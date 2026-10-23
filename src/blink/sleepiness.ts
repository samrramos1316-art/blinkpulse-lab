/**
 * Eye-Closure Index (PROJECT_SPEC 5.7, SPEC_AMENDMENT_01 Patch C, docs/STUDY_PROTOCOL.md
 * Sections 3-7). Pure.
 *
 * Compares eyelid behaviour in a trailing window with the user's own alert baseline:
 *
 *   C = closed fraction: valid time with EAR <= 0.20 b, over valid time
 *   L = closures of 500 ms or longer per valid minute
 *   D = mean duration of blinks shorter than 500 ms
 *   ECI = mean of min(max(X, floor) / max(X0, floor), cap) over C, L, D
 *
 * The floor applies to both sides, so values below the measurement resolution
 * count as the floor and a window equal to the baseline gives exactly 1.
 *
 * Blink rate is reported as a ratio to baseline but is never part of the ECI. A
 * window that fails gating reports a reason, never a number. All constants are
 * those of the draft protocol (not frozen, not tuned on any data).
 */

import { mean, median } from '../dsp/stats.ts';
import { DEFAULT_MAX_GAP_MS, type BlinkEvent } from './blinkDetector.ts';
import { LOW_FPS, MIN_COVERAGE } from './sessionSummary.ts';

/** EAR at or below this fraction of the open-eye baseline counts as closed (PROJECT_SPEC 5.7). */
export const PERCLOS_FRACTION = 0.2;
/** Alert baseline: valid time needed, longest clock time allowed, fewest blinks. */
export const BASELINE_VALID_MS = 180_000;
export const BASELINE_MAX_MS = 360_000;
export const BASELINE_MIN_BLINKS = 10;
/** Floors applied to the baseline values before dividing (protocol Section 5). */
export const FLOOR = { closedFraction: 0.01, longPerMin: 0.2, blinkMs: 100 } as const;
/** Each ratio is capped so one factor cannot dominate the mean. */
export const RATIO_CAP = 5;
/** Fewest blinks in a window for a mean duration. */
export const MIN_WINDOW_BLINKS = 3;
export const SHORT_WINDOW_MS = 60_000;
export const LONG_WINDOW_MS = 300_000;
/** Both windows are evaluated this often for the trend. */
export const EVAL_HOP_MS = 10_000;
/** Provisional band cut-offs (protocol Section 7): display only, not validated. */
export const PROVISIONAL_BANDS = { somewhatAbove: 1.5, wellAbove: 2.5 } as const;
/** Longest closure that still counts as a blink for D (detector's 'blink' kind). */
const LONG_CLOSURE_MIN_MS = 500;
/**
 * Events are kept this long past the 5-minute window, so a window ending a few
 * seconds ago can still be evaluated (study analysis windows).
 */
const EVENT_MARGIN_MS = 60_000;
/** Trend history kept (8 h of 10 s points). */
const MAX_TREND = 2880;
/**
 * Ring capacity: more than 5 min + EVENT_MARGIN_MS of intervals at 120 fps (some
 * phone cameras run above 60 fps; 24 000 held only 6 min up to about 66 fps).
 */
const CAPACITY = 48_000;

export type Band = 'near' | 'somewhatAbove' | 'wellAbove';

export type EciReason =
  | 'noCalibration'
  | 'noBaseline'
  | 'warmingUp'
  | 'noFace'
  | 'headTurned'
  | 'gap'
  | 'lowFps'
  | 'tooFewBlinks';

export interface EyeClosureFactors {
  /** 0..1 */
  closedFraction: number;
  longPerMin: number;
  /** Mean duration of blinks shorter than 500 ms. */
  meanBlinkMs: number;
  blinksPerMin: number;
}

export interface EciRatios {
  closedFraction: number;
  longClosures: number;
  blinkDuration: number;
  /** Shown separately; NOT part of the ECI. */
  blinkRate: number;
}

/** Time lost in a window, by reason (ms). */
export interface LostTime {
  noFace: number;
  headTurned: number;
  gap: number;
}

interface WindowQuality {
  coverage: number;
  lost: LostTime;
  /** Median frame rate over the window's non-gap intervals, or null. */
  medianFps: number | null;
}

export type EciResult =
  | ({
      ok: true;
      tMs: number;
      eci: number;
      band: Band;
      factors: EyeClosureFactors;
      ratios: EciRatios;
    } & WindowQuality)
  | ({ ok: false; tMs: number; reason: EciReason } & WindowQuality);

