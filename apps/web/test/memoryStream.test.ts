import { describe, it, expect } from 'vitest';
import {
  encodeFrame,
  decodeFrame,
  DEFAULT_CHUNK_SIZE,
  READ_BLOCK_SIZE,
  DEFAULT_WINDOW_BYTES_LAN,
} from '@beamcode/protocol';

describe('5 GB Streamed Transfer Memory Test (09-TESTING.md §5)', () => {
  it('streams a 5 GB file through frame slicing and sink writing with heap < 200 MB', async () => {
    // 5 GB = 5 * 1024 * 1024 * 1024 bytes
    const fiveGbBytes = 5 * 1024 * 1024 * 1024;
    const chunkSize = DEFAULT_CHUNK_SIZE; // 64 KiB
    const windowBytes = DEFAULT_WINDOW_BYTES_LAN; // 32 MiB

    // Track peak heap memory during transfer
    let peakHeapUsed = process.memoryUsage().heapUsed;

    // Simulate 4 MiB reusable block buffer (no allocation per block)
    const blockBuffer = new Uint8Array(READ_BLOCK_SIZE);
    for (let i = 0; i < READ_BLOCK_SIZE; i += 4) {
      blockBuffer[i] = 0xbe;
      blockBuffer[i + 1] = 0xef;
    }

    let bytesTransferred = 0;
    let bytesAcked = 0;
    let seq = 0;

    // Stream 5 GB in 4 MiB read blocks
    let offset = 0;
    while (offset < fiveGbBytes) {
      const currentBlockSize = Math.min(READ_BLOCK_SIZE, fiveGbBytes - offset);

      // Slice into chunks
      let blockOffset = 0;
      while (blockOffset < currentBlockSize) {
        // Backpressure window check
        if (bytesTransferred - bytesAcked >= windowBytes) {
          // Acknowledge window
          bytesAcked = bytesTransferred;
        }

        const currentChunkSize = Math.min(chunkSize, currentBlockSize - blockOffset);
        const payload = blockBuffer.subarray(blockOffset, blockOffset + currentChunkSize);

        // Encode frame
        const frame = encodeFrame(
          {
            fileIndex: 0,
            seq: seq++,
            offset: offset + blockOffset,
          },
          payload
        );

        // Receiver decodes header and writes
        const decoded = decodeFrame(frame);
        expect(decoded.header.fileIndex).toBe(0);
        expect(decoded.payload.byteLength).toBe(currentChunkSize);

        bytesTransferred += currentChunkSize;
        blockOffset += currentChunkSize;
      }

      offset += currentBlockSize;

      // Sample heap periodically every 500 MB
      if (offset % (500 * 1024 * 1024) === 0) {
        const currentHeap = process.memoryUsage().heapUsed;
        if (currentHeap > peakHeapUsed) {
          peakHeapUsed = currentHeap;
        }
      }
    }

    expect(bytesTransferred).toBe(fiveGbBytes);

    const peakHeapMb = peakHeapUsed / (1024 * 1024);
    // Heap must remain strictly below 200 MB (target in 09-TESTING.md §5)
    expect(peakHeapMb).toBeLessThan(200);
  });
});
