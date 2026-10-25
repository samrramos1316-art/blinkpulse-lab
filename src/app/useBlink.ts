/**
 * Runs face landmarks on every camera frame and feeds both streams: the blink
 * pipeline (Stream A) and the pulse estimator (Stream B, ROI pixels from the same
 * landmarks). Publishes snapshots to React at <= 4 Hz (CLAUDE.md). The landmarker is
 * loaded the first time the camera starts, so the 17 MB of model + wasm is never
 * fetched for visitors who do not press Start.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Point } from '../blink/ear.ts';
import { lockCameraAuto, type CameraLockResult } from '../capture/cameraLock.ts';
import { median, percentile } from '../dsp/stats.ts';
import type { BlinkEvent } from '../blink/blinkDetector.ts';
import { BIN_MS } from '../blink/sessionSummary.ts';
import { PulseMinutes } from '../history/history.ts';
import { PulseEstimator, type PulseUpdate } from '../rppg/pulseEstimator.ts';
import type { RegionId } from '../rppg/roi.ts';
import { createLandmarker, type Delegate, type Landmarker } from '../vision/faceLandmarker.ts';
import { headPoseFromMatrix } from '../vision/headPose.ts';
import { EYE_A, EYE_B, toPixels } from '../vision/landmarks.ts';
import { BlinkPipeline, type BlinkSnapshot } from './blinkPipeline.ts';
import { PUBLISH_INTERVAL_MS } from './captureController.ts';
import { buildPulseFrame } from './pulseFrame.ts';
import { RoiSampler } from './roiSampler.ts';
import { Recorder, type RecordedTrace } from './traceRecorder.ts';
import type { Capture } from './useCapture.ts';

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Wait for auto-exposure to settle before locking it (starting value). */
const LOCK_DELAY_MS = 3000;
/** What the preview overlay draws for the latest frame (pixel coordinates, unmirrored). */
export interface OverlayFrame {
  width: number;
  height: number;
  eyes: [Point[], Point[]] | null;
  regions: Record<RegionId, Point[] | null> | null;
}

export interface Blink {
  pipeline: BlinkPipeline;
  snapshot: BlinkSnapshot;
  landmarker: { status: LandmarkerStatus; delegate: Delegate | null };
  /** Median landmark inference time over recent frames (ms). */
  inferenceMs: number | null;
  /** Per-frame processing time excluding landmark inference (ms): median and p95. */
  processingMs: { median: number; p95: number } | null;
  pulse: PulseUpdate | null;
  cameraLock: CameraLockResult | null;
  /** Latest overlay geometry (read from animation frames, not render). */
  getOverlay: () => OverlayFrame | null;
  /** Load the landmarker if needed (call from the Start handler). */
  ensureLandmarker: () => void;
  /** Numeric trace recording (after the user confirmed what it contains). */
  recording: boolean;
  startRecording: () => void;
  /** Stop and return the trace (null if nothing was recording). */
  stopRecording: () => RecordedTrace | null;
  /** A trace finished because the camera stopped, waiting to be saved or discarded. */
  pendingTrace: RecordedTrace | null;
  clearPendingTrace: () => void;
  calibrate: () => void;
  cancelCalibration: () => void;
  /** Eye-closure indicator: record / abandon the alert baseline. */
  startBaseline: () => void;
  cancelBaseline: () => void;
  /** Receive every blink event as it is detected (study mode); null to stop. */
  setEventListener: (fn: ((e: BlinkEvent) => void) | null) => void;
  /** Pulse values per session-timeline minute, for history (SPEC_AMENDMENT_04 F3). */
  pulseMinutes: PulseMinutes;
}

const TIMING_WINDOW = 120;

class RingMedian {
  private readonly buf = new Float64Array(TIMING_WINDOW);
  private count = 0;
  record(ms: number): void {
    this.buf[this.count % TIMING_WINDOW] = ms;
    this.count++;
  }
  median(): number | null {
    const n = Math.min(this.count, TIMING_WINDOW);
    return n > 0 ? median(this.buf.subarray(0, n)) : null;
  }
  p95(): number | null {
    const n = Math.min(this.count, TIMING_WINDOW);
    return n > 0 ? percentile(this.buf.subarray(0, n), 95) : null;
  }
  reset(): void {
    this.count = 0;
  }
}

