import { describe, expect, it } from 'vitest';
import { poolWindows, pooledStats } from './pooled.ts';

describe('poolWindows', () => {
  it('averages each channel divided by its window mean, at frame times every region has', () => {
    const a = {
      tMs: [0, 33, 67, 100],
      r: [100, 110, 90, 100],
      g: [50, 50, 50, 50],
      b: [10, 20, 10, 0],
    };
    const b = { tMs: [0, 67, 100], r: [200, 200, 200], g: [80, 120, 100], b: [30, 30, 30] };
    const p = poolWindows([a, b]);
    expect(p?.tMs).toEqual([0, 67, 100]); // 33 is missing from b
    // r: a/100 and b/200 -> (1.0 + 1) / 2, (0.9 + 1) / 2, (1.0 + 1) / 2
    expect(p?.r).toEqual([1, 0.95, 1]);
    // g: a/50 = 1; b/100 = 0.8, 1.2, 1.0
    expect(Array.from(p?.g ?? [], (v) => +v.toFixed(10))).toEqual([0.9, 1.1, 1]);
    expect(p?.b[1]).toBeCloseTo((10 / 10 + 1) / 2, 10);
  });

  it('leaves out a region with a channel that has no light', () => {
    const ok = { tMs: [0, 33], r: [100, 102], g: [50, 51], b: [20, 21] };
    const dark = { tMs: [0, 33], r: [100, 102], g: [50, 51], b: [0, 0] };
    expect(poolWindows([ok, dark])).toBeNull();
    const p = poolWindows([ok, ok, dark]);
    expect(Array.from(p?.b ?? [NaN]).every((v) => Number.isFinite(v))).toBe(true);
  });

  it('needs at least two regions', () => {
    expect(poolWindows([])).toBeNull();
    expect(poolWindows([{ tMs: [0, 1], r: [1, 1], g: [1, 1], b: [1, 1] }])).toBeNull();
  });
});

describe('pooledStats', () => {
  it('takes the most cautious value of each statistic', () => {
    const s = pooledStats([
      { coverage: 0.9, saturatedFraction: 0.01, meanLuma: 120, maxLumaJump: 0.01, fps: 30 },
      { coverage: 0.7, saturatedFraction: 0.03, meanLuma: 80, maxLumaJump: 0.04, fps: 29 },
    ]);
    expect(s).toEqual({
      coverage: 0.7,
      saturatedFraction: 0.03,
      meanLuma: 80,
      maxLumaJump: 0.04,
      fps: 29,
    });
  });
});
