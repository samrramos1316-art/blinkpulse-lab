/**
 * Stream B orchestration (PROJECT_SPEC 5.4, Patch A). Pure: the caller passes the
 * per-region pixel statistics of each frame (computed from canvas pixels in the
 * browser, or read from a recorded trace by tools/eval_cli.ts).
 *
 * Every HOP_MS, once WINDOW_MS of data exist, each region's window is estimated
 * independently, quality-assessed, and fused; the fused value is smoothed.
 */

import type { Point } from '../blink/ear.ts';
import { median } from '../dsp/stats.ts';
import { BpmSmoother, fuseRegions, type FusionResult } from './fusion.ts';
import {
  estimateWindow,
  HOP_MS,
  WINDOW_MS,
  type WindowEstimate,
  type WindowFailure,
} from './hrEstimator.ts';
import {
  atLeastFair,
  FPS_MIN,
  globalFlags,
  motionFlag,
  regionFlags,
  regionQuality,
  type GlobalFlag,
  type PulseFlag,
  type QualityLevel,
} from './quality.ts';
import { RgbTrace, type WindowStats } from './rgbTrace.ts';
import { REGION_IDS, type RegionId, type RoiStats } from './roi.ts';

export interface PulseFrame {
  tMs: number;
  /** FrameClock gap before this frame. */
  gapBefore: boolean;
  /** False when the face is lost or the head is turned: no region is usable. */
  faceValid: boolean;
  regions: Partial<Record<RegionId, RoiStats | null>>;
  /** Nose tip and inter-ocular distance (pixels) for the motion flag, or null. */
  motion: { noseTip: Point; iodPx: number } | null;
}

export interface RegionReport {
  id: RegionId;
  bpm: number | null;
  timeBpm: number | null;
  sqi: number | null;
  level: QualityLevel | null;
  flags: PulseFlag[];
  failure: WindowFailure | null;
  estimate: WindowEstimate | null;
}

export type PulseStatus = 'warmingUp' | 'ok' | 'notEnoughSignal' | 'fpsTooLow' | 'gap';

export interface PulseUpdate {
  tMs: number;
  status: PulseStatus;
  regions: RegionReport[];
  fusion: FusionResult | null;
  /** Window-level flags shared by all regions. */
  globalFlags: GlobalFlag[];
  /** Smoothed fused BPM, only when the fused quality is at least Fair. */
  displayBpm: number | null;
  level: QualityLevel | null;
  /** Unsmoothed fused estimate of this hop (for logging / validation). */
  rawBpm: number | null;
  fps: number | null;
}

/** Consecutive hops without a shown value before the smoother forgets its history. */
export const RESET_AFTER_HOPS = 5;

export class PulseEstimator {
  private readonly traces = new Map<RegionId, RgbTrace>(
    REGION_IDS.map((id) => [id, new RgbTrace()]),
  );
  private speeds: { tMs: number; v: number }[] = [];
  private prevMotion: { tMs: number; p: Point; iod: number } | null = null;
  private readonly smoother = new BpmSmoother();
  private firstMs: number | null = null;
  private lastHopMs = -Infinity;
  private misses = 0;
  private last: PulseUpdate | null = null;

  push(frame: PulseFrame): PulseUpdate | null {
    this.firstMs ??= frame.tMs;
    for (const id of REGION_IDS) {
      const s = frame.faceValid ? frame.regions[id] : null;
      const ok = s != null && Number.isFinite(s.r) && Number.isFinite(s.g) && Number.isFinite(s.b);
      (this.traces.get(id) as RgbTrace).push(
        {
          tMs: frame.tMs,
          r: ok ? s.r : NaN,
          g: ok ? s.g : NaN,
          b: ok ? s.b : NaN,
          valid: ok,
          coverage: s?.coverage ?? 0,
          saturatedFraction: s?.saturatedFraction ?? 0,
          meanLuma: s?.meanLuma ?? 0,
        },
        frame.gapBefore,
      );
    }
    this.trackMotion(frame);

    if (frame.tMs - this.firstMs < WINDOW_MS) {
      return this.publish({ ...this.empty(frame.tMs), status: 'warmingUp' });
    }
    if (frame.tMs - this.lastHopMs < HOP_MS) return null;
    this.lastHopMs = frame.tMs;
    return this.publish(this.estimate(frame.tMs));
  }

  get latest(): PulseUpdate | null {
    return this.last;
  }

  reset(): void {
    for (const t of this.traces.values()) t.reset();
    this.speeds = [];
    this.prevMotion = null;
    this.smoother.reset();
    this.firstMs = null;
    this.lastHopMs = -Infinity;
    this.misses = 0;
    this.last = null;
  }

