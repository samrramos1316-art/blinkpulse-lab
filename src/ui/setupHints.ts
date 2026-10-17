/**
 * Live positioning hint for the first-run flow (SPEC_AMENDMENT_02 Part 3, step 3:
 * "Move a little closer", "Face the light", ...). One hint at a time, most
 * important first. Pure, so the priority order is unit-tested.
 */

import type { BlinkSnapshot } from '../app/blinkPipeline.ts';
import type { LandmarkerStatus } from '../app/useBlink.ts';
import type { BrightnessHint } from '../capture/brightness.ts';

/**
 * Face-size limits as outer-eye-corner distance / frame width. These are UI
 * heuristics chosen for the hint, NOT measured optima: at 640 px width, 0.12 is
 * about 77 px between the outer eye corners, so each eyelid opening spans only a
 * few pixels. Revisit after validation V1.
 */
export const EYE_SPAN_MIN = 0.12;
export const EYE_SPAN_MAX = 0.4;

export type PositionHint =
  'loading' | 'trackingError' | 'noFace' | 'tooFar' | 'tooClose' | 'tooDark' | 'ok';

export function positionHint(
  blink: BlinkSnapshot,
  brightness: BrightnessHint,
  tracking: LandmarkerStatus,
): PositionHint {
  if (tracking === 'error') return 'trackingError';
  if (tracking !== 'ready') return 'loading';
  if (blink.faceStatus === 'noFace' || blink.eyeSpanFraction === null) {
    return brightness === 'tooDark' ? 'tooDark' : 'noFace';
  }
  if (blink.eyeSpanFraction < EYE_SPAN_MIN) return 'tooFar';
  if (blink.eyeSpanFraction > EYE_SPAN_MAX) return 'tooClose';
  if (brightness === 'tooDark') return 'tooDark';
  return 'ok';
}
