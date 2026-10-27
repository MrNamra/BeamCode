export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export function normalizeIp(ip: string): string {
  // Strip IPv6-mapped IPv4 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
  let cleanIp = ip.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // Check if IPv6 (contains colons)
  if (cleanIp.includes(':')) {
    // Group IPv6 by /64 (first 4 hextets)
    const parts = cleanIp.split(':');
    return parts.slice(0, 4).join(':');
  }

  return cleanIp;
}

export class RateLimiter {
  private joinAttempts = new Map<string, number[]>(); // ip -> timestamps of join attempts
  private failedJoins = new Map<string, number[]>(); // ip -> timestamps of failed joins
  private createAttempts = new Map<string, number[]>(); // ip -> timestamps of create attempts
  private ipWsCount = new Map<string, number>(); // ip -> count of open sockets
  private socketMsgCount = new Map<string, number[]>(); // socketId -> timestamps of incoming messages

  constructor(
    private options: {
      rateJoinPerMin?: number;
      rateCreatePerMin?: number;
      maxCodesPerIp?: number;
      maxWsPerIp?: number;
      maxMsgsPer10s?: number;
      exemptLoopback?: boolean;
      now?: () => number;
    } = {}
  ) {}

  private get now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  // WebSocket connection limits (max 20 per IP)
  canConnectWs(ip: string): boolean {
    const norm = normalizeIp(ip);
    if (this.options.exemptLoopback && (norm === '127.0.0.1' || norm === '::1' || norm === 'localhost')) {
      return true;
    }
    const max = this.options.maxWsPerIp ?? 20;
    const current = this.ipWsCount.get(norm) ?? 0;
    return current < max;
  }

  onWsConnected(ip: string): void {
    const norm = normalizeIp(ip);
    const current = this.ipWsCount.get(norm) ?? 0;
    this.ipWsCount.set(norm, current + 1);
  }

  onWsDisconnected(ip: string): void {
    const norm = normalizeIp(ip);
    const current = this.ipWsCount.get(norm) ?? 0;
    if (current <= 1) {
      this.ipWsCount.delete(norm);
    } else {
      this.ipWsCount.set(norm, current - 1);
    }
  }

  // Per-socket message rate limit (30 msgs / 10 s)
  checkMessageRate(socketId: string): boolean {
    const max = this.options.maxMsgsPer10s ?? 30;
    const windowMs = 10_000;
    const currentTime = this.now;

    let timestamps = this.socketMsgCount.get(socketId);
    if (!timestamps) {
      timestamps = [];
      this.socketMsgCount.set(socketId, timestamps);
    }

    // Prune timestamps older than 10s
    const cutoff = currentTime - windowMs;
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length >= max) {
      return false; // exceeded
    }

    valid.push(currentTime);
    this.socketMsgCount.set(socketId, valid);
    return true;
  }

  onSocketClosed(socketId: string): void {
    this.socketMsgCount.delete(socketId);
  }

  // Create rate limit (10 / min, max 5 active codes simultaneously)
  canCreateCode(ip: string, activeCodesForIp: number): RateLimitResult {
    const norm = normalizeIp(ip);
    if (this.options.exemptLoopback && (norm === '127.0.0.1' || norm === '::1' || norm === 'localhost')) {
      return { allowed: true };
    }

    const maxActive = this.options.maxCodesPerIp ?? 5;
    if (activeCodesForIp >= maxActive) {
      return { allowed: false, retryAfterMs: 30_000 };
    }

    const maxPerMin = this.options.rateCreatePerMin ?? 10;
    const windowMs = 60_000;
    const currentTime = this.now;

    let timestamps = this.createAttempts.get(norm) ?? [];
    const cutoff = currentTime - windowMs;
    timestamps = timestamps.filter((t) => t > cutoff);

    if (timestamps.length >= maxPerMin) {
      const oldestInWindow = timestamps[0]!;
      const retryAfterMs = Math.max(1000, oldestInWindow + windowMs - currentTime);
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  recordCreateAttempt(ip: string): void {
    const norm = normalizeIp(ip);
    const currentTime = this.now;
    let timestamps = this.createAttempts.get(norm) ?? [];
    timestamps = timestamps.filter((t) => t > currentTime - 60_000);
    timestamps.push(currentTime);
    this.createAttempts.set(norm, timestamps);
  }

  // Join rate limit (10 / min; 5 failed joins in 10 min -> block for 10 min)
  canJoinCode(ip: string): RateLimitResult {
    const norm = normalizeIp(ip);
    if (this.options.exemptLoopback && (norm === '127.0.0.1' || norm === '::1' || norm === 'localhost')) {
      return { allowed: true };
    }

    const currentTime = this.now;

    // 1. Check failed joins penalty (5 in 10 min -> blocked for 10 min from last failure)
    const blockThreshold = 5;
    const blockWindowMs = 10 * 60_000;
    let failed = this.failedJoins.get(norm) ?? [];
    failed = failed.filter((t) => t > currentTime - blockWindowMs);
    this.failedJoins.set(norm, failed);

    if (failed.length >= blockThreshold) {
      const lastFailure = failed[failed.length - 1]!;
      const remainingBlock = lastFailure + blockWindowMs - currentTime;
      if (remainingBlock > 0) {
        return { allowed: false, retryAfterMs: remainingBlock };
      }
    }

    // 2. Check standard join rate (10 / min)
    const maxPerMin = this.options.rateJoinPerMin ?? 10;
    const windowMs = 60_000;
    let joins = this.joinAttempts.get(norm) ?? [];
    joins = joins.filter((t) => t > currentTime - windowMs);
    this.joinAttempts.set(norm, joins);

    if (joins.length >= maxPerMin) {
      const oldestInWindow = joins[0]!;
      const retryAfterMs = Math.max(1000, oldestInWindow + windowMs - currentTime);
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true };
  }

  recordJoinAttempt(ip: string): void {
    const norm = normalizeIp(ip);
    const currentTime = this.now;
    let joins = this.joinAttempts.get(norm) ?? [];
    joins = joins.filter((t) => t > currentTime - 60_000);
    joins.push(currentTime);
    this.joinAttempts.set(norm, joins);
  }

  recordFailedJoin(ip: string): void {
    const norm = normalizeIp(ip);
    const currentTime = this.now;
    let failed = this.failedJoins.get(norm) ?? [];
    failed = failed.filter((t) => t > currentTime - 10 * 60_000);
    failed.push(currentTime);
    this.failedJoins.set(norm, failed);
  }
}
