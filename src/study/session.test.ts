import { describe, expect, it } from 'vitest';
import type { BaselineState, BaselineValues, EciResult } from '../blink/sleepiness.ts';
import {
  RATING_EVERY_MS,
  RATING_TIMEOUT_MS,
  RATING_WINDOW_MS,
  StudySession,
  WINDOW_SETTLE_MS,
  WORK_MS,
  timeSlotOf,
  validParticipantId,
} from './session.ts';

const thresholds = { baseline: 0.3, closeEar: 0.2, reopenEar: 0.22 };
const values: BaselineValues = {
  closedFraction: 0.04,
  longPerMin: 0,
  meanBlinkMs: 150,
  blinksPerMin: 15,
  validMs: 180_000,
  blinkCount: 45,
};
const running: BaselineState = { phase: 'running', startedMs: 0, validMs: 0, progress: 0 };
const done: BaselineState = { phase: 'done', values };
const event = (startMs: number) => ({
  startMs,
  endMs: startMs + 150,
  durationMs: 150,
  kind: 'blink' as const,
  lowConfidence: false,
  samplesBelow: 4,
  minEar: 0.05,
});

function newSession() {
  return new StudySession(
    { participantId: 'P01', sessionNumber: 1, glasses: 'none' },
    1000,
    new Date(2026, 9, 19, 8, 30),
  );
}

/** Calibration, baseline rating 3, baseline done at 200 s, PVT 1 from 210 s to 390 s. */
function toWork() {
  const s = newSession();
  s.calibrationDone(thresholds, 20_000);
  s.answerRating(3, 25_000);
  s.tick(100_000, running);
  s.tick(200_000, done);
  s.pvtDone({ startMs: 210_000, endMs: 390_000, trials: [] }, 391_000);
  return s;
}

