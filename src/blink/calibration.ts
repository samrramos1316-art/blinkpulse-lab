/**
 * Open-eye baseline and blink thresholds (PROJECT_SPEC 5.3). Pure.
 *
 *   b0 = median(samples);  b = median(samples >= 0.85 b0)
 *   close threshold  = 0.70 b,  reopen threshold = 0.80 b  (hysteresis)
 *
 * The second median drops blinks and half-closed frames that were captured
 * during calibration. No absolute EAR threshold is used anywhere.
 */

import { mad, median } from '../dsp/stats.ts';

export const BASELINE_KEEP_FRACTION = 0.85;
export const CLOSE_FRACTION = 0.7;
export const REOPEN_FRACTION = 0.8;

/**
 * Minimum valid samples for a calibration. About 4 s at 24 fps; with the ~10 s
 * calibration this allows for some lost frames. A usability choice, not tuned.
 */
export const MIN_CALIBRATION_SAMPLES = 100;

export interface BlinkThresholds {
  /** Open-eye baseline EAR. */
  baseline: number;
  /** Below this the eye counts as closed. */
  closeEar: number;
  /** Above this a closed eye counts as reopened. */
  reopenEar: number;
}

export type CalibrationResult =
  | ({
      ok: true;
      /** Valid samples used. */
      n: number;
      /** Samples kept for the final median (>= 0.85 b0). */
      nKept: number;
      /** MAD of the kept samples divided by the baseline: lower is steadier. */
      relativeSpread: number;
    } & BlinkThresholds)
  | { ok: false; n: number; reason: 'tooFewSamples' | 'invalidValues' };

export function thresholdsFromBaseline(baseline: number): BlinkThresholds {
  return {
    baseline,
    closeEar: CLOSE_FRACTION * baseline,
    reopenEar: REOPEN_FRACTION * baseline,
  };
}

/** Calibrate from valid per-frame EAR samples (non-finite values are ignored). */
export function calibrate(
  samples: ArrayLike<number>,
  minSamples = MIN_CALIBRATION_SAMPLES,
): CalibrationResult {
  const valid: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] as number;
    if (Number.isFinite(v) && v > 0) valid.push(v);
  }
  if (valid.length < minSamples) return { ok: false, n: valid.length, reason: 'tooFewSamples' };

  const b0 = median(valid);
  const kept = valid.filter((v) => v >= BASELINE_KEEP_FRACTION * b0);
  const b = median(kept);
  if (!(b > 0)) return { ok: false, n: valid.length, reason: 'invalidValues' };

  return {
    ok: true,
    n: valid.length,
    nKept: kept.length,
    relativeSpread: mad(kept) / b,
    ...thresholdsFromBaseline(b),
  };
}
