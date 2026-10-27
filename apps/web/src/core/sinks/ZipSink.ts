import { ManifestFileItem } from '@beamcode/protocol';
import { Sink } from './Sink.js';

// Precomputed CRC32 table
const CRC32_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[n] = c >>> 0;
}

function updateCrc32(crc: number, data: Uint8Array): number {
  let c = crc ^ -1;
  for (let i = 0; i < data.byteLength; i++) {
    c = CRC32_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

interface ZipEntry {
  file: ManifestFileItem;
  offset: number; // offset of local header in zip
  crc32: number;
  size: number;
}

/**
 * Streaming Store-Only ZIP sink (no compression, maximum speed).
 * Pipes zip stream into an underlying sink.
 */
export class ZipSink implements Sink {
  readonly allowsRandomAccess = false;
  private currentOffset = 0;
  private currentCrc = 0;
  private entries: ZipEntry[] = [];
  private currentFile?: ManifestFileItem;

  constructor(private targetSink: Sink, private zipFilename = 'archive.zip') {}

  getCurrentFile(): ManifestFileItem | undefined {
    return this.currentFile;
  }

  async init(files: ManifestFileItem[]): Promise<void> {
    const totalEstSize = files.reduce((acc, f) => acc + f.size + 150, 0) + 100;
    await this.targetSink.init([
      {
        index: 0,
        name: this.zipFilename,
        size: totalEstSize,
        mime: 'application/zip',
        relPath: this.zipFilename,
      },
    ]);

    // Start with first file if files exist
    if (files.length > 0) {
      await this.startFile(files[0]!);
    }
  }

  private async startFile(file: ManifestFileItem): Promise<void> {
    this.currentFile = file;
    this.currentCrc = 0;

    const encodedName = new TextEncoder().encode(file.relPath || file.name);
    const header = new Uint8Array(30 + encodedName.byteLength);
    const view = new DataView(header.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed (2.0)
    view.setUint16(6, 0x0808, true); // General purpose bit flag (UTF-8 + data descriptor if needed)
    view.setUint16(8, 0, true); // Compression method (0 = STORE)
    view.setUint16(10, 0, true); // Last mod time
    view.setUint16(12, 0, true); // Last mod date
    view.setUint32(14, 0, true); // CRC-32 (filled or updated)
    view.setUint32(18, file.size, true); // Compressed size
    view.setUint32(22, file.size, true); // Uncompressed size
    view.setUint16(26, encodedName.byteLength, true); // File name length
    view.setUint16(28, 0, true); // Extra field length

    header.set(encodedName, 30);

    const localHeaderOffset = this.currentOffset;
    await this.targetSink.write(0, this.currentOffset, header);
    this.currentOffset += header.byteLength;

    this.entries.push({
      file,
      offset: localHeaderOffset,
      crc32: 0,
      size: file.size,
    });
  }

  async write(_fileIndex: number, _offset: number, data: Uint8Array): Promise<void> {
    this.currentCrc = updateCrc32(this.currentCrc, data);
    await this.targetSink.write(0, this.currentOffset, data);
    this.currentOffset += data.byteLength;
  }

  async fileEnd(fileIndex: number): Promise<void> {
    const entry = this.entries.find((e) => e.file.index === fileIndex);
    if (entry) {
      entry.crc32 = this.currentCrc;
    }
  }

  async close(): Promise<void> {
    // Write Central Directory headers + End of Central Directory
    const cdStartOffset = this.currentOffset;

    for (const entry of this.entries) {
      const encodedName = new TextEncoder().encode(entry.file.relPath || entry.file.name);
      const cd = new Uint8Array(46 + encodedName.byteLength);
      const view = new DataView(cd.buffer);

      view.setUint32(0, 0x02014b50, true); // Central file header signature
      view.setUint16(4, 20, true); // Version made by
      view.setUint16(6, 20, true); // Version needed
      view.setUint16(8, 0x0808, true); // Flags (UTF-8)
      view.setUint16(10, 0, true); // Method: Store
      view.setUint16(12, 0, true); // Time
      view.setUint16(14, 0, true); // Date
      view.setUint32(16, entry.crc32, true); // CRC-32
      view.setUint32(20, entry.size, true); // Compressed size
      view.setUint32(24, entry.size, true); // Uncompressed size
      view.setUint16(28, encodedName.byteLength, true); // File name length
      view.setUint16(30, 0, true); // Extra length
      view.setUint16(32, 0, true); // Comment length
      view.setUint16(34, 0, true); // Disk start
      view.setUint16(36, 0, true); // Internal attributes
      view.setUint32(38, 0, true); // External attributes
      view.setUint32(42, entry.offset, true); // Offset of local header

      cd.set(encodedName, 46);

      await this.targetSink.write(0, this.currentOffset, cd);
      this.currentOffset += cd.byteLength;
    }

    const cdSize = this.currentOffset - cdStartOffset;

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const view = new DataView(eocd.buffer);

    view.setUint32(0, 0x06054b50, true); // EOCD signature
    view.setUint16(4, 0, true); // Disk number
    view.setUint16(6, 0, true); // CD disk number
    view.setUint16(8, this.entries.length, true); // Total entries this disk
    view.setUint16(10, this.entries.length, true); // Total entries overall
    view.setUint32(12, cdSize, true); // Size of central directory
    view.setUint32(16, cdStartOffset, true); // Offset of central directory
    view.setUint16(20, 0, true); // Comment length

    await this.targetSink.write(0, this.currentOffset, eocd);
    this.currentOffset += eocd.byteLength;

    await this.targetSink.fileEnd(0);
    await this.targetSink.close();
  }

  async abort(reason?: string): Promise<void> {
    await this.targetSink.abort(reason);
  }
}
