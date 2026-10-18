/**
 * What the pulse card and region table show (PROJECT_SPEC 5.4: a BPM value only
 * when quality is at least Fair; otherwise "-" with the reason). Pure.
 */

import type { FaceStatus } from '../app/blinkPipeline.ts';
import type { PulseUpdate, RegionReport } from '../rppg/pulseEstimator.ts';
import type { PulseFlag, QualityLevel } from '../rppg/quality.ts';
import { PULSE_COPY, PULSE_FLAG_TEXT, REGION_LABEL } from './copy.ts';
import { METRIC } from './strings.ts';

export const FLAG_ORDER: readonly PulseFlag[] = [
  'motion',
  'dark',
  'saturated',
  'lightingChange',
  'lowCoverage',
  'lowFps',
  'crossCheck',
];

export function qualityText(level: QualityLevel): string {
  return METRIC.quality[level];
}

/** The most important flag's sentence, or null. */
export function mainFlagText(flags: readonly PulseFlag[]): string | null {
  const f = FLAG_ORDER.find((x) => flags.includes(x));
  return f ? PULSE_FLAG_TEXT[f] : null;
}

export interface PulseCardView {
  value: string;
  status: string;
  level: QualityLevel | null;
}

export function pulseCard(
  p: PulseUpdate | null,
  live: boolean,
  faceStatus: FaceStatus,
): PulseCardView {
  if (!live) return { value: '-', status: 'Not started', level: null };
  if (!p || p.status === 'warmingUp') {
    return {
      value: '-',
      status:
        faceStatus === 'noFace'
          ? PULSE_COPY.noFace
          : faceStatus === 'headTurned'
            ? PULSE_COPY.headTurned
            : PULSE_COPY.warmingUp,
      level: null,
    };
  }
  if (p.status === 'ok' && p.displayBpm !== null && p.level !== null) {
    const notes: string[] = [];
    if (p.fusion?.singleRegion) notes.push(PULSE_COPY.singleRegion);
    if (p.fusion?.regionsDisagree) notes.push(PULSE_COPY.regionsDisagree);
    const flag = mainFlagText(p.globalFlags);
    if (flag) notes.push(flag);
    return { value: p.displayBpm.toFixed(0), status: notes.join(' '), level: p.level };
  }
  const reason =
    p.status === 'fpsTooLow'
      ? PULSE_COPY.fpsTooLow
      : p.status === 'gap'
        ? faceStatus === 'noFace'
          ? PULSE_COPY.noFace
          : faceStatus === 'headTurned'
            ? PULSE_COPY.headTurned
            : PULSE_COPY.gap
        : (mainFlagText([...p.globalFlags, ...p.regions.flatMap((r) => r.flags)]) ??
          PULSE_COPY.notEnoughSignal);
  // A quality chip only describes a measured signal, not an interruption.
  return { value: '-', status: reason, level: p.status === 'notEnoughSignal' ? p.level : null };
}

export interface RegionRow {
  label: string;
  bpm: string;
  quality: string;
  reason: string;
  kept: boolean;
}

export function regionRow(r: RegionReport, kept: boolean): RegionRow {
  const reason =
    r.failure === 'gap'
      ? 'Interrupted in the last 10 s'
      : r.failure === 'tooShort'
        ? 'Collecting data'
        : r.failure === 'noPeak'
          ? 'No pulse peak found'
          : (mainFlagText(r.flags) ?? (kept ? 'Used' : 'Quality too low'));
  return {
    label: REGION_LABEL[r.id],
    bpm: r.bpm === null || r.level === 'poor' ? '-' : r.bpm.toFixed(0),
    quality: r.level ? qualityText(r.level) : '-',
    reason,
    kept,
  };
}
