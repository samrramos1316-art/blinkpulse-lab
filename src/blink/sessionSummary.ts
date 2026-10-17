/**
 * Blink analysis over time (SPEC_AMENDMENT_01 Patch B, PROJECT_SPEC 5.3.1). Pure.
 *
 * The session is cut into one-minute bins from the first sample. Each bin keeps:
 * - valid time: intervals between consecutive valid samples that are not gaps
 *   (same rule as BlinkMetrics), split exactly at bin boundaries;
 * - lost time by reason (no face, head turned, frame gap, calibrating);
 * - frame intervals, for the bin's frame rate and duration resolution;
 * - events, assigned to the bin where they START.
 *
 * A bin is usable when valid time covers >= 70% of the full minute. Unusable bins
 * report null for every value (shown as gaps, never zeros). A usable bin with no
 * blinks reports a count of 0 and null durations. Descriptive only.
 */

import { mean, median } from '../dsp/stats.ts';
import { DEFAULT_MAX_GAP_MS, type BlinkEvent } from './blinkDetector.ts';

export const BIN_MS = 60_000;
/** Patch B: usable when valid-time coverage >= 70%. */
export const MIN_COVERAGE = 0.7;
/** PROJECT_SPEC 5.1 asks the camera for >= 24 fps; below it a bin is marked low FPS. */
export const LOW_FPS = 24;

export type LostReason = 'noFace' | 'headTurned' | 'gap' | 'calibrating';
export const LOST_REASONS: readonly LostReason[] = ['noFace', 'headTurned', 'gap', 'calibrating'];

export interface SessionSample {
  tMs: number;
  valid: boolean;
  /** Why the sample is not valid (ignored when valid). */
  reason?: Exclude<LostReason, 'gap'>;
  /** The interval before this sample is a gap (FrameClock flag). */
  gapBefore?: boolean;
}

export interface MinuteBin {
  /** 0-based minute since the session started. */
  index: number;
  /** Session time (ms since the first sample). */
  startMs: number;
  endMs: number;
  /** Time observed so far in this bin (< BIN_MS only for the current minute). */
  elapsedMs: number;
  validMs: number;
  /** validMs / BIN_MS. */
  coverage: number;
  usable: boolean;
  lostMs: Record<LostReason, number>;
  /** Largest lost-time reason (or 'lowFps'), for the coverage bar; null if nothing notable. */
  mainReason: LostReason | 'lowFps' | null;
  /** Median frame interval in the bin (ms): the duration resolution. */
  medianFrameMs: number | null;
  lowFps: boolean;
  // Values below are null when the bin is not usable.
  /** Blinks + long closures starting in the bin. */
  blinkCount: number | null;
  ratePerMin: number | null;
  medianDurationMs: number | null;
  meanDurationMs: number | null;
  longClosures: number | null;
  extendedClosures: number | null;
  /** Closed time (all event kinds, clipped to the bin) / valid time. */
  closedFraction: number | null;
}

interface Acc {
  validMs: number;
  lostMs: Record<LostReason, number>;
  dts: number[];
  events: BlinkEvent[];
  closedMs: number;
  elapsedMs: number;
  cached: MinuteBin | null;
}

const emptyLost = (): Record<LostReason, number> => ({
  noFace: 0,
  headTurned: 0,
  gap: 0,
  calibrating: 0,
});

export class SessionSummary {
  private readonly maxGapMs: number;
  private t0 = NaN;
  private prev: SessionSample | null = null;
  private readonly accs: Acc[] = [];

  constructor(maxGapMs = DEFAULT_MAX_GAP_MS) {
    this.maxGapMs = maxGapMs;
  }

  get started(): boolean {
    return !Number.isNaN(this.t0);
  }

  /** Session time of a monotonic timestamp (ms since the first sample). */
  sessionMs(tMs: number): number {
    return tMs - this.t0;
  }

  addSample(s: SessionSample): void {
    if (Number.isNaN(this.t0)) this.t0 = s.tMs;
    const prev = this.prev;
    this.prev = s;
    if (!prev) {
      this.acc(0);
      return;
    }
    const a = prev.tMs - this.t0;
    const b = s.tMs - this.t0;
    if (!(b > a)) return;
    const dt = b - a;
    const gap = s.gapBefore === true || dt > this.maxGapMs;
    if (!gap) this.acc(Math.floor(b / BIN_MS)).dts.push(dt);
    let kind: 'valid' | LostReason;
    if (gap) kind = 'gap';
    else if (prev.valid && s.valid) kind = 'valid';
    else if (!s.valid) kind = s.reason ?? 'noFace';
    else kind = prev.reason ?? 'noFace';
    this.spread(a, b, (acc, ms) => {
      acc.elapsedMs += ms;
      if (kind === 'valid') acc.validMs += ms;
      else acc.lostMs[kind] += ms;
    });
  }

