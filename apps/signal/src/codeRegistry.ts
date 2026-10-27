import crypto from 'node:crypto';
import {
  CODE_LENGTH,
  DEFAULT_CODE_TTL_SECONDS,
  DEFAULT_CODE_COOLDOWN_SECONDS,
  DEFAULT_LOCKED_IDLE_TIMEOUT_SECONDS,
  MAX_ACTIVE_CODES,
  MAX_REJECTIONS,
} from '@beamcode/protocol';

export type CodeState = 'ACTIVE' | 'LOCKED' | 'COOLDOWN';

export interface CodeEntry {
  code: string;
  state: CodeState;
  senderId: string;
  senderIp: string;
  receiverId?: string;
  receiverIp?: string;
  createdAt: number;
  expiresAt: number;
  rejectionCount: number;
  ttlTimer?: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  cooldownTimer?: ReturnType<typeof setTimeout>;
}

export type CodeReleaseReason =
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'expired'
  | 'peer-left'
  | 'idle';

export interface CodeRegistryOptions {
  ttlSeconds?: number;
  cooldownSeconds?: number;
  lockedIdleTimeoutSeconds?: number;
  maxActiveCodes?: number;
  rng?: (min: number, max: number) => number;
  now?: () => number;
  onCodeReleased?: (
    entry: CodeEntry,
    reason: CodeReleaseReason,
    targets: { senderId: string; receiverId?: string }
  ) => void;
}

export class CodeRegistry {
  private codes = new Map<string, CodeEntry>(); // code -> CodeEntry
  private socketToCode = new Map<string, string>(); // socketId (sender or receiver) -> code
  private ipToActiveCodes = new Map<string, Set<string>>(); // ip -> Set<code active/locked>

  private rng: (min: number, max: number) => number;
  private now: () => number;

  constructor(private options: CodeRegistryOptions = {}) {
    this.rng = options.rng ?? ((min, max) => crypto.randomInt(min, max));
    this.now = options.now ?? (() => Date.now());
  }

  private get ttlMs(): number {
    return (this.options.ttlSeconds ?? DEFAULT_CODE_TTL_SECONDS) * 1000;
  }

  private get cooldownMs(): number {
    return (this.options.cooldownSeconds ?? DEFAULT_CODE_COOLDOWN_SECONDS) * 1000;
  }

  private get lockedIdleMs(): number {
    return (this.options.lockedIdleTimeoutSeconds ?? DEFAULT_LOCKED_IDLE_TIMEOUT_SECONDS) * 1000;
  }

  private get maxCapacity(): number {
    return this.options.maxActiveCodes ?? MAX_ACTIVE_CODES;
  }

  getActiveCount(): number {
    let count = 0;
    for (const entry of this.codes.values()) {
      if (entry.state === 'ACTIVE') count++;
    }
    return count;
  }

  getLockedCount(): number {
    let count = 0;
    for (const entry of this.codes.values()) {
      if (entry.state === 'LOCKED') count++;
    }
    return count;
  }

  getCooldownCount(): number {
    let count = 0;
    for (const entry of this.codes.values()) {
      if (entry.state === 'COOLDOWN') count++;
    }
    return count;
  }

  getActiveCodesForIp(ip: string): number {
    const set = this.ipToActiveCodes.get(ip);
    return set ? set.size : 0;
  }

  getEntryByCode(code: string): CodeEntry | undefined {
    return this.codes.get(code);
  }

  getEntryBySocket(socketId: string): CodeEntry | undefined {
    const code = this.socketToCode.get(socketId);
    if (!code) return undefined;
    return this.codes.get(code);
  }

  /**
   * Generates a new 6-digit code and creates an ACTIVE code entry for a sender.
   * Throws Error with message 'SERVER_BUSY' if registry is full or code collision retries exceed 50.
   */
  createCode(senderId: string, senderIp: string): { code: string; expiresAt: number } {
    if (this.codes.size >= this.maxCapacity) {
      throw new Error('SERVER_BUSY');
    }

    // Try up to 50 times to generate an unused code
    let code = '';
    let attempts = 0;
    while (attempts < 50) {
      const num = this.rng(0, 1_000_000);
      const candidate = num.toString().padStart(CODE_LENGTH, '0');
      if (!this.codes.has(candidate)) {
        code = candidate;
        break;
      }
      attempts++;
    }

    if (!code) {
      throw new Error('SERVER_BUSY');
    }

    const currentTime = this.now();
    const expiresAt = currentTime + this.ttlMs;

    const entry: CodeEntry = {
      code,
      state: 'ACTIVE',
      senderId,
      senderIp,
      createdAt: currentTime,
      expiresAt,
      rejectionCount: 0,
    };

    // Schedule TTL expiration timer
    entry.ttlTimer = setTimeout(() => {
      this.releaseCode(code, 'expired');
    }, this.ttlMs);

    this.codes.set(code, entry);
    this.socketToCode.set(senderId, code);

    // Track active codes for sender IP
    let ipSet = this.ipToActiveCodes.get(senderIp);
    if (!ipSet) {
      ipSet = new Set();
      this.ipToActiveCodes.set(senderIp, ipSet);
    }
    ipSet.add(code);

    return { code, expiresAt };
  }

