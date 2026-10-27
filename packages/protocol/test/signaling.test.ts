import { describe, it, expect } from 'vitest';
import {
  parseClientMessage,
  safeParseClientMessage,
  parseServerMessage,
  safeParseServerMessage,
} from '../src/signaling.js';

describe('signaling protocol messages', () => {
  describe('client messages', () => {
    it('parses valid hello message', () => {
      const msg = { v: 1, t: 'hello', clientVersion: '1.0.0' };
      expect(parseClientMessage(msg)).toEqual(msg);
    });

    it('parses valid create message', () => {
      const msg = { v: 1, t: 'create' };
      expect(parseClientMessage(msg)).toEqual(msg);
    });

    it('parses valid join message with 6 digits', () => {
      const msg = { v: 1, t: 'join', code: '001234' };
      expect(parseClientMessage(msg)).toEqual(msg);
    });

    it('rejects invalid join codes', () => {
      expect(safeParseClientMessage({ v: 1, t: 'join', code: '12345' }).success).toBe(false);
      expect(safeParseClientMessage({ v: 1, t: 'join', code: '1234567' }).success).toBe(false);
      expect(safeParseClientMessage({ v: 1, t: 'join', code: 'abcdef' }).success).toBe(false);
    });

    it('parses join-decision', () => {
      const msg = { v: 1, t: 'join-decision', receiverId: 'rec-1', accept: true };
      expect(parseClientMessage(msg)).toEqual(msg);
    });

    it('parses signal message with offer/answer/ice', () => {
      expect(
        safeParseClientMessage({
          v: 1,
          t: 'signal',
          to: 'peer-2',
          data: { kind: 'offer', sdp: 'v=0...' },
        }).success
      ).toBe(true);

      expect(
        safeParseClientMessage({
          v: 1,
          t: 'signal',
          to: 'peer-1',
          data: { kind: 'ice', candidate: { candidate: 'candidate:1 1 UDP...', sdpMid: '0', sdpMLineIndex: 0 } },
        }).success
      ).toBe(true);

      expect(
        safeParseClientMessage({
          v: 1,
          t: 'signal',
          to: 'peer-1',
          data: { kind: 'ice', candidate: null }, // end-of-candidates
        }).success
      ).toBe(true);
    });

    it('parses release with valid reasons', () => {
      expect(safeParseClientMessage({ v: 1, t: 'release', reason: 'completed' }).success).toBe(true);
      expect(safeParseClientMessage({ v: 1, t: 'release', reason: 'cancelled' }).success).toBe(true);
      expect(safeParseClientMessage({ v: 1, t: 'release', reason: 'failed' }).success).toBe(true);
      expect(safeParseClientMessage({ v: 1, t: 'release', reason: 'other' }).success).toBe(false);
    });

    it('parses ping', () => {
      expect(safeParseClientMessage({ v: 1, t: 'ping' }).success).toBe(true);
    });

    it('rejects message with wrong protocol version', () => {
      expect(safeParseClientMessage({ v: 2, t: 'create' }).success).toBe(false);
    });
  });

  describe('server messages', () => {
    it('parses welcome message', () => {
      const msg = { v: 1, t: 'welcome', peerId: 'p-123', deviceName: 'Brave Otter' };
      expect(parseServerMessage(msg)).toEqual(msg);
    });

    it('parses code-created message', () => {
      const msg = { v: 1, t: 'code-created', code: '482019', expiresAt: Date.now() + 600000 };
      expect(parseServerMessage(msg)).toEqual(msg);
    });

    it('parses join-request, join-pending, join-accepted, join-rejected', () => {
      expect(safeParseServerMessage({ v: 1, t: 'join-request', receiverId: 'rec-1', deviceName: 'Swift Fox' }).success).toBe(true);
      expect(safeParseServerMessage({ v: 1, t: 'join-pending' }).success).toBe(true);
      expect(safeParseServerMessage({ v: 1, t: 'join-accepted', peerId: 'rec-1' }).success).toBe(true);
      expect(safeParseServerMessage({ v: 1, t: 'join-rejected' }).success).toBe(true);
    });

    it('parses code-released with all valid reasons', () => {
      const reasons = ['completed', 'cancelled', 'failed', 'expired', 'peer-left', 'idle'] as const;
      for (const reason of reasons) {
        expect(safeParseServerMessage({ v: 1, t: 'code-released', reason }).success).toBe(true);
      }
      expect(safeParseServerMessage({ v: 1, t: 'code-released', reason: 'random' }).success).toBe(false);
    });

    it('parses error message with ErrorCode and optional retryAfterMs', () => {
      const msg = {
        v: 1,
        t: 'error',
        code: 'CODE_UNAVAILABLE',
        message: 'Code not found or no longer available',
        retryAfterMs: 5000,
      };
      expect(parseServerMessage(msg)).toEqual(msg);

      expect(safeParseServerMessage({ v: 1, t: 'error', code: 'UNKNOWN_CODE', message: 'err' }).success).toBe(false);
    });

    it('parses pong', () => {
      expect(safeParseServerMessage({ v: 1, t: 'pong' }).success).toBe(true);
    });
  });
});
