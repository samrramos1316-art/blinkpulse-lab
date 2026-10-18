/**
 * Agreement statistics for validation V2 (PROJECT_SPEC 7.3): MAE, RMSE, Pearson r,
 * share within +-k BPM, and Bland-Altman bias with 95% limits of agreement. Pure.
 */

import { mean } from '../dsp/stats.ts';

export interface Agreement {
  n: number;
  mae: number;
  rmse: number;
  /** NaN when either series has zero variance or n < 2. */
  pearsonR: number;
  within5: number;
  within3: number;
  /** Mean of (estimate - reference). */
  bias: number;
  /** Bias +- 1.96 SD of the differences (sample SD, n - 1). */
  loaLow: number;
  loaHigh: number;
}

export function agreement(estimates: readonly number[], references: readonly number[]): Agreement {
  const n = Math.min(estimates.length, references.length);
  if (n === 0) {
    return {
      n: 0,
      mae: NaN,
      rmse: NaN,
      pearsonR: NaN,
      within5: NaN,
      within3: NaN,
      bias: NaN,
      loaLow: NaN,
      loaHigh: NaN,
    };
  }
  const e = estimates.slice(0, n);
  const r = references.slice(0, n);
  const d = e.map((v, i) => v - (r[i] as number));
  const bias = mean(d);
  const sdD = n > 1 ? Math.sqrt(d.reduce((s, v) => s + (v - bias) ** 2, 0) / (n - 1)) : NaN;
  const me = mean(e);
  const mr = mean(r);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const a = (e[i] as number) - me;
    const b = (r[i] as number) - mr;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  return {
    n,
    mae: mean(d.map(Math.abs)),
    rmse: Math.sqrt(mean(d.map((v) => v * v))),
    pearsonR: n > 1 && sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN,
    within5: d.filter((v) => Math.abs(v) <= 5).length / n,
    within3: d.filter((v) => Math.abs(v) <= 3).length / n,
    bias,
    loaLow: bias - 1.96 * sdD,
    loaHigh: bias + 1.96 * sdD,
  };
}

/**
 * Reference value at time t from a reference log (sorted by time): linear
 * interpolation between readings no more than `maxSpanMs` apart; null otherwise.
 */
export function referenceAt(
  ref: readonly { tMs: number; bpm: number }[],
  tMs: number,
  maxSpanMs = 15_000,
): number | null {
  for (let i = 1; i < ref.length; i++) {
    const a = ref[i - 1] as { tMs: number; bpm: number };
    const b = ref[i] as { tMs: number; bpm: number };
    if (tMs >= a.tMs && tMs <= b.tMs) {
      if (b.tMs - a.tMs > maxSpanMs) return null;
      const f = b.tMs === a.tMs ? 0 : (tMs - a.tMs) / (b.tMs - a.tMs);
      return a.bpm + f * (b.bpm - a.bpm);
    }
  }
  return null;
}
