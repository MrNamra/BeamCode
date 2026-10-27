import { ManifestFileItem } from '@beamcode/protocol';
import { Sink } from './Sink.js';

export class ServiceWorkerStreamSink implements Sink {
  readonly allowsRandomAccess = false;
  private files: ManifestFileItem[] = [];
  private activeStreamId?: string;

  getFiles(): ManifestFileItem[] {
    return this.files;
  }

  async init(files: ManifestFileItem[]): Promise<void> {
    this.files = files;
    // For single file, register download stream immediately
    if (files.length === 1) {
      const file = files[0]!;
      this.activeStreamId = `dl_${Date.now()}_${file.index}`;
      await this.registerStream(this.activeStreamId, file);
      this.triggerBrowserDownload(this.activeStreamId, file.name);
    }
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

  async write(_fileIndex: number, _offset: number, data: Uint8Array): Promise<void> {
    if (!this.activeStreamId || !navigator.serviceWorker?.controller) return;

    // Send chunk to Service Worker
    navigator.serviceWorker.controller.postMessage({
      type: 'STREAM_CHUNK',
      streamId: this.activeStreamId,
      chunk: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    });
  }

  async fileEnd(_fileIndex: number): Promise<void> {
    if (!this.activeStreamId || !navigator.serviceWorker?.controller) return;

    navigator.serviceWorker.controller.postMessage({
      type: 'STREAM_END',
      streamId: this.activeStreamId,
    });
  }

  async close(): Promise<void> {
    // Finished
  }

  async abort(reason?: string): Promise<void> {
    if (!this.activeStreamId || !navigator.serviceWorker?.controller) return;

    navigator.serviceWorker.controller.postMessage({
      type: 'STREAM_ABORT',
      streamId: this.activeStreamId,
      reason,
    });
  }
}
