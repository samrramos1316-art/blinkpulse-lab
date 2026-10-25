/**
 * FrameClock: turns raw frame timestamps into monotonic milliseconds and tracks
 * frame timing (PROJECT_SPEC 5.1). Pure: no DOM, runs in Node.
 *
 *  - tMs is measured from the first accepted frame.
 *  - Timestamps that do not increase are rejected (returned as null), so tMs is
 *    strictly increasing.
 *  - Rolling statistics use the last `windowSize` frame intervals (dt):
 *    median dt, jitter = standard deviation of the non-gap dt values, and
 *    fps = 1000 / mean dt. The mean, not the median, gives the delivered frame
 *    rate: camera intervals are often skewed (e.g. mostly 31 ms with some 48 ms),
 *    and 1000 / median then overstates the rate.
 *  - Medians below are the rolling median dt computed before the interval is added.
 *  - Irregular interval: dt > irregularFactor (1.5) x median. The PROJECT_SPEC 5.1
 *    gap rule, kept as a timing warning only: it is counted and shown but does not
 *    invalidate data (option A, approved by the author 2026-10-17; see PHASE_NOTES).
 *  - Gap: a real break in the data, which invalidates any blink event or pulse
 *    window that spans it (`spansGap`): dt > gapFactor (2.5) x median, or marked by
 *    the caller (frames reported dropped, hidden tab, timestamp source change).
 *    The 2.5 factor is provisional until measured on real webcams in Phase 4.
 */

import { median, std } from '../dsp/stats.ts';

export type GapReason = 'interval' | 'dropped' | 'hidden' | 'sourceChange';

export interface FrameTick {
  /** Milliseconds since the first accepted frame. */
  tMs: number;
  /** Interval since the previous accepted frame (ms); NaN for the first frame. */
  dtMs: number;
  /** dt > irregularFactor x median: a timing warning, not a gap. */
  irregular: boolean;
  /** True when the interval before this frame is a gap (invalidates spanning windows). */
  gap: boolean;
  gapReason: GapReason | null;
  /** 0-based count of accepted frames. */
  index: number;
}

export interface GapInterval {
  startMs: number;
  endMs: number;
  reason: GapReason;
}

export interface FrameTimingStats {
  frames: number;
  /** Rolling median frame interval (ms); NaN until enough intervals. */
  medianDtMs: number;
  /** Rolling std of the intervals that are not gaps (ms); NaN until enough intervals. */
  jitterMs: number;
  /** Delivered frame rate, 1000 / mean dt over the window; NaN until enough intervals. */
  fps: number;
  /** Intervals longer than irregularFactor x median (timing warnings). */
  irregularIntervals: number;
  /** Number of gaps of any reason. */
  gaps: number;
  /** Timestamps rejected because they did not increase. */
  rejected: number;
}

export interface FrameClockOptions {
  /** Number of recent intervals used for median and jitter. Default 90. */
  windowSize?: number;
  /** dt > irregularFactor x median dt is irregular (warning). Default 1.5 (PROJECT_SPEC 5.1). */
  irregularFactor?: number;
  /** dt > gapFactor x median dt is a gap. Default 2.5 (provisional, option A). */
  gapFactor?: number;
  /** Intervals needed before stats and interval-gap detection start. Default 5. */
  minIntervals?: number;
  /** Most recent gap intervals kept for `gapIntervals`. Default 256. */
  maxGapHistory?: number;
}

export class FrameClock {
  private readonly windowSize: number;
  private readonly irregularFactor: number;
  private readonly gapFactor: number;
  private readonly minIntervals: number;
  private readonly maxGapHistory: number;

  private readonly dts: Float64Array;
  private readonly dtIsGap: Uint8Array;
  private filled = 0;
  private head = 0;

  private lastRaw = NaN;
  private lastTMs = NaN;
  private offset = 0; // tMs = raw + offset
  private frames = 0;
  private gapCount = 0;
  private irregularCount = 0;
  private rejected = 0;
  private pendingGap: GapReason | null = null;
  private rebasePending = false;
  private gaps: GapInterval[] = [];

  constructor(options: FrameClockOptions = {}) {
    this.windowSize = options.windowSize ?? 90;
    this.irregularFactor = options.irregularFactor ?? 1.5;
    this.gapFactor = options.gapFactor ?? 2.5;
    this.minIntervals = options.minIntervals ?? 5;
    this.maxGapHistory = options.maxGapHistory ?? 256;
    if (!(this.windowSize >= this.minIntervals && this.minIntervals >= 1)) {
      throw new RangeError('FrameClock: need windowSize >= minIntervals >= 1');
    }
    if (!(this.irregularFactor > 1 && this.gapFactor >= this.irregularFactor)) {
      throw new RangeError('FrameClock: need gapFactor >= irregularFactor > 1');
    }
    this.dts = new Float64Array(this.windowSize);
    this.dtIsGap = new Uint8Array(this.windowSize);
  }

