/**
 * Stream A pipeline: landmarks -> EAR -> gating -> calibration / blink detection ->
 * metrics (PROJECT_SPEC 5.3). No DOM: the caller passes pixel landmarks and pose,
 * so the whole flow is unit-tested in Node.
 *
 * Per-frame data stays in typed-array ring buffers (read by the canvas plot);
 * `snapshot()` is for React at <= 4 Hz.
 */

import { BlinkDetector, type BlinkEvent, type EarSample } from '../blink/blinkDetector.ts';
import { calibrate, type BlinkThresholds, type CalibrationResult } from '../blink/calibration.ts';
import { earBothEyes, type EyeIndices, type Point } from '../blink/ear.ts';
import { BlinkMetrics, type BlinkMetricsSnapshot } from '../blink/metrics.ts';
import type { FrameTick } from '../capture/frameClock.ts';
import { median } from '../dsp/stats.ts';
import { poseWithinLimits, relativePose, type HeadPose } from '../vision/headPose.ts';

/** Calibration length (PROJECT_SPEC 5.3: "about 10 s"). */
export const CALIBRATION_MS = 10_000;
/** EAR history kept for the plot (ms). */
export const HISTORY_MS = 20_000;
const HISTORY_CAPACITY = 2048; // > 20 s at 60 fps (1200) with margin

export type FaceStatus = 'noFace' | 'headTurned' | 'ok';

export type CalibrationState =
  | { phase: 'none' }
  | { phase: 'running'; startedMs: number; progress: number; samples: number }
  | { phase: 'done'; result: Extract<CalibrationResult, { ok: true }> }
  | { phase: 'failed'; result: Extract<CalibrationResult, { ok: false }> };

export interface FaceInput {
  /** Landmarks in PIXELS. */
  points: Point[];
  /** Head pose, or null if it could not be derived. */
  pose: HeadPose | null;
  /** Frame width in pixels, for the setup distance hint. */
  frameWidth?: number;
}

export interface BlinkSnapshot {
  faceStatus: FaceStatus;
  ear: number | null;
  eyeA: number | null;
  eyeB: number | null;
  pose: HeadPose | null;
  calibration: CalibrationState;
  thresholds: BlinkThresholds | null;
  metrics: BlinkMetricsSnapshot;
  /** Median frame interval over the plot history (ms): the duration resolution. */
  frameMs: number | null;
  /** Fraction of recent frames where a face was found (0..1). */
  faceFoundFraction: number | null;
  /** Outer-eye-corner distance / frame width (face size in frame), or null. */
  eyeSpanFraction: number | null;
  /** Head pose during calibration (gating reference), or null. */
  referencePose: HeadPose | null;
}

export interface EarHistory {
  /** Oldest-first copies. ear is NaN where the sample was invalid. */
  t: Float64Array;
  ear: Float64Array;
  events: readonly BlinkEvent[];
  thresholds: BlinkThresholds | null;
}

export interface LastFrame {
  status: FaceStatus;
  ear: number;
  eyeA: number;
  eyeB: number;
  pose: HeadPose | null;
  eyeSpan: number;
}

const EMPTY_FRAME: LastFrame = {
  status: 'noFace',
  ear: NaN,
  eyeA: NaN,
  eyeB: NaN,
  pose: null,
  eyeSpan: NaN,
};

export class BlinkPipeline {
  private readonly eyeA: EyeIndices;
  private readonly eyeB: EyeIndices;

  private detector: BlinkDetector | null = null;
  private readonly metrics = new BlinkMetrics();
  private thresholds: BlinkThresholds | null = null;
  private calibration: CalibrationState = { phase: 'none' };
  private calibrationSamples: number[] = [];
  private beforeCalibration: CalibrationState = { phase: 'none' };
  private calibrationPoses: HeadPose[] = [];
  /** Median head pose during calibration: the user's normal viewing position. */
  private referencePose: HeadPose | null = null;

