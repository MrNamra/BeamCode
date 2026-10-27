import {
  encodeFrame,
  ManifestFileItem,
  ControlMessage,
  parseControlMessage,
  READ_BLOCK_SIZE,
  HIGH_WATER_MARK,
} from '@beamcode/protocol';
import { SpeedMeter } from '../util/speedMeter.js';

export interface SenderTransferOptions {
  ctrlChannel: RTCDataChannel;
  dataChannels: RTCDataChannel[];
  files: { file: Blob; meta: ManifestFileItem }[];
  chunkSize: number;
  channelsCount: number;
  windowBytes: number;
  adaptiveChannels?: boolean;
  verifyIntegrity?: boolean;
  resumeOffsets?: Record<number, number>;
  onProgress?: (progress: {
    bytesSent: number;
    bytesAcked: number;
    totalBytes: number;
    speedMBs: string;
    eta: string;
  }) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

export class SenderTransfer {
  private ctrlChannel: RTCDataChannel;
  private dataChannels: RTCDataChannel[];
  private files: { file: Blob; meta: ManifestFileItem }[];
  private chunkSize: number;
  private windowBytes: number;
  private activeChannelCount: number;
  private adaptive: boolean;
  private verifyIntegrity: boolean;
  private resumeOffsets: Record<number, number>;

  private bytesSent = 0;
  private bytesAcked = 0;
  private totalBytes = 0;
  private seq = 0;
  private isCancelled = false;
  private speedMeter = new SpeedMeter();

  private ackResolvers: (() => void)[] = [];
  private doneResolver?: () => void;

  constructor(private options: SenderTransferOptions) {
    this.ctrlChannel = options.ctrlChannel;
    this.dataChannels = options.dataChannels;
    this.activeChannelCount = Math.min(
      Math.max(1, options.channelsCount),
      options.dataChannels.length
    );
    this.adaptive = options.adaptiveChannels ?? false;
    this.verifyIntegrity = options.verifyIntegrity ?? false;
    this.resumeOffsets = options.resumeOffsets ?? {};
    this.files = options.files;
    this.chunkSize = options.chunkSize;
    this.windowBytes = options.windowBytes;

    this.totalBytes = options.files.reduce((acc, f) => acc + f.meta.size, 0);

    this.setupCtrlListener();
  }

