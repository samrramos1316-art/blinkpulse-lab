/**
 * Capture orchestration: camera lifecycle, frame timing, hidden-tab handling, and
 * failure states (PROJECT_SPEC Phase 2 and 5.1).
 *
 * Browser APIs are injected (`CaptureDeps`) so every failure path is unit-tested in
 * Node. Per-frame data stays inside the controller; subscribers (React) get a new
 * snapshot only on status changes and at most every PUBLISH_INTERVAL_MS (<= 4 Hz,
 * CLAUDE.md).
 */

import type { CameraHandle, CameraSettings } from '../capture/camera.ts';
import { toCameraErrorKind, type CameraErrorKind } from '../capture/cameraErrors.ts';
import { FrameClock, type FrameTick, type FrameTimingStats } from '../capture/frameClock.ts';
import type { FrameLoopKind } from '../capture/frameLoop.ts';
import {
  chooseTimestampSource,
  readTimestamp,
  type FrameMetadataLike,
  type TimestampSource,
} from '../capture/timestampSource.ts';

export const PUBLISH_INTERVAL_MS = 250;

export type CaptureStatus = 'idle' | 'starting' | 'running' | 'error' | 'ended';

export interface CaptureSnapshot {
  status: CaptureStatus;
  /** Set when status is 'error'. */
  errorKind: CameraErrorKind | null;
  /** The page is hidden right now; analysis is paused. */
  hidden: boolean;
  /** The page was hidden at least once while running (a gap was recorded). */
  wasHidden: boolean;
  settings: CameraSettings | null;
  /** The frame-rate minimum was dropped to open the camera. */
  relaxedConstraints: boolean;
  loop: FrameLoopKind | null;
  timestampSource: TimestampSource | null;
  timing: FrameTimingStats | null;
  /**
   * Dropped frames: frames the video element presented that never reached the frame
   * callback (jumps in presentedFrames). Only available with requestVideoFrameCallback.
   */
  skippedCallbacks: number;
}

export interface LoopFrameInput {
  nowMs: number;
  meta: (FrameMetadataLike & { presentedFrames?: number }) | null;
}

export interface CaptureDeps {
  openCamera(): Promise<CameraHandle>;
  startFrameLoop(onFrame: (frame: LoopFrameInput) => void): { kind: FrameLoopKind; stop(): void };
  isHidden(): boolean;
  /** Subscribe to visibility changes; returns an unsubscribe function. */
  onVisibilityChange(callback: () => void): () => void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export const INITIAL_SNAPSHOT: CaptureSnapshot = Object.freeze({
  status: 'idle',
  errorKind: null,
  hidden: false,
  wasHidden: false,
  settings: null,
  relaxedConstraints: false,
  loop: null,
  timestampSource: null,
  timing: null,
  skippedCallbacks: 0,
});

export class CaptureController {
  private readonly deps: CaptureDeps;
  private snapshot: CaptureSnapshot = INITIAL_SNAPSHOT;
  private readonly subscribers = new Set<() => void>();
  private readonly frameListeners = new Set<(tick: FrameTick) => void>();

  /** Increases on every start/stop so a late camera promise can tell it is stale. */
  private generation = 0;
  private camera: CameraHandle | null = null;
  private loop: { kind: FrameLoopKind; stop(): void } | null = null;
  private unsubscribeVisibility: (() => void) | null = null;
  private publishTimer: unknown = null;

  private clock = new FrameClock();
  private source: TimestampSource | null = null;
  private lastPresentedFrames: number | null = null;
  private skipped = 0;
  private hidden = false;
  private wasHidden = false;

  constructor(deps: CaptureDeps) {
    this.deps = deps;
  }

  // --- subscription (useSyncExternalStore-compatible) ---

  readonly subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  };

  readonly getSnapshot = (): CaptureSnapshot => this.snapshot;

