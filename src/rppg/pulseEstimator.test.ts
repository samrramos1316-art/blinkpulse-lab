import { describe, expect, it } from 'vitest';
import { synthRgb, type SynthRgbOptions } from '../../tools/synth.ts';
import { median } from '../dsp/stats.ts';
import { PulseEstimator, type PulseFrame, type PulseUpdate } from './pulseEstimator.ts';
import type { RegionId, RoiStats } from './roi.ts';

type RegionSpec = Partial<SynthRgbOptions> & { bpm: number };

const stats = (r: number, g: number, b: number): RoiStats => ({
  r,
  g,
  b,
  polygonPixels: 500,
  coverage: 1,
  saturatedFraction: 0,
  meanLuma: 110,
});

/**
 * Feed `durationMs` of synthetic frames for three regions to a PulseEstimator and
 * return every update. All regions share frame times (30 fps, no jitter).
 */
function simulate(
  regions: Record<RegionId, RegionSpec>,
  durationMs = 20_000,
  edit?: (f: PulseFrame) => PulseFrame,
): PulseUpdate[] {
  const traces = Object.fromEntries(
    Object.entries(regions).map(([id, spec], k) => [
      id,
      synthRgb({ durationMs, fps: 30, amplitude: 0.005, seed: 11 + k, ...spec }),
    ]),
  ) as Record<RegionId, ReturnType<typeof synthRgb>>;
  const est = new PulseEstimator();
  const out: PulseUpdate[] = [];
  const n = traces.forehead.tMs.length;
  for (let i = 0; i < n; i++) {
    let frame: PulseFrame = {
      tMs: traces.forehead.tMs[i] as number,
      gapBefore: false,
      faceValid: true,
      regions: Object.fromEntries(
        (Object.keys(traces) as RegionId[]).map((id) => {
          const t = traces[id];
          return [id, stats(t.r[i] as number, t.g[i] as number, t.b[i] as number)];
        }),
      ),
      motion: { noseTip: { x: 320, y: 240 }, iodPx: 100 },
    };
    if (edit) frame = edit(frame);
    const u = est.push(frame);
    if (u) out.push(u);
  }
  return out;
}

const estimated = (us: PulseUpdate[]) => us.filter((u) => u.status !== 'warmingUp');

describe('PulseEstimator: Patch A fusion tests', () => {
  it('three regions, same BPM, different noise: fused error <= median single-region error; a noise-only region is excluded', () => {
    const us = estimated(
      simulate({
        forehead: { bpm: 75, noiseSd: 0.1 },
        leftCheek: { bpm: 75, noiseSd: 0.35 },
        rightCheek: { bpm: 75, amplitude: 0, noiseSd: 1 }, // noise only
      }),
    );
    expect(us.length).toBeGreaterThanOrEqual(9);
    for (const u of us) {
      const singles = u.regions
        .filter((r) => r.bpm !== null)
        .map((r) => Math.abs((r.bpm as number) - 75));
      expect(Math.abs((u.rawBpm ?? Infinity) - 75)).toBeLessThanOrEqual(median(singles) + 1e-9);
      expect(u.fusion?.kept).not.toContain('rightCheek');
    }
  });

  it('two regions at the true BPM plus one at an unrelated frequency: fused within 2 BPM, disagreement flagged', () => {
    const us = estimated(
      simulate({
        forehead: { bpm: 70, noiseSd: 0.1 },
        leftCheek: { bpm: 70, noiseSd: 0.1 },
        rightCheek: { bpm: 115, noiseSd: 0.1 }, // motion-like artefact at 1.9 Hz
      }),
    );
    for (const u of us) {
      expect(Math.abs((u.rawBpm ?? Infinity) - 70)).toBeLessThanOrEqual(2);
      expect(u.fusion?.regionsDisagree).toBe(true);
      expect(u.fusion?.agreementBpm).toBeGreaterThan(8);
    }
  });

  it('all three regions poor: "-" (no number) with a reason', () => {
    const us = estimated(
      simulate({
        forehead: { bpm: 70, amplitude: 0, noiseSd: 1 },
        leftCheek: { bpm: 70, amplitude: 0, noiseSd: 1 },
        rightCheek: { bpm: 70, amplitude: 0, noiseSd: 1 },
      }),
    );
    expect(us.length).toBeGreaterThan(0);
    for (const u of us) {
      expect(u.displayBpm).toBeNull();
      expect(u.status).toBe('notEnoughSignal');
    }
  });

  it('a frame gap invalidates the spanned windows in every region', () => {
    const us = simulate(
      { forehead: { bpm: 70 }, leftCheek: { bpm: 70 }, rightCheek: { bpm: 70 } },
      25_000,
      (f) => (Math.abs(f.tMs - 12_000) < 17 ? { ...f, gapBefore: true } : f),
    );
    const during = us.filter((u) => u.tMs > 12_100 && u.tMs < 21_900);
    expect(during.length).toBeGreaterThan(5);
    for (const u of during) {
      expect(u.status).toBe('gap');
      expect(u.regions.every((r) => r.failure === 'gap')).toBe(true);
    }
    const after = us.filter((u) => u.tMs > 22_100);
    expect(after.some((u) => u.status === 'ok')).toBe(true);
  });
});

