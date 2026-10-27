import { describe, it, expect } from 'vitest';
import { SpeedMeter } from '../src/core/util/speedMeter.js';

describe('SpeedMeter and ETA calculation', () => {
  it('computes throughput in MB/s accurately', () => {
    const meter = new SpeedMeter(1000, 1.0); // alpha = 1.0 (immediate update)

    let now = 1000;
    meter.addBytes(0, now);

    now += 500;
    meter.addBytes(5_000_000, now); // 5 MB in 0.5s = 10 MB/s

    const speed = meter.getSpeedBytesPerSec();
    expect(speed).toBeCloseTo(10_000_000, -4);
    expect(meter.getFormattedSpeed()).toBe('10.0 MB/s');
    expect(meter.getFormattedSpeed('Mbps')).toBe('80.0 Mbps');
  });

  it('formats ETA correctly for various remaining byte amounts', () => {
    const meter = new SpeedMeter(1000, 1.0);
    meter.addBytes(0, 1000);
    meter.addBytes(10_000_000, 2000); // 10 MB/s

    // Remaining 100 MB -> 10 seconds -> 00:10
    expect(meter.getETASeconds(100_000_000)).toBe(10);
    expect(meter.getFormattedETA(100_000_000)).toBe('00:10');

    // Remaining 125 MB -> 12.5s -> 13s -> 00:13
    expect(meter.getFormattedETA(125_000_000)).toBe('00:13');

    // Remaining 36000 MB -> 3600s = 1 hour -> 01:00:00
    expect(meter.getFormattedETA(36_000_000_000)).toBe('01:00:00');
  });

  it('handles zero or idle rate gracefully', () => {
    const meter = new SpeedMeter();
    expect(meter.getSpeedBytesPerSec()).toBe(0);
    expect(meter.getFormattedSpeed()).toBe('0 B/s');
    expect(meter.getFormattedETA(1000)).toBe('--:--');
  });
});