  /** Per-frame hook for later pipeline stages. Not throttled; keep listeners cheap. */
  addFrameListener(listener: (tick: FrameTick) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Recent gaps (long intervals, hidden tab, source change) for window invalidation. */
  gapIntervals() {
    return this.clock.gapIntervals();
  }

  // --- lifecycle ---

  async start(): Promise<void> {
    const status = this.snapshot.status;
    if (status === 'starting' || status === 'running') return;

    const generation = ++this.generation;
    this.resetSession();
    this.update({ ...INITIAL_SNAPSHOT, status: 'starting' });

    let camera: CameraHandle;
    try {
      camera = await this.deps.openCamera();
    } catch (err) {
      if (generation !== this.generation) return; // stopped meanwhile
      this.update({ ...INITIAL_SNAPSHOT, status: 'error', errorKind: toCameraErrorKind(err) });
      return;
    }
    if (generation !== this.generation) {
      camera.stop(); // Stop was pressed while the permission prompt was open.
      return;
    }

    this.camera = camera;
    camera.onEnded(() => {
      if (generation === this.generation) this.teardown('ended');
    });
    this.hidden = this.deps.isHidden();
    this.unsubscribeVisibility = this.deps.onVisibilityChange(() => {
      this.handleVisibility();
    });
    this.loop = this.deps.startFrameLoop((frame) => {
      this.handleFrame(frame);
    });
    this.publishTimer = this.deps.setInterval(() => {
      this.publish();
    }, PUBLISH_INTERVAL_MS);

    this.update({
      ...INITIAL_SNAPSHOT,
      status: 'running',
      hidden: this.hidden,
      settings: camera.settings,
      relaxedConstraints: camera.relaxed,
      loop: this.loop.kind,
    });
  }

  /** Release the camera. Safe to call in any state (Stop button, pagehide, unmount). */
  stop(): void {
    this.generation++;
    this.teardown('idle');
  }

  // --- internals ---

  private handleFrame(frame: LoopFrameInput): void {
    if (this.hidden) return; // analysis is paused while hidden (PROJECT_SPEC 5.1)

    const presented = frame.meta?.presentedFrames;
    if (typeof presented === 'number') {
      if (this.lastPresentedFrames !== null && presented > this.lastPresentedFrames + 1) {
        this.skipped += presented - this.lastPresentedFrames - 1;
        this.clock.markGap('dropped'); // frames missing from the data: a real break
      }
      this.lastPresentedFrames = presented;
    }

    this.source ??= chooseTimestampSource(frame.nowMs, frame.meta);
    let raw = readTimestamp(this.source, frame.nowMs, frame.meta);
    if (raw === null) {
      // The chosen source disappeared: switch, and mark the change as a gap.
      this.source = chooseTimestampSource(frame.nowMs, frame.meta);
      this.clock.rebase();
      raw = readTimestamp(this.source, frame.nowMs, frame.meta);
    }
    if (raw === null) return;

    const tick = this.clock.push(raw);
    if (tick === null) return;
    for (const listener of this.frameListeners) listener(tick);
  }

  private handleVisibility(): void {
    const hidden = this.deps.isHidden();
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.wasHidden = true;
      this.clock.markGap('hidden');
      this.lastPresentedFrames = null; // frames presented while hidden are not "skipped"
    }
    this.publish();
  }

  private publish(): void {
    if (this.snapshot.status !== 'running') return;
    this.update({
      ...this.snapshot,
      hidden: this.hidden,
      wasHidden: this.wasHidden,
      timestampSource: this.source,
      timing: this.clock.stats(),
      skippedCallbacks: this.skipped,
    });
  }

  private teardown(status: 'idle' | 'ended'): void {
    this.loop?.stop();
    this.loop = null;
    this.camera?.stop();
    this.camera = null;
    this.unsubscribeVisibility?.();
    this.unsubscribeVisibility = null;
    if (this.publishTimer !== null) this.deps.clearInterval(this.publishTimer);
    this.publishTimer = null;
    if (this.snapshot.status !== status || status === 'ended') {
      // Keep the last timing numbers visible after the camera ends by itself.
      this.update(
        status === 'ended' ? { ...this.snapshot, status, hidden: false } : INITIAL_SNAPSHOT,
      );
    }
  }

  private resetSession(): void {
    this.clock = new FrameClock();
    this.source = null;
    this.lastPresentedFrames = null;
    this.skipped = 0;
    this.hidden = false;
    this.wasHidden = false;
  }

  private update(next: CaptureSnapshot): void {
    this.snapshot = next;
    for (const callback of this.subscribers) callback();
  }
}
