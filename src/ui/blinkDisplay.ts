/**
 * What the blink cards show. Never a placeholder number: "-" with a reason until
 * the value is backed by enough valid data (SPEC_AMENDMENT_02 Part 3).
 */

import type { BlinkSnapshot } from '../app/blinkPipeline.ts';
import { METRIC } from './strings.ts';

export interface CardView {
  value: string;
  status: string;
}

/** Durations are accurate to about +-1 frame interval (PROJECT_SPEC 5.3). */
export function resolutionNote(frameMs: number | null): string {
  return frameMs === null ? '' : `Durations +-${frameMs.toFixed(0)} ms (1 frame).`;
}

function notReady(s: BlinkSnapshot, live: boolean): string | null {
  if (!live) return 'Not started';
  if (s.calibration.phase === 'running') return 'Calibrating...';
  if (s.thresholds === null) return 'Calibrate to start';
  return null;
}

export function blinkRateCard(s: BlinkSnapshot, live: boolean): CardView {
  const reason = notReady(s, live);
  if (reason) return { value: '-', status: reason };
  const m = s.metrics;
  const parts: string[] = [];
  if (m.lastDurationMs !== null) parts.push(`Last blink ${m.lastDurationMs.toFixed(0)} ms`);
  if (m.medianDurationMs !== null) parts.push(`median ${m.medianDurationMs.toFixed(0)} ms`);
  const detail = parts.length ? `${parts.join(', ')}. ${resolutionNote(s.frameMs)}` : '';
  if (m.ratePerMin === null) {
    return { value: '-', status: `${METRIC.measuring} ${detail}`.trim() };
  }
  return { value: m.ratePerMin.toFixed(0), status: detail || 'No blinks in the last minute.' };
}

export function closedFractionCard(s: BlinkSnapshot, live: boolean): CardView {
  const reason = notReady(s, live);
  if (reason) return { value: '-', status: reason };
  const f = s.metrics.closedFraction;
  if (f === null) return { value: '-', status: METRIC.measuring };
  return {
    value: (f * 100).toFixed(1),
    status: `Of ${(s.metrics.validMs / 1000).toFixed(0)} s with your face in view (last minute).`,
  };
}
