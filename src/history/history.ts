/**
 * Long-term history (SPEC_AMENDMENT_04 F2-F4). Pure: rows, per-minute collection,
 * day and hour-of-day summaries, the stored blink baseline, retention, CSV.
 *
 * One row per measured minute of a camera session, numbers only: the session
 * timeline minute (Patch B), the pulse values the app SHOWED in that minute
 * (Fair or better), and the eye-closure indicator's 5-minute result at the end of
 * the minute. Never video, images, landmarks, or EAR traces.
 *
 * Days are local calendar days of the minute's start. Descriptive only: no trends
 * are claimed and nothing is compared with population norms.
 */

import type { BlinkBaseline } from '../blink/comfortReminder.ts';
import { BIN_MS, type MinuteBin } from '../blink/sessionSummary.ts';
import { EVAL_HOP_MS, type Band, type TrendPoint } from '../blink/sleepiness.ts';
import { median } from '../dsp/stats.ts';

export interface HistoryRow {
  /** `${sessionId}:${minute}`. */
  id: string;
  sessionId: string;
  /** 0-based minute of the session timeline. */
  minute: number;
  /** Wall-clock start of the minute (epoch ms). */
  startMs: number;
  /** Time observed in the minute (< 60 000 only for a minute cut short by Stop). */
  elapsedMs: number;
  validMs: number;
  coverage: number;
  usable: boolean;
  medianFrameMs: number | null;
  lowFps: boolean;
  blinkCount: number | null;
  ratePerMin: number | null;
  medianDurationMs: number | null;
  meanDurationMs: number | null;
  longClosures: number | null;
  extendedClosures: number | null;
  closedFraction: number | null;
  /** Median of the pulse values shown in the minute (Fair or better), or null. */
  pulseBpm: number | null;
  pulseShownHops: number;
  /** Estimate hops in the minute (after warm-up). */
  pulseHops: number;
  /** Eye-closure indicator, 5-minute result at the end of the minute, or null. */
  eci: number | null;
  eciBand: Band | null;
}

/** Pulse values per session minute, collected hop by hop. */
export class PulseMinutes {
  private readonly m = new Map<number, { shown: number[]; hops: number }>();

  add(minute: number, displayBpm: number | null): void {
    if (!(minute >= 0)) return;
    let e = this.m.get(minute);
    if (!e) {
      e = { shown: [], hops: 0 };
      this.m.set(minute, e);
    }
    e.hops++;
    if (displayBpm !== null) e.shown.push(displayBpm);
  }

  /** The minute's values; forgets this minute and older ones. */
  take(minute: number): { bpm: number | null; shownHops: number; hops: number } {
    const e = this.m.get(minute);
    for (const k of [...this.m.keys()]) if (k <= minute) this.m.delete(k);
    return {
      bpm: e?.shown.length ? median(e.shown) : null,
      shownHops: e?.shown.length ?? 0,
      hops: e?.hops ?? 0,
    };
  }

  reset(): void {
    this.m.clear();
  }
}

/**
 * The indicator's 5-minute result at `endMs` (monotonic): the latest trend point
 * at or before it, if it is less than one evaluation step old and passed its gates.
 */
export function indicatorAt(
  trend: readonly TrendPoint[],
  endMs: number,
): { eci: number; band: Band } | null {
  for (let i = trend.length - 1; i >= 0; i--) {
    const p = trend[i] as TrendPoint;
    if (p.tMs > endMs) continue;
    if (endMs - p.tMs > EVAL_HOP_MS) return null;
    return p.long.ok ? { eci: p.long.eci, band: p.long.band } : null;
  }
  return null;
}

export interface MinuteContext {
  sessionId: string;
  /** Wall-clock time of the session timeline's origin (epoch ms). */
  wallOriginMs: number;
  pulse: { bpm: number | null; shownHops: number; hops: number };
  indicator: { eci: number; band: Band } | null;
}

export function rowFromMinute(bin: MinuteBin, c: MinuteContext): HistoryRow {
  return {
    id: `${c.sessionId}:${String(bin.index)}`,
    sessionId: c.sessionId,
    minute: bin.index,
    startMs: Math.round(c.wallOriginMs + bin.startMs),
    elapsedMs: bin.elapsedMs,
    validMs: bin.validMs,
    coverage: bin.coverage,
    usable: bin.usable,
    medianFrameMs: bin.medianFrameMs,
    lowFps: bin.lowFps,
    blinkCount: bin.blinkCount,
    ratePerMin: bin.ratePerMin,
    medianDurationMs: bin.medianDurationMs,
    meanDurationMs: bin.meanDurationMs,
    longClosures: bin.longClosures,
    extendedClosures: bin.extendedClosures,
    closedFraction: bin.closedFraction,
    pulseBpm: c.pulse.bpm,
    pulseShownHops: c.pulse.shownHops,
    pulseHops: c.pulse.hops,
    eci: c.indicator?.eci ?? null,
    eciBand: c.indicator?.band ?? null,
  };
}

