/**
 * Face landmark index constants and coordinate conversion (PROJECT_SPEC 5.2). Pure.
 *
 * "Never trust a landmark index from memory" (CLAUDE.md). Each list records how it
 * was checked; the full record is in docs/METHODS.md ("Landmark verification").
 *
 * Eye naming follows MediaPipe: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE contains 33
 * and 133, so eye A is the SUBJECT'S right eye. It appears on the left of an
 * unmirrored camera image and on the right of the mirrored preview.
 */

import type { EyeIndices, Point } from '../blink/ear.ts';

/**
 * Eye A (subject's right): P1 = outer corner, P2/P3 upper lid, P4 = inner corner,
 * P5/P6 lower lid below P3/P2.
 * Verified 2026-10-17:
 *  - topology: in @mediapipe/tasks-vision 1.1.1 FACE_LANDMARKS_RIGHT_EYE, 33 and 133
 *    are the corners shared by the upper (33-246-161-160-159-158-157-173-133) and
 *    lower (33-7-163-144-145-153-154-155-133) lid paths; 160/144 are both 3 steps
 *    from 33, 158/153 both 5 steps.
 *  - geometry: on MediaPipe's canonical_face_model.obj, 33 is lateral of 133, and
 *    160/158 lie directly above 144/153 (same x).
 *  - live video in the Landmark Explorer: checked by the author 2026-10-17 (see docs/METHODS.md).
 */
export const EYE_A: EyeIndices = [33, 160, 158, 133, 153, 144];

/**
 * Eye B (subject's left): P1 = inner corner, P4 = outer corner (the mirror image of
 * eye A: 362<->133, 263<->33, 385<->158, 387<->160, 373<->144, 380<->153).
 * Verified 2026-10-17 by the same topology and canonical-geometry checks
 * (FACE_LANDMARKS_LEFT_EYE). Live: checked by the author 2026-10-17.
 */
export const EYE_B: EyeIndices = [362, 385, 387, 263, 373, 380];

/** Landmark count with iris points (FaceLandmarker docs: "478 3-dimensional face landmarks"). */
export const LANDMARK_COUNT = 478;

export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * Normalised (0-1, separately in x and y) to pixel coordinates. Every distance
 * (EAR, ROI sizes) must be computed on the result, never on normalised values.
 */
export function toPixels(
  points: readonly NormalizedPoint[],
  width: number,
  height: number,
): Point[] {
  return points.map((p) => ({ x: p.x * width, y: p.y * height }));
}
