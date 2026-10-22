/**
 * Study-mode session runner (PROJECT_SPEC 5.8, docs/STUDY_PROTOCOL.md Section 8).
 * Pure: the caller passes times in ms on one clock (performance.now(); blink events
 * and window evaluation are converted from frame time by the caller, useStudy.ts) and
 * the eye-closure tracker's state.
 *
 * Steps: setup (consent check, IDs) -> blink calibration -> rating -> alert
 * baseline -> PVT-B -> 25 min of the participant's own work with a rating every
 * 5 min -> PVT-B -> finished (export, then review).
 */

import type { BlinkEvent } from '../blink/blinkDetector.ts';
import type { BlinkThresholds } from '../blink/calibration.ts';
import type { BaselineState, BaselineValues, EciResult } from '../blink/sleepiness.ts';
import type { PvtTrial } from './pvt.ts';

/** Work block length (decision D8) and rating interval. */
export const WORK_MS = 25 * 60_000;
export const RATING_EVERY_MS = 5 * 60_000;
export const RATINGS_IN_WORK = WORK_MS / RATING_EVERY_MS;
/** An unanswered rating prompt closes after this and is recorded as missing. */
export const RATING_TIMEOUT_MS = 60_000;
/** Analysis window before each rating prompt (protocol 3.3). */
export const RATING_WINDOW_MS = 5 * 60_000;
/**
 * A window is evaluated this long after it ends: blink events are reported when
 * the eye reopens, so a closure that started just before the end needs time to
 * arrive. Closures still open after this are not counted (protocol Section 10 note).
 */
export const WINDOW_SETTLE_MS = 5000;

export type StudyStep =
  'setup' | 'calibration' | 'baselineRating' | 'baseline' | 'pvt1' | 'work' | 'pvt2' | 'finished';

export type Glasses = 'none' | 'glasses' | 'contacts';
export type TimeSlot = 'morning' | 'evening' | 'other';

export type EndReason =
  'completed' | 'stopped' | 'cameraStopped' | 'baselineNotEnoughValid' | 'baselineTooFewBlinks';

export interface SessionInfo {
  /** Pseudonymous code, e.g. P03 (never a name). */
  participantId: string;
  sessionNumber: number;
  glasses: Glasses;
}

export interface RatingRecord {
  kind: 'baseline' | 'work';
  /** 0 for the baseline rating, 1-5 in the work block. */
  index: number;
  shownMs: number;
  answeredMs: number | null;
  /** 1-9, or null if missing. */
  rating: number | null;
}

export interface WindowRecord {
  kind: 'rating' | 'pvt';
  /** Rating index (1-5) or PVT run (1-2). */
  ref: number;
  startMs: number;
  endMs: number;
  /** Null until evaluated. */
  result: EciResult | null;
}

export interface PvtRecord {
  run: 1 | 2;
  startMs: number;
  endMs: number;
  trials: readonly PvtTrial[];
}

export interface StepRecord {
  step: StudyStep;
  startMs: number;
}

/** Participant codes: a letter P and 2-3 digits, so a name cannot be typed in. */
export const PARTICIPANT_ID = /^P\d{2,3}$/;

export function validParticipantId(id: string): boolean {
  return PARTICIPANT_ID.test(id);
}

/** Protocol Section 8: before 10:00, 19:00-21:30, or neither. */
export function timeSlotOf(date: Date): TimeSlot {
  const min = date.getHours() * 60 + date.getMinutes();
  if (min < 10 * 60) return 'morning';
  if (min >= 19 * 60 && min <= 21 * 60 + 30) return 'evening';
  return 'other';
}

export class StudySession {
  readonly info: SessionInfo;
  /** Session start: every exported time is relative to this. */
  readonly t0Ms: number;
  readonly startedAt: Date;
  private current: StudyStep = 'calibration';
  private readonly stepLog: StepRecord[] = [];
  private reason: EndReason | null = null;
  private calibrationValue: BlinkThresholds | null = null;
  private baselineValue: BaselineValues | null = null;
  private readonly ratingLog: RatingRecord[] = [];
  private open: RatingRecord | null = null;
  private workStartMs = NaN;
  private readonly windowLog: WindowRecord[] = [];
  private readonly pvtLog: PvtRecord[] = [];
  private readonly eventLog: BlinkEvent[] = [];
  private exportedFlag = false;

  constructor(info: SessionInfo, t0Ms: number, startedAt: Date) {
    this.info = info;
    this.t0Ms = t0Ms;
    this.startedAt = startedAt;
    this.stepLog.push({ step: 'calibration', startMs: t0Ms });
  }

  get step(): StudyStep {
    return this.current;
  }

  get endReason(): EndReason | null {
    return this.reason;
  }

  get steps(): readonly StepRecord[] {
    return this.stepLog;
  }

  get calibration(): BlinkThresholds | null {
    return this.calibrationValue;
  }

  get baseline(): BaselineValues | null {
    return this.baselineValue;
  }

  get ratings(): readonly RatingRecord[] {
    return this.ratingLog;
  }