describe('PulseEstimator: gating and smoothing', () => {
  it('warms up for the first 10 s, then estimates once per second', () => {
    const us = simulate({ forehead: { bpm: 66 }, leftCheek: { bpm: 66 }, rightCheek: { bpm: 66 } });
    const firstEst = us.findIndex((u) => u.status !== 'warmingUp');
    expect(us[firstEst]?.tMs).toBeGreaterThanOrEqual(10_000);
    const hops = estimated(us).map((u) => u.tMs);
    for (let i = 1; i < hops.length; i++) {
      expect((hops[i] as number) - (hops[i - 1] as number)).toBeGreaterThanOrEqual(1000);
      expect((hops[i] as number) - (hops[i - 1] as number)).toBeLessThan(1040);
    }
    expect(estimated(us).every((u) => u.status === 'ok' && u.level === 'good')).toBe(true);
    expect(Math.abs((estimated(us).at(-1)?.displayBpm ?? 0) - 66)).toBeLessThan(1);
  });

  it('face lost: no region is usable, the window fails as a gap', () => {
    const us = simulate(
      { forehead: { bpm: 70 }, leftCheek: { bpm: 70 }, rightCheek: { bpm: 70 } },
      20_000,
      (f) => (f.tMs > 14_000 && f.tMs < 15_000 ? { ...f, faceValid: false } : f),
    );
    expect(
      us.filter((u) => u.tMs > 15_100 && u.tMs < 23_900).every((u) => u.status === 'gap'),
    ).toBe(true);
  });

  it('motion lowers the level one step and is reported', () => {
    let x = 0;
    const us = estimated(
      simulate(
        { forehead: { bpm: 70 }, leftCheek: { bpm: 70 }, rightCheek: { bpm: 70 } },
        20_000,
        (f) => {
          x += 3; // 3 px per frame at 30 fps / 100 px IOD = 0.9 IOD/s
          return { ...f, motion: { noseTip: { x, y: 240 }, iodPx: 100 } };
        },
      ),
    );
    for (const u of us) {
      expect(u.globalFlags).toContain('motion');
      expect(u.level).toBe('fair');
    }
  });

  it('below 15 fps there is no pulse estimate', () => {
    const traces = synthRgb({ durationMs: 20_000, fps: 12, bpm: 70, amplitude: 0.005 });
    const est = new PulseEstimator();
    let last: PulseUpdate | null = null;
    traces.tMs.forEach((t, i) => {
      const s = stats(traces.r[i] as number, traces.g[i] as number, traces.b[i] as number);
      last =
        est.push({
          tMs: t,
          gapBefore: false,
          faceValid: true,
          regions: { forehead: s, leftCheek: s, rightCheek: s },
          motion: null,
        }) ?? last;
    });
    expect(last).not.toBeNull();
    expect((last as PulseUpdate | null)?.status).toBe('fpsTooLow');
    expect((last as PulseUpdate | null)?.displayBpm).toBeNull();
  });
});
