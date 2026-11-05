/**
 * Simulated camera frames for the Break-it Lab (SPEC_AMENDMENT_05 Patch G). Pure.
 *
 * Frames go through the same PulseEstimator as the app, so a run shows how the real
 * checks respond to a condition. The scene is illustrative: its strengths and noise
 * levels are not measured from faces, so a run says nothing about accuracy on people.
 */

import { median } from '../dsp/stats.ts';
import { normal, rng } from '../dsp/random.ts';
import { PulseEstimator, type PulseFrame, type PulseUpdate } from './pulseEstimator.ts';
import { REGION_IDS, type RegionId, type RoiStats } from './roi.ts';

export const SIM_DURATION_MS = 60_000;
export const SIM_FACE_LOST_FROM_MS = 25_000;
export const SIM_FACE_LOST_TO_MS = 28_000;
/** A shown value further than this from the truth counts as off. */
export const SIM_OFF_BY_BPM = 5;

const SKIN_MEANS = [150, 110, 90] as const;
const BACKGROUND_MEAN = 120;
const PULSE_DIRECTION = [0.45, 1, 0.65] as const;
const HARMONIC = 0.3;
const HEAD_HZ = 0.5;
/** Shading change per unit of head speed, different in each region. */
const HEAD_SHADING = 0.03;
const IOD_PX = 100;
/** A region's red channel counts as saturating above this level. */
const SATURATES_FROM = 230;

export interface SimScenario {
  bpm: number;
  /** Relative pulse amplitude in green, in percent. 0 means no pulse in the signal. */
  pulsePercent: number;
  /** Noise sd per channel of a region's average, in pixel levels (0-255). */
  noiseSd: number;
  /** Multiplies the scene's brightness. 1 is a well-lit scene. */
  light: number;
  /** Relative brightness change of the whole scene, in percent. */
  flickerPercent: number;
  flickerBpm: number;
  /** Peak head speed, in inter-ocular distances per second. */
  headSpeed: number;
  fps: number;
  faceLost: boolean;
  seed: number;
}

export interface SimHop {
  tMs: number;
  update: PulseUpdate;
  /** The face was lost at this moment. */
  faceLost: boolean;
}

export interface SimResult {
  scenario: SimScenario;
  /** Hops after the first 10 s, one per second. */
  hops: SimHop[];
  shown: number;
  /** Null when no value was shown or the signal has no pulse. */
  medianAbsError: number | null;
  maxAbsError: number | null;
  /** Shown values off by more than SIM_OFF_BY_BPM; with no pulse, every shown value. */
  wrong: number;
}

const inFaceLost = (s: SimScenario, tMs: number) =>
  s.faceLost && tMs >= SIM_FACE_LOST_FROM_MS && tMs < SIM_FACE_LOST_TO_MS;

const clip = (v: number) => Math.min(255, Math.max(0, v));

function stats(r: number, g: number, b: number): RoiStats {
  return {
    r,
    g,
    b,
    polygonPixels: 2000,
    coverage: 0.95,
    saturatedFraction: Math.min(1, Math.max(0, (r - SATURATES_FROM) / (255 - SATURATES_FROM))),
    meanLuma: 0.299 * r + 0.587 * g + 0.114 * b,
  };
}

export function simulateFrames(s: SimScenario): PulseFrame[] {
  const gauss = normal(rng(s.seed));
  const noise = () => s.noiseSd * gauss();
  const amplitude = s.pulsePercent / 100;
  const flicker = s.flickerPercent / 100;
  const pulseHz = s.bpm / 60;
  const flickerHz = s.flickerBpm / 60;
  // Sinusoidal head position whose peak speed is headSpeed.
  const headPx = (s.headSpeed * IOD_PX) / (2 * Math.PI * HEAD_HZ);
  const frames: PulseFrame[] = [];
  const count = Math.ceil((SIM_DURATION_MS * s.fps) / 1000);
  for (let k = 0; k < count; k++) {
    const tMs = (k * 1000) / s.fps;
    const t = tMs / 1000;
    const pulse =
      amplitude *
      (Math.sin(2 * Math.PI * pulseHz * t) +
        HARMONIC * Math.sin(2 * Math.PI * 2 * pulseHz * t + 0.8));
    const scene = s.light * (1 + flicker * Math.sin(2 * Math.PI * flickerHz * t));
    const regions: Partial<Record<RegionId, RoiStats>> = {};
    REGION_IDS.forEach((id, i) => {
      const shading =
        1 + HEAD_SHADING * s.headSpeed * Math.sin(2 * Math.PI * HEAD_HZ * t + (i * Math.PI) / 3);
      const channel = (c: 0 | 1 | 2) =>
        clip(SKIN_MEANS[c] * scene * shading * (1 + PULSE_DIRECTION[c] * pulse) + noise());
      regions[id] = stats(channel(0), channel(1), channel(2));
    });
    const backgroundChannel = () => clip(BACKGROUND_MEAN * scene + noise());
    const background = stats(backgroundChannel(), backgroundChannel(), backgroundChannel());
    const lost = inFaceLost(s, tMs);
    frames.push({
      tMs,
      gapBefore: false,
      faceValid: !lost,
      regions: lost ? {} : regions,
      motion: lost
        ? null
        : {
            noseTip: { x: 320 + headPx * Math.sin(2 * Math.PI * HEAD_HZ * t), y: 240 },
            iodPx: IOD_PX,
          },
      background,
    });
  }
  return frames;
}

/** One 60 s run through the app's own estimator. */
export function runScenario(scenario: SimScenario): SimResult {
  const estimator = new PulseEstimator();
  const hops: SimHop[] = [];
  for (const frame of simulateFrames(scenario)) {
    const update = estimator.push(frame);
    if (update && update.status !== 'warmingUp') {
      hops.push({ tMs: update.tMs, update, faceLost: inFaceLost(scenario, update.tMs) });
    }
  }
  const values = hops.flatMap((h) => (h.update.displayBpm === null ? [] : [h.update.displayBpm]));
  const hasPulse = scenario.pulsePercent > 0;
  const errors = hasPulse ? values.map((v) => Math.abs(v - scenario.bpm)) : [];
  return {
    scenario,
    hops,
    shown: values.length,
    medianAbsError: errors.length ? median(errors) : null,
    maxAbsError: errors.length ? Math.max(...errors) : null,
    wrong: hasPulse ? errors.filter((e) => e > SIM_OFF_BY_BPM).length : values.length,
  };
}
