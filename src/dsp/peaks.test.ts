import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/peaks.json';
import { relativeError } from '../../test/helpers.ts';
import {
  findPeaks,
  localMaxima,
  msToSamples,
  peakProminences,
  type FindPeaksOptions,
} from './peaks.ts';

interface ScipyKwargs {
  height?: number;
  distance?: number;
  prominence?: number;
}

function toOptions(k: ScipyKwargs): FindPeaksOptions {
  const o: FindPeaksOptions = {};
  if (k.height !== undefined) o.minHeight = k.height;
  if (k.distance !== undefined) o.minDistance = k.distance;
  if (k.prominence !== undefined) o.minProminence = k.prominence;
  return o;
}

describe('findPeaks vs scipy.signal.find_peaks', () => {
  for (const c of fixture.cases) {
    it(`kwargs ${JSON.stringify(c.kwargs)}`, () => {
      const result = findPeaks(fixture.x, toOptions(c.kwargs));
      expect(result.indices).toEqual(c.peaks);
      expect(relativeError(result.prominences, c.prominences)).toBeLessThan(1e-12);
    });
  }
});

describe('peak details', () => {
  it('reports a plateau at its middle sample (rounded down)', () => {
    expect(localMaxima([0, 1, 3, 3, 3, 3, 1, 0])).toEqual([3]);
    expect(localMaxima([0, 2, 2, 2, 1])).toEqual([2]);
  });

  it('never reports end samples or a plateau that runs to the end', () => {
    expect(localMaxima([5, 1, 5])).toEqual([]);
    expect(localMaxima([0, 1, 2, 2])).toEqual([]);
  });

  it('prominence uses the higher of the two side minima', () => {
    // Peak at 2 (height 5): left min 1, right min 0 before a higher sample at 6.
    expect(peakProminences([1, 3, 5, 0, 4, 2, 9], [2])).toEqual([4]);
  });

  it('distance keeps the higher of two close peaks', () => {
    const x = [0, 3, 0, 5, 0, 0, 0, 4, 0];
    expect(findPeaks(x, { minDistance: 3 }).indices).toEqual([3, 7]);
  });

  it('msToSamples converts the 0.33 s minimum spacing at 30 Hz', () => {
    expect(msToSamples(330, 30)).toBe(10);
    expect(msToSamples(1, 30)).toBe(1);
  });

  it('rejects a distance below one sample', () => {
    expect(() => findPeaks([0, 1, 0], { minDistance: 0 })).toThrow(RangeError);
  });
});
