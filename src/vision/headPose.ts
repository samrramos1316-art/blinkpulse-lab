/**
 * Head pose from FaceLandmarker's facial transformation matrix (PROJECT_SPEC 5.2). Pure.
 *
 * The API returns a 4x4 `Matrix` as { rows, columns, data } with a flattened
 * `data` array; its documentation does not say whether `data` is row- or
 * column-major. Instead of assuming, `matrixLayout` checks where the translation
 * sits: an affine 4x4 has [0, 0, 0, 1] as its bottom row, so in column-major data
 * entries 3, 7, 11 are 0 (translation at 12-14), and in row-major data entries
 * 12, 13, 14 are 0 (translation at 3, 7, 11). A face in front of the camera always
 * has a non-zero translation, so the two are distinguishable.
 *
 * Angles use R = Ry(yaw) * Rx(pitch) * Rz(roll):
 *   pitch = asin(-R[1][2]),  yaw = atan2(R[0][2], R[2][2]),  roll = atan2(R[1][0], R[1][1])
 * Which way is positive (left/right, up/down) has NOT been verified on live video
 * yet (PROJECT_SPEC 5.2 asks for that). The gating limits are symmetric (+-yaw,
 * +-pitch), so a sign error does not change gating; an axis mix-up would.
 *
 * Gating uses the pose RELATIVE to the user's median pose during calibration
 * (`relativePose`). First live test (2026-10-17, laptop webcam): looking normally
 * at the screen read about 19 deg pitch, right at the absolute 20 deg limit, so
 * absolute gating rejected ordinary viewing. Relative gating also cancels any
 * constant offset from the canonical-face convention.
 */

export type MatrixLayout = 'columnMajor' | 'rowMajor' | 'unknown';

export interface HeadPose {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

/** Default gating limits (PROJECT_SPEC 5.3). */
export const MAX_ABS_YAW_DEG = 25;
export const MAX_ABS_PITCH_DEG = 20;

const EPS = 1e-6;
const DEG = 180 / Math.PI;

export function matrixLayout(data: ArrayLike<number>): MatrixLayout {
  if (data.length !== 16) return 'unknown';
  const at = (i: number) => Math.abs(data[i] as number);
  const colMajorZeros = at(3) < EPS && at(7) < EPS && at(11) < EPS;
  const rowMajorZeros = at(12) < EPS && at(13) < EPS && at(14) < EPS;
  if (colMajorZeros && !rowMajorZeros) return 'columnMajor';
  if (rowMajorZeros && !colMajorZeros) return 'rowMajor';
  return 'unknown'; // identity-like or not affine: cannot tell
}

/** 3x3 rotation part as R[row][col], each column normalised to remove scale. */
export function rotationOf(
  data: ArrayLike<number>,
  layout: 'columnMajor' | 'rowMajor',
): number[][] {
  const m = (r: number, c: number) =>
    data[layout === 'columnMajor' ? c * 4 + r : r * 4 + c] as number;
  const R = [0, 1, 2].map((r) => [0, 1, 2].map((c) => m(r, c)));
  for (let c = 0; c < 3; c++) {
    const n = Math.hypot(R[0]?.[c] ?? 0, R[1]?.[c] ?? 0, R[2]?.[c] ?? 0) || 1;
    for (let r = 0; r < 3; r++) (R[r] as number[])[c] = ((R[r] as number[])[c] as number) / n;
  }
  return R;
}

/** Yaw/pitch/roll in degrees from R = Ry * Rx * Rz. */
export function eulerYXZ(R: number[][]): HeadPose {
  const r = (i: number, j: number) => (R[i] as number[])[j] as number;
  const s = Math.max(-1, Math.min(1, -r(1, 2)));
  return {
    pitchDeg: Math.asin(s) * DEG,
    yawDeg: Math.atan2(r(0, 2), r(2, 2)) * DEG,
    rollDeg: Math.atan2(r(1, 0), r(1, 1)) * DEG,
  };
}

/** Head pose from matrix data, or null if the layout cannot be determined. */
export function headPoseFromMatrix(data: ArrayLike<number>): HeadPose | null {
  const layout = matrixLayout(data);
  if (layout === 'unknown') return null;
  return eulerYXZ(rotationOf(data, layout));
}

/** Pose relative to a reference pose (angle differences, each in [-180, 180)). */
export function relativePose(pose: HeadPose, ref: HeadPose): HeadPose {
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
  return {
    yawDeg: wrap(pose.yawDeg - ref.yawDeg),
    pitchDeg: wrap(pose.pitchDeg - ref.pitchDeg),
    rollDeg: wrap(pose.rollDeg - ref.rollDeg),
  };
}

export function poseWithinLimits(
  pose: HeadPose,
  maxYawDeg = MAX_ABS_YAW_DEG,
  maxPitchDeg = MAX_ABS_PITCH_DEG,
): boolean {
  return Math.abs(pose.yawDeg) <= maxYawDeg && Math.abs(pose.pitchDeg) <= maxPitchDeg;
}
