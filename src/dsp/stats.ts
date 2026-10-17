/**
 * Basic statistics. NaN handling: none; callers pass finite values.
 * Conventions match NumPy where a NumPy equivalent exists.
 */

function requireNonEmpty(x: ArrayLike<number>, name: string): void {
  if (x.length === 0) throw new RangeError(`${name}: input must not be empty`);
}

export function mean(x: ArrayLike<number>): number {
  requireNonEmpty(x, 'mean');
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] as number;
  return sum / x.length;
}

/** Variance with `ddof` delta degrees of freedom (numpy.var; default ddof = 0). */
export function variance(x: ArrayLike<number>, ddof = 0): number {
  requireNonEmpty(x, 'variance');
  if (x.length - ddof <= 0) throw new RangeError('variance: not enough samples for ddof');
  const m = mean(x);
  let ss = 0;
  for (let i = 0; i < x.length; i++) {
    const d = (x[i] as number) - m;
    ss += d * d;
  }
  return ss / (x.length - ddof);
}

/** Standard deviation (numpy.std; default ddof = 0). */
export function std(x: ArrayLike<number>, ddof = 0): number {
  return Math.sqrt(variance(x, ddof));
}

function sorted(x: ArrayLike<number>): Float64Array {
  return Float64Array.from(x).sort();
}

export function median(x: ArrayLike<number>): number {
  requireNonEmpty(x, 'median');
  const s = sorted(x);
  const mid = s.length >> 1;
  return s.length % 2 === 1
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Percentile q in [0, 100], linear interpolation between order statistics (numpy default). */
export function percentile(x: ArrayLike<number>, q: number): number {
  requireNonEmpty(x, 'percentile');
  if (!(q >= 0 && q <= 100)) throw new RangeError(`percentile: q must be in [0, 100], got ${q}`);
  const s = sorted(x);
  const pos = (q / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, s.length - 1);
  const frac = pos - lo;
  return (s[lo] as number) + frac * ((s[hi] as number) - (s[lo] as number));
}

/** Removes the least-squares straight line (scipy.signal.detrend, type='linear'). */
export function detrendLinear(x: ArrayLike<number>): Float64Array {
  const n = x.length;
  const out = Float64Array.from(x);
  if (n < 2) {
    if (n === 1) out[0] = 0;
    return out;
  }
  // Fit y = a + b*(i - iMean) so the two parameters decouple.
  const iMean = (n - 1) / 2;
  const yMean = mean(x);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const di = i - iMean;
    sxy += di * ((x[i] as number) - yMean);
    sxx += di * di;
  }
  const slope = sxy / sxx;
  for (let i = 0; i < n; i++) out[i] = (x[i] as number) - (yMean + slope * (i - iMean));
  return out;
}

/** Removes the mean. */
export function detrendConstant(x: ArrayLike<number>): Float64Array {
  const m = mean(x);
  return Float64Array.from(x, (v) => v - m);
}

/**
 * Median absolute deviation, median(|x - median(x)|). Multiply by 1.4826 to estimate
 * the standard deviation of normally distributed data (pass `scale`).
 */
export function mad(x: ArrayLike<number>, scale = 1): number {
  const m = median(x);
  return scale * median(Float64Array.from(x, (v) => Math.abs(v - m)));
}

/** Scale factor that makes MAD a consistent estimator of sigma for normal data. */
export const MAD_TO_SIGMA = 1.482602218505602;

/**
 * Robust baseline: the median and the MAD-based sigma. Used for personal baselines
 * (blink metrics, quality thresholds) so a few outliers do not move the baseline.
 */
export function robustBaseline(x: ArrayLike<number>): { center: number; spread: number } {
  return { center: median(x), spread: mad(x, MAD_TO_SIGMA) };
}
