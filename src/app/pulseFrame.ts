/**
 * Builds the pulse estimator's per-frame input from landmarks, shared by the live
 * app and the video-file tool (#v2) so both record identical traces. Browser-only
 * through the sampler.
 */

import type { Point } from '../blink/ear.ts';
import { breaksAnalysis, type FrameTick } from '../capture/frameClock.ts';
import { MAX_GAP_MS } from '../rppg/hrEstimator.ts';
import type { PulseFrame } from '../rppg/pulseEstimator.ts';
import { backgroundPolygons, regionPolygons, type RegionId } from '../rppg/roi.ts';
import { EYE_A, EYE_B } from '../vision/landmarks.ts';
import type { RoiSampler } from './roiSampler.ts';

/** Landmark indices for the motion flag (PROJECT_SPEC 5.4: nose tip, outer eye corners). */
const NOSE_TIP = 1;
const IOD_A = EYE_A[0];
const IOD_B = EYE_B[3];

/**
 * Whether the break before this frame invalidates pulse windows. PROJECT_SPEC 5.4:
 * only frames more than 250 ms apart do; shorter holes are bridged by resampling.
 * The frame clock also flags short breaks (a skipped frame, an interval over 2.5x
 * the median) for its timing statistics; those are bridged (breaksAnalysis). A
 * hidden page or a change of timestamp source always breaks the window (time base).
 */
export function pulseGapBefore(tick: Pick<FrameTick, 'gap' | 'gapReason' | 'dtMs'>): boolean {
  return breaksAnalysis(tick, MAX_GAP_MS);
}

export function buildPulseFrame(
  tick: FrameTick,
  points: Point[] | null,
  faceValid: boolean,
  video: HTMLVideoElement,
  sampler: RoiSampler,
): {
  frame: PulseFrame;
  polygons: Record<RegionId, Point[] | null> | null;
  background: Point[][];
} {
  const polygons = points ? regionPolygons(points) : null;
  // The background reference does not depend on the head pose gate: it measures the
  // scene's light, not the skin.
  const background = points ? backgroundPolygons(points, video.videoWidth, video.videoHeight) : [];
  const nose = points?.[NOSE_TIP];
  const a = points?.[IOD_A];
  const b = points?.[IOD_B];
  return {
    frame: {
      tMs: tick.tMs,
      gapBefore: pulseGapBefore(tick),
      faceValid,
      regions: faceValid && polygons ? sampler.sample(video, polygons) : {},
      motion: nose && a && b ? { noseTip: nose, iodPx: Math.hypot(a.x - b.x, a.y - b.y) } : null,
      background: background.length ? sampler.sampleBackground(video, background) : null,
    },
    polygons,
    background,
  };
}
