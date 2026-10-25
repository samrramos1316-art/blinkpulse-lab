/**
 * Stream B orchestration (PROJECT_SPEC 5.4, Patch A). Pure: the caller passes the
 * per-region pixel statistics of each frame (computed from canvas pixels in the
 * browser, or read from a recorded trace by tools/eval_cli.ts).
 *
 * Every HOP_MS, once WINDOW_MS of data exist, each region's window is estimated
 * independently, quality-assessed, and fused; the fused value is smoothed. When the
 * fusion has no Fair-or-better value, the usable regions are pooled into one trace
 * and estimated again (pooled.ts, SPEC_AMENDMENT_03 Patch D), capped at Fair.
 *
 * Flicker (Phase 6): a background reference beside the face is traced like a region.
 * When its green channel has a clean peak at a region's pulse frequency (SQI at that
 * frequency >= FLICKER_SQI), the light of the whole scene varies at that rate, so the
 * region's estimate is flagged and its quality lowered one step.
 */

import type { Point } from '../blink/ear.ts';
import { median } from '../dsp/stats.ts';
import { BpmSmoother, fuseRegions, type FusionResult } from './fusion.ts';
import {
  estimateWindow,
  HOP_MS,
  sqi,
  WINDOW_MS,
  type TraceWindow,
  type WindowEstimate,
  type WindowFailure,
} from './hrEstimator.ts';
import {
  atLeastFair,
  FLICKER_SQI,
  FPS_MIN,
  globalFlags,
  motionFlag,
  regionFlags,
  regionQuality,
  type GlobalFlag,
  type PulseFlag,
  type QualityLevel,
} from './quality.ts';
import { poolWindows, pooledStats } from './pooled.ts';
import type { PowerSpectrum } from '../dsp/spectrum.ts';
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
  /** Background reference beside the face (Phase 6); absent or null when unavailable. */
  background?: RoiStats | null;
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

/** The pooled-region attempt of one hop (Patch D). */
export interface PooledReport {
  /** Regions pooled: window usable, no region flag. */
  regions: RegionId[];
  bpm: number | null;
  sqi: number | null;
  /** Capped at Fair. */
  level: QualityLevel | null;
  flags: PulseFlag[];
  /** The shown value came from this pooled estimate. */
  used: boolean;
  estimate: WindowEstimate | null;
}

/** 'confirming': a first estimate passed the quality gate and waits for the next to agree. */
export type PulseStatus =
  'warmingUp' | 'ok' | 'confirming' | 'notEnoughSignal' | 'fpsTooLow' | 'gap';

export interface PulseUpdate {
  tMs: number;
  status: PulseStatus;
  regions: RegionReport[];
  fusion: FusionResult | null;
  /** Pooled-region attempt, made only when the fusion has no Fair-or-better value. */
  pooled: PooledReport | null;
  /** Window-level flags shared by all regions. */
  globalFlags: GlobalFlag[];
  /** Smoothed BPM (fused, or pooled), only when its quality is at least Fair. */
  displayBpm: number | null;
  level: QualityLevel | null;
  /** Unsmoothed fused estimate of this hop (for logging / validation). */
  rawBpm: number | null;
  fps: number | null;
  /** A background window was available, so estimates were checked for flicker. */
  backgroundChecked: boolean;
}

/** Consecutive hops without a shown value before the smoother forgets its history. */
export const RESET_AFTER_HOPS = 5;

export interface PulseEstimatorOptions {
  /** Pooled-region fallback (Patch D). Default true; false for comparisons. */
  pooling?: boolean;
  /** Confirm the first estimate before showing it (Patch D). Default true. */
  confirmFirst?: boolean;
}

export class PulseEstimator {
  private readonly pooling: boolean;
  private readonly traces = new Map<RegionId, RgbTrace>(
    REGION_IDS.map((id) => [id, new RgbTrace()]),
  );
  private readonly background = new RgbTrace();
  private speeds: { tMs: number; v: number }[] = [];
  private prevMotion: { tMs: number; p: Point; iod: number } | null = null;
  private readonly smoother: BpmSmoother;
  private firstMs: number | null = null;
  private lastHopMs = -Infinity;
  private misses = 0;
  private last: PulseUpdate | null = null;

