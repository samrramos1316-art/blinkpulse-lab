/**
 * Matching detected blink events to hand labels for validation V1 (PROJECT_SPEC
 * 7.2). Pure. A detected event matches a label when their start times differ by
 * at most the tolerance (default +-100 ms). Matching is one-to-one and greedy by
 * smallest time difference, so each label and detection is used at most once.
 */

import { median } from '../dsp/stats.ts';

export interface TimedEvent {
  startMs: number;
  endMs: number;
}

export interface MatchResult {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  /** |detected duration - labelled duration| for each matched pair (ms). */
  durationErrorsMs: number[];
  medianAbsDurationErrorMs: number | null;
  pairs: { label: number; detection: number }[];
}

export const MATCH_TOLERANCE_MS = 100;

export function matchEvents(
  labels: readonly TimedEvent[],
  detections: readonly TimedEvent[],
  toleranceMs = MATCH_TOLERANCE_MS,
): MatchResult {
  const candidates: { label: number; detection: number; diff: number }[] = [];
  labels.forEach((l, i) => {
    detections.forEach((d, j) => {
      const diff = Math.abs(l.startMs - d.startMs);
      if (diff <= toleranceMs) candidates.push({ label: i, detection: j, diff });
    });
  });
  candidates.sort((a, b) => a.diff - b.diff || a.label - b.label || a.detection - b.detection);

  const usedL = new Set<number>();
  const usedD = new Set<number>();
  const pairs: { label: number; detection: number }[] = [];
  for (const c of candidates) {
    if (usedL.has(c.label) || usedD.has(c.detection)) continue;
    usedL.add(c.label);
    usedD.add(c.detection);
    pairs.push({ label: c.label, detection: c.detection });
  }
  pairs.sort((a, b) => a.label - b.label);

  const tp = pairs.length;
  const fp = detections.length - tp;
  const fn = labels.length - tp;
  const precision = detections.length ? tp / detections.length : NaN;
  const recall = labels.length ? tp / labels.length : NaN;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const durationErrorsMs = pairs.map(({ label, detection }) => {
    const l = labels[label] as TimedEvent;
    const d = detections[detection] as TimedEvent;
    return Math.abs(d.endMs - d.startMs - (l.endMs - l.startMs));
  });

  return {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1,
    durationErrorsMs,
    medianAbsDurationErrorMs: durationErrorsMs.length ? median(durationErrorsMs) : null,
    pairs,
  };
}
