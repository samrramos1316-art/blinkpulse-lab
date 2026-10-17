/**
 * Runs face landmarks + the blink pipeline on every camera frame and publishes a
 * snapshot to React at <= 4 Hz (CLAUDE.md). The landmarker is loaded the first
 * time the camera starts, so the 17 MB of model + wasm is never fetched for
 * visitors who do not press Start.
 */

import { useCallback, useEffect, useState } from 'react';
import { median } from '../dsp/stats.ts';
import { createLandmarker, type Delegate, type Landmarker } from '../vision/faceLandmarker.ts';
import { headPoseFromMatrix } from '../vision/headPose.ts';
import { EYE_A, EYE_B, toPixels } from '../vision/landmarks.ts';
import { BlinkPipeline, type BlinkSnapshot } from './blinkPipeline.ts';
import { PUBLISH_INTERVAL_MS } from './captureController.ts';
import type { Capture } from './useCapture.ts';

export type LandmarkerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Blink {
  pipeline: BlinkPipeline;
  snapshot: BlinkSnapshot;
  landmarker: { status: LandmarkerStatus; delegate: Delegate | null };
  /** Median landmark inference time over recent frames (ms). */
  inferenceMs: number | null;
  /** Load the landmarker if needed (call from the Start handler). */
  ensureLandmarker: () => void;
  calibrate: () => void;
  cancelCalibration: () => void;
}

const INFERENCE_WINDOW = 120;

/** Mutable per-session bookkeeping that must not live in React state. */
class Runtime {
  readonly pipeline = new BlinkPipeline(EYE_A, EYE_B);
  landmarker: Landmarker | null = null;
  loading = false;
  private readonly inference = new Float64Array(INFERENCE_WINDOW);
  private inferenceCount = 0;

  recordInference(ms: number): void {
    this.inference[this.inferenceCount % INFERENCE_WINDOW] = ms;
    this.inferenceCount++;
  }

  medianInference(): number | null {
    const n = Math.min(this.inferenceCount, INFERENCE_WINDOW);
    return n > 0 ? median(this.inference.subarray(0, n)) : null;
  }

  resetInference(): void {
    this.inferenceCount = 0;
  }

  setLandmarker(lm: Landmarker | null, loading: boolean): void {
    this.landmarker = lm;
    this.loading = loading;
  }

  close(): void {
    this.landmarker?.close();
    this.setLandmarker(null, false);
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
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);

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
        state.recordInference(frame.inferenceMs);
        const w = video.videoWidth;
        const h = video.videoHeight;
        pipeline.process(
          tick,
          frame.landmarks
            ? {
                points: toPixels(frame.landmarks, w, h),
                pose: frame.matrix ? headPoseFromMatrix(frame.matrix) : null,
                frameWidth: w,
              }
            : null,
        );
      }),
    [addFrameListener, getVideo, pipeline, state],
  );

  // Publish at <= 4 Hz while the camera runs; a fresh session starts clean.
  const running = capture.snapshot.status === 'running';
  useEffect(() => {
    if (!running) return;
    pipeline.resetSession();
    state.resetInference();
    const id = window.setInterval(() => {
      setSnapshot(pipeline.snapshot());
      setInferenceMs(state.medianInference());
    }, PUBLISH_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      pipeline.cancelCalibration();
      setSnapshot(pipeline.snapshot());
    };
  }, [running, pipeline, state]);

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
    inferenceMs,
    ensureLandmarker,
    calibrate: () => {
      pipeline.startCalibration();
      setSnapshot(pipeline.snapshot());
    },
    cancelCalibration: () => {
      pipeline.cancelCalibration();
      setSnapshot(pipeline.snapshot());
    },
  };
}
