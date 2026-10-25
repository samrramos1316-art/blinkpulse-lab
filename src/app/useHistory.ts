/**
 * Long-term history (SPEC_AMENDMENT_04 F2-F3): opt-in, on this device only. Saves
 * each finished minute of the session timeline while history is on, deletes rows
 * older than 90 days, and loads rows for the history view and the reminder baseline.
 *
 * Rows are saved when the timeline is published (<= 4 Hz), so a minute is stored
 * within a fraction of a second after it ends; closing the tab can lose at most
 * the minute in progress. Study mode does not use this hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlinkBaseline } from '../blink/comfortReminder.ts';
import {
  HistoryRecorder,
  historyBaseline,
  historyToCsv,
  retentionCutoff,
  type HistoryRow,
} from '../history/history.ts';
import { downloadText } from '../ui/download.ts';
import { useNow } from '../ui/useNow.ts';
import { openHistoryStore } from './historyStore.ts';
import type { Blink } from './useBlink.ts';
import type { Capture } from './useCapture.ts';

const FLAG_KEY = 'blinkpulse.history';
const HOUR_MS = 3_600_000;

function readFlag(): boolean {
  try {
    return globalThis.localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFlag(on: boolean): void {
  try {
    if (on) globalThis.localStorage.setItem(FLAG_KEY, '1');
    else globalThis.localStorage.removeItem(FLAG_KEY);
  } catch {
    // Blocked storage: history stays on only until the page closes.
  }
}

function newSessionId(): string {
  // crypto.randomUUID needs a secure context, which the camera needs anyway.
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export interface History {
  /** This browser can store history (IndexedDB available). */
  available: boolean;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** Stored rows, oldest first; null until loaded. */
  rows: HistoryRow[] | null;
  /** Load the stored rows (the history view calls this when it opens). */
  load: () => void;
  error: string | null;
  /** The usual blink rate from stored minutes (reminder), or null. */
  baseline: BlinkBaseline | null;
  deleteAll: () => Promise<void>;
  exportCsv: () => void;
}

export function useHistory(blink: Blink, capture: Capture): History {
  const [store] = useState(openHistoryStore);
  const [enabled, setEnabledState] = useState(readFlag);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<HistoryRecorder | null>(null);
  const sessionId = useRef<string | null>(null);
  const live = capture.snapshot.status === 'running';
  const { pipeline, pulseMinutes } = blink;

  const fail = useCallback((err: unknown) => {
    console.error('History storage failed', err);
    setError('The history could not be read or saved in this browser.');
  }, []);

  const load = useCallback(() => {
    if (!store) return;
    store
      .deleteBefore(retentionCutoff(Date.now()))
      .then(() => store.all())
      .then(setRows, fail);
  }, [store, fail]);

  const save = useCallback(
    (list: HistoryRow[]) => {
      if (!store || list.length === 0) return;
      store.put(list).then(() => {
        setRows((prev) => (prev ? [...prev, ...list] : prev));
      }, fail);
    },
    [store, fail],
  );

  // Load at start-up when history is on (reminder baseline), and delete expired rows hourly.
  useEffect(() => {
    if (!enabled) return;
    load();
    const id = window.setInterval(load, HOUR_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [enabled, load]);

  const timing = useCallback(
    () => ({
      originMs: pipeline.sessionStartMs,
      wallOriginMs: performance.timeOrigin + pipeline.sessionStartMs + capture.perfOffsetMs(),
    }),
    [pipeline, capture],
  );

  // A new camera session gets a new id; minutes are saved as they end.
  useEffect(() => {
    if (live) sessionId.current = newSessionId();
  }, [live]);

  const { snapshot } = blink;
  useEffect(() => {
    if (!live || !enabled || !Number.isFinite(pipeline.sessionStartMs)) return;
    const bins = snapshot.session;
    recorder.current ??= new HistoryRecorder(
      sessionId.current ?? newSessionId(),
      Math.max(0, bins.length - 1),
    );
    save(recorder.current.collect(bins, timing(), snapshot.indicator.trend, pulseMinutes));
  }, [snapshot, live, enabled, pipeline, pulseMinutes, timing, save]);

  // Stop: save the minute in progress. History turned off: save nothing more.
  useEffect(() => {
    if (live) {
      if (!enabled) recorder.current = null;
      return;
    }
    const r = recorder.current;
    recorder.current = null;
    if (!r || !enabled || !Number.isFinite(pipeline.sessionStartMs)) return;
    const snap = pipeline.snapshot();
    save(r.collect(snap.session, timing(), snap.indicator.trend, pulseMinutes, true));
  }, [live, enabled, pipeline, pulseMinutes, timing, save]);

  const now = useNow();
  const baseline = useMemo(
    () => (enabled && rows ? historyBaseline(rows, now) : null),
    [enabled, rows, now],
  );

  return {
    available: store !== null,
    enabled,
    setEnabled: (on) => {
      writeFlag(on);
      setEnabledState(on);
      setError(null);
    },
    rows,
    load,
    error,
    baseline,
    deleteAll: async () => {
      if (!store) return;
      try {
        await store.clear();
        setRows([]);
      } catch (err) {
        fail(err);
      }
    },
    exportCsv: () => {
      if (!rows) return;
      const d = new Date();
      const stamp = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      downloadText(`blinkpulse-history-${stamp}.csv`, historyToCsv(rows));
    },
  };
}