/** Mutable per-session bookkeeping that must not live in React state. */
class Runtime {
  readonly pipeline = new BlinkPipeline(EYE_A, EYE_B);
  readonly pulse = new PulseEstimator();
  readonly sampler = new RoiSampler();
  readonly inference = new RingMedian();
  readonly processing = new RingMedian();
  readonly pulseMinutes = new PulseMinutes();
  landmarker: Landmarker | null = null;
  loading = false;
  overlay: OverlayFrame | null = null;
  recorder: Recorder | null = null;
  eventListener: ((e: BlinkEvent) => void) | null = null;

  setEventListener(fn: ((e: BlinkEvent) => void) | null): void {
    this.eventListener = fn;
  }

  setRecorder(r: Recorder | null): void {
    this.recorder = r;
  }

  setLandmarker(lm: Landmarker | null, loading: boolean): void {
    this.landmarker = lm;
    this.loading = loading;
  }

  setOverlay(o: OverlayFrame | null): void {
    this.overlay = o;
  }

  resetSession(): void {
    this.pipeline.resetSession();
    this.pulse.reset();
    this.inference.reset();
    this.processing.reset();
    this.pulseMinutes.reset();
    this.overlay = null;
  }

  close(): void {
    this.landmarker?.close();
    this.setLandmarker(null, false);
    this.sampler.close();
  }
}

