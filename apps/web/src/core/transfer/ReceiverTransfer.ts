import {
  decodeFrame,
  ManifestFileItem,
  ControlMessage,
  parseControlMessage,
  ACK_INTERVAL_MS,
  ACK_INTERVAL_BYTES,
  DecodedFrame,
} from '@beamcode/protocol';
import { Sink } from '../sinks/Sink.js';
import { ReorderBuffer } from './reorderBuffer.js';
import { SpeedMeter } from '../util/speedMeter.js';

export interface ReceiverTransferOptions {
  ctrlChannel: RTCDataChannel;
  dataChannels: RTCDataChannel[];
  sink: Sink;
  files: ManifestFileItem[];
  totalExpectedBytes: number;
  windowBytes: number;
  onProgress?: (progress: {
    bytesReceived: number;
    totalBytes: number;
    speedMBs: string;
    eta: string;
  }) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

export class ReceiverTransfer {
  private ctrlChannel: RTCDataChannel;
  private dataChannels: RTCDataChannel[];
  private sink: Sink;
  private files: ManifestFileItem[];
  private totalExpectedBytes: number;

  private reorderBuffer: ReorderBuffer;
  private speedMeter = new SpeedMeter();

  private bytesWritten = 0;
  private bytesAcked = 0;
  private ackTimer: ReturnType<typeof setInterval> | null = null;
  private fileEndReceived = new Set<number>();
  private endedFiles = new Set<number>();
  private fileBytesWritten = new Map<number, number>();
  private isCancelled = false;
  private donePromiseResolve?: () => void;
  private donePromiseReject?: (err: Error) => void;

  constructor(private options: ReceiverTransferOptions) {
    this.ctrlChannel = options.ctrlChannel;
    this.dataChannels = options.dataChannels;
    this.sink = options.sink;
    this.files = options.files;
    this.totalExpectedBytes = options.totalExpectedBytes;

    for (const f of options.files) {
      this.fileBytesWritten.set(f.index, 0);
    }

    this.reorderBuffer = new ReorderBuffer(0, options.windowBytes);

    this.setupListeners();
    this.startAckScheduler();
  }

  private writeQueue: Promise<void> = Promise.resolve();

  private setupListeners(): void {
    // Control channel listener
    this.ctrlChannel.onmessage = async (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const msg: ControlMessage = parseControlMessage(JSON.parse(raw));

        if (msg.t === 'file-end') {
          await this.handleFileEnd(msg.index);
        } else if (msg.t === 'cancel') {
          this.isCancelled = true;
          this.cleanup();
          await this.sink.abort(msg.reason);
          this.donePromiseReject?.(new Error(`Transfer cancelled by ${msg.by}`));
          this.options.onError?.(new Error(`Transfer cancelled by ${msg.by}`));
        }
      } catch (err) {
        console.warn('Error processing control message in ReceiverTransfer:', err);
      }
    };

    // Data channels listeners
    for (const ch of this.dataChannels) {
      ch.onmessage = async (event) => {
        if (this.isCancelled) return;
        try {
          const rawBuffer = event.data as ArrayBuffer;
          const frame = decodeFrame(rawBuffer);
          await this.handleDataFrame(frame);
        } catch (err) {
          console.error('Failed to process data frame:', err);
          this.cancel('Malformed data frame');
        }
      };
    }
  }

  private async handleDataFrame(frame: DecodedFrame): Promise<void> {
    if (this.sink.allowsRandomAccess) {
      // Random access sink: can write immediately at offset without reorder buffer
      await this.sink.write(frame.header.fileIndex, frame.header.offset, frame.payload);
      this.bytesWritten += frame.payload.byteLength;
      const curWritten =
        (this.fileBytesWritten.get(frame.header.fileIndex) || 0) + frame.payload.byteLength;
      this.fileBytesWritten.set(frame.header.fileIndex, curWritten);
      this.onBytesDurablyWritten(frame.payload.byteLength);
      await this.tryFinishFile(frame.header.fileIndex);
      return;
    }

    // In-order sink: pass through reorder buffer synchronously
    const readyFrames = this.reorderBuffer.push(frame);
    if (readyFrames.length === 0) return;

    this.writeQueue = this.writeQueue.then(async () => {
      for (const ready of readyFrames) {
        if (this.isCancelled) return;
        await this.sink.write(ready.header.fileIndex, ready.header.offset, ready.payload);
        this.bytesWritten += ready.payload.byteLength;
        const curWritten =
          (this.fileBytesWritten.get(ready.header.fileIndex) || 0) + ready.payload.byteLength;
        this.fileBytesWritten.set(ready.header.fileIndex, curWritten);
        this.onBytesDurablyWritten(ready.payload.byteLength);
        await this.tryFinishFile(ready.header.fileIndex);
      }
    });
  }