  private publish(u: PulseUpdate): PulseUpdate {
    this.last = u;
    return u;
  }

  private empty(tMs: number): PulseUpdate {
    return {
      tMs,
      status: 'notEnoughSignal',
      regions: [],
      fusion: null,
      globalFlags: [],
      displayBpm: null,
      level: null,
      rawBpm: null,
      fps: null,
    };
  }

  private trackMotion(frame: PulseFrame): void {
    const m = frame.faceValid ? frame.motion : null;
    const prev = this.prevMotion;
    if (m && prev && !frame.gapBefore && m.iodPx > 0) {
      const dt = (frame.tMs - prev.tMs) / 1000;
      if (dt > 0) {
        const d = Math.hypot(m.noseTip.x - prev.p.x, m.noseTip.y - prev.p.y);
        this.speeds.push({ tMs: frame.tMs, v: d / ((m.iodPx + prev.iod) / 2) / dt });
      }
    }
    this.prevMotion = m ? { tMs: frame.tMs, p: m.noseTip, iod: m.iodPx } : null;
    const lo = frame.tMs - WINDOW_MS;
    if ((this.speeds[0]?.tMs ?? Infinity) < lo - 1000)
      this.speeds = this.speeds.filter((s) => s.tMs >= lo);
  }

  private estimate(tMs: number): PulseUpdate {
    const moving = motionFlag(this.speeds.filter((s) => s.tMs >= tMs - WINDOW_MS).map((s) => s.v));
    const reports: RegionReport[] = [];
    const statsList: WindowStats[] = [];
    let anyGap = false;
    let global: GlobalFlag[] = [];
    for (const id of REGION_IDS) {
      const w = (this.traces.get(id) as RgbTrace).window(tMs);
      if (!w.ok) {
        if (w.reason === 'gap') anyGap = true;
        reports.push(failed(id, w.reason));
        continue;
      }
      statsList.push(w.stats);
      const g = globalFlags(w.stats, moving);
      if (g.length > global.length) global = g;
      if (w.stats.fps < FPS_MIN) {
        reports.push({ ...failed(id, null), flags: [...regionFlags(w.stats), ...g] });
        continue;
      }
      const est = estimateWindow(w.window);
      if (!est.ok) {
        reports.push(failed(id, est.reason));
        continue;
      }
      const q = regionQuality(est, w.stats, g);
      reports.push({
        id,
        bpm: est.bpm,
        timeBpm: est.timeBpm,
        sqi: est.sqi,
        level: q.level,
        flags: q.flags,
        failure: null,
        estimate: est,
      });
    }
    const fps = statsList.length ? median(statsList.map((s) => s.fps)) : null;

    const base = { tMs, regions: reports, globalFlags: global, fps };
    if (fps !== null && fps < FPS_MIN) {
      return this.miss({
        ...base,
        status: 'fpsTooLow',
        fusion: null,
        displayBpm: null,
        level: null,
        rawBpm: null,
      });
    }
    const fusion = fuseRegions(
      reports.map((r) => ({
        id: r.id,
        bpm: r.bpm,
        sqi: r.sqi ?? 0,
        level: r.level ?? 'poor',
        regionFlags: r.flags.filter(
          (f): f is 'saturated' | 'dark' | 'lowCoverage' =>
            f === 'saturated' || f === 'dark' || f === 'lowCoverage',
        ),
      })),
    );
    if (fusion.bpm === null || !atLeastFair(fusion.level)) {
      const status: PulseStatus = statsList.length === 0 && anyGap ? 'gap' : 'notEnoughSignal';
      return this.miss({
        ...base,
        status,
        fusion,
        displayBpm: null,
        level: fusion.level,
        rawBpm: fusion.bpm,
      });
    }
    this.misses = 0;
    const displayBpm = this.smoother.push(fusion.bpm);
    return { ...base, status: 'ok', fusion, displayBpm, level: fusion.level, rawBpm: fusion.bpm };
  }

  private miss(u: PulseUpdate): PulseUpdate {
    this.misses++;
    if (this.misses >= RESET_AFTER_HOPS) this.smoother.reset();
    return u;
  }
}

function failed(id: RegionId, failure: WindowFailure | 'gap' | 'tooShort' | null): RegionReport {
  return {
    id,
    bpm: null,
    timeBpm: null,
    sqi: null,
    level: null,
    flags: [],
    failure: failure === 'gap' || failure === 'tooShort' || failure === 'noPeak' ? failure : null,
    estimate: null,
  };
}
