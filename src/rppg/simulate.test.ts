import { describe, expect, it } from 'vitest';
import { runScenario, simulateFrames, type SimResult, type SimScenario } from './simulate.ts';

const clean: SimScenario = {
  bpm: 72,
  pulsePercent: 0.8,
  noiseSd: 0.2,
  light: 1,
  flickerPercent: 0,
  flickerBpm: 72,
  headSpeed: 0,
  fps: 30,
  faceLost: false,
  seed: 1,
};

const flagged = (r: SimResult, flag: string) =>
  r.hops.filter((h) =>
    [...h.update.globalFlags, ...h.update.regions.flatMap((x) => x.flags)].some((f) => f === flag),
  ).length;
const withStatus = (r: SimResult, status: string) =>
  r.hops.filter((h) => h.update.status === status).length;

describe('simulateFrames', () => {
  it('keeps the requested frame rate and duration, and repeats exactly for one seed', () => {
    const frames = simulateFrames(clean);
    expect(frames).toHaveLength(1800);
    expect(frames[30]?.tMs).toBeCloseTo(1000, 9);
    expect(simulateFrames(clean)).toEqual(frames);
    expect(simulateFrames({ ...clean, seed: 2 })).not.toEqual(frames);
  });

  it('removes the face only during the 3 s loss', () => {
    const frames = simulateFrames({ ...clean, faceLost: true });
    const lost = frames.filter((f) => !f.faceValid);
    expect(lost).toHaveLength(90);
    expect(lost[0]?.tMs).toBe(25_000);
    expect(lost[0]?.regions).toEqual({});
    expect(lost[0]?.motion).toBeNull();
  });

  it('never leaves the 0-255 pixel range', () => {
    const frames = simulateFrames({ ...clean, light: 2, noiseSd: 5, flickerPercent: 10 });
    for (const f of frames) {
      for (const r of Object.values(f.regions)) {
        if (!r) continue;
        for (const c of [r.r, r.g, r.b]) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    }
  });
});

describe('runScenario, through the real PulseEstimator', () => {
  it('a clean signal: values shown almost throughout, close to the truth', () => {
    const r = runScenario(clean);
    expect(r.hops.length).toBe(50);
    expect(r.shown).toBeGreaterThanOrEqual(48);
    expect(r.medianAbsError).toBeLessThan(1);
    expect(r.wrong).toBe(0);
  });

  it('finds other true rates too', () => {
    for (const bpm of [50, 110, 150]) {
      const r = runScenario({ ...clean, bpm, flickerBpm: bpm });
      expect(r.shown).toBeGreaterThanOrEqual(45);
      expect(r.medianAbsError).toBeLessThan(1);
    }
  });

  it('no pulse in the signal: errors are not defined, and every shown value counts as wrong', () => {
    const r = runScenario({ ...clean, pulsePercent: 0 });
    expect(r.medianAbsError).toBeNull();
    expect(r.maxAbsError).toBeNull();
    expect(r.wrong).toBe(r.shown);
    // Measured across seeds in docs/METHODS.md; here only that it mostly refuses.
    expect(r.shown).toBeLessThan(5);
  });

  it('a dark scene is flagged and withholds a value', () => {
    const r = runScenario({ ...clean, light: 0.25 });
    expect(flagged(r, 'dark')).toBe(r.hops.length);
    expect(r.shown).toBe(0);
  });

  it('a very bright scene is flagged as saturated and withholds a value', () => {
    const r = runScenario({ ...clean, light: 2 });
    expect(flagged(r, 'saturated')).toBe(r.hops.length);
    expect(r.shown).toBe(0);
  });

  it('light flickering at the pulse rate is flagged by the background check', () => {
    const r = runScenario({ ...clean, flickerPercent: 1, flickerBpm: 72 });
    expect(flagged(r, 'flicker')).toBeGreaterThan(40);
  });

  it('head movement raises the motion flag; a still head does not', () => {
    expect(flagged(runScenario({ ...clean, headSpeed: 1 }), 'motion')).toBeGreaterThan(40);
    expect(flagged(runScenario(clean), 'motion')).toBe(0);
  });

  it('below 15 fps there is no estimate; below 20 fps it warns', () => {
    const tooLow = runScenario({ ...clean, fps: 12 });
    expect(tooLow.shown).toBe(0);
    expect(withStatus(tooLow, 'fpsTooLow')).toBeGreaterThan(40);
    expect(flagged(runScenario({ ...clean, fps: 18 }), 'lowFps')).toBeGreaterThan(40);
  });

  it('losing the face withholds values while the 10 s window covers the loss', () => {
    const r = runScenario({ ...clean, faceLost: true });
    const covering = r.hops.filter((h) => h.tMs >= 26_000 && h.tMs < 35_000);
    expect(covering.length).toBeGreaterThan(5);
    expect(covering.every((h) => h.update.displayBpm === null)).toBe(true);
    expect(r.hops.some((h) => h.tMs > 40_000 && h.update.displayBpm !== null)).toBe(true);
  });

  it('known limitation: at 50 BPM with noise, the cross-check downgrades correct values', () => {
    // Not a goal: this records current behaviour (docs/LIMITATIONS.md, npm run bench:break).
    const r = runScenario({ ...clean, bpm: 50, flickerBpm: 50, noiseSd: 0.5 });
    expect(r.medianAbsError).toBeLessThan(1);
    expect(flagged(r, 'crossCheck')).toBeGreaterThan(40);
    const good = r.hops.filter((h) => h.update.level === 'good').length;
    expect(good).toBeLessThan(5);
  });

  it('counts a shown value far from the truth as wrong', () => {
    // A strong flicker at another rate pulls estimates away from the true 72 BPM.
    const r = runScenario({ ...clean, pulsePercent: 0.1, flickerPercent: 5, flickerBpm: 130 });
    expect(r.wrong).toBe(
      r.hops.filter((h) => h.update.displayBpm !== null && Math.abs(h.update.displayBpm - 72) > 5)
        .length,
    );
  });
});