  /** The rating prompt waiting for an answer, if any. */
  get openRating(): RatingRecord | null {
    return this.open;
  }

  get windows(): readonly WindowRecord[] {
    return this.windowLog;
  }

  get pvtRuns(): readonly PvtRecord[] {
    return this.pvtLog;
  }

  get events(): readonly BlinkEvent[] {
    return this.eventLog;
  }

  get exported(): boolean {
    return this.exportedFlag;
  }

  /** Work-block start, or NaN before it. */
  get workStart(): number {
    return this.workStartMs;
  }

  /** The calibration chosen to continue with; shows the first rating. */
  calibrationDone(thresholds: BlinkThresholds, nowMs: number): void {
    if (this.current !== 'calibration') return;
    this.calibrationValue = thresholds;
    this.go('baselineRating', nowMs);
    this.showRating('baseline', 0, nowMs);
  }

  /** Returns true if the answer was taken (a prompt was open and the rating is 1-9). */
  answerRating(rating: number, nowMs: number): boolean {
    const r = this.open;
    if (!r || !Number.isInteger(rating) || rating < 1 || rating > 9) return false;
    r.answeredMs = nowMs;
    r.rating = rating;
    this.open = null;
    if (this.current === 'baselineRating') this.go('baseline', nowMs);
    return true;
  }

  /** Blink events from the detector; kept from the end of calibration to the end. */
  addEvent(e: BlinkEvent): void {
    if (this.current !== 'setup' && this.current !== 'calibration' && this.reason === null) {
      this.eventLog.push(e);
    }
  }

  /** Advance timers (call a few times a second). */
  tick(nowMs: number, baseline: BaselineState): void {
    if (this.current === 'baseline') {
      if (baseline.phase === 'done') {
        this.baselineValue = baseline.values;
        this.go('pvt1', nowMs);
      } else if (baseline.phase === 'failed') {
        this.finish(
          baseline.reason === 'tooFewBlinks' ? 'baselineTooFewBlinks' : 'baselineNotEnoughValid',
          nowMs,
        );
      }
      return;
    }
    if (this.current !== 'work') return;
    const r = this.open;
    if (r && nowMs - r.shownMs >= RATING_TIMEOUT_MS) this.open = null;
    const shown = this.ratingLog.filter((x) => x.kind === 'work').length;
    if (!this.open && shown < RATINGS_IN_WORK) {
      const dueMs = this.workStartMs + (shown + 1) * RATING_EVERY_MS;
      if (nowMs >= dueMs) {
        this.showRating('work', shown + 1, nowMs);
        this.windowLog.push({
          kind: 'rating',
          ref: shown + 1,
          startMs: nowMs - RATING_WINDOW_MS,
          endMs: nowMs,
          result: null,
        });
      }
    }
    if (!this.open && shown >= RATINGS_IN_WORK && nowMs >= this.workStartMs + WORK_MS) {
      this.go('pvt2', nowMs);
    }
  }

  pvtDone(run: { startMs: number; endMs: number; trials: readonly PvtTrial[] }, nowMs: number) {
    const n = this.current === 'pvt1' ? 1 : this.current === 'pvt2' ? 2 : null;
    if (n === null) return;
    this.pvtLog.push({ run: n, ...run });
    this.windowLog.push({
      kind: 'pvt',
      ref: n,
      startMs: run.startMs,
      endMs: run.endMs,
      result: null,
    });
    if (n === 1) {
      this.workStartMs = nowMs;
      this.go('work', nowMs);
    } else {
      this.finish('completed', nowMs);
    }
  }

  /** Stop early (participant or researcher), or because the camera stopped. */
  stop(reason: 'stopped' | 'cameraStopped', nowMs: number): void {
    if (this.current === 'finished') return;
    this.finish(reason, nowMs);
  }

  /**
   * Evaluate windows that ended at least WINDOW_SETTLE_MS before the latest frame
   * (or all of them with `force`, at export). `evaluate` is the tracker's.
   */
  resolveWindows(
    latestSampleMs: number,
    evaluate: (windowMs: number, endMs: number) => EciResult,
    force = false,
  ): void {
    for (const w of this.windowLog) {
      if (w.result !== null) continue;
      if (force || latestSampleMs >= w.endMs + WINDOW_SETTLE_MS) {
        w.result = evaluate(w.endMs - w.startMs, w.endMs);
      }
    }
  }

  markExported(): void {
    if (this.current === 'finished') this.exportedFlag = true;
  }

  private showRating(kind: RatingRecord['kind'], index: number, nowMs: number): void {
    const r: RatingRecord = { kind, index, shownMs: nowMs, answeredMs: null, rating: null };
    this.ratingLog.push(r);
    this.open = r;
  }

  private finish(reason: EndReason, nowMs: number): void {
    this.reason = reason;
    this.open = null;
    this.go('finished', nowMs);
  }

  private go(step: StudyStep, nowMs: number): void {
    this.current = step;
    this.stepLog.push({ step, startMs: nowMs });
  }
}