/**
 * Turns the session timeline into rows as minutes end. One recorder per camera
 * session; each minute is returned once.
 */
export class HistoryRecorder {
  private readonly sessionId: string;
  private next: number;

  /** `firstMinute`: history turned on mid-session saves from the current minute on. */
  constructor(sessionId: string, firstMinute = 0) {
    this.sessionId = sessionId;
    this.next = firstMinute;
  }

  /**
   * Rows for the minutes that have ended since the last call: all but the current
   * minute, or with `final` (Stop) all of them, keeping a cut-short last minute if it
   * lasted at least a second. `originMs` is the timeline's monotonic origin and
   * `wallOriginMs` its wall-clock time.
   */
  collect(
    bins: readonly MinuteBin[],
    timing: { originMs: number; wallOriginMs: number },
    trend: readonly TrendPoint[],
    pulse: PulseMinutes,
    final = false,
  ): HistoryRow[] {
    const end = final ? bins.length : bins.length - 1;
    const rows: HistoryRow[] = [];
    for (; this.next < end; this.next++) {
      const bin = bins[this.next] as MinuteBin;
      const cut = bin.elapsedMs < BIN_MS;
      if (cut && bin.elapsedMs < 1000) continue;
      const endMs = timing.originMs + bin.startMs + (cut ? bin.elapsedMs : BIN_MS);
      rows.push(
        rowFromMinute(bin, {
          sessionId: this.sessionId,
          wallOriginMs: timing.wallOriginMs,
          pulse: pulse.take(bin.index),
          indicator: indicatorAt(trend, endMs),
        }),
      );
    }
    return rows;
  }
}

// --- summaries ---

/** A day shows blink values only with at least this many usable minutes (display rule). */
export const MIN_DAY_USABLE_MINUTES = 10;
/** Stored baseline: usable minutes needed within the last BASELINE_DAYS. */
export const BASELINE_MIN_MINUTES = 60;
export const BASELINE_DAYS = 14;
/** Rows older than this are deleted (author's decision, F2). */
export const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of an epoch time, as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Usable minutes with good frame timing: the ones blink values are pooled from. */
const good = (r: HistoryRow) => r.usable && !r.lowFps && r.blinkCount !== null;

export interface BlinkPool {
  /** Usable minutes pooled. */
  minutes: number;
  /** Blinks per valid minute, or null with too few minutes. */
  ratePerMin: number | null;
  closedFraction: number | null;
  /** Long closures (>= 500 ms) per valid hour. */
  longPerHour: number | null;
  /** Median of the minutes' median blink durations. */
  medianDurationMs: number | null;
}

/** Pool blink measures over rows (needs `minMinutes` usable minutes for values). */
export function poolBlinks(rows: readonly HistoryRow[], minMinutes: number): BlinkPool {
  const g = rows.filter(good);
  if (g.length === 0 || g.length < minMinutes) {
    return {
      minutes: g.length,
      ratePerMin: null,
      closedFraction: null,
      longPerHour: null,
      medianDurationMs: null,
    };
  }
  let validMs = 0;
  let blinks = 0;
  let closedMs = 0;
  let long = 0;
  const durations: number[] = [];
  for (const r of g) {
    validMs += r.validMs;
    blinks += r.blinkCount ?? 0;
    closedMs += (r.closedFraction ?? 0) * r.validMs;
    long += r.longClosures ?? 0;
    if (r.medianDurationMs !== null) durations.push(r.medianDurationMs);
  }
  return {
    minutes: g.length,
    ratePerMin: (blinks * 60_000) / validMs,
    closedFraction: closedMs / validMs,
    longPerHour: (long * 3_600_000) / validMs,
    medianDurationMs: durations.length ? median(durations) : null,
  };
}

export interface PulsePool {
  /** Minutes with at least one shown value. */
  minutes: number;
  bpm: number | null;
}

export function poolPulse(rows: readonly HistoryRow[]): PulsePool {
  const v = rows.flatMap((r) => (r.pulseBpm === null ? [] : [r.pulseBpm]));
  return { minutes: v.length, bpm: v.length ? median(v) : null };
}

export interface IndicatorPool {
  /** Minutes with an indicator value, per band. */
  bands: Record<Band, number>;
  /** Measured minutes without an indicator value ("Not enough data"). */
  notEnoughData: number;
  medianEci: number | null;
}

