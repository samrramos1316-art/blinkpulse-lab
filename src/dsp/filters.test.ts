/**
 * Butterworth design + biquad filtering against SciPy fixtures, plus the Phase 1
 * band-pass magnitude criteria.
 */
import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/filters.json';
import { complexRelativeError, relativeError, sine } from '../../test/helpers.ts';
import {
  defaultPadLength,
  filtfilt,
  oddExtend,
  sosFrequencyResponse,
  sosMagnitudeDb,
  sosfilt,
  sosfiltZi,
  type Sos,
  type SosSection,
} from './biquad.ts';
import { butterBandpass, butterHighpass, butterLowpass } from './butterworth.ts';

const TOL = 1e-6; // Phase 1 acceptance: relative error < 1e-6

function toSos(flat: readonly number[]): Sos {
  const sections: SosSection[] = [];
  for (let i = 0; i < flat.length; i += 6) {
    const s = flat.slice(i, i + 6);
    sections.push([s[0] ?? 0, s[1] ?? 0, s[2] ?? 0, s[3] ?? 0, s[4] ?? 0, s[5] ?? 0]);
  }
  return sections;
}

const flatten = (sos: Sos) => sos.flatMap((s) => [...s]);

describe('Butterworth SOS coefficients vs scipy.signal.butter', () => {
  for (const d of fixture.designs) {
    it(`${d.btype} order ${d.order}, fc = ${d.cutoff} Hz, fs = ${d.fs} Hz`, () => {
      const design = d.btype === 'lowpass' ? butterLowpass : butterHighpass;
      const sos = design(d.order, d.cutoff, d.fs);
      expect(sos.length).toBe(d.order / 2);
      expect(relativeError(flatten(sos), d.sos)).toBeLessThan(TOL);
    });
  }

  it('band-pass 0.7-3.0 Hz is high-pass sections followed by low-pass sections', () => {
    const sos = butterBandpass(4, 0.7, 3.0, fixture.fs);
    expect(relativeError(flatten(sos), fixture.filtered.bandpass.sos)).toBeLessThan(TOL);
  });

  it('rejects odd orders and out-of-range cutoffs', () => {
    expect(() => butterLowpass(3, 3, 30)).toThrow(RangeError);
    expect(() => butterLowpass(4, 15, 30)).toThrow(RangeError);
    expect(() => butterHighpass(4, 0, 30)).toThrow(RangeError);
    expect(() => butterBandpass(4, 3, 0.7, 30)).toThrow(RangeError);
  });
});

describe('sosfilt / sosfilt_zi / sosfiltfilt vs SciPy', () => {
  for (const [name, f] of Object.entries(fixture.filtered)) {
    const sos = toSos(f.sos);
    it(`${name}: sosfilt_zi`, () => {
      expect(
        relativeError(
          sosfiltZi(sos).flatMap((z) => [...z]),
          f.zi,
        ),
      ).toBeLessThan(TOL);
    });
    it(`${name}: sosfilt`, () => {
      expect(relativeError(sosfilt(sos, fixture.x), f.sosfilt)).toBeLessThan(TOL);
    });
    it(`${name}: filtfilt (sosfiltfilt, padtype='odd')`, () => {
      expect(relativeError(filtfilt(sos, fixture.x), f.sosfiltfilt)).toBeLessThan(TOL);
    });
  }

  it('frequency response matches scipy.signal.sosfreqz', () => {
    const sos = toSos(fixture.filtered.bandpass.sos);
    const r = fixture.bandpassResponse;
    const h = sosFrequencyResponse(sos, r.freqs, fixture.fs);
    expect(complexRelativeError(h.re, h.im, r.re, r.im)).toBeLessThan(TOL);
  });
});

describe('band-pass 0.7-3.0 Hz, 4th order, fs = 30 Hz (Phase 1 acceptance)', () => {
  const fs = 30;
  const sos = butterBandpass(4, 0.7, 3.0, fs);
  const [atLow, atHigh, at01, at8, at15] = Array.from(
    sosMagnitudeDb(sos, [0.7, 3.0, 0.1, 8, 1.5], fs),
  );

  it('is about -3 dB at both cutoffs (within 0.1 dB of -3.01 dB)', () => {
    expect(Math.abs((atLow as number) + 3.0103)).toBeLessThan(0.1);
    expect(Math.abs((atHigh as number) + 3.0103)).toBeLessThan(0.1);
  });

  it('attenuates at least 40 dB at 0.1 Hz and at 8 Hz', () => {
    expect(at01).toBeLessThanOrEqual(-40);
    expect(at8).toBeLessThanOrEqual(-40);
  });

  it('passes mid-band (1.5 Hz) within 0.1 dB of 0 dB', () => {
    expect(Math.abs(at15 as number)).toBeLessThan(0.1);
  });

  it('measured gain on real sines matches: pass 1.5 Hz, reject 0.1 Hz and 8 Hz', () => {
    // 60 s of signal; measure the RMS ratio over the middle third (away from edges).
    const n = 60 * fs;
    const rmsGainDb = (f: number) => {
      const x = sine(n, f, fs);
      const y = sosfilt(sos, x);
      let sx = 0;
      let sy = 0;
      for (let i = Math.floor(n / 3); i < Math.floor((2 * n) / 3); i++) {
        sx += (x[i] as number) ** 2;
        sy += (y[i] as number) ** 2;
      }
      return 10 * Math.log10(sy / sx);
    };
    expect(Math.abs(rmsGainDb(1.5))).toBeLessThan(0.1);
    expect(rmsGainDb(8)).toBeLessThanOrEqual(-40);
    expect(rmsGainDb(0.1)).toBeLessThanOrEqual(-40);
  });

  it('filtfilt squares the magnitude: about -6 dB at the cutoffs, zero phase', () => {
    const n = 60 * fs;
    const x = sine(n, 3.0, fs);
    const y = filtfilt(sos, x);
    let sx = 0;
    let sy = 0;
    let cross = 0;
    for (let i = Math.floor(n / 3); i < Math.floor((2 * n) / 3); i++) {
      sx += (x[i] as number) ** 2;
      sy += (y[i] as number) ** 2;
      cross += (x[i] as number) * (y[i] as number);
    }
    expect(10 * Math.log10(sy / sx)).toBeCloseTo(-6.02, 1);
    // Zero phase: output is in phase with input (correlation coefficient ~ 1).
    expect(cross / Math.sqrt(sx * sy)).toBeGreaterThan(0.999);
  });
});

describe('filtfilt edge handling', () => {
  const sos = butterLowpass(4, 3, 30);

  it('passes a constant signal unchanged (steady-state initial conditions)', () => {
    const y = filtfilt(sos, new Float64Array(100).fill(7.5));
    for (const v of y) expect(v).toBeCloseTo(7.5, 9);
  });

  it('uses SciPy default padding of 3 * (2 * sections + 1)', () => {
    expect(defaultPadLength(sos)).toBe(15);
    expect(defaultPadLength(butterBandpass(4, 0.7, 3, 30))).toBe(27);
  });

  it('rejects inputs not longer than the padding', () => {
    expect(() => filtfilt(sos, new Float64Array(15))).toThrow(RangeError);
  });

  it('odd extension reflects through the end points', () => {
    expect(Array.from(oddExtend([1, 2, 4, 7], 2))).toEqual([-2, 0, 1, 2, 4, 7, 10, 12]);
  });
});
