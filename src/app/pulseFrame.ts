/**
 * Builds the pulse estimator's per-frame input from landmarks, shared by the live
 * app and the video-file tool (#v2) so both record identical traces. Browser-only
 * through the sampler.
 */

import type { Point } from '../blink/ear.ts';
import type { FrameTick } from '../capture/frameClock.ts';
import type { PulseFrame } from '../rppg/pulseEstimator.ts';
import { regionPolygons, type RegionId } from '../rppg/roi.ts';
import { EYE_A, EYE_B } from '../vision/landmarks.ts';
import type { RoiSampler } from './roiSampler.ts';

/** Landmark indices for the motion flag (PROJECT_SPEC 5.4: nose tip, outer eye corners). */
const NOSE_TIP = 1;
const IOD_A = EYE_A[0];
const IOD_B = EYE_B[3];

export function buildPulseFrame(
  tick: FrameTick,
  points: Point[] | null,
  faceValid: boolean,
  video: HTMLVideoElement,
  sampler: RoiSampler,
): { frame: PulseFrame; polygons: Record<RegionId, Point[] | null> | null } {
  const polygons = points ? regionPolygons(points) : null;
  const nose = points?.[NOSE_TIP];
  const a = points?.[IOD_A];
  const b = points?.[IOD_B];
  return {
    frame: {
      tMs: tick.tMs,
      gapBefore: tick.gap,
      faceValid,
      regions: faceValid && polygons ? sampler.sample(video, polygons) : {},
      motion: nose && a && b ? { noseTip: nose, iodPx: Math.hypot(a.x - b.x, a.y - b.y) } : null,
    },
    polygons,
  };
}
