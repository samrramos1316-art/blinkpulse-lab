/**
 * Per-frame callback loop (PROJECT_SPEC 5.1). Browser-only.
 *
 * Uses HTMLVideoElement.requestVideoFrameCallback when the browser has it
 * (feature-detected): it fires once per new video frame with frame metadata, and
 * must be re-registered from inside the callback. Otherwise it falls back to
 * requestAnimationFrame, which fires per display refresh: frames can then repeat or
 * be skipped, and the timestamp is performance.now() at the callback.
 */

export type FrameLoopKind = 'videoFrameCallback' | 'animationFrame';

export interface LoopFrame {
  /** Callback time (ms, performance.now() clock). */
  nowMs: number;
  /** Frame metadata, or null in the requestAnimationFrame fallback. */
  meta: VideoFrameCallbackMetadata | null;
}

export function hasVideoFrameCallback(video: HTMLVideoElement): boolean {
  // Feature detection: older browsers lack the method even though the typings declare it.
  return typeof (video as Partial<HTMLVideoElement>).requestVideoFrameCallback === 'function';
}

/** Start calling `onFrame` for each frame. Returns a function that stops the loop. */
export function startFrameLoop(
  video: HTMLVideoElement,
  onFrame: (frame: LoopFrame) => void,
): { kind: FrameLoopKind; stop: () => void } {
  let running = true;
  // An exception (e.g. the landmarker failing on one frame) is logged once, not thrown:
  // thrown out of the callback it would skip re-registering it, and the loop would stop
  // for good while the camera kept running.
  let logged = false;
  const safely = (frame: LoopFrame) => {
    try {
      onFrame(frame);
    } catch (err) {
      if (!logged) console.error('Frame processing failed', err);
      logged = true;
    }
  };

  if (hasVideoFrameCallback(video)) {
    let handle = 0;
    const tick = (now: number, meta: VideoFrameCallbackMetadata) => {
      if (!running) return;
      safely({ nowMs: now, meta });
      handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return {
      kind: 'videoFrameCallback',
      stop: () => {
        running = false;
        video.cancelVideoFrameCallback(handle);
      },
    };
  }

  let handle = 0;
  const tick = () => {
    if (!running) return;
    // HAVE_CURRENT_DATA: a frame is available.
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      safely({ nowMs: performance.now(), meta: null });
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return {
    kind: 'animationFrame',
    stop: () => {
      running = false;
      cancelAnimationFrame(handle);
    },
  };
}