export interface BaselineValues extends EyeClosureFactors {
  validMs: number;
  blinkCount: number;
}

export type BaselineState =
  | { phase: 'none' }
  | { phase: 'running'; startedMs: number; validMs: number; progress: number }
  | { phase: 'done'; values: BaselineValues }
  | { phase: 'failed'; reason: 'notEnoughValid' | 'tooFewBlinks' };

export interface TrendPoint {
  tMs: number;
  short: EciResult;
  long: EciResult;
}

export interface EyeClosureSample {
  tMs: number;
  ear: number;
  valid: boolean;
  /** Why the sample is not valid (ignored when valid). */
  reason?: 'noFace' | 'headTurned';
  /** The interval before this sample is a gap (FrameClock flag). */
  gapBefore?: boolean;
}

/** Interval classes stored in the ring. */
const Code = { Open: 0, Closed: 1, NoFace: 2, HeadTurned: 3, Gap: 4 } as const;
type Code = (typeof Code)[keyof typeof Code];

export function bandOf(eci: number): Band {
  if (eci >= PROVISIONAL_BANDS.wellAbove) return 'wellAbove';
  if (eci >= PROVISIONAL_BANDS.somewhatAbove) return 'somewhatAbove';
  return 'near';
}

const ratio = (x: number, base: number, floor: number) =>
  Math.min(Math.max(x, floor) / Math.max(base, floor), RATIO_CAP);

/** Ratios and ECI of window factors against the baseline (protocol Section 5). */
export function eciFromFactors(
  f: EyeClosureFactors,
  base: EyeClosureFactors,
): { eci: number; ratios: EciRatios } {
  const ratios: EciRatios = {
    closedFraction: ratio(f.closedFraction, base.closedFraction, FLOOR.closedFraction),
    longClosures: ratio(f.longPerMin, base.longPerMin, FLOOR.longPerMin),
    blinkDuration: ratio(f.meanBlinkMs, base.meanBlinkMs, FLOOR.blinkMs),
    blinkRate: base.blinksPerMin > 0 ? f.blinksPerMin / base.blinksPerMin : NaN,
  };
  const eci = (ratios.closedFraction + ratios.longClosures + ratios.blinkDuration) / 3;
  return { eci, ratios };
}

interface Tally {
  validMs: number;
  closedMs: number;
  long: number;
  blinkMs: number[];
  /** Blinks + long closures (same rule as the blink-rate card). */
  rateCount: number;
}

const emptyTally = (): Tally => ({ validMs: 0, closedMs: 0, long: 0, blinkMs: [], rateCount: 0 });

function addEventTo(t: Tally, e: BlinkEvent): void {
  if (e.durationMs >= LONG_CLOSURE_MIN_MS) t.long++;
  else t.blinkMs.push(e.durationMs);
  if (e.kind !== 'extended_closure') t.rateCount++;
}

function factorsOf(t: Tally): EyeClosureFactors {
  const min = t.validMs / 60_000;
  return {
    closedFraction: t.closedMs / t.validMs,
    longPerMin: t.long / min,
    meanBlinkMs: mean(t.blinkMs),
    blinksPerMin: t.rateCount / min,
  };
}

/**
 * Feed every frame after blink calibration (`addSample`) and every detected event
 * (`addEvent`). Intervals are classified once, as they arrive; windows sum the
 * intervals that END inside them (a 33 ms interval is not split at the edge).
 */
export class EyeClosureTracker {
  private readonly maxGapMs: number;
  private closedEar = NaN;
  private readonly tEnd = new Float64Array(CAPACITY);
  private readonly dt = new Float64Array(CAPACITY);
  private readonly code = new Uint8Array(CAPACITY);
  private head = 0;
  private count = 0;
  private prev: EyeClosureSample | null = null;
  private firstMs = NaN;
  private events: BlinkEvent[] = [];
  private baselineState: BaselineState = { phase: 'none' };
  private baselineTally: Tally = emptyTally();
  private trendPoints: TrendPoint[] = [];
  private nextEvalMs = NaN;

  constructor(maxGapMs = DEFAULT_MAX_GAP_MS) {
    this.maxGapMs = maxGapMs;
  }

  /** A new blink calibration: new closed level; the old baseline no longer applies. */
  setEarBaseline(earBaseline: number): void {
    this.closedEar = PERCLOS_FRACTION * earBaseline;
    this.baselineState = { phase: 'none' };
    this.reset();
  }

