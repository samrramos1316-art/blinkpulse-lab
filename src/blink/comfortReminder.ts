/**
 * Optional eye-comfort reminder (PROJECT_SPEC 5.6, Phase 6). Pure. Off by default.
 *
 * Due when, over the last `minutes` COMPLETE minutes of the session timeline, the
 * blink rate (blinks / valid minutes, pooled over those minutes) is below
 * `fraction` x the user's own baseline rate, AND blink-detection quality was good
 * for that whole period: every one of those minutes is usable (>= 70% valid time,
 * sessionSummary.ts) and not low-FPS. At most once per cooldown (>= 20 min).
 *
 * The baseline is the user's own: the pooled rate of their first BASELINE_MINUTES
 * usable minutes after calibration in this session, or, with long-term history on,
 * their stored usual rate (history/baseline.ts). Those baseline minutes are never
 * part of the checked period.
 *
 * Informational only: no health state, no sound, nothing stored.
 */

import type { MinuteBin } from './sessionSummary.ts';

export interface ReminderSettings {
  enabled: boolean;
  /** Due below this fraction of the baseline rate. */
  fraction: number;
  /** Length of the checked period (complete minutes). */
  minutes: number;
  /** Minimum time between reminders (minutes), never below MIN_COOLDOWN_MIN. */
  cooldownMin: number;
  /** Also show a silent system notification (needs the browser's permission). */
  notify: boolean;
}

/** PROJECT_SPEC 5.6: cooldown >= 20 minutes. */
export const MIN_COOLDOWN_MIN = 20;
/** Choices offered in the settings (user-set; the defaults are the middle options). */
export const FRACTION_CHOICES = [0.3, 0.5, 0.7] as const;
export const MINUTE_CHOICES = [3, 5, 10] as const;
export const COOLDOWN_CHOICES = [20, 30, 60] as const;

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  fraction: 0.5,
  minutes: 5,
  cooldownMin: 20,
  notify: false,
};

/** Usable minutes that form a session baseline. */
export const BASELINE_MINUTES = 3;

export interface BlinkBaseline {
  ratePerMin: number;
  source: 'session' | 'history';
  /** Usable minutes behind the value. */
  minutes: number;
  /** Session baseline only: index of its last minute (checks start after it). */
  lastIndex?: number;
}

/** Minutes that have ended: every bin but the current (last) one. */
function complete(bins: readonly MinuteBin[]): readonly MinuteBin[] {
  return bins.slice(0, -1);
}

const good = (b: MinuteBin) => b.usable && !b.lowFps && b.blinkCount !== null;

function pooledRate(bins: readonly MinuteBin[]): number {
  let blinks = 0;
  let validMs = 0;
  for (const b of bins) {
    blinks += b.blinkCount ?? 0;
    validMs += b.validMs;
  }
  return validMs > 0 ? (blinks * 60_000) / validMs : NaN;
}

/** The first BASELINE_MINUTES good complete minutes of the session, or null. */
export function sessionBaseline(bins: readonly MinuteBin[]): BlinkBaseline | null {
  const first = complete(bins).filter(good).slice(0, BASELINE_MINUTES);
  if (first.length < BASELINE_MINUTES) return null;
  const rate = pooledRate(first);
  if (!(rate > 0)) return null;
  return {
    ratePerMin: rate,
    source: 'session',
    minutes: first.length,
    lastIndex: (first.at(-1) as MinuteBin).index,
  };
}

export interface ReminderCheck {
  due: boolean;
  /** Pooled rate over the checked period, or null when the period is not all good. */
  recentRate: number | null;
}

/**
 * `lastShownMs` and `nowMs` are wall-clock times (the cooldown spans camera
 * sessions); null when no reminder was shown yet.
 */
export function checkReminder(
  bins: readonly MinuteBin[],
  baseline: BlinkBaseline | null,
  settings: ReminderSettings,
  lastShownMs: number | null,
  nowMs: number,
): ReminderCheck {
  const none = { due: false, recentRate: null };
  if (!settings.enabled || !baseline || !(baseline.ratePerMin > 0)) return none;
  const n = Math.max(1, Math.round(settings.minutes));
  const done = complete(bins);
  const recent = done.slice(-n);
  if (recent.length < n || !recent.every(good)) return none;
  // Contiguous minutes only, and none of them part of a session baseline.
  if ((recent.at(-1) as MinuteBin).index - (recent[0] as MinuteBin).index !== n - 1) return none;
  if (baseline.lastIndex !== undefined && (recent[0] as MinuteBin).index <= baseline.lastIndex)
    return none;
  const rate = pooledRate(recent);
  const cooldownMs = Math.max(MIN_COOLDOWN_MIN, settings.cooldownMin) * 60_000;
  const cooled = lastShownMs === null || nowMs - lastShownMs >= cooldownMs;
  return { due: cooled && rate < settings.fraction * baseline.ratePerMin, recentRate: rate };
}

/** Settings read back from storage: anything missing or invalid becomes the default. */
export function sanitizeSettings(raw: unknown): ReminderSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = <T extends number>(v: unknown, choices: readonly T[], d: T): T =>
    choices.includes(v as T) ? (v as T) : d;
  return {
    enabled: o.enabled === true,
    fraction: pick(o.fraction, FRACTION_CHOICES, 0.5),
    minutes: pick(o.minutes, MINUTE_CHOICES, 5),
    cooldownMin: pick(o.cooldownMin, COOLDOWN_CHOICES, 20),
    notify: o.notify === true,
  };
}
