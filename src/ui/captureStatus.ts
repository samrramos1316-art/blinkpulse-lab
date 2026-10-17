/** Plain-language capture status for the line under the preview. */

import type { BlinkSnapshot } from '../app/blinkPipeline.ts';
import type { CaptureSnapshot } from '../app/captureController.ts';
import type { LandmarkerStatus } from '../app/useBlink.ts';
import { BLINK_STATUS, CAMERA_ERROR, CAPTURE_STATUS } from './copy.ts';

const MIN_FPS = 24; // PROJECT_SPEC 5.1 frameRate.min

export type StatusTone = 'neutral' | 'warning' | 'error';

export function captureStatusText(s: CaptureSnapshot): { text: string; tone: StatusTone } {
  switch (s.status) {
    case 'idle':
      return { text: CAPTURE_STATUS.idle, tone: 'neutral' };
    case 'starting':
      return { text: CAPTURE_STATUS.starting, tone: 'neutral' };
    case 'error':
      return { text: CAMERA_ERROR[s.errorKind ?? 'unknown'], tone: 'error' };
    case 'ended':
      return { text: CAPTURE_STATUS.ended, tone: 'error' };
    case 'running': {
      if (s.hidden) return { text: CAPTURE_STATUS.hidden, tone: 'warning' };
      if (s.wasHidden) return { text: CAPTURE_STATUS.wasHidden, tone: 'warning' };
      const fps = s.timing?.fps ?? NaN;
      if (Number.isFinite(fps) && fps < MIN_FPS) {
        return { text: CAPTURE_STATUS.runningSlow, tone: 'warning' };
      }
      return { text: CAPTURE_STATUS.running, tone: 'neutral' };
    }
  }
}

export interface StatusText {
  text: string;
  tone: StatusTone;
}

/**
 * Status line while measuring: camera problems first, then face tracking and
 * calibration, then the camera's own notes (hidden earlier, slow camera).
 */
export function liveStatusText(
  capture: CaptureSnapshot,
  blink: BlinkSnapshot,
  landmarker: LandmarkerStatus,
): StatusText {
  const base = captureStatusText(capture);
  if (capture.status !== 'running' || capture.hidden) return base;
  if (landmarker === 'error') return { text: BLINK_STATUS.error, tone: 'error' };
  if (landmarker !== 'ready') return { text: BLINK_STATUS.loading, tone: 'neutral' };
  if (blink.faceStatus === 'noFace') return { text: BLINK_STATUS.noFace, tone: 'warning' };
  if (blink.faceStatus === 'headTurned') return { text: BLINK_STATUS.headTurned, tone: 'warning' };
  switch (blink.calibration.phase) {
    case 'running':
      return { text: BLINK_STATUS.calibrating, tone: 'neutral' };
    case 'failed':
      return { text: BLINK_STATUS.calibrationFailed, tone: 'warning' };
    case 'none':
      return { text: BLINK_STATUS.notCalibrated, tone: 'neutral' };
    case 'done':
      return base.tone === 'neutral' ? { text: BLINK_STATUS.measuring, tone: 'neutral' } : base;
  }
}
