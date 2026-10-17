import { describe, expect, it } from 'vitest';
import { seededNormal, sine } from '../../test/helpers.ts';
import { bandPower, findBandPeak, parabolicOffset, powerSpectrum } from './spectrum.ts';

const FS = 30;
const N = 10 * FS; // 10 s window

describe('spectrum recovers a synthetic sine within 0.05 Hz (Phase 1 acceptance: 10 s, fs = 30 Hz)', () => {
  // Frequencies across the pulse band, deliberately off-bin, with varied phases.
  const freqs = [0.75, 0.93, 1.0, 1.137, 1.5, 1.77, 2.02, 2.333, 2.71, 2.95];
  for (const [i, f] of freqs.entries()) {
    it(`${f} Hz`, () => {
      const x = sine(N, f, FS, 1, 0.37 * i);
      const peak = findBandPeak(powerSpectrum(x, FS, { nfft: 4096 }), 0.7, 3.0);
      expect(peak).not.toBeNull();
      expect(Math.abs((peak?.freqHz ?? 0) - f)).toBeLessThan(0.05);
    });
  }

  it('also within 0.05 Hz with additive noise (SNR 10 dB) and a slow drift', () => {
    const randn = seededNormal(3);
    const f = 1.234;
    const noiseStd = Math.sqrt(0.5 / 10); // signal power 0.5, SNR 10
    const x = sine(N, f, FS).map((v, i) => v + noiseStd * randn() + 0.02 * i);
    const peak = findBandPeak(powerSpectrum(x, FS, { nfft: 4096 }), 0.7, 3.0);
    expect(Math.abs((peak?.freqHz ?? 0) - f)).toBeLessThan(0.05);
  });
});

describe('powerSpectrum scaling and shape', () => {
  it('an on-bin sine of amplitude A reads A^2 / 2 at its bin (Hann and rectangular)', () => {
    const n = 256;
    const f = (16 * FS) / n; // exactly bin 16
    const x = sine(n, f, FS, 3);
    for (const window of ['hann', 'rectangular'] as const) {
      const s = powerSpectrum(x, FS, { window, detrend: false });
      expect(s.power[16]).toBeCloseTo(4.5, 9);
    }
  });

  it('has nfft/2 + 1 bins from 0 to fs/2', () => {
    const s = powerSpectrum(new Float64Array(300), FS, { nfft: 4096 });
    expect(s.freqs.length).toBe(2049);
    expect(s.freqs[0]).toBe(0);
    expect(s.freqs[2048]).toBe(FS / 2);
  });

  it('rejects an nfft shorter than the signal or not a power of two', () => {
    expect(() => powerSpectrum(new Float64Array(300), FS, { nfft: 256 })).toThrow(RangeError);
    expect(() => powerSpectrum(new Float64Array(300), FS, { nfft: 1000 })).toThrow(RangeError);
  });
});

describe('peak search details', () => {
  it('ignores a stronger peak outside the band', () => {
    const x = sine(N, 5, FS, 4).map((v, i) => v + Math.sin((2 * Math.PI * 1.6 * i) / FS));
    const peak = findBandPeak(powerSpectrum(x, FS, { nfft: 4096 }), 0.7, 3.0);
    expect(Math.abs((peak?.freqHz ?? 0) - 1.6)).toBeLessThan(0.05);
  });

  it('returns null for a silent signal', () => {
    expect(findBandPeak(powerSpectrum(new Float64Array(N), FS), 0.7, 3.0)).toBeNull();
  });

  it('parabolicOffset finds the vertex of a parabola and is clamped', () => {
    // y = -(x - 0.3)^2 sampled at -1, 0, 1
    const y = (x: number) => -((x - 0.3) ** 2);
    expect(parabolicOffset(y(-1), y(0), y(1))).toBeCloseTo(0.3, 12);
    expect(parabolicOffset(1, 1, 1)).toBe(0);
  });

  it('bandPower sums power inside the band only', () => {
    const s = powerSpectrum(sine(N, 1.5, FS), FS, { nfft: 4096 });
    const inBand = bandPower(s, 0.7, 3.0);
    const total = bandPower(s, 0, FS / 2);
    expect(inBand / total).toBeGreaterThan(0.99);
  });
});
