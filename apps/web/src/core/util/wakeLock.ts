export class WakeLockManager {
  private sentinel: unknown = null;

  async request(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.sentinel = await (navigator as any).wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  async release(): Promise<void> {
    if (this.sentinel) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this.sentinel as any).release();
      } catch {
        // ignore
      }
      this.sentinel = null;
    }
  }
}
