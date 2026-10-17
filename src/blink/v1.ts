/**
 * Validation V1 file formats and scoring (PROJECT_SPEC 7.2). Pure: shared by the
 * in-browser V1 tool and `tools/score_v1.ts`, so both score exactly the same way.
 *
 * All times are milliseconds of VIDEO media time (frame presentation timestamps),
 * so hand labels and detections share one timeline. Files hold numbers only: no
 * images, no landmarks.
 */

import type { BlinkKind } from './blinkDetector.ts';
import {
  MATCH_TOLERANCE_MS,
  matchEvents,
  type MatchResult,
  type TimedEvent,
} from './eventMatching.ts';

export interface DetectedEvent extends TimedEvent {
  kind: BlinkKind;
  lowConfidence: boolean;
  minEar: number;
}

export interface V1Detections {
  /** End of the 10 s calibration (ms media time). Nothing before it can be detected. */
  calibrationEndMs: number;
  events: DetectedEvent[];
}

export interface FrameRow {
  tMs: number;
  ear: number;
  earA: number;
  earB: number;
  valid: boolean;
  face: boolean;
}

const KINDS: readonly BlinkKind[] = ['blink', 'long_closure', 'extended_closure'];
const num = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '');

export function detectionsToCsv(d: V1Detections): string {
  const lines = [
    `# calibration_end_ms=${num(d.calibrationEndMs)}`,
    'start_ms,end_ms,duration_ms,kind,low_confidence,min_ear',
    ...d.events.map((e) =>
      [
        num(e.startMs),
        num(e.endMs),
        num(e.endMs - e.startMs),
        e.kind,
        e.lowConfidence ? '1' : '0',
        num(e.minEar),
      ].join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function labelsToCsv(labels: readonly TimedEvent[]): string {
  const sorted = [...labels].sort((a, b) => a.startMs - b.startMs);
  return `${['start_ms,end_ms', ...sorted.map((l) => `${num(l.startMs)},${num(l.endMs)}`)].join('\n')}\n`;
}

export function framesToCsv(rows: readonly FrameRow[]): string {
  const lines = ['t_ms,ear,ear_a,ear_b,valid,face'];
  for (const r of rows) {
    lines.push(
      [
        num(r.tMs),
        num(r.ear),
        num(r.earA),
        num(r.earB),
        r.valid ? '1' : '0',
        r.face ? '1' : '0',
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

interface Table {
  meta: Map<string, string>;
  header: string[];
  rows: { line: number; cells: string[] }[];
}

function readTable(text: string): Table {
  const meta = new Map<string, string>();
  let header: string[] | null = null;
  const rows: Table['rows'] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = /^#\s*([\w-]+)\s*=\s*(.*)$/.exec(line);
      if (m?.[1] !== undefined && m[2] !== undefined) meta.set(m[1], m[2].trim());
      continue;
    }
    const cells = line.split(',').map((c) => c.trim());
    if (header === null) header = cells;
    else rows.push({ line: i + 1, cells });
  }
  return { meta, header: header ?? [], rows };
}

function column(t: Table, name: string): number {
  const i = t.header.indexOf(name);
  if (i < 0) throw new Error(`Missing column "${name}"`);
  return i;
}

function numberAt(cells: string[], i: number, line: number, name: string): number {
  const v = Number(cells[i]);
  if (cells[i] === undefined || cells[i] === '' || !Number.isFinite(v)) {
    throw new Error(`Line ${line.toFixed(0)}: "${name}" is not a number`);
  }
  return v;
}

export function parseLabelsCsv(text: string): TimedEvent[] {
  const t = readTable(text);
  const s = column(t, 'start_ms');
  const e = column(t, 'end_ms');
  return t.rows.map(({ line, cells }) => {
    const startMs = numberAt(cells, s, line, 'start_ms');
    const endMs = numberAt(cells, e, line, 'end_ms');
    if (!(endMs > startMs))
      throw new Error(`Line ${line.toFixed(0)}: end_ms must be after start_ms`);
    return { startMs, endMs };
  });
}

export function parseDetectionsCsv(text: string): V1Detections {
  const t = readTable(text);
  const cal = Number(t.meta.get('calibration_end_ms'));
  if (!Number.isFinite(cal)) throw new Error('Missing "# calibration_end_ms=" line');
  const s = column(t, 'start_ms');
  const e = column(t, 'end_ms');
  const k = column(t, 'kind');
  const lc = column(t, 'low_confidence');
  const me = column(t, 'min_ear');
  const events = t.rows.map(({ line, cells }) => {
    const kind = cells[k] as BlinkKind;
    if (!KINDS.includes(kind)) throw new Error(`Line ${line.toFixed(0)}: unknown kind`);
    return {
      startMs: numberAt(cells, s, line, 'start_ms'),
      endMs: numberAt(cells, e, line, 'end_ms'),
      kind,
      lowConfidence: cells[lc] === '1',
      minEar: Number(cells[me]),
    };
  });
  return { calibrationEndMs: cal, events };
}

export interface V1Score extends MatchResult {
  /** Labels scored (after the calibration window). */
  labelsScored: number;
  /** Labels inside the calibration window, excluded because nothing is detected there. */
  labelsExcluded: number;
  detectionsScored: number;
  toleranceMs: number;
}

/**
 * Score detections against hand labels (PROJECT_SPEC 7.2, +-100 ms on start time).
 * Every detected kind counts: a hand-labelled blink the detector called a long
 * closure is still a match, and its duration error shows the disagreement.
 */
export function scoreV1(
  labels: readonly TimedEvent[],
  detections: V1Detections,
  toleranceMs = MATCH_TOLERANCE_MS,
): V1Score {
  const scored = labels.filter((l) => l.startMs >= detections.calibrationEndMs);
  const dets = detections.events.filter((d) => d.startMs >= detections.calibrationEndMs);
  return {
    ...matchEvents(scored, dets, toleranceMs),
    labelsScored: scored.length,
    labelsExcluded: labels.length - scored.length,
    detectionsScored: dets.length,
    toleranceMs,
  };
}

const pct = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');

/** Plain-text report, the same in the browser and the CLI. */
export function formatV1Score(s: V1Score): string {
  return [
    `Labels scored: ${s.labelsScored.toFixed(0)} (excluded in calibration window: ${s.labelsExcluded.toFixed(0)})`,
    `Detections scored: ${s.detectionsScored.toFixed(0)}`,
    `Tolerance: +-${s.toleranceMs.toFixed(0)} ms on start time`,
    `TP ${s.truePositives.toFixed(0)}, FP ${s.falsePositives.toFixed(0)}, FN ${s.falseNegatives.toFixed(0)}`,
    `Precision ${pct(s.precision)}, recall ${pct(s.recall)}, F1 ${pct(s.f1)}`,
    `Median absolute duration error: ${
      s.medianAbsDurationErrorMs === null ? 'n/a' : `${s.medianAbsDurationErrorMs.toFixed(1)} ms`
    } (n = ${s.durationErrorsMs.length.toFixed(0)})`,
  ].join('\n');
}

/**
 * Index of the frame shown at media time `tMs`: the last frame whose presentation
 * time is <= tMs (binary search; `frameTimes` ascending). -1 before the first frame.
 */
export function frameIndexAt(frameTimes: ArrayLike<number>, tMs: number): number {
  let lo = 0;
  let hi = frameTimes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((frameTimes[mid] as number) <= tMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Media time (ms) to seek to so that frame `i` is shown: the midpoint between its
 * presentation time and the next one, which avoids landing on a frame boundary.
 */
export function seekTimeForFrame(frameTimes: ArrayLike<number>, i: number): number {
  const n = frameTimes.length;
  const k = Math.min(Math.max(i, 0), n - 1);
  const t = frameTimes[k] as number;
  const next = frameTimes[k + 1];
  if (next !== undefined) return (t + next) / 2;
  const prev = frameTimes[k - 1];
  return prev !== undefined ? t + (t - prev) / 2 : t;
}
