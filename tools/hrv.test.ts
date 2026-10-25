import { describe, expect, it } from 'vitest';
import { detectBeats, diffs, matchBeats, rmssd, synthBeats, within } from './hrv.ts';

describe('offline HRV tool (PROJECT_SPEC 7.4)', () => {
  it('rmssd of known intervals', () => {
    // Successive differences 10, -20, 10: sqrt((100 + 400 + 100) / 3).
    expect(rmssd([800, 810, 790, 800])).toBeCloseTo(Math.sqrt(200), 10);
    expect(rmssd([800])).toBeNaN();
  });

  it('matchBeats counts matched, missed, and extra beats', () => {
    const m = matchBeats([1005, 1500, 2010, 3990], [1000, 2000, 3000, 4000]);
    expect(m.matched).toBe(3);
    expect(m.missed).toBe(1);
    expect(m.extra).toBe(1);
    expect(m.errorsMs).toEqual([5, 10, -10]);
  });

  it('noise-free synthetic beats are found, and interpolation removes the 30 Hz grid error', () => {
    const s = synthBeats({
      durationMs: 60_000,
      fps: 30,
      meanBpm: 70,
      ibiSdMs: 20,
      rsaMs: 30,
      amplitude: 0.004,
      noiseSd: 0,
      jitterMs: 0,
      seed: 3,
    });
    const truth = within(s.truthMs, 2000, 58_000);
    const grid = within(detectBeats(s.window, false) ?? [], 2000, 58_000);
    const fine = within(detectBeats(s.window, true) ?? [], 2000, 58_000);
    expect(matchBeats(grid, truth)).toMatchObject({ missed: 0, extra: 0 });
    const errGrid = Math.abs(rmssd(diffs(grid)) - rmssd(diffs(truth)));
    const errFine = Math.abs(rmssd(diffs(fine)) - rmssd(diffs(truth)));
    expect(errFine).toBeLessThan(1);
    expect(errGrid).toBeGreaterThan(errFine);
  });
});