  /** Forget measured data and the trend; keep the calibration and a finished baseline. */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.prev = null;
    this.firstMs = NaN;
    this.events = [];
    this.trendPoints = [];
    this.nextEvalMs = NaN;
    if (this.baselineState.phase === 'running') this.baselineState = { phase: 'none' };
  }

  startBaseline(): void {
    this.baselineState = { phase: 'running', startedMs: NaN, validMs: 0, progress: 0 };
    this.baselineTally = emptyTally();
  }

  cancelBaseline(): void {
    if (this.baselineState.phase === 'running') this.baselineState = { phase: 'none' };
  }

  get baseline(): BaselineState {
    return this.baselineState;
  }

  get trend(): readonly TrendPoint[] {
    return this.trendPoints;
  }

  /** The latest trend point, or a fresh evaluation before the first one. */
  latest(): TrendPoint {
    const last = this.trendPoints[this.trendPoints.length - 1];
    if (last) return last;
    const now = this.prev?.tMs ?? 0;
    return {
      tMs: now,
      short: this.evaluate(SHORT_WINDOW_MS, now),
      long: this.evaluate(LONG_WINDOW_MS, now),
    };
  }

  addSample(s: EyeClosureSample): void {
    if (Number.isNaN(this.firstMs)) this.firstMs = s.tMs;
    const p = this.prev;
    this.prev = s;
    if (p) {
      const dt = s.tMs - p.tMs;
      const c = this.classify(p, s, dt);
      this.tEnd[this.head] = s.tMs;
      this.dt[this.head] = dt;
      this.code[this.head] = c;
      this.head = (this.head + 1) % CAPACITY;
      this.count = Math.min(this.count + 1, CAPACITY);
      this.stepBaseline(s.tMs, dt, c);
    } else {
      this.stepBaseline(s.tMs, 0, Code.Gap);
    }
    const lo = s.tMs - LONG_WINDOW_MS - EVENT_MARGIN_MS;
    if ((this.events[0]?.startMs ?? Infinity) <= lo)
      this.events = this.events.filter((e) => e.startMs > lo);

    if (this.baselineState.phase === 'done') {
      if (Number.isNaN(this.nextEvalMs)) this.nextEvalMs = s.tMs;
      if (s.tMs >= this.nextEvalMs) {
        this.trendPoints.push({
          tMs: s.tMs,
          short: this.evaluate(SHORT_WINDOW_MS, s.tMs),
          long: this.evaluate(LONG_WINDOW_MS, s.tMs),
        });
        if (this.trendPoints.length > MAX_TREND) this.trendPoints.shift();
        while (this.nextEvalMs <= s.tMs) this.nextEvalMs += EVAL_HOP_MS;
      }
    }
  }

  addEvent(e: BlinkEvent): void {
    this.events.push(e);
    const b = this.baselineState;
    if (b.phase === 'running' && e.startMs >= b.startedMs) addEventTo(this.baselineTally, e);
  }

  /** Time of the latest sample, or NaN before the first. */
  get latestSampleMs(): number {
    return this.prev?.tMs ?? NaN;
  }

  /**
   * The trailing window ending at `nowMs`: normally the latest sample, or up to
   * EVENT_MARGIN_MS earlier (an analysis window evaluated a few seconds late).
   */
  evaluate(windowMs: number, nowMs: number): EciResult {
    const lo = nowMs - windowMs;
    const none: WindowQuality = {
      coverage: 0,
      lost: { noFace: 0, headTurned: 0, gap: 0 },
      medianFps: null,
    };
    const fail = (reason: EciReason, q: WindowQuality): EciResult => ({
      ok: false,
      tMs: nowMs,
      reason,
      ...q,
    });
    if (Number.isNaN(this.closedEar)) return fail('noCalibration', none);
    const b = this.baselineState;
    if (b.phase !== 'done') return fail('noBaseline', none);

    const t = emptyTally();
    const lost = { noFace: 0, headTurned: 0, gap: 0 };
    const dts: number[] = [];
    for (let k = 0; k < this.count; k++) {
      const i = (this.head - 1 - k + CAPACITY) % CAPACITY;
      const end = this.tEnd[i] as number;
      if (end <= lo) break;
      if (end > nowMs) continue;
      const dt = this.dt[i] as number;
      const c = this.code[i] as Code;
      if (c !== Code.Gap) dts.push(dt);
      if (c === Code.Open || c === Code.Closed) {
        t.validMs += dt;
        if (c === Code.Closed) t.closedMs += dt;
      } else if (c === Code.NoFace) lost.noFace += dt;
      else if (c === Code.HeadTurned) lost.headTurned += dt;
      else lost.gap += dt;
    }
    const coverage = Math.min(1, t.validMs / windowMs);
    const q: WindowQuality = {
      coverage,
      lost,
      medianFps: dts.length ? 1000 / median(dts) : null,
    };
    if (coverage < MIN_COVERAGE) {
      const unrecorded = Number.isNaN(this.firstMs) ? windowMs : Math.max(0, this.firstMs - lo);
      const candidates: [EciReason, number][] = [
        ['warmingUp', unrecorded],
        ['noFace', lost.noFace],
        ['headTurned', lost.headTurned],
        ['gap', lost.gap],
      ];
      let best = candidates[0] as [EciReason, number];
      for (const c of candidates) if (c[1] > best[1]) best = c;
      return fail(best[0], q);
    }
    if (q.medianFps === null || q.medianFps < LOW_FPS) return fail('lowFps', q);
    for (const e of this.events) if (e.startMs > lo && e.startMs <= nowMs) addEventTo(t, e);
    if (t.blinkMs.length < MIN_WINDOW_BLINKS) return fail('tooFewBlinks', q);

    const factors = factorsOf(t);
    const { eci, ratios } = eciFromFactors(factors, b.values);
    return { ok: true, tMs: nowMs, eci, band: bandOf(eci), factors, ratios, ...q };
  }

  private classify(p: EyeClosureSample, s: EyeClosureSample, dt: number): Code {
    if (s.gapBefore === true || dt > this.maxGapMs) return Code.Gap;
    const ok = (x: EyeClosureSample) => x.valid && Number.isFinite(x.ear);
    if (ok(s) && ok(p)) return s.ear <= this.closedEar ? Code.Closed : Code.Open;
    const bad = ok(s) ? p : s;
    return bad.reason === 'headTurned' ? Code.HeadTurned : Code.NoFace;
  }

  private stepBaseline(tMs: number, dt: number, c: Code): void {
    const b = this.baselineState;
    if (b.phase !== 'running') return;
    const startedMs = Number.isNaN(b.startedMs) ? tMs : b.startedMs;
    const t = this.baselineTally;
    // Intervals that end at the start belong to the time before the baseline.
    if (tMs > startedMs && (c === Code.Open || c === Code.Closed)) {
      t.validMs += dt;
      if (c === Code.Closed) t.closedMs += dt;
    }
    if (t.validMs >= BASELINE_VALID_MS) {
      if (t.blinkMs.length < BASELINE_MIN_BLINKS) {
        this.baselineState = { phase: 'failed', reason: 'tooFewBlinks' };
        return;
      }
      this.baselineState = {
        phase: 'done',
        values: { ...factorsOf(t), validMs: t.validMs, blinkCount: t.blinkMs.length },
      };
      return;
    }
    if (tMs - startedMs > BASELINE_MAX_MS) {
      this.baselineState = { phase: 'failed', reason: 'notEnoughValid' };
      return;
    }
    this.baselineState = {
      phase: 'running',
      startedMs,
      validMs: t.validMs,
      progress: t.validMs / BASELINE_VALID_MS,
    };
  }
}

export interface TrendSummary {
  /** Minutes (10 s steps) of the 5-minute window in each band. */
  minutesInBand: Record<Band, number>;
  minutesNotEnoughData: number;
  firstUsable: number | null;
  lastUsable: number | null;
}

/** Session-end summary over the 5-minute window (Patch C2). Descriptive only. */
export function summarizeTrend(trend: readonly TrendPoint[]): TrendSummary {
  const step = EVAL_HOP_MS / 60_000;
  const minutesInBand: Record<Band, number> = { near: 0, somewhatAbove: 0, wellAbove: 0 };
  let minutesNotEnoughData = 0;
  let firstUsable: number | null = null;
  let lastUsable: number | null = null;
  for (const p of trend) {
    if (p.long.ok) {
      minutesInBand[p.long.band] += step;
      firstUsable ??= p.long.eci;
      lastUsable = p.long.eci;
    } else minutesNotEnoughData += step;
  }
  return { minutesInBand, minutesNotEnoughData, firstUsable, lastUsable };
}