describe('StudySession', () => {
  it('runs the protocol steps in order', () => {
    const s = newSession();
    expect(s.step).toBe('calibration');
    s.addEvent(event(5000)); // during calibration: not kept
    s.calibrationDone(thresholds, 20_000);
    expect(s.step).toBe('baselineRating');
    expect(s.openRating).toMatchObject({ kind: 'baseline', index: 0, shownMs: 20_000 });
    s.answerRating(3, 25_000);
    expect(s.step).toBe('baseline');
    s.addEvent(event(30_000));
    s.tick(100_000, running);
    expect(s.step).toBe('baseline');
    s.tick(200_000, done);
    expect(s.step).toBe('pvt1');
    expect(s.baseline).toEqual(values);
    s.pvtDone({ startMs: 210_000, endMs: 390_000, trials: [] }, 391_000);
    expect(s.step).toBe('work');
    expect(s.workStart).toBe(391_000);
    expect(s.steps.map((x) => x.step)).toEqual([
      'calibration',
      'baselineRating',
      'baseline',
      'pvt1',
      'work',
    ]);
    expect(s.events.map((e) => e.startMs)).toEqual([30_000]);
    expect(s.calibration).toEqual(thresholds);
  });

  it('prompts a rating every 5 minutes of work, 5 in all, then the second PVT-B', () => {
    const s = toWork();
    const w = s.workStart;
    s.tick(w + RATING_EVERY_MS - 1, done);
    expect(s.openRating).toBeNull();
    for (let k = 1; k <= 5; k++) {
      s.tick(w + k * RATING_EVERY_MS, done);
      expect(s.openRating).toMatchObject({
        kind: 'work',
        index: k,
        shownMs: w + k * RATING_EVERY_MS,
      });
      s.answerRating(k + 2, w + k * RATING_EVERY_MS + 3000);
    }
    s.tick(w + WORK_MS + 3001, done);
    expect(s.step).toBe('pvt2');
    expect(s.ratings.map((r) => r.rating)).toEqual([3, 3, 4, 5, 6, 7]);
  });

  it('an unanswered prompt closes after 60 s and is recorded as missing', () => {
    const s = toWork();
    const shown = s.workStart + RATING_EVERY_MS;
    s.tick(shown, done);
    s.tick(shown + RATING_TIMEOUT_MS - 1, done);
    expect(s.openRating).not.toBeNull();
    s.tick(shown + RATING_TIMEOUT_MS, done);
    expect(s.openRating).toBeNull();
    s.answerRating(5, shown + RATING_TIMEOUT_MS + 10); // too late: ignored
    expect(s.ratings[1]).toMatchObject({ index: 1, rating: null, answeredMs: null });
  });

  it('the second PVT-B waits for the last prompt to be answered or to time out', () => {
    const s = toWork();
    const w = s.workStart;
    for (let k = 1; k <= 5; k++) s.tick(w + k * RATING_EVERY_MS, done);
    // Prompts 1-4 timed out (each tick found the previous one older than 60 s).
    expect(s.step).toBe('work');
    expect(s.openRating?.index).toBe(5);
    s.tick(w + WORK_MS + RATING_TIMEOUT_MS, done);
    expect(s.step).toBe('pvt2');
    s.pvtDone(
      { startMs: w + WORK_MS + 70_000, endMs: w + WORK_MS + 250_000, trials: [] },
      w + WORK_MS + 251_000,
    );
    expect(s.step).toBe('finished');
    expect(s.endReason).toBe('completed');
    expect(s.pvtRuns.map((r) => r.run)).toEqual([1, 2]);
  });

  it('records the 5 minutes before each prompt is shown and each PVT-B run as analysis windows', () => {
    const s = toWork();
    const shown = s.workStart + RATING_EVERY_MS;
    s.tick(shown, done);
    expect(s.windows).toEqual([
      { kind: 'pvt', ref: 1, startMs: 210_000, endMs: 390_000, result: null },
      { kind: 'rating', ref: 1, startMs: shown - RATING_WINDOW_MS, endMs: shown, result: null },
    ]);
  });

  it('evaluates a window only once it has settled, with its own length and end', () => {
    const s = toWork();
    const calls: [number, number][] = [];
    const evaluate = (windowMs: number, endMs: number): EciResult => {
      calls.push([windowMs, endMs]);
      return {
        ok: false,
        tMs: endMs,
        reason: 'tooFewBlinks',
        coverage: 1,
        lost: { noFace: 0, headTurned: 0, gap: 0 },
        medianFps: 30,
      };
    };
    s.resolveWindows(390_000 + WINDOW_SETTLE_MS - 1, evaluate);
    expect(calls).toEqual([]);
    s.resolveWindows(390_000 + WINDOW_SETTLE_MS, evaluate);
    expect(calls).toEqual([[180_000, 390_000]]);
    s.resolveWindows(500_000, evaluate);
    expect(calls).toHaveLength(1);
    expect(s.windows[0]?.result).toMatchObject({ reason: 'tooFewBlinks' });
  });

  it('a failed alert baseline ends the session with the reason', () => {
    const s = newSession();
    s.calibrationDone(thresholds, 20_000);
    s.answerRating(4, 25_000);
    s.tick(400_000, { phase: 'failed', reason: 'notEnoughValid' });
    expect(s.step).toBe('finished');
    expect(s.endReason).toBe('baselineNotEnoughValid');
  });

  it('can be stopped at any time; events after the stop are not kept', () => {
    const s = toWork();
    s.tick(s.workStart + RATING_EVERY_MS, done);
    s.stop('stopped', s.workStart + RATING_EVERY_MS + 10);
    expect(s.step).toBe('finished');
    expect(s.endReason).toBe('stopped');
    expect(s.openRating).toBeNull();
    s.addEvent(event(5_000_000));
    expect(s.events).toHaveLength(0);
    s.stop('cameraStopped', 6_000_000);
    expect(s.endReason).toBe('stopped');
  });

  it('only a finished session can be marked exported', () => {
    const s = toWork();
    s.markExported();
    expect(s.exported).toBe(false);
    s.stop('stopped', 1_000_000);
    s.markExported();
    expect(s.exported).toBe(true);
  });

  it('ignores ratings outside 1-9', () => {
    const s = newSession();
    s.calibrationDone(thresholds, 20_000);
    s.answerRating(0, 21_000);
    s.answerRating(10, 21_000);
    s.answerRating(2.5, 21_000);
    expect(s.step).toBe('baselineRating');
  });
});

describe('session info', () => {
  it('participant IDs are codes, not names', () => {
    expect(validParticipantId('P03')).toBe(true);
    expect(validParticipantId('P123')).toBe(true);
    expect(validParticipantId('Sam')).toBe(false);
    expect(validParticipantId('P3')).toBe(false);
    expect(validParticipantId('p03')).toBe(false);
  });

  it('time-of-day slots follow the protocol', () => {
    const at = (h: number, m: number) => timeSlotOf(new Date(2026, 9, 19, h, m));
    expect(at(9, 59)).toBe('morning');
    expect(at(10, 0)).toBe('other');
    expect(at(19, 0)).toBe('evening');
    expect(at(21, 30)).toBe('evening');
    expect(at(21, 31)).toBe('other');
  });
});
