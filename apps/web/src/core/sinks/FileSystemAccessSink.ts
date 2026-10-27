import { ManifestFileItem } from '@beamcode/protocol';
import { Sink } from './Sink.js';

interface WritableFileStream {
  write(params: { type: 'write'; position: number; data: Uint8Array }): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export class FileSystemAccessSink implements Sink {
  readonly allowsRandomAccess = true;
  private writables = new Map<number, WritableFileStream>();
  private files: ManifestFileItem[] = [];

  constructor(
    private getWritableForFile?: (
      file: ManifestFileItem
    ) => Promise<WritableFileStream | undefined>
  ) {}

  getFiles(): ManifestFileItem[] {
    return this.files;
  }

  async init(files: ManifestFileItem[]): Promise<void> {
    this.files = files;
    if (this.getWritableForFile) {
      for (const file of files) {
        const writable = await this.getWritableForFile(file);
        if (writable) {
          this.writables.set(file.index, writable);
        }
      }
    }
  }

  setWritable(fileIndex: number, writable: WritableFileStream): void {
    this.writables.set(fileIndex, writable);
  }

  async write(fileIndex: number, offset: number, data: Uint8Array): Promise<void> {
    const writable = this.writables.get(fileIndex);
    if (!writable) {
      throw new Error(`No writable stream configured for file index ${fileIndex}`);
    }

    await writable.write({
      type: 'write',
      position: offset,
      data,
    });
  }

  async fileEnd(fileIndex: number): Promise<void> {
    const writable = this.writables.get(fileIndex);
    if (writable) {
      await writable.close();
      this.writables.delete(fileIndex);
    }
  }

  async close(): Promise<void> {
    for (const [idx, writable] of this.writables.entries()) {
      try {
        await writable.close();
      } catch {
        // ignore
      }
      this.writables.delete(idx);
    }
  }

  async abort(reason?: string): Promise<void> {
    for (const [idx, writable] of this.writables.entries()) {
      try {
        await writable.abort(reason);
      } catch {
        // ignore
      }
      this.writables.delete(idx);
    }
  }
}
