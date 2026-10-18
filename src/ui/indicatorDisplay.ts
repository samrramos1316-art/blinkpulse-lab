/**
 * Card and text models for the eye-closure indicator (PROJECT_SPEC 5.7, Patch C2).
 * No DOM: unit-tested in Node.
 */

import type { IndicatorSnapshot } from '../app/blinkPipeline.ts';
import type { EciResult, TrendPoint } from '../blink/sleepiness.ts';
import { EVAL_HOP_MS } from '../blink/sleepiness.ts';
import { INDICATOR_COPY, INDICATOR_REASON_TEXT } from './copy.ts';
import { INDICATOR } from './strings.ts';

export type IndicatorWindow = 'short' | 'long';

export interface IndicatorCardModel {
  value: string;
  status: string;
  /** ECI for the gauge, or null (no gauge when there is no value). */
  gauge: number | null;
}

export const formatEci = (v: number) => v.toFixed(1);

export function notEnoughDataText(r: Extract<EciResult, { ok: false }>): string {
  return `${INDICATOR.notEnoughData}: ${INDICATOR_REASON_TEXT[r.reason]}`;
}

/** The main card shows the 5-minute window. */
export function indicatorCard(
  ind: IndicatorSnapshot,
  live: boolean,
  calibrated: boolean,
): IndicatorCardModel {
  const none = (status: string): IndicatorCardModel => ({ value: '-', status, gauge: null });
  if (!calibrated) return none(INDICATOR_COPY.notCalibrated);
  const b = ind.baseline;
  if (b.phase === 'running') return none(INDICATOR_COPY.baselineRunning(b.progress * 100));
  if (b.phase !== 'done') return none(INDICATOR_COPY.noBaseline);
  if (!live) return none(INDICATOR.subtitle);
  const r = ind.latest.long;
  if (!r.ok) return none(notEnoughDataText(r));
  return { value: formatEci(r.eci), status: INDICATOR.bands[r.band], gauge: r.eci };
}

/** Labels for the trend x axis: whole minutes since the first point, null elsewhere. */
export function trendLabels(trend: readonly TrendPoint[]): (string | null)[] {
  const perMin = 60_000 / EVAL_HOP_MS;
  return trend.map((_, i) => (i % perMin === 0 ? String(i / perMin) : null));
}

const minutes = (m: number) => {
  const r = Math.round(m * 10) / 10;
  return `${String(r)} minute${r === 1 ? '' : 's'}`;
};

/**
 * Text alternative for a trend plot, e.g. "Eye-closure index over 12 minutes
 * (5-minute window): range 0.9 to 1.4, not enough data for 2 minutes."
 */
export function describeTrend(
  label: string,
  values: readonly (number | null)[],
  format: (v: number) => string,
): string {
  const step = EVAL_HOP_MS / 60_000;
  if (values.length === 0) return `${label}: nothing measured yet.`;
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const missing = values.length - present.length;
  const head = `${label} over ${minutes(values.length * step)}`;
  if (present.length === 0) return `${head}: not enough data at any point.`;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const range = lo === hi ? `${format(lo)} throughout` : `range ${format(lo)} to ${format(hi)}`;
  const tail = missing ? `, not enough data for ${minutes(missing * step)}` : '';
  return `${head}: ${range}${tail}.`;
}
