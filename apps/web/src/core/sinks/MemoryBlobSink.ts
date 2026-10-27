import { ManifestFileItem } from '@beamcode/protocol';
import { Sink } from './Sink.js';

export interface SavedFile {
  name: string;
  blob: Blob;
  size: number;
}

export class MemoryBlobSink implements Sink {
  readonly allowsRandomAccess = true;
  private fileChunks = new Map<number, Map<number, Uint8Array>>();
  private files: ManifestFileItem[] = [];
  private completedFiles: SavedFile[] = [];

  async init(files: ManifestFileItem[]): Promise<void> {
    this.files = files;
    for (const file of files) {
      this.fileChunks.set(file.index, new Map<number, Uint8Array>());
    }
  }

  async write(fileIndex: number, offset: number, data: Uint8Array): Promise<void> {
    const chunks = this.fileChunks.get(fileIndex);
    if (!chunks) return;
    // Copy the slice so caller can safely reuse buffer
    chunks.set(offset, new Uint8Array(data));
  }

  async fileEnd(fileIndex: number): Promise<void> {
    const chunks = this.fileChunks.get(fileIndex);
    const meta = this.files.find((f) => f.index === fileIndex);
    if (!chunks || !meta) return;

    // Sort chunk offsets to guarantee exact in-order assembly
    const sortedOffsets = Array.from(chunks.keys()).sort((a, b) => a - b);
    const orderedParts: Uint8Array[] = new Array(sortedOffsets.length);
    for (let i = 0; i < sortedOffsets.length; i++) {
      orderedParts[i] = chunks.get(sortedOffsets[i]!)!;
    }

    const blob = new Blob(orderedParts as BlobPart[], {
      type: meta.mime || 'application/octet-stream',
    });

    this.completedFiles.push({
      name: meta.name,
      blob,
      size: blob.size,
    });
    this.fileChunks.delete(fileIndex);
  }

  async close(): Promise<void> {
    // All files ended
  }

  async abort(): Promise<void> {
    this.fileChunks.clear();
    this.completedFiles = [];
  }

  getCompletedFiles(): SavedFile[] {
    return this.completedFiles;
  }
}