  addEvent(e: BlinkEvent): void {
    if (Number.isNaN(this.t0)) return;
    const a = e.startMs - this.t0;
    const b = e.endMs - this.t0;
    this.acc(Math.max(0, Math.floor(a / BIN_MS))).events.push(e);
    this.spread(Math.max(0, a), b, (acc, ms) => {
      acc.closedMs += ms;
    });
  }

  reset(): void {
    this.t0 = NaN;
    this.prev = null;
    this.accs.length = 0;
  }

  bins(): MinuteBin[] {
    return this.accs.map((acc, i) => {
      acc.cached ??= summarise(acc, i);
      return acc.cached;
    });
  }

  private acc(i: number): Acc {
    while (this.accs.length <= i) {
      this.accs.push({
        validMs: 0,
        lostMs: emptyLost(),
        dts: [],
        events: [],
        closedMs: 0,
        elapsedMs: 0,
        cached: null,
      });
    }
    const acc = this.accs[i] as Acc;
    acc.cached = null;
    return acc;
  }

  /** Split [a, b) (session ms) across bins. */
  private spread(a: number, b: number, add: (acc: Acc, ms: number) => void): void {
    let t = a;
    while (t < b) {
      const i = Math.floor(t / BIN_MS);
      const end = Math.min(b, (i + 1) * BIN_MS);
      add(this.acc(i), end - t);
      t = end;
    }
  }
}

function summarise(acc: Acc, index: number): MinuteBin {
  const coverage = acc.validMs / BIN_MS;
  const usable = coverage >= MIN_COVERAGE;
  const medianFrameMs = acc.dts.length ? median(acc.dts) : null;
  const lowFps = medianFrameMs !== null && 1000 / medianFrameMs < LOW_FPS;

  let mainReason: MinuteBin['mainReason'] = null;
  let most = 0;
  for (const r of LOST_REASONS) {
    if (acc.lostMs[r] > most) {
      most = acc.lostMs[r];
      mainReason = r;
    }
  }
  if (mainReason === null && lowFps) mainReason = 'lowFps';

  const blinks = acc.events.filter((e) => e.kind !== 'extended_closure');
  const durations = blinks.map((e) => e.durationMs);
  const ifUsable = <T>(v: T): T | null => (usable ? v : null);
  return {
    index,
    startMs: index * BIN_MS,
    endMs: (index + 1) * BIN_MS,
    elapsedMs: acc.elapsedMs,
    validMs: acc.validMs,
    coverage,
    usable,
    lostMs: { ...acc.lostMs },
    mainReason,
    medianFrameMs,
    lowFps,
    blinkCount: ifUsable(blinks.length),
    ratePerMin: ifUsable((blinks.length * 60_000) / acc.validMs),
    medianDurationMs: usable && durations.length ? median(durations) : null,
    meanDurationMs: usable && durations.length ? mean(durations) : null,
    longClosures: ifUsable(acc.events.filter((e) => e.kind === 'long_closure').length),
    extendedClosures: ifUsable(acc.events.filter((e) => e.kind === 'extended_closure').length),
    closedFraction: ifUsable(Math.min(1, acc.closedMs / acc.validMs)),
  };
}

const cell = (v: number | null, digits: number) => (v === null ? '' : v.toFixed(digits));

/** Per-minute table as CSV (numbers only; empty cells for unusable minutes). */
export function sessionToCsv(bins: readonly MinuteBin[]): string {
  const header = [
    'minute',
    'start_s',
    'end_s',
    'coverage',
    'usable',
    'blink_count',
    'rate_per_min',
    'median_duration_ms',
    'mean_duration_ms',
    'long_closures',
    'extended_closures',
    'closed_fraction',
    'lost_no_face_s',
    'lost_head_turned_s',
    'lost_gap_s',
    'lost_calibrating_s',
    'median_frame_ms',
    'low_fps',
  ];
  const rows = bins.map((b) =>
    [
      String(b.index + 1),
      (b.startMs / 1000).toFixed(0),
      (b.endMs / 1000).toFixed(0),
      b.coverage.toFixed(3),
      b.usable ? '1' : '0',
      cell(b.blinkCount, 0),
      cell(b.ratePerMin, 2),
      cell(b.medianDurationMs, 1),
      cell(b.meanDurationMs, 1),
      cell(b.longClosures, 0),
      cell(b.extendedClosures, 0),
      cell(b.closedFraction, 4),
      (b.lostMs.noFace / 1000).toFixed(1),
      (b.lostMs.headTurned / 1000).toFixed(1),
      (b.lostMs.gap / 1000).toFixed(1),
      (b.lostMs.calibrating / 1000).toFixed(1),
      cell(b.medianFrameMs, 2),
      b.lowFps ? '1' : '0',
    ].join(','),
  );
  return `${[header.join(','), ...rows].join('\n')}\n`;
}
