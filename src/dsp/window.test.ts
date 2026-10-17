import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/window.json';
import { relativeError } from '../../test/helpers.ts';
import { applyWindow, coherentGain, enbwBins, hann, rectangular } from './window.ts';

describe('hann vs scipy.signal.windows.hann', () => {
  for (const c of fixture.hann) {
    it(`n = ${c.n}, sym = ${c.sym}`, () => {
      expect(relativeError(hann(c.n, { symmetric: c.sym }), c.w)).toBeLessThan(1e-12);
    });
  }
});

describe('window gains', () => {
  it('rectangular: coherent gain 1, ENBW 1 bin', () => {
    const w = rectangular(64);
    expect(coherentGain(w)).toBe(1);
    expect(enbwBins(w)).toBeCloseTo(1, 12);
  });

  it('periodic Hann: coherent gain 0.5, ENBW 1.5 bins', () => {
    const w = hann(1024);
    expect(coherentGain(w)).toBeCloseTo(0.5, 12);
    expect(enbwBins(w)).toBeCloseTo(1.5, 12);
  });

  it('applyWindow multiplies element-wise and checks lengths', () => {
    expect(Array.from(applyWindow([1, 2, 3], [0, 0.5, 1]))).toEqual([0, 1, 3]);
    expect(() => applyWindow([1, 2], [1])).toThrow(RangeError);
  });

  it('rejects invalid lengths', () => {
    expect(() => hann(0)).toThrow(RangeError);
    expect(() => rectangular(1.5)).toThrow(RangeError);
  });
});
