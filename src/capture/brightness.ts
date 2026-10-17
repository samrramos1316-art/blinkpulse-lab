/**
 * Frame brightness for the first-run positioning hint. Pure.
 * The pixels come from a tiny downscaled copy of the current frame and are
 * discarded straight after this calculation (never stored).
 */

/** Mean Rec. 601 luma (0-255) of RGBA pixel data. NaN for no pixels. */
export function meanLuma(rgba: ArrayLike<number>): number {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return NaN;
  let sum = 0;
  for (let i = 0; i < pixels * 4; i += 4) {
    sum +=
      0.299 * (rgba[i] as number) +
      0.587 * (rgba[i + 1] as number) +
      0.114 * (rgba[i + 2] as number);
  }
  return sum / pixels;
}

/**
 * Below this mean luma the frame counts as too dark. A usability heuristic for a
 * hint, not a measured threshold: it has not been tuned or validated.
 */
export const DARK_LUMA = 50;

export type BrightnessHint = 'tooDark' | 'ok' | 'unknown';

export function brightnessHint(luma: number): BrightnessHint {
  if (!Number.isFinite(luma)) return 'unknown';
  return luma < DARK_LUMA ? 'tooDark' : 'ok';
}
