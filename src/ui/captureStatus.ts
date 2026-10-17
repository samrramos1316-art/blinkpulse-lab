/** Plain-language capture status for the line under the preview. */

import type { CaptureSnapshot } from '../app/captureController.ts';
import { CAMERA_ERROR, CAPTURE_STATUS } from './copy.ts';

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
