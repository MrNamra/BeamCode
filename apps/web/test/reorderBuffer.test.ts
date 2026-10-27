import { describe, it, expect } from 'vitest';
import { ReorderBuffer } from '../src/core/transfer/reorderBuffer.js';
import { DecodedFrame } from '@beamcode/protocol';

function makeFrame(seq: number, payloadLength = 100): DecodedFrame {
  return {
    header: {
      version: 1,
      kind: 1,
      fileIndex: 0,
      seq,
      offset: seq * payloadLength,
      offsetBig: BigInt(seq * payloadLength),
    },
    payload: new Uint8Array(payloadLength),
  };
}

describe('ReorderBuffer', () => {
  it('passes in-order frames immediately without buffering', () => {
    const buffer = new ReorderBuffer(0);

    const f0 = makeFrame(0);
    const r0 = buffer.push(f0);
    expect(r0).toEqual([f0]);
    expect(buffer.getPendingCount()).toBe(0);

    const f1 = makeFrame(1);
    const r1 = buffer.push(f1);
    expect(r1).toEqual([f1]);
    expect(buffer.getExpectedSeq()).toBe(2);
  });

  it('buffers out-of-order frames and drains when missing arrives', () => {
    const buffer = new ReorderBuffer(0);

    const f2 = makeFrame(2);
    const f1 = makeFrame(1);
    const f0 = makeFrame(0);

    // Push 2: not ready
    expect(buffer.push(f2)).toEqual([]);
    expect(buffer.getPendingCount()).toBe(1);

    // Push 0: 0 is ready, but 1 is still missing so 2 remains buffered
    expect(buffer.push(f0)).toEqual([f0]);
    expect(buffer.getPendingCount()).toBe(1);
    expect(buffer.getExpectedSeq()).toBe(1);

    // Push 1: now both 1 and 2 become ready!
    const drained = buffer.push(f1);
    expect(drained).toEqual([f1, f2]);
    expect(buffer.getPendingCount()).toBe(0);
    expect(buffer.getExpectedSeq()).toBe(3);
  });

  it('handles 32-bit sequence wraparound', () => {
    // Start at uint32 max - 1
    const maxU32 = 0xffffffff;
    const buffer = new ReorderBuffer(maxU32);

    const fWrap0 = makeFrame(maxU32); // 4294967295
    const fWrap1 = makeFrame(0); // wrapped to 0

    // Push wrapped sequence 0 first
    expect(buffer.push(fWrap1)).toEqual([]);

    // Push maxU32: should drain maxU32 and then 0
    const drained = buffer.push(fWrap0);
    expect(drained).toEqual([fWrap0, fWrap1]);
    expect(buffer.getExpectedSeq()).toBe(1);
  });

  it('enforces memory bound and throws on overflow', () => {
    const buffer = new ReorderBuffer(0, 500); // 500 bytes max

    buffer.push(makeFrame(1, 200));
    buffer.push(makeFrame(2, 200));

    // Next frame exceeds 500 bytes
    expect(() => buffer.push(makeFrame(3, 200))).toThrowError(/overflow/);
  });

  it('ignores duplicate or old frames', () => {
    const buffer = new ReorderBuffer(5);
    const oldFrame = makeFrame(2);

    expect(buffer.push(oldFrame)).toEqual([]);
    expect(buffer.getPendingCount()).toBe(0);
  });
});
