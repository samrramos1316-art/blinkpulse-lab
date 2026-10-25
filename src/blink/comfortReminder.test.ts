import { describe, expect, it } from 'vitest';
import {
  checkReminder,
  DEFAULT_REMINDER,
  sanitizeSettings,
  sessionBaseline,
  type ReminderSettings,
} from './comfortReminder.ts';
import { BIN_MS, type MinuteBin } from './sessionSummary.ts';

/** A complete minute with `blinks` blinks over `validS` seconds of valid time. */
function bin(index: number, blinks: number | null, validS = 60, lowFps = false): MinuteBin {
  const count = validS >= 42 ? blinks : null;
  const usable = count !== null;
  return {
    index,
    startMs: index * BIN_MS,
    endMs: (index + 1) * BIN_MS,
    elapsedMs: BIN_MS,
    validMs: validS * 1000,
    coverage: validS / 60,
    usable,
    lostMs: { noFace: (60 - validS) * 1000, headTurned: 0, gap: 0, calibrating: 0 },
    mainReason: null,
    medianFrameMs: lowFps ? 50 : 33.3,
    lowFps,
    blinkCount: count,
    ratePerMin: count === null ? null : (count * 60) / validS,
    medianDurationMs: null,
    meanDurationMs: null,
    longClosures: usable ? 0 : null,
    extendedClosures: usable ? 0 : null,
    closedFraction: usable ? 0.02 : null,
  };
}

/** Bins from per-minute blink counts, plus an incomplete current minute at the end. */
const session = (counts: (number | null)[]) => [
  ...counts.map((c, i) => bin(i, c)),
  bin(counts.length, 1, 10),
];

const on: ReminderSettings = { ...DEFAULT_REMINDER, enabled: true };

describe('eye-comfort reminder (PROJECT_SPEC 5.6)', () => {
  it('is off by default', () => {
    const bins = session([15, 15, 15, 4, 4, 4, 4, 4]);
    const base = sessionBaseline(bins);
    expect(checkReminder(bins, base, DEFAULT_REMINDER, null, 0).due).toBe(false);
  });

  it('baseline: the first 3 good complete minutes, pooled', () => {
    expect(sessionBaseline(session([12, null, 15, 18, 3]))).toEqual({
      ratePerMin: 15,
      source: 'session',
      minutes: 3,
      lastIndex: 3,
    });
    // The current minute never counts.
    expect(sessionBaseline(session([12, 15]))).toBeNull();
  });

  it('due after 5 good minutes below half the baseline, not before', () => {
    const base = sessionBaseline(session([15, 15, 15]));
    expect(checkReminder(session([15, 15, 15, 7, 7, 7, 7]), base, on, null, 0)).toEqual({
      due: false,
      recentRate: null,
    });
    const r = checkReminder(session([15, 15, 15, 7, 7, 7, 7, 7]), base, on, null, 0);
    expect(r.due).toBe(true);
    expect(r.recentRate).toBe(7);
    // Exactly half is not below half.
    const half = checkReminder(session([16, 16, 16, 8, 8, 8, 8, 8]), base, on, null, 0);
    expect(half.recentRate).toBe(8);
    expect(half.due).toBe(false);
  });

  it('the period is pooled: one low minute among normal ones is not enough', () => {
    const base = sessionBaseline(session([15, 15, 15]));
    expect(checkReminder(session([15, 15, 15, 14, 2, 14, 14, 14]), base, on, null, 0).due).toBe(
      false,
    );
  });

  it('any minute with poor detection (not usable, or low FPS) in the period blocks it', () => {
    const bins = session([15, 15, 15, 5, 5, null, 5, 5]);
    const base = sessionBaseline(bins);
    expect(checkReminder(bins, base, on, null, 0).due).toBe(false);
    const slow = session([15, 15, 15, 5, 5, 5, 5, 5]);
    slow[6] = bin(6, 5, 60, true);
    expect(checkReminder(slow, sessionBaseline(slow), on, null, 0).due).toBe(false);
  });

  it('never checks the baseline minutes themselves', () => {
    // A low first-3 baseline cannot trigger on itself (period would overlap it).
    const bins = session([15, 15, 15, 1, 1]);
    const base = sessionBaseline(bins);
    expect(checkReminder(bins, base, { ...on, minutes: 3 }, null, 0).due).toBe(false);
  });

  it('cooldown: at least 20 minutes between reminders, even if set lower', () => {
    const bins = session([15, 15, 15, 5, 5, 5, 5, 5]);
    const base = sessionBaseline(bins);
    const min = 60_000;
    expect(checkReminder(bins, base, on, 0, 19 * min).due).toBe(false);
    expect(checkReminder(bins, base, on, 0, 20 * min).due).toBe(true);
    expect(checkReminder(bins, base, { ...on, cooldownMin: 5 }, 0, 19 * min).due).toBe(false);
    expect(checkReminder(bins, base, { ...on, cooldownMin: 60 }, 0, 59 * min).due).toBe(false);
  });

  it('works with a stored (history) baseline', () => {
    const bins = session([6, 6, 6]);
    const hist = { ratePerMin: 16, source: 'history' as const, minutes: 400 };
    expect(checkReminder(bins, hist, { ...on, minutes: 3 }, null, 0).due).toBe(true);
    expect(checkReminder(bins, null, { ...on, minutes: 3 }, null, 0).due).toBe(false);
  });

  it('settings from storage: invalid values fall back to the defaults', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_REMINDER);
    expect(
      sanitizeSettings({ enabled: 'yes', fraction: 0.01, minutes: 5, cooldownMin: 1 }),
    ).toEqual(DEFAULT_REMINDER);
    expect(
      sanitizeSettings({
        enabled: true,
        fraction: 0.7,
        minutes: 10,
        cooldownMin: 60,
        notify: true,
      }),
    ).toEqual({ enabled: true, fraction: 0.7, minutes: 10, cooldownMin: 60, notify: true });
  });
});
