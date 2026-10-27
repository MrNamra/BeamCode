import { ManifestFileItem } from '@beamcode/protocol';

export interface Sink {
  readonly allowsRandomAccess: boolean;
  init(files: ManifestFileItem[]): Promise<void>;
  write(fileIndex: number, offset: number, data: Uint8Array): Promise<void>;
  fileEnd(fileIndex: number): Promise<void>;
  close(): Promise<void>;
  abort(reason?: string): Promise<void>;
}
