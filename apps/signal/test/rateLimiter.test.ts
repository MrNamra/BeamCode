import { describe, it, expect } from 'vitest';
import { RateLimiter, normalizeIp } from '../src/rateLimiter.js';

describe('RateLimiter', () => {
  it('normalizes IPv4 and IPv6 addresses correctly', () => {
    expect(normalizeIp('192.168.1.10')).toBe('192.168.1.10');
    expect(normalizeIp('::ffff:192.168.1.10')).toBe('192.168.1.10');
    // IPv6 grouped by /64 (first 4 segments)
    expect(normalizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3:0000');
    expect(normalizeIp('2001:0db8:85a3:0000:1111:2222:3333:4444')).toBe('2001:0db8:85a3:0000');
  });

  it('limits join attempts to 10 per minute per IP (AC-9)', () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ rateJoinPerMin: 10, now: () => now });
    const ip = '10.0.0.1';

    for (let i = 0; i < 10; i++) {
      expect(limiter.canJoinCode(ip).allowed).toBe(true);
      limiter.recordJoinAttempt(ip);
    }

    // 11th attempt is rate-limited
    const check11 = limiter.canJoinCode(ip);
    expect(check11.allowed).toBe(false);
    expect(check11.retryAfterMs).toBeGreaterThan(0);

    // After 60 seconds, allowed again
    now += 60_001;
    expect(limiter.canJoinCode(ip).allowed).toBe(true);
  });

  it('blocks joins for 10 minutes after 5 failed joins', () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ now: () => now });
    const ip = '10.0.0.2';

    for (let i = 0; i < 5; i++) {
      limiter.recordFailedJoin(ip);
    }

    const check = limiter.canJoinCode(ip);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterMs).toBeGreaterThan(0);

    // After 9 minutes still blocked
    now += 9 * 60 * 1000;
    expect(limiter.canJoinCode(ip).allowed).toBe(false);

    // After 10 minutes unblocked
    now += 61 * 1000;
    expect(limiter.canJoinCode(ip).allowed).toBe(true);
  });

  it('limits create to 10/min and max 5 active codes per IP', () => {
    const now = 1_000_000;
    const limiter = new RateLimiter({ rateCreatePerMin: 10, maxCodesPerIp: 5, now: () => now });
    const ip = '10.0.0.3';

    // 5 active codes blocks further creates
    expect(limiter.canCreateCode(ip, 5).allowed).toBe(false);
    expect(limiter.canCreateCode(ip, 4).allowed).toBe(true);

    // 10 creates in a minute
    for (let i = 0; i < 10; i++) {
      expect(limiter.canCreateCode(ip, 0).allowed).toBe(true);
      limiter.recordCreateAttempt(ip);
    }

    expect(limiter.canCreateCode(ip, 0).allowed).toBe(false);
  });

  it('limits WebSocket connections to 20 per IP', () => {
    const limiter = new RateLimiter({ maxWsPerIp: 20 });
    const ip = '10.0.0.4';

    for (let i = 0; i < 20; i++) {
      expect(limiter.canConnectWs(ip)).toBe(true);
      limiter.onWsConnected(ip);
    }

    // 21st fails
    expect(limiter.canConnectWs(ip)).toBe(false);

    // Disconnect one
    limiter.onWsDisconnected(ip);
    expect(limiter.canConnectWs(ip)).toBe(true);
  });

  it('limits message rate to 30 messages per 10 seconds per socket', () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ maxMsgsPer10s: 30, now: () => now });
    const socketId = 'sock-1';

    for (let i = 0; i < 30; i++) {
      expect(limiter.checkMessageRate(socketId)).toBe(true);
    }

    // 31st exceeds limit
    expect(limiter.checkMessageRate(socketId)).toBe(false);

    // After 10s allowed again
    now += 10_001;
    expect(limiter.checkMessageRate(socketId)).toBe(true);
  });
});
