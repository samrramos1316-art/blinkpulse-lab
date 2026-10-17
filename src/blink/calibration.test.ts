import { describe, expect, it } from 'vitest';
import { synthEar, typicalBlink } from '../../tools/synth.ts';
import { calibrate, thresholdsFromBaseline } from './calibration.ts';

describe('calibrate (PROJECT_SPEC 5.3)', () => {
  it('thresholds are 0.70 and 0.80 of the baseline', () => {
    const t = thresholdsFromBaseline(0.3);
    expect(t.closeEar).toBeCloseTo(0.21, 12);
    expect(t.reopenEar).toBeCloseTo(0.24, 12);
  });

  it('robust baseline: blinks during calibration do not pull it down', () => {
    // 10 s at 30 fps with 4 blinks and mild noise.
    const samples = synthEar({
      durationMs: 10_000,
      fps: 30,
      baseline: 0.3,
      blinks: [1000, 3500, 6000, 8500].map((t) => typicalBlink(t)),
      noiseSd: 0.005,
      seed: 3,
    }).map((s) => s.ear);
    const r = calibrate(samples);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.baseline).toBeCloseTo(0.3, 2);
    expect(r.n).toBe(300);
    expect(r.nKept).toBeLessThan(r.n); // blink frames dropped by the 0.85 b0 rule
    expect(r.closeEar).toBeCloseTo(0.7 * r.baseline, 12);
    expect(r.relativeSpread).toBeGreaterThan(0);
    expect(r.relativeSpread).toBeLessThan(0.05);
  });

  it('second median recovers the open-eye level when b0 is pulled down', () => {
    // Half open at 0.30, half partly closed at 0.22: b0 = 0.26. Keeping samples
    // >= 0.85 * 0.26 = 0.221 drops the 0.22s, so b = 0.30.
    const samples = [...Array<number>(50).fill(0.3), ...Array<number>(50).fill(0.22)];
    const r = calibrate(samples, 10);
    expect(r.ok && r.nKept).toBe(50);
    expect(r.ok && r.baseline).toBe(0.3);
  });

  it('asks for a retry with too few valid samples', () => {
    const r = calibrate([0.3, 0.3, NaN, 0.31], 100);
    expect(r).toEqual({ ok: false, n: 3, reason: 'tooFewSamples' });
  });

  it('ignores non-finite and non-positive values', () => {
    const r = calibrate([...Array<number>(100).fill(0.28), NaN, -1, 0, Infinity], 100);
    expect(r.ok && r.n).toBe(100);
  });
});
