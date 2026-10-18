import { describe, expect, it } from 'vitest';
import { synthRgb, type SynthRgbOptions } from '../../tools/synth.ts';
import { sosMagnitudeDb } from '../dsp/biquad.ts';
import { BANDPASS, FS, estimateWindow, sqi } from './hrEstimator.ts';
import { pos } from './pos.ts';

const BPMS = [50, 72, 95, 130, 170];
const SEEDS = 10;

function run(o: SynthRgbOptions, method: 'pos' | 'green' = 'pos') {
  const s = synthRgb(o);
  return estimateWindow({ tMs: s.tMs, r: s.r, g: s.g, b: s.b }, { method });
}

/** Max |BPM error| over BPMS x SEEDS windows (n = 50). */
function maxError(base: Omit<SynthRgbOptions, 'bpm' | 'seed'>): { max: number; n: number } {
  let max = 0;
  let n = 0;
  for (const bpm of BPMS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = run({ ...base, bpm, seed: seed * 31 + bpm });
      if (!r.ok) throw new Error(`window failed: ${r.reason}`);
      max = Math.max(max, Math.abs(r.bpm - bpm));
      n++;
    }
  }
  return { max, n };
}

describe('POS', () => {
  it('cancels an intensity change shared by all channels', () => {
    const n = 300;
    const k = Array.from({ length: n }, (_, i) => 1 + 0.05 * Math.sin(i / 7));
    const h = pos(
      k.map((v) => 150 * v),
      k.map((v) => 110 * v),
      k.map((v) => 90 * v),
      FS,
    );
    expect(Math.max(...h.map(Math.abs))).toBeLessThan(1e-12);
  });

  it('returns zeros when the input is shorter than one POS window', () => {
    expect([...pos([1, 2], [1, 2], [1, 2], FS)]).toEqual([0, 0]);
  });
});

describe('band-pass used for pulse (0.7-3.0 Hz)', () => {
  it('has about -3 dB at the cutoffs (single pass) and passes 1.2 Hz', () => {
    const [lo, hi, mid] = sosMagnitudeDb(BANDPASS, [0.7, 3.0, 1.2], FS);
    expect(lo).toBeCloseTo(-3.01, 1);
    expect(hi).toBeCloseTo(-3.01, 1);
    expect(Math.abs(mid as number)).toBeLessThan(0.5);
  });
});

describe('estimateWindow on synthetic RGB (PROJECT_SPEC 6.2)', () => {
  // Amplitude 0.5% in green; noise sd in 0-255 pixel units; illumination drift 5%/min;
  // +-3 ms timestamp jitter. Measured bounds are in docs/METHODS.md.
  for (const fps of [24, 30, 60]) {
    it(`${fps} fps, noise 0.2, jitter, drift: every BPM error <= 2 (n = 50)`, () => {
      const { max, n } = maxError({
        durationMs: 10_000,
        fps,
        amplitude: 0.005,
        noiseSd: 0.2,
        jitterMs: 3,
        driftPerMin: 0.05,
      });
      expect(n).toBe(50);
      expect(max).toBeLessThanOrEqual(2);
    });
  }

  it('clean signal: error < 0.2 BPM, SQI > 0.85, time-domain estimate agrees', () => {
    const r = run({ durationMs: 10_000, fps: 30, bpm: 72, amplitude: 0.005 });
    if (!r.ok) throw new Error(r.reason);
    expect(Math.abs(r.bpm - 72)).toBeLessThan(0.2);
    expect(r.sqi).toBeGreaterThan(0.85);
    expect(r.crossCheckAgrees).toBe(true);
    expect(Math.abs((r.timeBpm ?? 0) - 72)).toBeLessThan(3);
  });

  it('short dropped-frame runs (<= 250 ms) are bridged; error still <= 2 BPM', () => {
    const r = run({
      durationMs: 10_000,
      fps: 30,
      bpm: 80,
      amplitude: 0.005,
      noiseSd: 0.2,
      drops: [
        [2_000, 2_100],
        [5_000, 5_200],
      ],
      seed: 3,
    });
    if (!r.ok) throw new Error(r.reason);
    expect(Math.abs(r.bpm - 80)).toBeLessThanOrEqual(2);
  });

  it('a hole longer than 250 ms invalidates the window', () => {
    const r = run({
      durationMs: 10_000,
      fps: 30,
      bpm: 80,
      amplitude: 0.005,
      drops: [[4_000, 4_400]],
    });
    expect(r).toEqual({ ok: false, reason: 'gap' });
  });

  it('a window shorter than 9.5 s is not estimated', () => {
    expect(run({ durationMs: 8_000, fps: 30, bpm: 80, amplitude: 0.005 })).toEqual({
      ok: false,
      reason: 'tooShort',
    });
  });

  it('POS beats raw green under a shared motion/illumination artefact (n = 20 each)', () => {
    for (const hz of [1.1, 1.6]) {
      let ePos = 0;
      let eGreen = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const o = {
          durationMs: 10_000,
          fps: 30,
          bpm: 72,
          amplitude: 0.005,
          noiseSd: 0.3,
          artefact: { amplitude: 0.02, hz },
          seed,
        };
        const p = run(o);
        const g = run(o, 'green');
        if (!p.ok || !g.ok) throw new Error('window failed');
        ePos += Math.abs(p.bpm - 72);
        eGreen += Math.abs(g.bpm - 72);
      }
      expect(ePos / 20).toBeLessThan(1);
      expect(eGreen / 20).toBeGreaterThan(5);
    }
  });
});

describe('SQI', () => {
  it('is between 0 and 1 and low for noise without a pulse', () => {
    const values: number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const r = run({ durationMs: 10_000, fps: 30, bpm: 72, amplitude: 0, noiseSd: 1, seed });
      if (r.ok) values.push(r.sqi);
    }
    values.sort((a, b) => a - b);
    expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(values[values.length >> 1]).toBeLessThan(0.4);
  });

  it('counts harmonic power only inside the band', () => {
    const r = run({ durationMs: 10_000, fps: 30, bpm: 170, amplitude: 0.005 });
    if (!r.ok) throw new Error(r.reason);
    expect(sqi(r.spectrum, r.peakHz)).toBeLessThanOrEqual(1);
  });
});
