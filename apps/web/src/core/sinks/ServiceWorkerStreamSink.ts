import { ManifestFileItem } from '@beamcode/protocol';
import { Sink } from './Sink.js';

export class ServiceWorkerStreamSink implements Sink {
  readonly allowsRandomAccess = false;
  private files: ManifestFileItem[] = [];
  private activeStreamId?: string;
  private currentFileIndex: number | null = null;
  private streamInitPromise?: Promise<void>;

  getFiles(): ManifestFileItem[] {
    return this.files;
  }

  async init(files: ManifestFileItem[]): Promise<void> {
    this.files = files;
    // For single file, register download stream immediately
    if (files.length === 1) {
      const file = files[0]!;
      this.currentFileIndex = file.index;
      this.activeStreamId = `dl_${Date.now()}_${file.index}`;
      this.streamInitPromise = this.registerStream(this.activeStreamId, file);
      await this.streamInitPromise;
      this.triggerBrowserDownload(this.activeStreamId, file.name);
    }
  }

  private async ensureStreamForFile(fileIndex: number): Promise<void> {
    if (this.currentFileIndex === fileIndex && this.activeStreamId) {
      if (this.streamInitPromise) await this.streamInitPromise;
      return;
    }

    // If there was a previous active file stream, end it
    if (this.activeStreamId && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'STREAM_END',
        streamId: this.activeStreamId,
      });
    }

    const file = this.files.find((f) => f.index === fileIndex);
    if (!file) return;

    this.currentFileIndex = fileIndex;
    const streamId = `dl_${Date.now()}_${fileIndex}`;
    this.activeStreamId = streamId;
    this.streamInitPromise = this.registerStream(streamId, file);
    await this.streamInitPromise;
    this.triggerBrowserDownload(streamId, file.name);
  }

  private async registerStream(streamId: string, file: ManifestFileItem): Promise<void> {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      throw new Error('Service Worker is not active');
    }

    const channel = new MessageChannel();
    const promise = new Promise<void>((resolve, reject) => {
      channel.port1.onmessage = (event) => {
        if (event.data?.ok) resolve();
        else reject(new Error('Failed to register SW download'));
      };
    });

    navigator.serviceWorker.controller.postMessage(
      {
        type: 'REGISTER_DOWNLOAD',
        streamId,
        filename: file.name,
        size: file.size,
        mime: file.mime,
      },
      [channel.port2]
    );

    return promise;
  }

  private triggerBrowserDownload(streamId: string, filename: string): void {
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.src = `/sw-download/${streamId}/${encodeURIComponent(filename)}`;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // ignore
      }
    }, 60000);
  }

  async write(fileIndex: number, _offset: number, data: Uint8Array): Promise<void> {
    if (!navigator.serviceWorker?.controller) return;

    await this.ensureStreamForFile(fileIndex);
    if (!this.activeStreamId) return;

    // Send chunk to Service Worker
    navigator.serviceWorker.controller.postMessage({
      type: 'STREAM_CHUNK',
      streamId: this.activeStreamId,
      chunk: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    });
  }

  async fileEnd(fileIndex: number): Promise<void> {
    if (!this.activeStreamId || !navigator.serviceWorker?.controller) return;

    if (this.streamInitPromise) await this.streamInitPromise;

    navigator.serviceWorker.controller.postMessage({
      type: 'STREAM_END',
      streamId: this.activeStreamId,
    });

    if (this.currentFileIndex === fileIndex) {
      this.activeStreamId = undefined;
      this.currentFileIndex = null;
      this.streamInitPromise = undefined;
    }
  }

  async close(): Promise<void> {
    if (this.activeStreamId && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'STREAM_END',
        streamId: this.activeStreamId,
      });
      this.activeStreamId = undefined;
      this.currentFileIndex = null;
    }
  }

  async abort(reason?: string): Promise<void> {
    if (!this.activeStreamId || !navigator.serviceWorker?.controller) return;

    navigator.serviceWorker.controller.postMessage({
      type: 'STREAM_ABORT',
      streamId: this.activeStreamId,
      reason,
    });
    this.activeStreamId = undefined;
    this.currentFileIndex = null;
  }
}