export function useBlink(capture: Capture): Blink {
  const [state] = useState(() => new Runtime());
  const { pipeline } = state;
  const [snapshot, setSnapshot] = useState<BlinkSnapshot>(() => pipeline.snapshot());
  const [lm, setLm] = useState<{ status: LandmarkerStatus; delegate: Delegate | null }>({
    status: 'idle',
    delegate: null,
  });
  const [timing, setTiming] = useState<{
    inference: number | null;
    processing: { median: number; p95: number } | null;
  }>({
    inference: null,
    processing: null,
  });
  const [pulse, setPulse] = useState<PulseUpdate | null>(null);
  const [cameraLock, setCameraLock] = useState<CameraLockResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [pendingTrace, setPendingTrace] = useState<RecordedTrace | null>(null);

  const ensureLandmarker = useCallback(() => {
    if (state.landmarker || state.loading) return;
    state.setLandmarker(null, true);
    setLm({ status: 'loading', delegate: null });
    createLandmarker().then(
      (created) => {
        state.setLandmarker(created, false);
        setLm({ status: 'ready', delegate: created.delegate });
      },
      (err: unknown) => {
        state.setLandmarker(null, false);
        console.error('Face landmarker failed to load', err);
        setLm({ status: 'error', delegate: null });
      },
    );
  }, [state]);

  // Per-frame processing. Runs inside the frame callback; no React state here.
  const { addFrameListener, getVideo } = capture;
  useEffect(
    () =>
      addFrameListener((tick) => {
        const landmarker = state.landmarker;
        const video = getVideo();
        if (!landmarker || !video || video.videoWidth === 0) return;
        const frame = landmarker.detect(video, tick.tMs);
        state.inference.record(frame.inferenceMs);
        const t0 = performance.now();
        const w = video.videoWidth;
        const h = video.videoHeight;
        const points = frame.landmarks ? toPixels(frame.landmarks, w, h) : null;
        const event = pipeline.process(
          tick,
          points
            ? {
                points,
                pose: frame.matrix ? headPoseFromMatrix(frame.matrix) : null,
                frameSize: Math.max(w, h),
              }
            : null,
        );
        if (event) state.eventListener?.(event);
        // Pulse uses the same gating as blinks: face found and head pose in range.
        const faceValid = points !== null && pipeline.lastFrame.status === 'ok';
        const { frame: pulseFrame, polygons } = buildPulseFrame(
          tick,
          points,
          faceValid,
          video,
          state.sampler,
        );
        const update = state.pulse.push(pulseFrame);
        state.recorder?.add(pulseFrame, update);
        const origin = pipeline.sessionStartMs;
        if (update && update.status !== 'warmingUp' && Number.isFinite(origin)) {
          state.pulseMinutes.add(Math.floor((update.tMs - origin) / BIN_MS), update.displayBpm);
        }
        state.setOverlay({
          width: w,
          height: h,
          eyes: points
            ? [EYE_A.map((i) => points[i] as Point), EYE_B.map((i) => points[i] as Point)]
            : null,
          regions: polygons,
        });
        state.processing.record(performance.now() - t0);
      }),
    [addFrameListener, getVideo, pipeline, state],
  );

  // Publish at <= 4 Hz while the camera runs; a fresh session starts clean.
  const running = capture.snapshot.status === 'running';
  useEffect(() => {
    if (!running) return;
    state.resetSession();
    const id = window.setInterval(() => {
      setSnapshot(pipeline.snapshot());
      const med = state.processing.median();
      const p95 = state.processing.p95();
      setTiming({
        inference: state.inference.median(),
        processing: med === null || p95 === null ? null : { median: med, p95 },
      });
      setPulse(state.pulse.latest);
      // The 30-minute limit ends the recording; offer it like a camera stop.
      if (state.recorder?.full) {
        setPendingTrace(state.recorder.finish('limit'));
        state.setRecorder(null);
        setRecording(false);
      }
    }, PUBLISH_INTERVAL_MS);
    // Lock exposure / white balance once auto-exposure has had time to settle.
    const lockId = window.setTimeout(() => {
      const stream = getVideo()?.srcObject;
      const track = stream instanceof MediaStream ? stream.getVideoTracks()[0] : undefined;
      if (track) {
        void lockCameraAuto(track).then(setCameraLock, () => {
          setCameraLock({ exposure: 'failed', whiteBalance: 'failed' });
        });
      }
    }, LOCK_DELAY_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(lockId);
      pipeline.cancelCalibration();
      state.setOverlay(null);
      // Camera stopped while recording: keep the trace for the user to save.
      if (state.recorder) {
        setPendingTrace(state.recorder.finish('cameraStopped'));
        state.setRecorder(null);
        setRecording(false);
      }
      setCameraLock(null);
      // The pulse table and Signal Lab show nothing once the camera stops, like the card.
      setPulse(null);
      setSnapshot(pipeline.snapshot());
    };
  }, [running, pipeline, state, getVideo]);

  // Release the model when the app unmounts.
  useEffect(
    () => () => {
      state.close();
    },
    [state],
  );

  return {
    pipeline,
    snapshot,
    landmarker: lm,
    inferenceMs: timing.inference,
    processingMs: timing.processing,
    pulse,
    cameraLock,
    getOverlay: () => state.overlay,
    ensureLandmarker,
    recording,
    startRecording: () => {
      state.setRecorder(new Recorder());
      setRecording(true);
      setPendingTrace(null);
    },
    pendingTrace,
    clearPendingTrace: () => {
      setPendingTrace(null);
    },
    stopRecording: () => {
      const r = state.recorder;
      state.setRecorder(null);
      setRecording(false);
      return r ? r.finish('stopped') : null;
    },
    calibrate: () => {
      pipeline.startCalibration();
      setSnapshot(pipeline.snapshot());
    },
    cancelCalibration: () => {
      pipeline.cancelCalibration();
      setSnapshot(pipeline.snapshot());
    },
    startBaseline: () => {
      pipeline.startBaseline();
      setSnapshot(pipeline.snapshot());
    },
    cancelBaseline: () => {
      pipeline.cancelBaseline();
      setSnapshot(pipeline.snapshot());
    },
    setEventListener: (fn) => {
      state.setEventListener(fn);
    },
    pulseMinutes: state.pulseMinutes,
  };
}
