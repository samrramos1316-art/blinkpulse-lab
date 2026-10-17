/**
 * MediaPipe FaceLandmarker wrapper (PROJECT_SPEC 5.2). Browser-only.
 *
 * API from @mediapipe/tasks-vision 1.1.1 (vision.d.ts) and the official
 * "Face landmark detection guide for Web", read 2026-10-17:
 *   FilesetResolver.forVisionTasks(basePath) -> WasmFileset
 *   FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath, delegate },
 *     runningMode: 'VIDEO', numFaces, outputFacialTransformationMatrixes, ... })
 *   detectForVideo(videoFrame, timestampMs) -> { faceLandmarks, facialTransformationMatrixes, ... }
 * The model and wasm files are self-hosted (public/models, public/wasm): no request
 * leaves the app's origin.
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedPoint } from './landmarks.ts';

const WASM_BASE = `${import.meta.env.BASE_URL}wasm`;
const MODEL_PATH = `${import.meta.env.BASE_URL}models/face_landmarker.task`;

export type Delegate = 'GPU' | 'CPU';

export interface FaceFrame {
  /** Normalised landmarks of the first face (478 points), or null if no face. */
  landmarks: NormalizedPoint[] | null;
  /** Facial transformation matrix data (16 values), or null. */
  matrix: number[] | null;
  /** Inference time on the main thread (ms). */
  inferenceMs: number;
}

export interface Landmarker {
  delegate: Delegate;
  /** Run on the current video frame. `tMs` must increase between calls. */
  detect(video: HTMLVideoElement, tMs: number): FaceFrame;
  close(): void;
}

async function create(delegate: Delegate): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
  });
}

/** Create a landmarker, trying the GPU delegate first and falling back to CPU. */
export async function createLandmarker(): Promise<Landmarker> {
  let delegate: Delegate = 'GPU';
  let task: FaceLandmarker;
  try {
    task = await create('GPU');
  } catch {
    delegate = 'CPU';
    task = await create('CPU');
  }

  // detectForVideo needs strictly increasing timestamps over the task's whole
  // lifetime, also across camera restarts (where FrameClock starts again at 0).
  let lastTs = -Infinity;
  let offset = 0;

  return {
    delegate,
    detect(video, tMs) {
      let ts = tMs + offset;
      if (!(ts > lastTs)) {
        offset = lastTs + 1 - tMs;
        ts = tMs + offset;
      }
      lastTs = ts;
      const t0 = performance.now();
      const result = task.detectForVideo(video, ts);
      const inferenceMs = performance.now() - t0;
      const face = result.faceLandmarks[0];
      const matrix = result.facialTransformationMatrixes[0];
      return {
        landmarks: face && face.length > 0 ? face : null,
        matrix: matrix ? matrix.data : null,
        inferenceMs,
      };
    },
    close() {
      task.close();
    },
  };
}
