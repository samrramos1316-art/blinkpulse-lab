/**
 * Geometry and text description for the EAR plot (PROJECT_SPEC 5.5 "EAR trace with
 * thresholds"). No DOM: the canvas component only draws what this returns, so the
 * scaling, gap handling, and text alternative are unit-tested in Node.
 */

import type { EarHistory } from '../../app/blinkPipeline.ts';
import type { BlinkKind } from '../../blink/blinkDetector.ts';

export interface PlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlotPoint {
  x: number;
  y: number;
}

export interface EarPlotModel {
  /** Polyline pieces; invalid samples (NaN) split the line so gaps stay visible. */
  segments: PlotPoint[][];
  thresholds: { label: string; value: number; y: number; dash: 'solid' | 'dashed' | 'dotted' }[];
  events: { x0: number; x1: number; kind: BlinkKind }[];
  yTicks: { value: number; y: number }[];
  xTicks: { label: string; x: number }[];
  yMax: number;
}

export const PLOT_WINDOW_MS = 20_000;

/** Upper EAR axis limit: at least 0.4, else the data maximum rounded up to 0.1. */
export function earAxisMax(ear: ArrayLike<number>, baseline: number | null): number {
  let max = baseline ?? 0;
  for (let i = 0; i < ear.length; i++) {
    const v = ear[i] as number;
    if (Number.isFinite(v) && v > max) max = v;
  }
  return Math.min(1, Math.max(0.4, Math.ceil(max * 1.1 * 10) / 10));
}

export function buildEarPlot(
  h: EarHistory,
  rect: PlotRect,
  windowMs = PLOT_WINDOW_MS,
): EarPlotModel {
  const n = h.t.length;
  const tEnd = n ? (h.t[n - 1] as number) : 0;
  const tStart = tEnd - windowMs;
  const yMax = earAxisMax(h.ear, h.thresholds?.baseline ?? null);
  const xOf = (t: number) => rect.x + ((t - tStart) / windowMs) * rect.w;
  const yOf = (v: number) => rect.y + rect.h - (v / yMax) * rect.h;

  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = h.t[i] as number;
    const v = h.ear[i] as number;
    if (t < tStart) continue;
    if (Number.isFinite(v)) {
      current.push({ x: xOf(t), y: yOf(Math.min(v, yMax)) });
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);

  const thresholds: EarPlotModel['thresholds'] = [];
  if (h.thresholds) {
    const { baseline, reopenEar, closeEar } = h.thresholds;
    thresholds.push(
      { label: 'baseline', value: baseline, y: yOf(baseline), dash: 'solid' },
      { label: 'reopen', value: reopenEar, y: yOf(reopenEar), dash: 'dotted' },
      { label: 'close', value: closeEar, y: yOf(closeEar), dash: 'dashed' },
    );
  }

  const events = h.events
    .filter((e) => e.endMs >= tStart)
    .map((e) => ({ x0: xOf(Math.max(e.startMs, tStart)), x1: xOf(e.endMs), kind: e.kind }));

  const yTicks: EarPlotModel['yTicks'] = [];
  for (let v = 0; v <= yMax + 1e-9; v += 0.1) {
    const value = Math.round(v * 10) / 10;
    yTicks.push({ value, y: yOf(value) });
  }
  const xTicks: EarPlotModel['xTicks'] = [];
  for (let s = windowMs / 1000; s >= 0; s -= 5) {
    xTicks.push({ label: s === 0 ? 'now' : `-${s.toFixed(0)} s`, x: xOf(tEnd - s * 1000) });
  }

  return { segments, thresholds, events, yTicks, xTicks, yMax };
}

const KIND_LABEL: Record<BlinkKind, string> = {
  blink: 'blink',
  long_closure: 'long closure',
  extended_closure: 'extended closure',
};

/** Text alternative for the plot (PROJECT_SPEC 5.5: "plot descriptions available as text"). */
export function describeEarPlot(h: EarHistory, windowMs = PLOT_WINDOW_MS): string {
  const n = h.t.length;
  if (n === 0) return 'Eye aspect ratio plot: no data yet.';
  const tEnd = h.t[n - 1] as number;
  let valid = 0;
  let inWindow = 0;
  for (let i = 0; i < n; i++) {
    if ((h.t[i] as number) < tEnd - windowMs) continue;
    inWindow++;
    if (Number.isFinite(h.ear[i])) valid++;
  }
  const last = h.ear[n - 1] as number;
  const parts = [
    `Eye aspect ratio over the last ${(windowMs / 1000).toFixed(0)} s.`,
    Number.isFinite(last) ? `Current ${last.toFixed(2)}.` : 'Current value not available.',
    `${Math.round((100 * valid) / inWindow).toFixed(0)}% of frames usable.`,
  ];
  if (h.thresholds) {
    parts.push(
      `Baseline ${h.thresholds.baseline.toFixed(2)}, close threshold ${h.thresholds.closeEar.toFixed(2)}, reopen threshold ${h.thresholds.reopenEar.toFixed(2)}.`,
    );
  } else {
    parts.push('Not calibrated: no thresholds yet.');
  }
  const shown = h.events.filter((e) => e.endMs >= tEnd - windowMs);
  if (shown.length) {
    const counts = new Map<BlinkKind, number>();
    for (const e of shown) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    const list = [...counts].map(([k, c]) => `${c.toFixed(0)} ${KIND_LABEL[k]}${c > 1 ? 's' : ''}`);
    const lastEvent = shown[shown.length - 1];
    parts.push(
      `${list.join(', ')} marked${lastEvent ? `; the last lasted ${lastEvent.durationMs.toFixed(0)} ms` : ''}.`,
    );
  } else if (h.thresholds) {
    parts.push('No blinks marked.');
  }
  return parts.join(' ');
}