  private readonly histT = new Float64Array(HISTORY_CAPACITY);
  private readonly histEar = new Float64Array(HISTORY_CAPACITY);
  private readonly histFace = new Uint8Array(HISTORY_CAPACITY);
  private histHead = 0;
  private histCount = 0;
  private events: BlinkEvent[] = [];

  private last: LastFrame = EMPTY_FRAME;

  constructor(eyeA: EyeIndices, eyeB: EyeIndices) {
    this.eyeA = eyeA;
    this.eyeB = eyeB;
  }

  /** Process one frame. `face` is null when no face was found. */
  process(tick: FrameTick, face: FaceInput | null): BlinkEvent | null {
    let status: FaceStatus = 'noFace';
    let ear = NaN;
    let eyeA = NaN;
    let eyeB = NaN;
    if (face) {
      const r = earBothEyes(face.points, this.eyeA, this.eyeB);
      ear = r.ear;
      eyeA = r.eyeA;
      eyeB = r.eyeB;
      // Head pose is gated RELATIVE to the median pose during calibration, so a
      // camera below eye level (laptops) does not count as "head turned". Before
      // calibration, and when pose cannot be derived, there is no pose gating.
      const ref = this.calibration.phase === 'running' ? null : this.referencePose;
      status =
        face.pose && ref && !poseWithinLimits(relativePose(face.pose, ref)) ? 'headTurned' : 'ok';
    }
    const valid = status === 'ok' && Number.isFinite(ear);
    let eyeSpan = NaN;
    if (face?.frameWidth) {
      const outerA = face.points[this.eyeA[0]];
      const outerB = face.points[this.eyeB[3]];
      if (outerA && outerB) {
        eyeSpan = Math.hypot(outerA.x - outerB.x, outerA.y - outerB.y) / face.frameWidth;
      }
    }
    this.last = { status, ear, eyeA, eyeB, pose: face?.pose ?? null, eyeSpan };

    const sample: EarSample = { tMs: tick.tMs, ear, valid, gapBefore: tick.gap };
    this.record(tick.tMs, valid ? ear : NaN, face !== null);

    if (this.calibration.phase === 'running') {
      this.stepCalibration(sample);
      return null;
    }

    this.metrics.addSample(sample);
    const event = this.detector?.push(sample) ?? null;
    if (event) {
      this.metrics.addEvent(event);
      this.events.push(event);
      const lo = tick.tMs - HISTORY_MS;
      if ((this.events[0]?.endMs ?? Infinity) < lo)
        this.events = this.events.filter((e) => e.endMs >= lo);
    }
    return event;
  }

  /** Start (or restart) a calibration from the next frame. Blink detection pauses meanwhile. */
  startCalibration(): void {
    if (this.calibration.phase !== 'running') this.beforeCalibration = this.calibration;
    this.calibration = { phase: 'running', startedMs: NaN, progress: 0, samples: 0 };
    this.calibrationSamples = [];
  }

  /** Abandon a running calibration; the previous one (if any) stays in force. */
  cancelCalibration(): void {
    if (this.calibration.phase === 'running') this.calibration = this.beforeCalibration;
    this.calibrationSamples = [];
    this.calibrationPoses = [];
  }

  /** New camera session: keep the calibration, forget events, history, and metrics. */
  resetSession(): void {
    this.cancelCalibration();
    this.metrics.reset();
    this.detector?.reset();
    this.events = [];
    this.histCount = 0;
    this.histHead = 0;
    this.last = EMPTY_FRAME;
  }

  /** The most recent frame's values; cheap enough to read every frame (V1 export). */
  get lastFrame(): Readonly<LastFrame> {
    return this.last;
  }

  get calibrationState(): CalibrationState {
    return this.calibration;
  }

  get isCalibrated(): boolean {
    return this.thresholds !== null;
  }

  /** True while the detector is inside an event (eye counted as closed). */
  get eyeClosed(): boolean {
    return this.detector?.inEvent ?? false;
  }

