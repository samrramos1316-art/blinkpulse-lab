import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/stats.json';
import { relativeError } from '../../test/helpers.ts';
import {
  MAD_TO_SIGMA,
  detrendConstant,
  detrendLinear,
  mad,
  mean,
  median,
  percentile,
  robustBaseline,
  std,
  variance,
} from './stats.ts';

describe('stats vs NumPy/SciPy fixtures', () => {
  const { x } = fixture;

  it('mean, std (ddof 0 and 1), median', () => {
    expect(mean(x)).toBeCloseTo(fixture.mean, 12);
    expect(std(x)).toBeCloseTo(fixture.std0, 12);
    expect(std(x, 1)).toBeCloseTo(fixture.std1, 12);
    expect(median(x)).toBe(fixture.median);
    expect(median(fixture.even)).toBeCloseTo(fixture.medianEven, 14);
  });

  it('percentile (linear interpolation)', () => {
    fixture.percentiles.q.forEach((q, i) => {
      expect(percentile(x, q)).toBeCloseTo(fixture.percentiles.values[i] as number, 12);
    });
  });

  it('linear detrend matches scipy.signal.detrend', () => {
    expect(relativeError(detrendLinear(x), fixture.detrendLinear)).toBeLessThan(1e-12);
  });
});

describe('stats properties', () => {
  it('detrendLinear removes an exact line completely', () => {
    const line = Float64Array.from({ length: 50 }, (_, i) => 3 - 0.25 * i);
    for (const v of detrendLinear(line)) expect(Math.abs(v)).toBeLessThan(1e-12);
  });

  it('detrendConstant removes the mean', () => {
    expect(mean(detrendConstant([1, 2, 3, 10]))).toBeCloseTo(0, 14);
  });

  it('variance needs enough samples for ddof', () => {
    expect(variance([1, 3])).toBe(1);
    expect(() => variance([1], 1)).toThrow(RangeError);
  });

  it('empty input is rejected', () => {
    expect(() => mean([])).toThrow(RangeError);
    expect(() => median([])).toThrow(RangeError);
    expect(() => percentile([], 50)).toThrow(RangeError);
  });

  it('MAD ignores a single large outlier; robustBaseline scales MAD to sigma', () => {
    const x = [1, 2, 3, 4, 5, 6, 1000];
    expect(median(x)).toBe(4);
    expect(mad(x)).toBe(2);
    expect(robustBaseline(x)).toEqual({ center: 4, spread: 2 * MAD_TO_SIGMA });
  });
});