  constructor(options: PulseEstimatorOptions = {}) {
    this.pooling = options.pooling ?? true;
    this.smoother = new BpmSmoother(options.confirmFirst ?? true);
  }

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
    const bg = frame.background;
    const bgOk =
      bg != null && Number.isFinite(bg.r) && Number.isFinite(bg.g) && Number.isFinite(bg.b);
    this.background.push(
      {
        tMs: frame.tMs,
        r: bgOk ? bg.r : NaN,
        g: bgOk ? bg.g : NaN,
        b: bgOk ? bg.b : NaN,
        valid: bgOk,
        coverage: bg?.coverage ?? 0,
        saturatedFraction: bg?.saturatedFraction ?? 0,
        meanLuma: bg?.meanLuma ?? 0,
      },
      frame.gapBefore,
    );
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
    this.background.reset();
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
      pooled: null,
      globalFlags: [],
      displayBpm: null,
      level: null,
      rawBpm: null,
      fps: null,
      backgroundChecked: false,
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
    const bgSpectrum = this.backgroundSpectrum(tMs);
    const flickerAt = (hz: number) => bgSpectrum !== null && sqi(bgSpectrum, hz) >= FLICKER_SQI;
    const reports: RegionReport[] = [];
    const statsList: WindowStats[] = [];
    const poolable: { id: RegionId; window: TraceWindow; stats: WindowStats }[] = [];
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
      if (regionFlags(w.stats).length === 0) poolable.push({ id, ...w });
      const est = estimateWindow(w.window);
      if (!est.ok) {
        reports.push(failed(id, est.reason));
        continue;
      }
      const q = regionQuality(est, w.stats, g, flickerAt(est.peakHz));
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

    const base = {
      tMs,
      regions: reports,
      globalFlags: global,
      fps,
      backgroundChecked: bgSpectrum !== null,
    };
    if (fps !== null && fps < FPS_MIN) {
      return this.miss({
        ...base,
        status: 'fpsTooLow',
        fusion: null,
        pooled: null,
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
    if (fusion.bpm !== null && atLeastFair(fusion.level)) {
      return this.show({ ...base, fusion, pooled: null }, fusion.bpm, fusion.level);
    }
    const pooled = this.pooling ? poolRegions(poolable, global, flickerAt) : null;
    if (pooled?.used && pooled.bpm !== null && pooled.level !== null) {
      return this.show({ ...base, fusion, pooled }, pooled.bpm, pooled.level);
    }
    const status: PulseStatus = statsList.length === 0 && anyGap ? 'gap' : 'notEnoughSignal';
    return this.miss({
      ...base,
      status,
      fusion,
      pooled,
      displayBpm: null,
      level: fusion.level,
      rawBpm: fusion.bpm,
    });
  }

  /** Spectrum of the background's green channel over the window, or null. */
  private backgroundSpectrum(tMs: number): PowerSpectrum | null {
    const w = this.background.window(tMs);
    if (!w.ok || w.stats.fps < FPS_MIN) return null;
    const est = estimateWindow(w.window, { method: 'green' });
    return est.ok ? est.spectrum : null;
  }

  private show(
    u: Omit<PulseUpdate, 'status' | 'displayBpm' | 'level' | 'rawBpm'>,
    bpm: number,
    level: QualityLevel,
  ): PulseUpdate {
    this.misses = 0;
    const displayBpm = this.smoother.push(bpm);
    if (displayBpm === null) return { ...u, status: 'confirming', displayBpm, level, rawBpm: bpm };
    return { ...u, status: 'ok', displayBpm, level, rawBpm: bpm };
  }

  private miss(u: PulseUpdate): PulseUpdate {
    this.smoother.interrupt();
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

/**
 * Patch D: pool the usable regions and run the same chain and quality rules on the
 * pooled trace. The level is capped at Fair; a value is used only at Fair.
 */
export function poolRegions(
  regions: readonly { id: RegionId; window: TraceWindow; stats: WindowStats }[],
  global: readonly GlobalFlag[],
  flickerAt: (hz: number) => boolean = () => false,
): PooledReport | null {
  const window = poolWindows(regions.map((r) => r.window));
  if (!window) return null;
  const ids = regions.map((r) => r.id);
  const none: PooledReport = {
    regions: ids,
    bpm: null,
    sqi: null,
    level: null,
    flags: [],
    used: false,
    estimate: null,
  };
  if (window.tMs.length < 2) return none;
  const est = estimateWindow(window);
  if (!est.ok) return none;
  const q = regionQuality(
    est,
    pooledStats(regions.map((r) => r.stats)),
    global,
    flickerAt(est.peakHz),
  );
  const level: QualityLevel = q.level === 'good' ? 'fair' : q.level;
  return {
    regions: ids,
    bpm: est.bpm,
    sqi: est.sqi,
    level,
    flags: q.flags,
    used: atLeastFair(level),
    estimate: est,
  };
}
