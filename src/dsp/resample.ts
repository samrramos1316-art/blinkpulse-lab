/**
 * Resampling of irregularly timed samples onto a uniform grid.
 *
 * Timestamps are in milliseconds (CLAUDE.md: timing comes from frame timestamps,
 * never frame counts). Two methods:
 *  - linear: interpolate between the two source samples around each grid time.
 *  - binAverage: average the source samples in each grid bin (+-half a grid step),
 *    keep each average at the mean time of its samples, then interpolate those
 *    averages onto the grid. The averaging is a simple anti-alias step when the
 *    source rate is well above the target. The first and last half step, outside
 *    the span of bin averages, use plain linear interpolation.
 * 'auto' uses binAverage when the median source rate is >= 1.5x the target rate.
 */

import { median } from './stats.ts';

export type ResampleMethod = 'linear' | 'binAverage' | 'auto';

export interface ResampleOptions {
  method?: ResampleMethod;
  /**
   * Source intervals longer than this (ms) are gaps: grid samples inside them are
   * marked invalid instead of being interpolated across. Default: no gap check.
   */
  maxGapMs?: number;
}

export interface UniformSeries {
  /** Time of the first grid sample (ms) = first source timestamp. */
  t0Ms: number;
  /** Grid step (ms). */
  dtMs: number;
  values: Float64Array;
  /** 1 where the value is backed by data, 0 inside a gap. */
  valid: Uint8Array;
  /** Method actually used. */
  method: 'linear' | 'binAverage';
}

/** Ratio of median source rate to target rate at which 'auto' switches to bin averaging. */
export const BIN_AVERAGE_RATIO = 1.5;

function checkInputs(tMs: ArrayLike<number>, x: ArrayLike<number>, targetHz: number): void {
  if (tMs.length !== x.length) throw new RangeError('resample: t and x must have the same length');
  if (tMs.length < 2) throw new RangeError('resample: need at least 2 samples');
  if (!(targetHz > 0)) throw new RangeError(`resample: targetHz must be > 0, got ${targetHz}`);
  for (let i = 1; i < tMs.length; i++) {
    if (!((tMs[i] as number) > (tMs[i - 1] as number))) {
      throw new RangeError(`resample: timestamps must be strictly increasing (index ${i})`);
    }
  }
}

/** Median sampling rate (Hz) of the timestamps (ms). */
export function medianRateHz(tMs: ArrayLike<number>): number {
  const dts = new Float64Array(tMs.length - 1);
  for (let i = 1; i < tMs.length; i++) dts[i - 1] = (tMs[i] as number) - (tMs[i - 1] as number);
  return 1000 / median(dts);
}

export function resampleUniform(
  tMs: ArrayLike<number>,
  x: ArrayLike<number>,
  targetHz: number,
  options: ResampleOptions = {},
): UniformSeries {
  checkInputs(tMs, x, targetHz);
  const requested = options.method ?? 'auto';
  const method =
    requested === 'auto'
      ? medianRateHz(tMs) >= BIN_AVERAGE_RATIO * targetHz
        ? 'binAverage'
        : 'linear'
      : requested;

  const dtMs = 1000 / targetHz;
  const t0 = tMs[0] as number;
  const tEnd = tMs[tMs.length - 1] as number;
  // Small tolerance so a grid point that should land exactly on tEnd is not lost to rounding.
  const count = Math.floor((tEnd - t0) / dtMs + 1e-9) + 1;
  const values = new Float64Array(count);
  const valid = new Uint8Array(count).fill(1);
  const maxGap = options.maxGapMs ?? Infinity;

  const raw = interpolator(tMs, x);
  const centroids = method === 'binAverage' ? binCentroids(tMs, x, t0, dtMs, count) : null;
  const smoothed =
    centroids && centroids.t.length >= 2 ? interpolator(centroids.t, centroids.x) : null;
  const firstCentroid = centroids?.t[0] ?? Infinity;
  const lastCentroid = centroids?.t[centroids.t.length - 1] ?? -Infinity;

  for (let k = 0; k < count; k++) {
    const t = t0 + k * dtMs;
    const [ta, tb] = raw.bracket(t);
    if (tb - ta > maxGap && t > ta && t < tb) {
      valid[k] = 0;
      values[k] = NaN;
      continue;
    }
    // Outside the span of bin centroids (the first/last half step) use the raw samples.
    values[k] = smoothed && t >= firstCentroid && t <= lastCentroid ? smoothed.at(t) : raw.at(t);
  }

  return { t0Ms: t0, dtMs, values, valid, method };
}

/**
 * Mean time and mean value of the source samples in each grid bin [t - dt/2, t + dt/2).
 * Keeping each mean at its own mean time (not at the bin centre) avoids the timing
 * error a plain bin average has when jitter moves samples across bin boundaries.
 */
function binCentroids(
  tMs: ArrayLike<number>,
  x: ArrayLike<number>,
  t0: number,
  dtMs: number,
  count: number,
): { t: Float64Array; x: Float64Array } {
  const ct: number[] = [];
  const cx: number[] = [];
  let i = 0;
  for (let k = 0; k < count; k++) {
    const lo = t0 + (k - 0.5) * dtMs;
    const hi = lo + dtMs;
    while (i < tMs.length && (tMs[i] as number) < lo) i++;
    let sumT = 0;
    let sumX = 0;
    let n = 0;
    for (let q = i; q < tMs.length && (tMs[q] as number) < hi; q++) {
      sumT += tMs[q] as number;
      sumX += x[q] as number;
      n++;
    }
    if (n > 0) {
      ct.push(sumT / n);
      cx.push(sumX / n);
    }
  }
  return { t: Float64Array.from(ct), x: Float64Array.from(cx) };
}

/**
 * Linear interpolation for query times that never decrease (a moving pointer, so a
 * full pass is O(n)). Queries outside the data hold the end values.
 */
function interpolator(ts: ArrayLike<number>, xs: ArrayLike<number>) {
  let j = 0; // ts[j] <= t < ts[j+1]
  const advance = (t: number) => {
    while (j < ts.length - 2 && (ts[j + 1] as number) <= t) j++;
  };
  return {
    bracket(t: number): [number, number] {
      advance(t);
      return [ts[j] as number, ts[j + 1] as number];
    },
    at(t: number): number {
      advance(t);
      const ta = ts[j] as number;
      const tb = ts[j + 1] as number;
      const frac = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
      return (xs[j] as number) + frac * ((xs[j + 1] as number) - (xs[j] as number));
    },
  };
}
