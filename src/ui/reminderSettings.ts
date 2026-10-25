/**
 * Eye-comfort reminder settings in localStorage (SPEC_AMENDMENT_04 E1: settings
 * only, never measurements). Storage failures are ignored: the defaults apply.
 */

import {
  DEFAULT_REMINDER,
  sanitizeSettings,
  type ReminderSettings,
} from '../blink/comfortReminder.ts';

const STORAGE_KEY = 'blinkpulse.reminder';

export function readReminderSettings(): ReminderSettings {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : DEFAULT_REMINDER;
  } catch {
    return DEFAULT_REMINDER;
  }
}

export function writeReminderSettings(s: ReminderSettings): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: the settings last until the page closes.
  }
}
