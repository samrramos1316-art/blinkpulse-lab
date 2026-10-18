/**
 * Multi-region fusion (SPEC_AMENDMENT_01 Patch A, fixed before validation) and the
 * output smoothing from PROJECT_SPEC 5.4. Pure.
 */

import { median } from '../dsp/stats.ts';
import { lowerLevel, type QualityLevel, type RegionFlag } from './quality.ts';
import type { RegionId } from './roi.ts';

/** Regions disagreeing by more than this lower the quality one step (Patch A). */
export const AGREEMENT_BPM = 8;

export interface RegionResult {
  id: RegionId;
  bpm: number | null;
  sqi: number;
  level: QualityLevel;
  /** Region-specific flags (saturation, low luminance, mask coverage). */
  regionFlags: readonly RegionFlag[];
}

export type FusionFailure = 'noRegion';

export interface FusionResult {
  bpm: number | null;
  level: QualityLevel;
  kept: RegionId[];
  /** Max - min BPM across kept regions (null with fewer than 2). */
  agreementBpm: number | null;
  singleRegion: boolean;
  regionsDisagree: boolean;
  reason: FusionFailure | null;
}

/** Weighted median: the smallest value whose cumulative weight reaches half the total. */
export function weightedMedian(values: readonly number[], weights: readonly number[]): number {
  const pairs = values.map((v, i) => [v, weights[i] ?? 0] as const).sort((a, b) => a[0] - b[0]);
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  if (!(total > 0)) return median(values);
  let acc = 0;
  for (const [v, w] of pairs) {
    acc += w;
    if (acc >= total / 2 - 1e-12) return v;
  }
  return (pairs.at(-1) as readonly [number, number])[0];
}

export function fuseRegions(regions: readonly RegionResult[]): FusionResult {
  // 1. Keep Fair-or-better regions without a region-specific flag.
  const kept = regions.filter(
    (r): r is RegionResult & { bpm: number } =>
      r.bpm !== null && r.level !== 'poor' && r.regionFlags.length === 0,
  );
  if (kept.length === 0) {
    return {
      bpm: null,
      level: 'poor',
      kept: [],
      agreementBpm: null,
      singleRegion: false,
      regionsDisagree: false,
      reason: 'noRegion',
    };
  }
  // 2. SQI-weighted median; 3. agreement = max - min.
  const bpms = kept.map((r) => r.bpm);
  const bpm = weightedMedian(
    bpms,
    kept.map((r) => r.sqi),
  );
  const agreementBpm = kept.length >= 2 ? Math.max(...bpms) - Math.min(...bpms) : null;
  // 4. Confidence: best kept level, capped at Fair for one region, lowered on disagreement.
  let level: QualityLevel = kept.some((r) => r.level === 'good') ? 'good' : 'fair';
  const singleRegion = kept.length === 1;
  if (singleRegion && level === 'good') level = 'fair';
  const regionsDisagree = agreementBpm !== null && agreementBpm > AGREEMENT_BPM;
  if (regionsDisagree) level = lowerLevel(level);
  return {
    bpm,
    level,
    kept: kept.map((r) => r.id),
    agreementBpm,
    singleRegion,
    regionsDisagree,
    reason: null,
  };
}

/** Jump rule (PROJECT_SPEC 5.4): a jump larger than this needs confirmation. */
export const JUMP_BPM = 12;
/** Two jumped estimates within this of each other count as consistent (starting value). */
export const CONSISTENT_BPM = 6;
export const SMOOTH_COUNT = 5;

/**
 * Median of the last 5 accepted estimates. An estimate more than 12 BPM from the
 * current median is held; it is accepted (with the held one) only when the next
 * estimate is within 6 BPM of it.
 */
export class BpmSmoother {
  private accepted: number[] = [];
  private pending: number | null = null;

  push(bpm: number): number {
    const current = this.value;
    if (current === null || Math.abs(bpm - current) <= JUMP_BPM) {
      this.pending = null;
      this.accept(bpm);
    } else if (this.pending !== null && Math.abs(bpm - this.pending) <= CONSISTENT_BPM) {
      this.accept(this.pending);
      this.accept(bpm);
      this.pending = null;
    } else {
      this.pending = bpm;
    }
    return this.value ?? bpm;
  }

  get value(): number | null {
    return this.accepted.length ? median(this.accepted) : null;
  }

  reset(): void {
    this.accepted = [];
    this.pending = null;
  }

  private accept(bpm: number): void {
    this.accepted.push(bpm);
    if (this.accepted.length > SMOOTH_COUNT) this.accepted.shift();
  }
}