  /** Add a raw timestamp (ms). Returns null if it is not finite or does not increase. */
  push(rawMs: number): FrameTick | null {
    if (!Number.isFinite(rawMs)) {
      this.rejected++;
      return null;
    }

    if (this.frames === 0) {
      this.offset = -rawMs;
      this.lastRaw = rawMs;
      this.lastTMs = 0;
      this.frames = 1;
      this.pendingGap = null;
      this.rebasePending = false;
      return { tMs: 0, dtMs: NaN, irregular: false, gap: false, gapReason: null, index: 0 };
    }

    if (this.rebasePending) {
      // New time base: the real length of the switch is unknown. Continue one
      // median interval later and flag the interval as a gap.
      const step = this.currentMedian();
      this.offset = this.lastTMs + (Number.isFinite(step) ? step : 1) - rawMs;
      this.rebasePending = false;
      this.pendingGap = 'sourceChange';
    } else if (!(rawMs > this.lastRaw)) {
      this.rejected++;
      return null;
    }

    const tMs = rawMs + this.offset;
    const dtMs = tMs - this.lastTMs;
    const med = this.currentMedian();

    const known = Number.isFinite(med);
    const irregular = known && dtMs > this.irregularFactor * med;
    let reason: GapReason | null = this.pendingGap;
    if (reason === null && known && dtMs > this.gapFactor * med) reason = 'interval';
    this.pendingGap = null;
    if (irregular) this.irregularCount++;

    // Pauses (hidden tab, source change) say nothing about the camera's frame
    // rate, so they are not added to the rolling window.
    if (reason !== 'hidden' && reason !== 'sourceChange') this.addInterval(dtMs, reason !== null);
    if (reason !== null) this.recordGap({ startMs: this.lastTMs, endMs: tMs, reason });

    const index = this.frames;
    this.frames++;
    this.lastRaw = rawMs;
    this.lastTMs = tMs;
    return { tMs, dtMs, irregular, gap: reason !== null, gapReason: reason, index };
  }

  /** Flag the interval before the next accepted frame as a gap (frames dropped, tab hidden). */
  markGap(reason: Exclude<GapReason, 'interval'>): void {
    if (this.frames > 0) this.pendingGap = reason;
  }

  /**
   * The timestamp source changed (different time base). The next timestamp is
   * accepted even if smaller, and the interval before it is a gap.
   */
  rebase(): void {
    if (this.frames > 0) this.rebasePending = true;
  }

  stats(): FrameTimingStats {
    const med = this.currentMedian();
    return {
      frames: this.frames,
      medianDtMs: med,
      jitterMs: this.currentJitter(),
      fps: Number.isFinite(med) ? 1000 / this.currentMean() : NaN,
      irregularIntervals: this.irregularCount,
      gaps: this.gapCount,
      rejected: this.rejected,
    };
  }

  /** Most recent gaps, oldest first (at most `maxGapHistory`). */
  gapIntervals(): readonly GapInterval[] {
    return this.gaps;
  }

  private addInterval(dt: number, isGap: boolean): void {
    this.dts[this.head] = dt;
    this.dtIsGap[this.head] = isGap ? 1 : 0;
    this.head = (this.head + 1) % this.windowSize;
    if (this.filled < this.windowSize) this.filled++;
  }

  private recordGap(gap: GapInterval): void {
    this.gapCount++;
    this.gaps.push(gap);
    if (this.gaps.length > this.maxGapHistory) this.gaps = this.gaps.slice(-this.maxGapHistory);
  }

  private currentMedian(): number {
    if (this.filled < this.minIntervals) return NaN;
    return median(this.dts.subarray(0, this.filled));
  }

  private currentMean(): number {
    if (this.filled < this.minIntervals) return NaN;
    let sum = 0;
    for (let i = 0; i < this.filled; i++) sum += this.dts[i] as number;
    return sum / this.filled;
  }

  private currentJitter(): number {
    if (this.filled < this.minIntervals) return NaN;
    const regular: number[] = [];
    for (let i = 0; i < this.filled; i++) {
      if (this.dtIsGap[i] === 0) regular.push(this.dts[i] as number);
    }
    return regular.length >= 2 ? std(regular) : NaN;
  }
}

/** True if [startMs, endMs] overlaps any gap interval. */
export function spansGap(gaps: readonly GapInterval[], startMs: number, endMs: number): boolean {
  return gaps.some((g) => g.startMs < endMs && g.endMs > startMs);
}

/**
 * Whether the break before this frame breaks an analysis that bridges holes up to
 * `maxGapMs` (blinks 100 ms, PROJECT_SPEC 5.3; pulse 250 ms, 5.4). A hidden page or
 * a change of timestamp source always does (time base). A skipped frame or a long
 * interval is flagged for timing statistics but breaks the analysis only when the
 * hole is longer than `maxGapMs`.
 */
export function breaksAnalysis(
  tick: Pick<FrameTick, 'gap' | 'gapReason' | 'dtMs'>,
  maxGapMs: number,
): boolean {
  if (!tick.gap) return false;
  if (tick.gapReason === 'dropped' || tick.gapReason === 'interval')
    return !(tick.dtMs <= maxGapMs);
  return true;
}
