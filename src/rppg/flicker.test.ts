import { describe, expect, it } from 'vitest';
import { synthRgb, type SynthRgbOptions } from '../../tools/synth.ts';
import { PulseEstimator, type PulseUpdate } from './pulseEstimator.ts';
import { REGION_IDS, type RoiStats } from './roi.ts';

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
 * Three skin regions with the same synthetic signal (independent noise) and a
 * background reference, 30 fps. `background: null` leaves the reference out.
 */
function run(
  face: Partial<SynthRgbOptions> & { bpm: number },
  background: (Partial<SynthRgbOptions> & { bpm: number }) | null,
  seed = 1,
  durationMs = 20_000,
): PulseUpdate[] {
  const regions = REGION_IDS.map((_, k) =>
    synthRgb({ durationMs, fps: 30, amplitude: 0.005, noiseSd: 0.3, seed: seed * 10 + k, ...face }),
  );
  const bg = background
    ? synthRgb({
        durationMs,
        fps: 30,
        amplitude: 0,
        noiseSd: 0.3,
        means: [120, 120, 120],
        seed: seed * 10 + 7,
        ...background,
      })
    : null;
  const est = new PulseEstimator();
  const out: PulseUpdate[] = [];
  const first = regions[0] as ReturnType<typeof synthRgb>;
  for (let i = 0; i < first.tMs.length; i++) {
    const u = est.push({
      tMs: first.tMs[i] as number,
      gapBefore: false,
      faceValid: true,
      regions: Object.fromEntries(
        REGION_IDS.map((id, k) => {
          const t = regions[k] as ReturnType<typeof synthRgb>;
          return [id, stats(t.r[i] as number, t.g[i] as number, t.b[i] as number)];
        }),
      ),
      motion: { noseTip: { x: 320, y: 240 }, iodPx: 100 },
      background: bg ? stats(bg.r[i] as number, bg.g[i] as number, bg.b[i] as number) : null,
    });
    if (u && u.status !== 'warmingUp') out.push(u);
  }
  return out;
}

const flagged = (us: PulseUpdate[]) =>
  us.filter((u) => u.regions.some((r) => r.flags.includes('flicker'))).length;

describe('flicker check against the background reference (Phase 6)', () => {
  it('light pulsing at the same rate in the background flags every region and lowers it', () => {
    // The "pulse" in the skin is really the lamp: the background varies at 90 BPM too.
    const flick = run({ bpm: 90 }, { bpm: 90, amplitude: 0.01, pulseDir: [1, 1, 1] });
    const clean = run({ bpm: 90 }, { bpm: 90 });
    expect(flick.length).toBe(10);
    expect(flick.every((u) => u.backgroundChecked)).toBe(true);
    expect(flick.every((u) => u.regions.every((r) => r.flags.includes('flicker')))).toBe(true);
    // Each region is one quality step lower than without the flicker.
    const order = { poor: 0, fair: 1, good: 2 } as const;
    flick.forEach((u, i) => {
      for (const r of u.regions) {
        const before = clean[i]?.regions.find((x) => x.id === r.id)?.level;
        if (r.level && before) expect(order[r.level]).toBe(Math.max(0, order[before] - 1));
      }
    });
  });

  it('background flicker at a different rate does not flag a real pulse', () => {
    const us = run({ bpm: 66 }, { bpm: 120, amplitude: 0.01, pulseDir: [1, 1, 1] });
    expect(flagged(us)).toBe(0);
    expect(us.filter((u) => u.displayBpm !== null).length).toBeGreaterThan(0);
  });

  it('no background reference: nothing is checked or flagged', () => {
    const us = run({ bpm: 90 }, null);
    expect(us.some((u) => u.backgroundChecked)).toBe(false);
    expect(flagged(us)).toBe(0);
  });

  it('false flags on a steady background (noise only), 40 streams', () => {
    // Background: sensor noise only. Rates 55-165 BPM, 8 seeds each, 50 s per stream.
    let hops = 0;
    let falseFlags = 0;
    for (const bpm of [55, 72, 95, 130, 165]) {
      for (let seed = 1; seed <= 8; seed++) {
        const us = run({ bpm }, { bpm: 60, amplitude: 0, noiseSd: 0.5 }, seed, 50_000);
        hops += us.length;
        falseFlags += flagged(us);
      }
    }
    expect(hops).toBe(40 * 40);
    // Measured: 3 of 1600 hops (0.19%), recorded in docs/METHODS.md. The threshold
    // (FLICKER_SQI = SQI_FAIR) was not tuned to this result.
    expect(falseFlags).toBe(3);
  });
});
