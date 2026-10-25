/**
 * Signal quality: SQI levels and quality flags (PROJECT_SPEC 5.4). Pure.
 *
 * All thresholds here are STARTING VALUES. The SQI levels were set on synthetic
 * data (docs/METHODS.md: noise-only windows and error rates, with n); the others
 * are untested. PROJECT_SPEC 7.1: they are frozen before validation V2b starts and
 * are not tuned on its results.
 */

import type { WindowEstimate } from './hrEstimator.ts';
import type { WindowStats } from './rgbTrace.ts';

export type QualityLevel = 'good' | 'fair' | 'poor';

/** SQI at or above this is Good / Fair (synthetic study in docs/METHODS.md). */
export const SQI_GOOD = 0.7;
export const SQI_FAIR = 0.5;

/** Region flags (Patch A): the region is excluded from fusion. */
export const MAX_SATURATED_FRACTION = 0.05;
export const MIN_MEAN_LUMA = 40;
export const MIN_COVERAGE = 0.6; // Patch A
/** Relative frame-to-frame luminance change counted as a sudden lighting change. */
export const MAX_LUMA_JUMP = 0.05;
/**
 * Motion: nose-tip speed in inter-ocular distances per second; flagged when more
 * than MOTION_FRACTION of the window's frames exceed MOTION_IOD_PER_S.
 */
export const MOTION_IOD_PER_S = 0.5;
export const MOTION_FRACTION = 0.1;
/** PROJECT_SPEC 5.4: < 20 fps warn, < 15 fps no pulse estimate. */
export const FPS_WARN = 20;
export const FPS_MIN = 15;

/**
 * Flicker (Phase 6): the background reference has at least this SQI at the region's
 * pulse peak, i.e. the scene's light varies at that rate about as cleanly as a Fair
 * pulse signal. Starting value (= SQI_FAIR); false-flag rate on noise in
 * docs/METHODS.md.
 */
export const FLICKER_SQI = SQI_FAIR;

export type RegionFlag = 'saturated' | 'dark' | 'lowCoverage';
export type GlobalFlag = 'motion' | 'lightingChange' | 'lowFps';
export type PulseFlag = RegionFlag | GlobalFlag | 'crossCheck' | 'flicker';

const ORDER: readonly QualityLevel[] = ['poor', 'fair', 'good'];

export function levelFromSqi(sqi: number): QualityLevel {
  return sqi >= SQI_GOOD ? 'good' : sqi >= SQI_FAIR ? 'fair' : 'poor';
}

export function lowerLevel(level: QualityLevel, steps = 1): QualityLevel {
  return ORDER[Math.max(0, ORDER.indexOf(level) - steps)] as QualityLevel;
}

export function atLeastFair(level: QualityLevel): boolean {
  return level !== 'poor';
}

export function regionFlags(stats: WindowStats): RegionFlag[] {
  const f: RegionFlag[] = [];
  if (stats.saturatedFraction > MAX_SATURATED_FRACTION) f.push('saturated');
  if (stats.meanLuma < MIN_MEAN_LUMA) f.push('dark');
  if (stats.coverage < MIN_COVERAGE) f.push('lowCoverage');
  return f;
}

/** Fraction of frames moving faster than the motion limit -> motion flag. */
export function motionFlag(speedsIodPerS: readonly number[]): boolean {
  if (speedsIodPerS.length === 0) return false;
  const fast = speedsIodPerS.filter((s) => s > MOTION_IOD_PER_S).length;
  return fast / speedsIodPerS.length > MOTION_FRACTION;
}

export function globalFlags(stats: WindowStats, moving: boolean): GlobalFlag[] {
  const f: GlobalFlag[] = [];
  if (moving) f.push('motion');
  if (stats.maxLumaJump > MAX_LUMA_JUMP) f.push('lightingChange');
  if (stats.fps < FPS_WARN) f.push('lowFps');
  return f;
}

export interface RegionQuality {
  level: QualityLevel;
  flags: PulseFlag[];
}

/**
 * Level from the SQI, lowered one step for each of: motion, sudden lighting
 * change, low frame rate, spectral/time-domain disagreement (> 8 BPM), and flicker
 * (the background reference varies at the same rate; `flicker` says whether it does
 * at this estimate's peak, Phase 6). Region flags do not change the level; they
 * exclude the region from fusion.
 */
export function regionQuality(
  est: WindowEstimate,
  stats: WindowStats,
  global: readonly GlobalFlag[],
  flicker = false,
): RegionQuality {
  const flags: PulseFlag[] = [...regionFlags(stats), ...global];
  if (est.crossCheckAgrees === false) flags.push('crossCheck');
  if (flicker) flags.push('flicker');
  const penalties = global.length + (est.crossCheckAgrees === false ? 1 : 0) + (flicker ? 1 : 0);
  return { level: lowerLevel(levelFromSqi(est.sqi), penalties), flags };
}
