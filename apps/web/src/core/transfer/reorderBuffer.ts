import { DecodedFrame } from '@beamcode/protocol';

export class ReorderBuffer {
  private buffer = new Map<number, DecodedFrame>();
  private expectedSeq: number;
  private currentBufferedBytes = 0;
  private maxBufferedBytes: number;

  constructor(initialSeq = 0, maxBufferedBytes = 32 * 1024 * 1024) {
    this.expectedSeq = initialSeq >>> 0;
    this.maxBufferedBytes = maxBufferedBytes;
  }

  /**
   * Pushes a received frame into the buffer.
   * Returns an array of frames that are now ready in strict sequential order.
   */
  push(frame: DecodedFrame): DecodedFrame[] {
    const seq = frame.header.seq >>> 0;

    // Fast-path: chunk is exactly the expected next sequence and buffer is empty
    if (seq === this.expectedSeq && this.buffer.size === 0) {
      this.expectedSeq = (this.expectedSeq + 1) >>> 0;
      return [frame];
    }

    // Sequence distance check (modular arithmetic for 32-bit wrap)
    const diff = (seq - this.expectedSeq) | 0;
    if (diff < 0) {
      // Duplicate or ancient sequence, ignore
      return [];
    }

    // Check buffer memory bound
    if (this.currentBufferedBytes + frame.payload.byteLength > this.maxBufferedBytes) {
      throw new Error('Reorder buffer overflow: receiver window limit exceeded');
    }

    // Store if not already present
    if (!this.buffer.has(seq)) {
      this.buffer.set(seq, frame);
      this.currentBufferedBytes += frame.payload.byteLength;
    }

    // Drain ready consecutive frames
    const ready: DecodedFrame[] = [];
    while (this.buffer.has(this.expectedSeq)) {
      const nextFrame = this.buffer.get(this.expectedSeq)!;
      this.buffer.delete(this.expectedSeq);
      this.currentBufferedBytes -= nextFrame.payload.byteLength;
      ready.push(nextFrame);
      this.expectedSeq = (this.expectedSeq + 1) >>> 0;
    }

    return ready;
  }

  getExpectedSeq(): number {
    return this.expectedSeq;
  }

  getPendingCount(): number {
    return this.buffer.size;
  }

  getBufferedBytes(): number {
    return this.currentBufferedBytes;
  }

  clear(): void {
    this.buffer.clear();
    this.currentBufferedBytes = 0;
  }
}
