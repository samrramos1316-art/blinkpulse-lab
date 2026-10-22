/**
 * Study mode (PROJECT_SPEC 5.8): drives a StudySession from the camera and blink
 * pipeline. The session's times are performance.now() milliseconds (also the clock of
 * the PVT-B's frame and input timestamps). The blink pipeline uses frame time, which
 * starts at 0 with each camera session, so blink events, window ends, and trend points
 * are shifted by the capture's offset between the two clocks.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PvtTrial } from '../study/pvt.ts';
import { StudySession, type SessionInfo, type StudyStep } from '../study/session.ts';
import { buildStudyCsv, studyCsvFileName } from '../study/studyCsv.ts';
import type { CameraSettings } from '../capture/camera.ts';
import type { TimestampSource } from '../capture/timestampSource.ts';
import type { Capture } from './useCapture.ts';
import type { Blink } from './useBlink.ts';

const TICK_MS = 250;

/**
 * Camera details for the export header and the clock offset (kept after the camera
 * stops), and whether it runs.
 */
class LastCamera {
  settings: CameraSettings | null = null;
  source: TimestampSource | null = null;
  running = false;
  /** performance.now() minus frame time (see Capture.perfOffsetMs). */
  offsetMs = NaN;
  update(settings: CameraSettings | null, source: TimestampSource | null, running: boolean): void {
    if (settings) this.settings = settings;
    if (source) this.source = source;
    this.running = running;
  }
  updateOffset(offsetMs: number): void {
    if (Number.isFinite(offsetMs)) this.offsetMs = offsetMs;
  }
}

export interface Study {
  session: StudySession | null;
  /** 'setup' before a session starts. */
  step: StudyStep;
  begin: (info: SessionInfo) => void;
  /** Keep the current blink calibration and move on to the first rating. */
  continueAfterCalibration: () => void;
  answerRating: (rating: number) => void;
  pvtDone: (run: { startMs: number; endMs: number; trials: readonly PvtTrial[] }) => void;
  stop: () => void;
  /** The session as CSV (numbers only); marks it exported. */
  exportCsv: () => { name: string; text: string } | null;
}

/** Steps where losing the camera ends the session (calibration may restart it). */
const NEEDS_CAMERA: readonly StudyStep[] = ['baselineRating', 'baseline', 'pvt1', 'work', 'pvt2'];

export function useStudy(capture: Capture, blink: Blink): Study {
  const [session, setSession] = useState<StudySession | null>(null);
  // The session mutates in place; this counter re-renders after each change.
  const [, setVersion] = useState(0);
  const changed = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  const { pipeline, setEventListener, startBaseline } = blink;
  const { perfOffsetMs } = capture;
  const [camera] = useState(() => new LastCamera());
  const { settings: liveSettings, timestampSource: liveSource } = capture.snapshot;
  const running = capture.snapshot.status === 'running';
  useEffect(() => {
    camera.update(liveSettings, liveSource, running);
  }, [camera, liveSettings, liveSource, running]);

  // Blink events go straight into the session (it keeps them only while it runs).
  useEffect(() => {
    if (!session) return;
    setEventListener((e) => {
      camera.updateOffset(perfOffsetMs());
      const off = camera.offsetMs;
      session.addEvent({ ...e, startMs: e.startMs + off, endMs: e.endMs + off });
    });
    return () => {
      setEventListener(null);
    };
  }, [session, setEventListener, perfOffsetMs, camera]);

  const step = session?.step ?? 'setup';
  const active = session !== null && step !== 'finished';

  // Timers: baseline progress, rating prompts and time-outs, analysis windows. The
  // camera stopping mid-session ends it (the measurements would have a hole).
  useEffect(() => {
    if (!session || !active) return;
    const id = window.setInterval(() => {
      const before = `${session.step}|${String(session.ratings.length)}|${String(session.openRating === null)}`;
      if (!camera.running && NEEDS_CAMERA.includes(session.step)) {
        session.stop('cameraStopped', performance.now());
      }
      session.tick(performance.now(), pipeline.eyeClosureBaseline);
      camera.updateOffset(perfOffsetMs());
      const off = camera.offsetMs;
      session.resolveWindows(pipeline.latestEyeClosureMs + off, (w, end) =>
        pipeline.evaluateEyeClosure(w, end - off),
      );
      const after = `${session.step}|${String(session.ratings.length)}|${String(session.openRating === null)}`;
      if (after !== before) changed();
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [session, active, pipeline, changed, camera, perfOffsetMs]);

  return {
    session,
    step,
    begin: (info) => {
      setSession(new StudySession(info, performance.now(), new Date()));
    },
    continueAfterCalibration: () => {
      const t = blink.snapshot.thresholds;
      if (!session || !t) return;
      session.calibrationDone(t, performance.now());
      changed();
    },
    answerRating: (rating) => {
      if (!session) return;
      const wasBaselineRating = session.step === 'baselineRating';
      if (session.answerRating(rating, performance.now()) && wasBaselineRating) startBaseline();
      changed();
    },
    pvtDone: (run) => {
      if (!session) return;
      session.pvtDone(run, performance.now());
      changed();
    },
    stop: () => {
      if (!session) return;
      session.stop('stopped', performance.now());
      changed();
    },
    exportCsv: () => {
      if (!session || session.step !== 'finished') return null;
      // Windows still unsettled (the last PVT-B just ended) are evaluated as they are.
      const off = camera.offsetMs;
      session.resolveWindows(
        pipeline.latestEyeClosureMs + off,
        (w, end) => pipeline.evaluateEyeClosure(w, end - off),
        true,
      );
      const settings = camera.settings;
      const text = buildStudyCsv({
        session,
        appCommit: __APP_COMMIT__,
        timestampSource: camera.source,
        camera:
          settings?.width && settings.height && settings.frameRate
            ? { width: settings.width, height: settings.height, frameRate: settings.frameRate }
            : null,
        trend: pipeline.snapshot().indicator.trend.map((p) => ({ ...p, tMs: p.tMs + off })),
        ratingWording: 'placeholder',
      });
      session.markExported();
      changed();
      return { name: studyCsvFileName(session), text };
    },
  };
}
