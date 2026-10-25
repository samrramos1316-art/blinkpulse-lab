/**
 * Eye-comfort reminder state (PROJECT_SPEC 5.6, SPEC_AMENDMENT_04 E1): settings,
 * the user's own baseline, and the banner. Checked whenever the session timeline
 * is published (<= 4 Hz). The cooldown uses wall-clock time, so it spans Stop/Start.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  checkReminder,
  sessionBaseline,
  type BlinkBaseline,
  type ReminderSettings,
} from '../blink/comfortReminder.ts';
import type { MinuteBin } from '../blink/sessionSummary.ts';
import { REMINDER_COPY } from '../ui/copy.ts';
import { showNotification } from '../ui/notify.ts';
import { readReminderSettings, writeReminderSettings } from '../ui/reminderSettings.ts';

export interface ComfortReminder {
  settings: ReminderSettings;
  setSettings: (s: ReminderSettings) => void;
  /** The baseline in use: from saved history when available, else this session's. */
  baseline: BlinkBaseline | null;
  /** The banner is showing. */
  bannerOpen: boolean;
  dismiss: () => void;
}

export function useComfortReminder(
  bins: readonly MinuteBin[],
  historyBaseline: BlinkBaseline | null,
): ComfortReminder {
  const [settings, setSettingsState] = useState(readReminderSettings);
  const [bannerOpen, setBannerOpen] = useState(false);
  const lastShown = useRef<number | null>(null);
  const baseline = useMemo(() => historyBaseline ?? sessionBaseline(bins), [bins, historyBaseline]);

  useEffect(() => {
    const now = Date.now();
    if (!checkReminder(bins, baseline, settings, lastShown.current, now).due) return;
    lastShown.current = now;
    setBannerOpen(true);
    if (settings.notify) showNotification(REMINDER_COPY.notificationTitle, REMINDER_COPY.banner);
  }, [bins, baseline, settings]);

  return {
    settings,
    setSettings: (s) => {
      setSettingsState(s);
      writeReminderSettings(s);
      if (!s.enabled) setBannerOpen(false);
    },
    baseline,
    bannerOpen: bannerOpen && settings.enabled,
    dismiss: () => {
      setBannerOpen(false);
    },
  };
}
