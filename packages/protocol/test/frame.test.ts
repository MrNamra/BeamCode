import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrame, encodeFrameInto } from '../src/frame.js';
import { FRAME_HEADER_SIZE, FRAME_VERSION, FRAME_KIND_DATA } from '../src/constants.js';

describe('binary frame protocol', () => {
  it('round-trips standard data frames', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 42, 255]);
    const header = {
      fileIndex: 7,
      seq: 123456,
      offset: 1048576, // 1 MiB
    };

    const encoded = encodeFrame(header, payload);
    expect(encoded.byteLength).toBe(FRAME_HEADER_SIZE + payload.byteLength);

    const decoded = decodeFrame(encoded);
    expect(decoded.header.version).toBe(FRAME_VERSION);
    expect(decoded.header.kind).toBe(FRAME_KIND_DATA);
    expect(decoded.header.fileIndex).toBe(7);
    expect(decoded.header.seq).toBe(123456);
    expect(decoded.header.offset).toBe(1048576);
    expect(decoded.header.offsetBig).toBe(1048576n);
    expect(Array.from(decoded.payload)).toEqual([1, 2, 3, 4, 5, 42, 255]);
  });

  it('handles empty payload', () => {
    const payload = new Uint8Array(0);
    const header = {
      fileIndex: 0,
      seq: 0,
      offset: 0,
    };

    const encoded = encodeFrame(header, payload);
    expect(encoded.byteLength).toBe(FRAME_HEADER_SIZE);

    const decoded = decodeFrame(encoded);
    expect(decoded.header.fileIndex).toBe(0);
    expect(decoded.header.seq).toBe(0);
    expect(decoded.header.offset).toBe(0);
    expect(decoded.payload.byteLength).toBe(0);
  });

  it('handles offsets > 4 GiB correctly with number and bigint', () => {
    const fiveGiB = 5 * 1024 * 1024 * 1024; // 5,368,709,120 bytes (> 2^32)
    const payload = new Uint8Array([99, 100]);

    // Test with number
    const encodedNum = encodeFrame(
      {
        fileIndex: 2,
        seq: 9999,
        offset: fiveGiB,
      },
      payload
    );

    const decodedNum = decodeFrame(encodedNum);
    expect(decodedNum.header.offset).toBe(fiveGiB);
    expect(decodedNum.header.offsetBig).toBe(BigInt(fiveGiB));

    // Test with bigint (e.g. 50 GiB)
    const fiftyGiB = 50n * 1024n * 1024n * 1024n;
    const encodedBig = encodeFrame(
      {
        fileIndex: 3,
        seq: 10000,
        offset: fiftyGiB,
      },
      payload
    );

    const decodedBig = decodeFrame(encodedBig);
    expect(decodedBig.header.offsetBig).toBe(fiftyGiB);
    expect(decodedBig.header.offset).toBe(Number(fiftyGiB));
  });

  it('supports encodeFrameInto with pre-allocated buffer', () => {
    const target = new Uint8Array(64);
    const payload = new Uint8Array([10, 20, 30]);

    encodeFrameInto(
      {
        fileIndex: 1,
        seq: 42,
        offset: 100,
      },
      payload,
      target,
      4 // 4 bytes offset
    );

    const view = new Uint8Array(target.buffer, target.byteOffset + 4, FRAME_HEADER_SIZE + 3);
    const decoded = decodeFrame(view);

    expect(decoded.header.fileIndex).toBe(1);
    expect(decoded.header.seq).toBe(42);
    expect(decoded.header.offset).toBe(100);
    expect(Array.from(decoded.payload)).toEqual([10, 20, 30]);
  });

  it('throws on buffer too short for header', () => {
    const tooShort = new Uint8Array(15);
    expect(() => decodeFrame(tooShort)).toThrowError(/Frame too short/);
  });

  it('throws on unsupported frame version', () => {
    const frame = new Uint8Array(16);
    frame[0] = 2; // version 2
    frame[1] = 1; // kind 1
    expect(() => decodeFrame(frame)).toThrowError(/Unsupported frame version: 2/);
  });

  it('throws on unsupported frame kind', () => {
    const frame = new Uint8Array(16);
    frame[0] = 1; // version 1
    frame[1] = 9; // invalid kind 9
    expect(() => decodeFrame(frame)).toThrowError(/Unsupported frame kind: 9/);
  });

  it('throws on negative offset', () => {
    expect(() =>
      encodeFrame(
        {
          fileIndex: 0,
          seq: 0,
          offset: -1,
        },
        new Uint8Array(0)
      )
    ).toThrowError(RangeError);
  });
});
