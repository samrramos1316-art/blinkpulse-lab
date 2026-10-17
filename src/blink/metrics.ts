/**
 * Rolling blink metrics (PROJECT_SPEC 5.3). Pure.
 *
 * - Valid observation time: the sum of intervals between consecutive valid
 *   samples that are not gaps (dt <= maxGapMs and no gap flag). Invalid time (no
 *   face, head turned, hidden tab) is excluded, so rates are per valid minute,
 *   not per wall-clock minute.
 * - Blink rate: events of kind 'blink' or 'long_closure' that END inside the
 *   window, divided by the valid time in the window. Extended closures (> 2 s:
 *   eyes shut on purpose, looking away) are not counted as blinks.
 * - Durations: median and mean over the same events; last blink duration.
 * - Eye-closed fraction: time inside events of any kind (clipped to the window),
 *   divided by the valid time in the window.
 */

import { mean, median } from '../dsp/stats.ts';
import { DEFAULT_MAX_GAP_MS, type BlinkEvent, type EarSample } from './blinkDetector.ts';

export const METRICS_WINDOW_MS = 60_000;

/**
 * Valid time needed before rates are shown. A usability choice so the first few
 * seconds do not show a wildly extrapolated rate; not tuned.
 */
export const MIN_VALID_MS_FOR_RATE = 20_000;

export interface BlinkMetricsSnapshot {
  /** Valid observation time inside the window (ms). */
  validMs: number;
  /** Blinks per valid minute, or null until MIN_VALID_MS_FOR_RATE. */
  ratePerMin: number | null;
  /** Blinks (blink + long_closure) ending in the window. */
  blinkCount: number;
  medianDurationMs: number | null;
  meanDurationMs: number | null;
  lastDurationMs: number | null;
  /** 0..1, or null until MIN_VALID_MS_FOR_RATE. */
  closedFraction: number | null;
  longClosures: number;
  extendedClosures: number;
}

interface Span {
  start: number;
  end: number;
}

const overlap = (a: Span, lo: number, hi: number) =>
  Math.max(0, Math.min(a.end, hi) - Math.max(a.start, lo));

export class BlinkMetrics {
  private readonly windowMs: number;
  private readonly maxGapMs: number;
  private valid: Span[] = [];
  private events: BlinkEvent[] = [];
  private prev: EarSample | null = null;
  private lastBlink: BlinkEvent | null = null;
  private nowMs = 0;

  constructor(windowMs = METRICS_WINDOW_MS, maxGapMs = DEFAULT_MAX_GAP_MS) {
    this.windowMs = windowMs;
    this.maxGapMs = maxGapMs;
  }

  /** Record a sample (for valid-time bookkeeping). Call for every sample, valid or not. */
  addSample(sample: EarSample): void {
    this.nowMs = Math.max(this.nowMs, sample.tMs);
    const ok = sample.valid && Number.isFinite(sample.ear);
    const prev = this.prev;
    if (
      ok &&
      prev !== null &&
      sample.gapBefore !== true &&
      sample.tMs - prev.tMs <= this.maxGapMs
    ) {
      const last = this.valid[this.valid.length - 1];
      if (last && last.end === prev.tMs) last.end = sample.tMs;
      else this.valid.push({ start: prev.tMs, end: sample.tMs });
    }
    this.prev = ok ? sample : null;
    this.prune();
  }

  addEvent(event: BlinkEvent): void {
    this.events.push(event);
    if (event.kind !== 'extended_closure') this.lastBlink = event;
    this.prune();
  }

  reset(): void {
    this.valid = [];
    this.events = [];
    this.prev = null;
    this.lastBlink = null;
    this.nowMs = 0;
  }

  snapshot(): BlinkMetricsSnapshot {
    const hi = this.nowMs;
    const lo = hi - this.windowMs;
    let validMs = 0;
    for (const s of this.valid) validMs += overlap(s, lo, hi);

    const inWindow = this.events.filter((e) => e.endMs > lo && e.endMs <= hi);
    const blinks = inWindow.filter((e) => e.kind !== 'extended_closure');
    const durations = blinks.map((e) => e.durationMs);
    let closedMs = 0;
    for (const e of this.events) closedMs += overlap({ start: e.startMs, end: e.endMs }, lo, hi);

    const enough = validMs >= MIN_VALID_MS_FOR_RATE;
    return {
      validMs,
      ratePerMin: enough ? (blinks.length * 60_000) / validMs : null,
      blinkCount: blinks.length,
      medianDurationMs: durations.length ? median(durations) : null,
      meanDurationMs: durations.length ? mean(durations) : null,
      lastDurationMs: this.lastBlink?.durationMs ?? null,
      closedFraction: enough ? Math.min(1, closedMs / validMs) : null,
      longClosures: inWindow.filter((e) => e.kind === 'long_closure').length,
      extendedClosures: inWindow.filter((e) => e.kind === 'extended_closure').length,
    };
  }

  private prune(): void {
    const lo = this.nowMs - this.windowMs;
    if (this.valid.length && (this.valid[0] as Span).end < lo) {
      this.valid = this.valid.filter((s) => s.end >= lo);
    }
    if (this.events.length && (this.events[0] as BlinkEvent).endMs < lo) {
      this.events = this.events.filter((e) => e.endMs >= lo);
    }
  }
}