  /**
   * Called when a receiver requests to join with a code.
   * Must be in ACTIVE state.
   */
  requestJoin(
    code: string,
    receiverId: string,
    receiverIp: string
  ): { status: 'OK'; entry: CodeEntry } | { status: 'UNAVAILABLE' } {
    const entry = this.codes.get(code);
    if (!entry || entry.state !== 'ACTIVE') {
      return { status: 'UNAVAILABLE' };
    }

    // Temporarily record receiver candidate
    entry.receiverId = receiverId;
    entry.receiverIp = receiverIp;
    this.socketToCode.set(receiverId, code);

    return { status: 'OK', entry };
  }

  /**
   * Called when sender approves receiver join request.
   * Transitions state from ACTIVE to LOCKED.
   */
  acceptJoin(code: string, receiverId: string): boolean {
    const entry = this.codes.get(code);
    if (!entry || entry.state !== 'ACTIVE' || entry.receiverId !== receiverId) {
      return false;
    }

    // Cancel TTL timer — TTL no longer applies while LOCKED
    if (entry.ttlTimer) {
      clearTimeout(entry.ttlTimer);
      entry.ttlTimer = undefined;
    }

    entry.state = 'LOCKED';

    // Start locked idle timer (60 s before data channels / signaling starts)
    this.resetIdleTimer(entry);

    return true;
  }

  /**
   * Resets the 60 s locked idle timeout when signaling activity occurs.
   */
  resetIdleTimer(entry: CodeEntry): void {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }
    entry.idleTimer = setTimeout(() => {
      this.releaseCode(entry.code, 'idle');
    }, this.lockedIdleMs);
  }

  /**
   * Clears idle timer once data channels are active (or if closed).
   */
  clearIdleTimer(entry: CodeEntry): void {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
  }

  /**
   * Called when sender rejects receiver join request.
   * Increments rejection counter. Returns code to ACTIVE.
   * After 3 rejections, releases code with 'cancelled'.
   */
  rejectJoin(
    code: string,
    receiverId: string
  ): { ok: boolean; shouldRelease: boolean; rejections: number } {
    const entry = this.codes.get(code);
    if (!entry || entry.receiverId !== receiverId) {
      return { ok: false, shouldRelease: false, rejections: 0 };
    }

    this.socketToCode.delete(receiverId);
    entry.receiverId = undefined;
    entry.receiverIp = undefined;
    entry.rejectionCount++;

    if (entry.rejectionCount >= MAX_REJECTIONS) {
      this.releaseCode(code, 'cancelled');
      return { ok: true, shouldRelease: true, rejections: entry.rejectionCount };
    }

    return { ok: true, shouldRelease: false, rejections: entry.rejectionCount };
  }

  /**
   * Releases a code (from ACTIVE or LOCKED) and transitions to COOLDOWN.
   * After cooldown delay, frees the code completely.
   */
  releaseCode(code: string, reason: CodeReleaseReason): boolean {
    const entry = this.codes.get(code);
    if (!entry || entry.state === 'COOLDOWN') {
      return false;
    }

    const targets = {
      senderId: entry.senderId,
      receiverId: entry.receiverId,
    };

    // Clean up active timers
    if (entry.ttlTimer) {
      clearTimeout(entry.ttlTimer);
      entry.ttlTimer = undefined;
    }
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }

    // Clean up IP active code set
    const senderSet = this.ipToActiveCodes.get(entry.senderIp);
    if (senderSet) {
      senderSet.delete(code);
      if (senderSet.size === 0) {
        this.ipToActiveCodes.delete(entry.senderIp);
      }
    }

    // Disassociate sockets from the code
    this.socketToCode.delete(entry.senderId);
    if (entry.receiverId) {
      this.socketToCode.delete(entry.receiverId);
    }

    // Move to COOLDOWN
    entry.state = 'COOLDOWN';

    // Notify listeners
    if (this.options.onCodeReleased) {
      this.options.onCodeReleased(entry, reason, targets);
    }

    // Schedule cooldown expiration to completely free code
    entry.cooldownTimer = setTimeout(() => {
      this.codes.delete(code);
    }, this.cooldownMs);

    return true;
  }

  /**
   * Handles socket disconnect (sender or receiver).
   */
  handleDisconnect(socketId: string): void {
    const code = this.socketToCode.get(socketId);
    if (!code) return;

    const entry = this.codes.get(code);
    if (!entry) {
      this.socketToCode.delete(socketId);
      return;
    }

    if (entry.state === 'ACTIVE') {
      if (socketId === entry.senderId) {
        // Sender disconnected while ACTIVE -> release
        this.releaseCode(code, 'cancelled');
      } else if (socketId === entry.receiverId) {
        // Pending receiver disconnected -> reset receiver
        this.socketToCode.delete(socketId);
        entry.receiverId = undefined;
        entry.receiverIp = undefined;
      }
    } else if (entry.state === 'LOCKED') {
      // Either socket disconnects during LOCKED -> release with peer-left
      this.releaseCode(code, 'peer-left');
    }
  }

  /**
   * Clean up all timers and state (e.g. for server shutdown or tests).
   */
  clear(): void {
    for (const entry of this.codes.values()) {
      if (entry.ttlTimer) clearTimeout(entry.ttlTimer);
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      if (entry.cooldownTimer) clearTimeout(entry.cooldownTimer);
    }
    this.codes.clear();
    this.socketToCode.clear();
    this.ipToActiveCodes.clear();
  }
}
