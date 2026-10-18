/**
 * Per-region RGB trace with window extraction (PROJECT_SPEC 5.4). Pure.
 *
 * Samples are (t, mean R, G, B) plus the pixel-quality numbers of that frame.
 * Invalid frames (face lost, head turned, no accepted pixels) are simply absent
 * from the window; a hole longer than MAX_GAP_MS, or a FrameClock gap flag inside
 * the window, invalidates the window.
 */

import { median } from '../dsp/stats.ts';
import { MAX_GAP_MS, WINDOW_MS, type TraceWindow } from './hrEstimator.ts';

export interface TraceSample {
  tMs: number;
  r: number;
  g: number;
  b: number;
  /** False when the frame cannot be used (no face, head turned, no accepted pixels). */
  valid: boolean;
  coverage: number;
  saturatedFraction: number;
  meanLuma: number;
}

export interface WindowStats {
  /** Median mask coverage over valid frames. */
  coverage: number;
  /** Mean saturated-pixel fraction over valid frames. */
  saturatedFraction: number;
  /** Mean luma over valid frames (0-255). */
  meanLuma: number;
  /** Largest relative luma change between consecutive valid frames. */
  maxLumaJump: number;
  /** Median frame rate of the valid frames (Hz). */
  fps: number;
}

export type TraceWindowResult =
  { ok: true; window: TraceWindow; stats: WindowStats } | { ok: false; reason: 'tooShort' | 'gap' };

export class RgbTrace {
  private readonly keepMs: number;
  private s: (TraceSample & { gapBefore: boolean })[] = [];

  constructor(keepMs = WINDOW_MS + 5_000) {
    this.keepMs = keepMs;
  }

  push(sample: TraceSample, gapBefore = false): void {
    this.s.push({ ...sample, gapBefore });
    const lo = sample.tMs - this.keepMs;
    if ((this.s[0]?.tMs ?? Infinity) < lo - 1000) this.s = this.s.filter((x) => x.tMs >= lo);
  }

  reset(): void {
    this.s = [];
  }

  get latestMs(): number | null {
    return this.s.at(-1)?.tMs ?? null;
  }

  /** Window [endMs - lengthMs, endMs] of valid samples, or why there is none. */
  window(endMs: number, lengthMs = WINDOW_MS): TraceWindowResult {
    const startMs = endMs - lengthMs;
    const inWin = this.s.filter((x) => x.tMs >= startMs && x.tMs <= endMs);
    if (inWin.length === 0 || (this.s[0]?.tMs ?? Infinity) > startMs) {
      return { ok: false, reason: 'tooShort' };
    }
    // A flagged gap after the first sample of the window breaks it.
    if (inWin.slice(1).some((x) => x.gapBefore)) return { ok: false, reason: 'gap' };
    const v = inWin.filter((x) => x.valid);
    const first = v[0];
    const last = v.at(-1);
    if (!first || !last || first.tMs - startMs > MAX_GAP_MS || endMs - last.tMs > MAX_GAP_MS) {
      return { ok: false, reason: 'gap' };
    }
    for (let i = 1; i < v.length; i++) {
      if ((v[i] as TraceSample).tMs - (v[i - 1] as TraceSample).tMs > MAX_GAP_MS) {
        return { ok: false, reason: 'gap' };
      }
    }

    let jump = 0;
    let sat = 0;
    let luma = 0;
    const dts: number[] = [];
    v.forEach((x, i) => {
      sat += x.saturatedFraction;
      luma += x.meanLuma;
      const p = v[i - 1];
      if (p) {
        dts.push(x.tMs - p.tMs);
        if (p.meanLuma > 0) jump = Math.max(jump, Math.abs(x.meanLuma - p.meanLuma) / p.meanLuma);
      }
    });
    return {
      ok: true,
      window: {
        tMs: v.map((x) => x.tMs),
        r: v.map((x) => x.r),
        g: v.map((x) => x.g),
        b: v.map((x) => x.b),
      },
      stats: {
        coverage: median(v.map((x) => x.coverage)),
        saturatedFraction: sat / v.length,
        meanLuma: luma / v.length,
        maxLumaJump: jump,
        fps: dts.length ? 1000 / median(dts) : 0,
      },
    };
  }
}
