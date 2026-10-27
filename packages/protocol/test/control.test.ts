import { describe, it, expect } from 'vitest';
import { parseControlMessage, safeParseControlMessage } from '../src/control.js';

describe('control protocol messages', () => {
  it('parses hello control message', () => {
    const msg = {
      t: 'hello',
      v: 1,
      caps: {
        maxMessageSize: 65536,
        fsAccess: true,
        swStream: false,
        maxChannels: 8,
      },
    };
    expect(parseControlMessage(msg)).toEqual(msg);
  });

  it('parses manifest control message', () => {
    const msg = {
      t: 'manifest',
      transferId: 'tr-1',
      totalSize: 2048,
      files: [
        {
          index: 0,
          name: 'photo.jpg',
          size: 2048,
          mime: 'image/jpeg',
          relPath: 'photo.jpg',
        },
      ],
    };
    expect(parseControlMessage(msg)).toEqual(msg);
  });

  it('parses accept control message', () => {
    const msg = {
      t: 'accept',
      transferId: 'tr-1',
      files: [0],
      sink: 'fs',
      zip: false,
      channels: 4,
      chunkSize: 65536,
      windowBytes: 33554432,
    };
    expect(parseControlMessage(msg)).toEqual(msg);
  });

  it('parses decline, start, file-end, ack, done, cancel, ping, pong', () => {
    expect(safeParseControlMessage({ t: 'decline', transferId: 'tr-1' }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'start', transferId: 'tr-1' }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'file-end', index: 0 }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'ack', bytes: 65536 }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'done', ok: true, bytes: 2048 }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'cancel', by: 'sender', reason: 'user cancelled' }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'cancel', by: 'receiver' }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'ping' }).success).toBe(true);
    expect(safeParseControlMessage({ t: 'pong' }).success).toBe(true);
  });

  it('rejects invalid sink option in accept', () => {
    const bad = {
      t: 'accept',
      transferId: 'tr-1',
      files: [0],
      sink: 'invalid-sink',
      zip: false,
      channels: 4,
      chunkSize: 65536,
      windowBytes: 33554432,
    };
    expect(safeParseControlMessage(bad).success).toBe(false);
  });
});