  private setupCtrlListener(): void {
    this.ctrlChannel.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const msg: ControlMessage = parseControlMessage(JSON.parse(raw));

        if (msg.t === 'ack') {
          this.bytesAcked = msg.bytes;
          this.speedMeter.addBytes(msg.bytes);

          // Resolve pending flow control promises
          const resolvers = this.ackResolvers.splice(0, this.ackResolvers.length);
          for (const res of resolvers) {
            res();
          }

          this.notifyProgress();
        } else if (msg.t === 'done') {
          this.doneResolver?.();
          this.options.onDone?.();
        } else if (msg.t === 'cancel') {
          this.isCancelled = true;
          this.options.onError?.(new Error(`Transfer cancelled by ${msg.by}: ${msg.reason || ''}`));
        }
      } catch (err) {
        console.warn('Error handling control message in SenderTransfer:', err);
      }
    };
  }

  private notifyProgress(): void {
    this.options.onProgress?.({
      bytesSent: this.bytesSent,
      bytesAcked: this.bytesAcked,
      totalBytes: this.totalBytes,
      speedMBs: this.speedMeter.getFormattedSpeed('MB/s'),
      eta: this.speedMeter.getFormattedETA(this.totalBytes - this.bytesAcked),
    });
  }

  private sendControl(msg: ControlMessage): void {
    if (this.ctrlChannel.readyState === 'open') {
      this.ctrlChannel.send(JSON.stringify(msg));
    }
  }

  /**
   * Starts transferring files sequentially.
   */
  async start(): Promise<void> {
    const donePromise = new Promise<void>((resolve) => {
      this.doneResolver = resolve;
    });

    try {
      for (const item of this.files) {
        if (this.isCancelled) break;
        await this.sendFile(item.file, item.meta.index, item.meta.size);
      }
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }

    // Wait for receiver done message
    await donePromise;
  }

  private async sendFile(file: Blob, fileIndex: number, fileSize: number): Promise<void> {
    let fileOffset = this.resumeOffsets[fileIndex] ?? 0;
    if (fileOffset > 0) {
      this.bytesSent += fileOffset;
      this.bytesAcked += fileOffset;
      this.notifyProgress();
    }

    // Handle 0-byte file
    if (fileSize === 0) {
      this.sendControl({ t: 'file-end', index: fileIndex });
      return;
    }

    let fileHash: string | undefined;
    if (this.verifyIntegrity) {
      try {
        const fullBuf = await file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', fullBuf);
        fileHash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      } catch (err) {
        console.warn('Could not compute file hash for integrity check:', err);
      }
    }

    // Read blocks of 4 MiB (read-ahead)
    while (fileOffset < fileSize && !this.isCancelled) {
      const blockEnd = Math.min(fileOffset + READ_BLOCK_SIZE, fileSize);
      const blockSlice = file.slice(fileOffset, blockEnd);
      const blockBuffer = await blockSlice.arrayBuffer();
      const blockBytes = new Uint8Array(blockBuffer);

      // Slice 4 MiB block into chunks (default 64 KiB)
      let blockOffset = 0;
      while (blockOffset < blockBytes.byteLength && !this.isCancelled) {
        // Flow control: wait if in-flight bytes exceed window
        while (this.bytesSent - this.bytesAcked >= this.windowBytes && !this.isCancelled) {
          await new Promise<void>((resolve) => {
            this.ackResolvers.push(resolve);
          });
        }

        const chunkEnd = Math.min(blockOffset + this.chunkSize, blockBytes.byteLength);
        const chunkPayload = blockBytes.subarray(blockOffset, chunkEnd);
        const currentOffset = fileOffset + blockOffset;

        // Channel selection: least buffered among active channels
        const ch = await this.selectChannel();
        if (!ch) {
          throw new Error('All data channels closed during transfer');
        }

        // Build binary frame and send
        const frame = encodeFrame(
          {
            fileIndex,
            seq: this.seq++,
            offset: currentOffset,
          },
          chunkPayload
        );

        const frameBuffer = frame.buffer.slice(
          frame.byteOffset,
          frame.byteOffset + frame.byteLength
        ) as ArrayBuffer;
        ch.send(frameBuffer);
        this.bytesSent += chunkPayload.byteLength;
        blockOffset += chunkPayload.byteLength;
      }

      fileOffset = blockEnd;
    }

    if (!this.isCancelled) {
      this.sendControl({ t: 'file-end', index: fileIndex, sha256: fileHash });
    }
  }

  /**
   * Selects the least buffered open data channel, awaiting bufferedamountlow if all are full.
   */
  private async selectChannel(): Promise<RTCDataChannel | null> {
    const active = this.dataChannels
      .slice(0, this.activeChannelCount)
      .filter((c) => c.readyState === 'open');
    if (active.length === 0) return null;

    // Adaptive channel scaling
    if (this.adaptive) {
      const avgBuffer = active.reduce((acc, c) => acc + c.bufferedAmount, 0) / active.length;
      if (avgBuffer < 256 * 1024 && this.activeChannelCount < this.dataChannels.length) {
        this.activeChannelCount++;
      } else if (avgBuffer > HIGH_WATER_MARK * 0.75 && this.activeChannelCount > 1) {
        this.activeChannelCount--;
      }
    }

    // Find channel with lowest bufferedAmount
    let best = active[0]!;
    for (let i = 1; i < active.length; i++) {
      if (active[i]!.bufferedAmount < best.bufferedAmount) {
        best = active[i]!;
      }
    }

    // Backpressure: if even the best channel is above high water mark, wait
    if (best.bufferedAmount >= HIGH_WATER_MARK) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          best.removeEventListener('bufferedamountlow', handler);
          resolve();
        };
        best.addEventListener('bufferedamountlow', handler);
      });
    }

    return best;
  }

  cancel(reason = 'User cancelled'): void {
    if (this.isCancelled) return;
    this.isCancelled = true;
    this.sendControl({ t: 'cancel', by: 'sender', reason });
  }
}
