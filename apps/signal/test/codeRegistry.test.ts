import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeRegistry } from '../src/codeRegistry.js';

describe('CodeRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates unique 6-digit codes with leading zeros', () => {
    let call = 0;
    const rng = () => {
      call++;
      return call === 1 ? 42 : 123456;
    };

    const registry = new CodeRegistry({ rng });
    const { code } = registry.createCode('sender-1', '127.0.0.1');

    expect(code).toBe('000042');
    expect(code.length).toBe(6);
    expect(registry.getActiveCount()).toBe(1);
    registry.clear();
  });

  it('retries on code collision until an unused code is found', () => {
    let callCount = 0;
    // Return 555555 first two times, then 777777
    const rng = () => {
      callCount++;
      return callCount <= 2 ? 555555 : 777777;
    };

    const registry = new CodeRegistry({ rng });
    const first = registry.createCode('sender-1', '127.0.0.1');
    expect(first.code).toBe('555555');

    // Second call will collide on 555555, then retry and get 777777
    const second = registry.createCode('sender-2', '127.0.0.2');
    expect(second.code).toBe('777777');
    expect(registry.getActiveCount()).toBe(2);
    registry.clear();
  });

  it('throws SERVER_BUSY after 50 failed collision attempts', () => {
    const rng = () => 123456; // always returns same number
    const registry = new CodeRegistry({ rng });
    registry.createCode('sender-1', '127.0.0.1');

    expect(() => registry.createCode('sender-2', '127.0.0.2')).toThrowError('SERVER_BUSY');
    registry.clear();
  });

  it('transitions ACTIVE -> LOCKED -> COOLDOWN -> FREE (AC-3)', () => {
    const rng = () => 123456;
    const cooldownSeconds = 45;
    const registry = new CodeRegistry({ rng, cooldownSeconds });

    // 1. ACTIVE
    const { code } = registry.createCode('sender-1', '127.0.0.1');
    expect(registry.getEntryByCode(code)?.state).toBe('ACTIVE');

    // 2. Request join
    const req = registry.requestJoin(code, 'receiver-1', '127.0.0.2');
    expect(req.status).toBe('OK');

    // 3. Accept join -> LOCKED
    const accepted = registry.acceptJoin(code, 'receiver-1');
    expect(accepted).toBe(true);
    expect(registry.getEntryByCode(code)?.state).toBe('LOCKED');
    expect(registry.getLockedCount()).toBe(1);

    // 4. Release code -> COOLDOWN
    const released = registry.releaseCode(code, 'completed');
    expect(released).toBe(true);
    expect(registry.getEntryByCode(code)?.state).toBe('COOLDOWN');
    expect(registry.getCooldownCount()).toBe(1);

    // Join during COOLDOWN must fail
    const joinInCooldown = registry.requestJoin(code, 'receiver-2', '127.0.0.3');
    expect(joinInCooldown.status).toBe('UNAVAILABLE');

    // 5. Advance timer past cooldown -> FREE
    vi.advanceTimersByTime(cooldownSeconds * 1000 + 100);
    expect(registry.getEntryByCode(code)).toBeUndefined();

    // 6. Same code can now be re-assigned!
    const reissued = registry.createCode('sender-3', '127.0.0.4');
    expect(reissued.code).toBe('123456');
    registry.clear();
  });

  it('expires code after TTL (AC-5)', () => {
    let releasedReason: string | undefined;
    const ttlSeconds = 600;
    const registry = new CodeRegistry({
      ttlSeconds,
      onCodeReleased: (_entry, reason) => {
        releasedReason = reason;
      },
    });

    const { code } = registry.createCode('sender-1', '127.0.0.1');
    expect(registry.getEntryByCode(code)?.state).toBe('ACTIVE');

    vi.advanceTimersByTime(ttlSeconds * 1000 + 100);
    expect(releasedReason).toBe('expired');
    expect(registry.getEntryByCode(code)?.state).toBe('COOLDOWN');
    registry.clear();
  });

  it('releases code on sender disconnect (AC-4)', () => {
    let releasedReason: string | undefined;
    const registry = new CodeRegistry({
      onCodeReleased: (_entry, reason) => {
        releasedReason = reason;
      },
    });

    const { code } = registry.createCode('sender-1', '127.0.0.1');
    registry.handleDisconnect('sender-1');

    expect(releasedReason).toBe('cancelled');
    expect(registry.getEntryByCode(code)?.state).toBe('COOLDOWN');
    registry.clear();
  });

  it('releases code when either socket disconnects during LOCKED', () => {
    let releasedReason: string | undefined;
    const registry = new CodeRegistry({
      onCodeReleased: (_entry, reason) => {
        releasedReason = reason;
      },
    });

    const { code } = registry.createCode('sender-1', '127.0.0.1');
    registry.requestJoin(code, 'receiver-1', '127.0.0.2');
    registry.acceptJoin(code, 'receiver-1');

    // Receiver disconnects
    registry.handleDisconnect('receiver-1');
    expect(releasedReason).toBe('peer-left');
    expect(registry.getEntryByCode(code)?.state).toBe('COOLDOWN');
    registry.clear();
  });

  it('releases code after 3 rejections', () => {
    let releasedReason: string | undefined;
    const registry = new CodeRegistry({
      onCodeReleased: (_entry, reason) => {
        releasedReason = reason;
      },
    });

    const { code } = registry.createCode('sender-1', '127.0.0.1');

    // 1st rejection
    registry.requestJoin(code, 'rec-1', '1.1.1.1');
    const r1 = registry.rejectJoin(code, 'rec-1');
    expect(r1.shouldRelease).toBe(false);
    expect(registry.getEntryByCode(code)?.state).toBe('ACTIVE');

    // 2nd rejection
    registry.requestJoin(code, 'rec-2', '1.1.1.2');
    const r2 = registry.rejectJoin(code, 'rec-2');
    expect(r2.shouldRelease).toBe(false);
    expect(registry.getEntryByCode(code)?.state).toBe('ACTIVE');

    // 3rd rejection
    registry.requestJoin(code, 'rec-3', '1.1.1.3');
    const r3 = registry.rejectJoin(code, 'rec-3');
    expect(r3.shouldRelease).toBe(true);
    expect(releasedReason).toBe('cancelled');
    expect(registry.getEntryByCode(code)?.state).toBe('COOLDOWN');
    registry.clear();
  });
});
