/**
 * Pooled-region fallback (SPEC_AMENDMENT_03 Patch D). Pure.
 *
 * When no single region gives a Fair-or-better estimate, the usable regions are
 * pooled into one trace and run through the same chain (estimateWindow) and the same
 * quality rules. The pulse is in step across the face while much of the noise
 * (sensor noise, few pixels, low light) is independent between regions, so pooling
 * raises the signal-to-noise ratio. Each region's channels are divided by their
 * window mean before averaging, so a brighter region does not dominate and POS sees
 * relative colour changes as usual. Regions get equal weight (no tuned weights).
 */

import type { TraceWindow } from './hrEstimator.ts';
import type { WindowStats } from './rgbTrace.ts';

/** Fewest regions worth pooling. */
export const MIN_POOLED_REGIONS = 2;

function mean(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] as number;
  return s / x.length;
}

/**
 * One trace from several regions' windows: at each frame time present in EVERY
 * window, the equal-weight average of each channel divided by that region's window
 * mean. Returns null with fewer than MIN_POOLED_REGIONS windows. Frames missing from
 * any region are left out, so the usual gap rules apply to the pooled trace.
 */
export function poolWindows(windows: readonly TraceWindow[]): TraceWindow | null {
  if (windows.length < MIN_POOLED_REGIONS) return null;
  const k = windows.length;
  const scaled = windows.map((w) => {
    const mr = mean(w.r);
    const mg = mean(w.g);
    const mb = mean(w.b);
    const at = new Map<number, number>();
    for (let i = 0; i < w.tMs.length; i++) at.set(w.tMs[i] as number, i);
    return { w, at, mr, mg, mb };
  });
  const first = scaled[0];
  if (!first) return null;
  const out: { tMs: number[]; r: number[]; g: number[]; b: number[] } = {
    tMs: [],
    r: [],
    g: [],
    b: [],
  };
  for (let i = 0; i < first.w.tMs.length; i++) {
    const t = first.w.tMs[i] as number;
    let r = 0;
    let g = 0;
    let b = 0;
    let complete = true;
    for (const s of scaled) {
      const j = s.at.get(t);
      if (j === undefined) {
        complete = false;
        break;
      }
      r += (s.w.r[j] as number) / s.mr;
      g += (s.w.g[j] as number) / s.mg;
      b += (s.w.b[j] as number) / s.mb;
    }
    if (!complete) continue;
    out.tMs.push(t);
    out.r.push(r / k);
    out.g.push(g / k);
    out.b.push(b / k);
  }
  return out;
}

/** Window statistics of the pooled trace: the most cautious value of each. */
export function pooledStats(stats: readonly WindowStats[]): WindowStats {
  return {
    coverage: Math.min(...stats.map((s) => s.coverage)),
    saturatedFraction: Math.max(...stats.map((s) => s.saturatedFraction)),
    meanLuma: Math.min(...stats.map((s) => s.meanLuma)),
    maxLumaJump: Math.max(...stats.map((s) => s.maxLumaJump)),
    fps: Math.min(...stats.map((s) => s.fps)),
  };
}