export function poolIndicator(rows: readonly HistoryRow[]): IndicatorPool {
  const bands: Record<Band, number> = { near: 0, somewhatAbove: 0, wellAbove: 0 };
  const values: number[] = [];
  for (const r of rows) {
    if (r.eci === null || r.eciBand === null) continue;
    bands[r.eciBand]++;
    values.push(r.eci);
  }
  return {
    bands,
    notEnoughData: rows.length - values.length,
    medianEci: values.length ? median(values) : null,
  };
}

export interface DaySummary {
  day: string;
  /** Rows (measured minutes, whole or partial). */
  measuredMinutes: number;
  /** Valid time in minutes. */
  validMinutes: number;
  blinks: BlinkPool;
  pulse: PulsePool;
  indicator: IndicatorPool;
}

export function summarizeDay(day: string, rows: readonly HistoryRow[]): DaySummary {
  return {
    day,
    measuredMinutes: rows.length,
    validMinutes: rows.reduce((a, r) => a + r.validMs, 0) / 60_000,
    blinks: poolBlinks(rows, MIN_DAY_USABLE_MINUTES),
    pulse: poolPulse(rows),
    indicator: poolIndicator(rows),
  };
}

/** Rows grouped by local day, oldest first. */
export function byDay(rows: readonly HistoryRow[]): Map<string, HistoryRow[]> {
  const m = new Map<string, HistoryRow[]>();
  for (const r of [...rows].sort((a, b) => a.startMs - b.startMs)) {
    const k = dayKey(r.startMs);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export function summarizeDays(rows: readonly HistoryRow[]): DaySummary[] {
  return [...byDay(rows)].map(([day, rs]) => summarizeDay(day, rs));
}

/** Blink rate by local hour of day (usable minutes pooled per hour; null below 10). */
export function hourOfDay(rows: readonly HistoryRow[]): { hour: number; blinks: BlinkPool }[] {
  const hours: HistoryRow[][] = Array.from({ length: 24 }, () => []);
  for (const r of rows) (hours[new Date(r.startMs).getHours()] as HistoryRow[]).push(r);
  return hours.map((rs, hour) => ({ hour, blinks: poolBlinks(rs, MIN_DAY_USABLE_MINUTES) }));
}

/**
 * The user's usual blink rate from history (SPEC_AMENDMENT_04 E1): the pooled rate of
 * the good minutes in the last 14 days, when there are at least 60.
 */
export function historyBaseline(rows: readonly HistoryRow[], nowMs: number): BlinkBaseline | null {
  const recent = rows.filter((r) => r.startMs >= nowMs - BASELINE_DAYS * DAY_MS);
  const p = poolBlinks(recent, BASELINE_MIN_MINUTES);
  return p.ratePerMin !== null && p.ratePerMin > 0
    ? { ratePerMin: p.ratePerMin, source: 'history', minutes: p.minutes }
    : null;
}

/** Rows that start before this time are deleted (90 days). */
export function retentionCutoff(nowMs: number): number {
  return nowMs - RETENTION_DAYS * DAY_MS;
}

/** Start of the local day `days - 1` days before the day of `nowMs` (range start). */
export function rangeStart(nowMs: number, days: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}

// --- CSV ---

const HEADER = [
  'session_id',
  'minute',
  'start_iso',
  'start_ms',
  'elapsed_s',
  'valid_s',
  'coverage',
  'usable',
  'median_frame_ms',
  'low_fps',
  'blink_count',
  'rate_per_min',
  'median_duration_ms',
  'mean_duration_ms',
  'long_closures',
  'extended_closures',
  'closed_fraction',
  'pulse_bpm_shown_median',
  'pulse_hops_shown',
  'pulse_hops',
  'eci_5min',
  'eci_band',
];

const cell = (v: number | null, digits: number) => (v === null ? '' : v.toFixed(digits));

/** All rows as CSV (numbers only), oldest first. */
export function historyToCsv(rows: readonly HistoryRow[]): string {
  const lines = [...rows]
    .sort((a, b) => a.startMs - b.startMs)
    .map((r) =>
      [
        r.sessionId,
        String(r.minute),
        new Date(r.startMs).toISOString(),
        String(r.startMs),
        (r.elapsedMs / 1000).toFixed(1),
        (r.validMs / 1000).toFixed(1),
        r.coverage.toFixed(3),
        r.usable ? '1' : '0',
        cell(r.medianFrameMs, 2),
        r.lowFps ? '1' : '0',
        cell(r.blinkCount, 0),
        cell(r.ratePerMin, 2),
        cell(r.medianDurationMs, 1),
        cell(r.meanDurationMs, 1),
        cell(r.longClosures, 0),
        cell(r.extendedClosures, 0),
        cell(r.closedFraction, 4),
        cell(r.pulseBpm, 1),
        String(r.pulseShownHops),
        String(r.pulseHops),
        cell(r.eci, 3),
        r.eciBand ?? '',
      ].join(','),
    );
  return `${[HEADER.join(','), ...lines].join('\n')}\n`;
}