  private onBytesDurablyWritten(byteDelta: number): void {
    this.speedMeter.addBytes(byteDelta);

    // If unacked bytes exceed 4 MiB, send immediate ack
    if (this.bytesWritten - this.bytesAcked >= ACK_INTERVAL_BYTES) {
      this.sendAck();
    }

    this.notifyProgress();
  }

  private notifyProgress(): void {
    this.options.onProgress?.({
      bytesReceived: this.bytesWritten,
      totalBytes: this.totalExpectedBytes,
      speedMBs: this.speedMeter.getFormattedSpeed('MB/s'),
      eta: this.speedMeter.getFormattedETA(this.totalExpectedBytes - this.bytesWritten),
    });
  }

  private startAckScheduler(): void {
    this.ackTimer = setInterval(() => {
      if (this.bytesWritten > this.bytesAcked) {
        this.sendAck();
      }
    }, ACK_INTERVAL_MS);
  }

  private sendAck(): void {
    if (this.ctrlChannel.readyState === 'open') {
      this.ctrlChannel.send(
        JSON.stringify({
          t: 'ack',
          bytes: this.bytesWritten,
        })
      );
      this.bytesAcked = this.bytesWritten;
    }
  }

  private async handleFileEnd(fileIndex: number): Promise<void> {
    if (!this.sink.allowsRandomAccess) {
      await this.writeQueue;
    }
    this.fileEndReceived.add(fileIndex);
    await this.tryFinishFile(fileIndex);
  }

  private async tryFinishFile(fileIndex: number): Promise<void> {
    if (this.endedFiles.has(fileIndex)) return;
    if (!this.fileEndReceived.has(fileIndex)) return;

    const fileMeta = this.files.find((f) => f.index === fileIndex);
    if (!fileMeta) return;

    const written = this.fileBytesWritten.get(fileIndex) || 0;
    if (written < fileMeta.size) {
      // Still awaiting remaining in-flight chunks for this file
      return;
    }

    this.endedFiles.add(fileIndex);
    await this.sink.fileEnd(fileIndex);
    await this.checkCompletion();
  }

  private async checkCompletion(): Promise<void> {
    if (
      this.endedFiles.size === this.files.length &&
      this.bytesWritten >= this.totalExpectedBytes
    ) {
      this.cleanup();
      // Final flush and close sink
      await this.sink.close();

      // Send done message
      if (this.ctrlChannel.readyState === 'open') {
        this.ctrlChannel.send(
          JSON.stringify({
            t: 'done',
            ok: true,
            bytes: this.bytesWritten,
          })
        );
      }

      this.options.onDone?.();
      this.donePromiseResolve?.();
    }
  }

  waitForCompletion(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.donePromiseResolve = resolve;
      this.donePromiseReject = reject;
    });
  }

  private cleanup(): void {
    if (this.ackTimer) {
      clearInterval(this.ackTimer);
      this.ackTimer = null;
    }
  }

  cancel(reason = 'User cancelled'): void {
    if (this.isCancelled) return;
    this.isCancelled = true;
    this.cleanup();
    if (this.ctrlChannel.readyState === 'open') {
      this.ctrlChannel.send(
        JSON.stringify({
          t: 'cancel',
          by: 'receiver',
          reason,
        })
      );
    }
    this.sink.abort(reason).catch(() => {});
  }
}