  snapshot(): BlinkSnapshot {
    const n = this.histCount;
    let frameMs: number | null = null;
    let faceFoundFraction: number | null = null;
    if (n >= 3) {
      const h = this.history();
      const dts = new Float64Array(n - 1);
      for (let i = 1; i < n; i++) dts[i - 1] = (h.t[i] as number) - (h.t[i - 1] as number);
      frameMs = median(dts);
      let found = 0;
      for (let i = 0; i < n; i++)
        found += this.histFace[
          (this.histHead - n + i + HISTORY_CAPACITY) % HISTORY_CAPACITY
        ] as number;
      faceFoundFraction = found / n;
    }
    const finite = (v: number) => (Number.isFinite(v) ? v : null);
    return {
      faceStatus: this.last.status,
      ear: finite(this.last.ear),
      eyeA: finite(this.last.eyeA),
      eyeB: finite(this.last.eyeB),
      pose: this.last.pose,
      calibration: this.calibration,
      thresholds: this.thresholds,
      metrics: this.metrics.snapshot(),
      frameMs,
      faceFoundFraction,
      eyeSpanFraction: finite(this.last.eyeSpan),
      referencePose: this.referencePose,
    };
  }

  /** EAR history for the plot (last HISTORY_MS at most). */
  history(): EarHistory {
    const n = this.histCount;
    const t = new Float64Array(n);
    const ear = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const j = (this.histHead - n + i + HISTORY_CAPACITY) % HISTORY_CAPACITY;
      t[i] = this.histT[j] as number;
      ear[i] = this.histEar[j] as number;
    }
    return { t, ear, events: this.events, thresholds: this.thresholds };
  }

  private record(tMs: number, ear: number, faceFound: boolean): void {
    this.histT[this.histHead] = tMs;
    this.histEar[this.histHead] = ear;
    this.histFace[this.histHead] = faceFound ? 1 : 0;
    this.histHead = (this.histHead + 1) % HISTORY_CAPACITY;
    this.histCount = Math.min(this.histCount + 1, HISTORY_CAPACITY);
    // Drop entries older than HISTORY_MS.
    while (this.histCount > 1) {
      const oldest = (this.histHead - this.histCount + HISTORY_CAPACITY) % HISTORY_CAPACITY;
      if (tMs - (this.histT[oldest] as number) <= HISTORY_MS) break;
      this.histCount--;
    }
  }

  private stepCalibration(sample: EarSample): void {
    if (this.calibration.phase !== 'running') return;
    const startedMs = Number.isNaN(this.calibration.startedMs)
      ? sample.tMs
      : this.calibration.startedMs;
    if (sample.valid) {
      this.calibrationSamples.push(sample.ear);
      const pose = this.last.pose;
      if (pose) this.calibrationPoses.push(pose);
    }
    const elapsed = sample.tMs - startedMs;
    this.calibration = {
      phase: 'running',
      startedMs,
      progress: Math.min(1, elapsed / CALIBRATION_MS),
      samples: this.calibrationSamples.length,
    };
    if (elapsed < CALIBRATION_MS) return;

    const result = calibrate(this.calibrationSamples);
    const poses = this.calibrationPoses;
    this.calibrationSamples = [];
    this.calibrationPoses = [];
    if (!result.ok) {
      this.calibration = { phase: 'failed', result };
      return;
    }
    this.calibration = { phase: 'done', result };
    this.thresholds = {
      baseline: result.baseline,
      closeEar: result.closeEar,
      reopenEar: result.reopenEar,
    };
    this.referencePose = poses.length
      ? {
          yawDeg: median(poses.map((p) => p.yawDeg)),
          pitchDeg: median(poses.map((p) => p.pitchDeg)),
          rollDeg: median(poses.map((p) => p.rollDeg)),
        }
      : null;
    this.detector = new BlinkDetector(this.thresholds);
    this.metrics.reset();
    this.events = [];
  }
}
