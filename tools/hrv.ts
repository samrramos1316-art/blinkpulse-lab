/**
 * Offline HRV analysis, for documenting why HRV is NOT shown in the app
 * (PROJECT_SPEC 7.4, Phase 6). Lives in tools/ only (CLAUDE.md: no HRV in the UI).
 *
 * Beats are the time-domain peaks of the app's own filtered pulse waveform
 * (estimateWindow: resampling to 30 Hz, POS, band-pass, peak detection), so this
 * measures the app's pipeline, not a better one. Peak times are taken either on the
 * 30 Hz grid (33 ms steps) or refined by parabolic interpolation between samples.
 * RMSSD = sqrt(mean of squared successive IBI differences).
 */

import { estimateWindow, FS, type TraceWindow } from '../src/rppg/hrEstimator.ts';
import { normal, rng } from './synth.ts';

export function rmssd(ibisMs: readonly number[]): number {
  if (ibisMs.length < 2) return NaN;
  let s = 0;
  for (let i = 1; i < ibisMs.length; i++) {
    const d = (ibisMs[i] as number) - (ibisMs[i - 1] as number);
    s += d * d;
  }
  return Math.sqrt(s / (ibisMs.length - 1));
}

export const diffs = (t: readonly number[]) => t.slice(1).map((v, i) => v - (t[i] as number));

/**
 * Beat (peak) times in ms from the app's filtered waveform for one trace window,
 * or null when the window cannot be estimated.
 */
export function detectBeats(w: TraceWindow, interpolate: boolean): number[] | null {
  const n = w.tMs.length;
  if (n < 2) return null;
  const span = (w.tMs[n - 1] as number) - (w.tMs[0] as number);
  const est = estimateWindow(w, { minSpanMs: 0.95 * span });
  if (!est.ok) return null;
  const t0 = w.tMs[0] as number;
  const y = est.filtered;
  return est.peaks.map((i) => {
    let offset = 0;
    if (interpolate && i > 0 && i < y.length - 1) {
      const l = y[i - 1] as number;
      const c = y[i] as number;
      const r = y[i + 1] as number;
      const denom = l - 2 * c + r;
      if (denom < 0) offset = Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / denom));
    }
    return t0 + ((i + offset) * 1000) / FS;
  });
}

export interface BeatSynthOptions {
  durationMs: number;
  fps: number;
  meanBpm: number;
  /** Beat-to-beat variability: sd of the random part of each IBI (ms). */
  ibiSdMs: number;
  /** Respiratory modulation of the IBI: amplitude (ms) at 0.25 Hz. */
  rsaMs: number;
  /** Relative pulse amplitude in green (0.005 = 0.5%). */
  amplitude: number;
  /** Gaussian sensor noise per channel (0-255 units). */
  noiseSd: number;
  /** Uniform frame-time jitter +-jitterMs. */
  jitterMs: number;
  seed: number;
}

/** Second-harmonic weight of the synthetic pulse shape (as in tools/synth.ts). */
const HARMONIC = 0.3;
/** Phase of the waveform maximum of sin(p) + HARMONIC sin(2p), found numerically. */
const PEAK_PHASE = (() => {
  let best = 0;
  let bestV = -Infinity;
  for (let k = 0; k < 100_000; k++) {
    const p = (2 * Math.PI * k) / 100_000;
    const v = Math.sin(p) + HARMONIC * Math.sin(2 * p);
    if (v > bestV) {
      bestV = v;
      best = p;
    }
  }
  return best;
})();

/**
 * Synthetic face trace with a variable heart rate. The truth is the continuous-time
 * maximum of each beat's waveform, which is what peak detection estimates.
 */
export function synthBeats(o: BeatSynthOptions): { window: TraceWindow; truthMs: number[] } {
  const gauss = normal(rng(o.seed));
  const uniform = rng(o.seed + 500);
  const base = 60_000 / o.meanBpm;
  // Beat onsets T_k and their IBIs, covering the whole duration.
  const onsets = [-base];
  const ibis: number[] = [];
  while ((onsets.at(-1) as number) < o.durationMs + base) {
    const t = onsets.at(-1) as number;
    const ibi = base + o.rsaMs * Math.sin(2 * Math.PI * 0.25 * (t / 1000)) + o.ibiSdMs * gauss();
    ibis.push(ibi);
    onsets.push(t + ibi);
  }
  const phaseAt = (t: number) => {
    let k = 0;
    while ((onsets[k + 1] as number) <= t) k++;
    return 2 * Math.PI * (k + (t - (onsets[k] as number)) / (ibis[k] as number));
  };
  const truthMs = ibis
    .map((ibi, k) => (onsets[k] as number) + (PEAK_PHASE / (2 * Math.PI)) * ibi)
    .filter((t) => t >= 0 && t <= o.durationMs);

  const [mr, mg, mb] = [150, 110, 90];
  const [dr, dg, db] = [0.45, 1, 0.65];
  const w = { tMs: [] as number[], r: [] as number[], g: [] as number[], b: [] as number[] };
  const dt = 1000 / o.fps;
  let last = -Infinity;
  for (let k = 0; k * dt <= o.durationMs; k++) {
    const t = Math.max(0, k * dt + (uniform() * 2 - 1) * o.jitterMs);
    if (t <= last) continue;
    last = t;
    const p = phaseAt(t);
    const pulse = o.amplitude * (Math.sin(p) + HARMONIC * Math.sin(2 * p));
    w.tMs.push(t);
    w.r.push(mr * (1 + dr * pulse) + o.noiseSd * gauss());
    w.g.push(mg * (1 + dg * pulse) + o.noiseSd * gauss());
    w.b.push(mb * (1 + db * pulse) + o.noiseSd * gauss());
  }
  return { window: w, truthMs };
}

export interface BeatMatch {
  /** Detected beats matched one-to-one to true beats (within half the mean IBI). */
  matched: number;
  missed: number;
  extra: number;
  /** Detected - true time of each matched beat (ms). */
  errorsMs: number[];
}

/** Greedy nearest matching of detected to true beat times. */
export function matchBeats(detected: readonly number[], truth: readonly number[]): BeatMatch {
  const ibi =
    truth.length > 1
      ? ((truth.at(-1) as number) - (truth[0] as number)) / (truth.length - 1)
      : 1000;
  const used = new Set<number>();
  const errorsMs: number[] = [];
  for (const t of truth) {
    let best = -1;
    let bestD = Infinity;
    detected.forEach((d, j) => {
      const e = Math.abs(d - t);
      if (!used.has(j) && e < bestD) {
        bestD = e;
        best = j;
      }
    });
    if (best >= 0 && bestD <= ibi / 2) {
      used.add(best);
      errorsMs.push((detected[best] as number) - t);
    }
  }
  return {
    matched: errorsMs.length,
    missed: truth.length - errorsMs.length,
    extra: detected.length - used.size,
    errorsMs,
  };
}

/** Beats in [startMs, endMs). */
export const within = (t: readonly number[], startMs: number, endMs: number) =>
  t.filter((x) => x >= startMs && x < endMs);
