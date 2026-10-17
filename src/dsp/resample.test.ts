import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../test/helpers.ts';
import { findBandPeak, powerSpectrum } from './spectrum.ts';
import { medianRateHz, resampleUniform } from './resample.ts';

/** Irregular timestamps (ms) at a nominal rate with uniform jitter of +-jitterMs. */
function jitteredTimes(
  durationS: number,
  rateHz: number,
  jitterMs: number,
  seed: number,
): Float64Array {
  const rand = seededRandom(seed);
  const n = Math.floor(durationS * rateHz);
  const dt = 1000 / rateHz;
  return Float64Array.from({ length: n }, (_, i) => 1000 + i * dt + (rand() * 2 - 1) * jitterMs);
}

const TARGET = 30;

describe('resampleUniform recovers a known sine (frequency and amplitude)', () => {
  const cases = [
    { label: '30 fps with 8 ms jitter -> linear', rate: 30, jitter: 8, method: 'linear' },
    { label: '25 fps with 10 ms jitter -> linear', rate: 25, jitter: 10, method: 'linear' },
    {
      label: '60 fps with 4 ms jitter -> bin averaging',
      rate: 60,
      jitter: 4,
      method: 'binAverage',
    },
  ] as const;

  for (const c of cases) {
    it(c.label, () => {
      const f = 1.3;
      const amp = 2;
      const t = jitteredTimes(20, c.rate, c.jitter, 7);
      const x = Float64Array.from(t, (ms) => amp * Math.sin((2 * Math.PI * f * ms) / 1000));
      const out = resampleUniform(t, x, TARGET);
      expect(out.method).toBe(c.method);
      expect(out.dtMs).toBeCloseTo(1000 / TARGET, 12);

      // Compare each grid value with the true sine at the grid time.
      let maxErr = 0;
      for (let k = 0; k < out.values.length; k++) {
        const tk = out.t0Ms + k * out.dtMs;
        maxErr = Math.max(
          maxErr,
          Math.abs((out.values[k] as number) - amp * Math.sin((2 * Math.PI * f * tk) / 1000)),
        );
      }
      expect(maxErr).toBeLessThan(0.05 * amp);

      const peak = findBandPeak(powerSpectrum(out.values, TARGET, { nfft: 4096 }), 0.7, 3.0);
      expect(peak).not.toBeNull();
      expect(Math.abs((peak?.freqHz ?? 0) - f)).toBeLessThan(0.02);
    });
  }
});

describe('resampleUniform behaviour', () => {
  it('reproduces samples that already sit on the grid', () => {
    const t = [0, 100, 200, 300];
    const out = resampleUniform(t, [1, 2, 3, 4], 10, { method: 'linear' });
    expect(Array.from(out.values)).toEqual([1, 2, 3, 4]);
  });

  it('linear interpolation between irregular samples', () => {
    const out = resampleUniform([0, 150, 200], [0, 3, 5], 10, { method: 'linear' });
    expect(Array.from(out.values)).toEqual([0, 2, 5]);
  });

  it('bin averaging takes the mean of samples within half a step', () => {
    // Grid at 0, 100, 200 ms (10 Hz). Bins [50,150) and [150,250) each hold three
    // samples centred on the grid time, so the result is the plain bin mean.
    const t = [0, 30, 70, 100, 130, 170, 200, 230];
    const x = [5, 0, 10, 20, 30, 1, 2, 3];
    const out = resampleUniform(t, x, 10, { method: 'binAverage' });
    expect(Array.from(out.values)).toEqual([5, 20, 2]);
  });

  it('bin averaging places each mean at its samples mean time (no jitter bias)', () => {
    // Bin [50,150) holds samples at 60 and 80 only: their mean (15) belongs at t = 70.
    // On the line x = t/4 the value at grid t = 100 must still be 25.
    const t = [0, 20, 40, 60, 80, 150, 170, 200, 230];
    const out = resampleUniform(
      t,
      t.map((v) => v / 4),
      10,
      { method: 'binAverage' },
    );
    expect(out.values[1]).toBeCloseTo(25, 12);
  });

  it('bin averaging attenuates content that would alias (25 Hz at 60 fps -> 30 Hz)', () => {
    const fs = 60;
    const t = Float64Array.from({ length: 600 }, (_, i) => (i * 1000) / fs);
    const x = Float64Array.from(t, (ms) => Math.sin((2 * Math.PI * 25 * ms) / 1000 + 0.3));
    const aliasPower = (method: 'linear' | 'binAverage') => {
      const out = resampleUniform(t, x, TARGET, { method });
      const s = powerSpectrum(out.values, TARGET, { nfft: 1024 });
      return findBandPeak(s, 4, 6)?.power ?? 0; // 25 Hz folds to 5 Hz
    };
    expect(10 * Math.log10(aliasPower('binAverage') / aliasPower('linear'))).toBeLessThan(-6);
  });

  it('bin averaging interpolates at edge bins instead of averaging one side', () => {
    // Bin [-50, 50) runs before the first sample: value is the sample at t = 0, not mean(5, 0, 0).
    const out = resampleUniform([0, 10, 40, 60, 100], [5, 0, 0, 0, 0], 10, {
      method: 'binAverage',
    });
    expect(out.values[0]).toBe(5);
  });

  it('marks grid samples inside a gap as invalid (NaN), never interpolated', () => {
    const t = [0, 33, 66, 400, 433];
    const out = resampleUniform(t, [1, 1, 1, 1, 1], 30, { method: 'linear', maxGapMs: 250 });
    const invalid = Array.from(out.valid).flatMap((v, k) => (v === 0 ? [k] : []));
    expect(invalid.length).toBeGreaterThan(5);
    for (const k of invalid) {
      const tk = out.t0Ms + k * out.dtMs;
      expect(tk).toBeGreaterThan(66);
      expect(tk).toBeLessThan(400);
      expect(out.values[k]).toBeNaN();
    }
    expect(out.valid[0]).toBe(1);
    expect(out.valid[out.valid.length - 1]).toBe(1);
  });

  it('medianRateHz ignores a single long interval', () => {
    expect(medianRateHz([0, 33, 66, 100, 500, 533])).toBeCloseTo(1000 / 33, 6);
  });

  it('rejects non-increasing timestamps and mismatched lengths', () => {
    expect(() => resampleUniform([0, 10, 10], [1, 2, 3], 30)).toThrow(RangeError);
    expect(() => resampleUniform([0, 10], [1], 30)).toThrow(RangeError);
  });
});
