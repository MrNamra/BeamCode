export interface SpeedSample {
  timestamp: number;
  bytes: number;
}

export class SpeedMeter {
  private samples: SpeedSample[] = [];
  private windowDurationMs = 1000; // 1 second sliding window
  private smoothedSpeed = 0; // Bytes/sec (EMA smoothed)
  private alpha = 0.3; // Smoothing factor for EMA

  constructor(windowDurationMs = 1000, alpha = 0.3) {
    this.windowDurationMs = windowDurationMs;
    this.alpha = alpha;
  }

  addBytes(bytes: number, nowMs = Date.now()): void {
    if (bytes < 0) return;
    this.samples.push({ timestamp: nowMs, bytes });

    // Prune samples older than window
    const cutoff = nowMs - this.windowDurationMs;
    this.samples = this.samples.filter((s) => s.timestamp >= cutoff);

    // Compute raw rate across current window
    if (this.samples.length >= 2) {
      const oldest = this.samples[0]!;
      const newest = this.samples[this.samples.length - 1]!;
      const durationSec = (newest.timestamp - oldest.timestamp) / 1000;
      if (durationSec > 0.05) {
        let totalBytes = 0;
        // sum bytes from second sample onwards
        for (let i = 1; i < this.samples.length; i++) {
          totalBytes += this.samples[i]!.bytes;
        }
        const currentRate = totalBytes / durationSec;
        if (this.smoothedSpeed === 0) {
          this.smoothedSpeed = currentRate;
        } else {
          this.smoothedSpeed = this.alpha * currentRate + (1 - this.alpha) * this.smoothedSpeed;
        }
      }
    } else if (this.samples.length === 1 && this.smoothedSpeed === 0) {
      this.smoothedSpeed = bytes;
    }
  }

  getSpeedBytesPerSec(): number {
    return Math.max(0, this.smoothedSpeed);
  }

  /**
   * Formatted speed string, default decimal MB/s (1 MB = 1,000,000 bytes)
   */
  getFormattedSpeed(unit: 'MB/s' | 'Mbps' = 'MB/s'): string {
    const bytesPerSec = this.getSpeedBytesPerSec();

    if (unit === 'Mbps') {
      const mbps = (bytesPerSec * 8) / 1_000_000;
      return `${mbps.toFixed(1)} Mbps`;
    }

    if (bytesPerSec >= 1_000_000) {
      const mbs = bytesPerSec / 1_000_000;
      return `${mbs.toFixed(1)} MB/s`;
    }

    if (bytesPerSec >= 1_000) {
      const kbs = bytesPerSec / 1_000;
      return `${kbs.toFixed(1)} KB/s`;
    }

    return `${Math.round(bytesPerSec)} B/s`;
  }

  getETASeconds(remainingBytes: number): number {
    const speed = this.getSpeedBytesPerSec();
    if (speed <= 0 || remainingBytes <= 0) return 0;
    return Math.round(remainingBytes / speed);
  }

  getFormattedETA(remainingBytes: number): string {
    const totalSeconds = this.getETASeconds(remainingBytes);
    if (totalSeconds <= 0) return '--:--';

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  reset(): void {
    this.samples = [];
    this.smoothedSpeed = 0;
  }
}
