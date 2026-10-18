/**
 * Geometry and text description for the per-minute session plots (Patch B).
 * No DOM. Unusable minutes (value null) break the line and are drawn as hatched
 * columns, so a gap can never be read as a zero.
 */

import type { PlotPoint, PlotRect } from './earPlotModel.ts';

export interface SeriesPlotModel {
  /** Line pieces through consecutive usable minutes. */
  segments: PlotPoint[][];
  /** A marker on every usable minute (a lone minute still shows). */
  markers: PlotPoint[];
  /** Unusable minutes as columns [x0, x1]. */
  gaps: { x0: number; x1: number }[];
  yTicks: { value: number; y: number }[];
  xTicks: { label: string; x: number }[];
  yMax: number;
  /** Horizontal reference lines (e.g. baseline = 1), inside the axis range. */
  refs: { y: number; label: string }[];
}

export interface RefLine {
  value: number;
  label: string;
}

/** Smallest of 1, 2, 2.5, 5 x 10^k that is >= v (v > 0). */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v - 1e-12) return m * p;
  return 10 * p;
}

/**
 * `usable[i]` false draws minute i as a gap column. A usable minute with no value
 * (e.g. no blinks, so no median duration) breaks the line but is not a gap.
 * Without `usable`, every null is treated as unusable.
 */
export function buildSeriesPlot(
  values: readonly (number | null)[],
  rect: PlotRect,
  fixedMax?: number,
  usable?: readonly boolean[],
  /** Counts: the axis maximum is an even integer >= 2, so the mid tick is a whole number. */
  integer = false,
  /** Custom x labels (null = no tick there); default: 1-based minute numbers. */
  xLabels?: readonly (string | null)[],
  refLines: readonly RefLine[] = [],
): SeriesPlotModel {
  const n = Math.max(values.length, 1);
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  // Reference lines stay in view (with headroom so their labels fit).
  const dataMax = Math.max(0, ...finite, ...refLines.map((r) => r.value * 1.1));
  const yMax = fixedMax ?? (integer ? Math.max(2, 2 * Math.ceil(dataMax / 2)) : niceCeil(dataMax));
  const colW = rect.w / n;
  const xOf = (i: number) => rect.x + (i + 0.5) * colW;
  const yOf = (v: number) => rect.y + rect.h - (Math.min(v, yMax) / yMax) * rect.h;

  const segments: PlotPoint[][] = [];
  const markers: PlotPoint[] = [];
  const gaps: SeriesPlotModel['gaps'] = [];
  let current: PlotPoint[] = [];
  values.forEach((v, i) => {
    const missing = v === null || !Number.isFinite(v);
    if (!(usable?.[i] ?? !missing))
      gaps.push({ x0: rect.x + i * colW, x1: rect.x + (i + 1) * colW });
    if (v === null || missing) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    const p = { x: xOf(i), y: yOf(v) };
    current.push(p);
    markers.push(p);
  });
  if (current.length) segments.push(current);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: f * yMax, y: yOf(f * yMax) }));
  const labelled = xLabels
    ? values.flatMap((_, i) => {
        const label = xLabels[i];
        return label == null ? [] : [{ i, label }];
      })
    : values.map((_, i) => ({ i, label: String(i + 1) }));
  const step = Math.max(1, Math.ceil(labelled.length / 8));
  const xTicks: SeriesPlotModel['xTicks'] = [];
  for (let k = 0; k < labelled.length; k += step) {
    const t = labelled[k] as { i: number; label: string };
    xTicks.push({ label: t.label, x: xOf(t.i) });
  }

  const refs = refLines
    .filter((r) => r.value >= 0 && r.value <= yMax)
    .map((r) => ({ y: yOf(r.value), label: r.label }));

  return { segments, markers, gaps, yTicks, xTicks, yMax, refs };
}

/** Index of the point under x (pointer readout), or null outside the plot. */
export function indexAtX(x: number, n: number, rect: PlotRect): number | null {
  if (n === 0 || x < rect.x || x > rect.x + rect.w) return null;
  return Math.min(n - 1, Math.max(0, Math.floor(((x - rect.x) / rect.w) * n)));
}

/**
 * Text alternative, e.g. "Blink rate over 24 minutes: range 8 to 17 per minute,
 * 3 minutes unusable." (Patch B example wording).
 */
export function describeSeries(
  label: string,
  values: readonly (number | null)[],
  format: (v: number) => string,
  usable?: readonly boolean[],
): string {
  const n = values.length;
  if (n === 0) return `${label}: no minutes measured yet.`;
  const ok = (i: number) => usable?.[i] ?? values[i] !== null;
  const unusable = values.filter((_, i) => !ok(i)).length;
  const present = values.filter((v, i): v is number => ok(i) && v !== null && Number.isFinite(v));
  const noValue = n - unusable - present.length;
  const minutes = (k: number) => `${String(k)} minute${k === 1 ? '' : 's'}`;
  const head = `${label} over ${minutes(n)}`;
  if (unusable === n) return `${head}: no usable minutes.`;
  const extra = noValue ? `, no value in ${minutes(noValue)} without blinks` : '';
  if (present.length === 0) return `${head}: no values${extra}, ${minutes(unusable)} unusable.`;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const range =
    lo === hi
      ? `${format(lo)} in every minute with a value`
      : `range ${format(lo)} to ${format(hi)}`;
  return `${head}: ${range}${extra}, ${minutes(unusable)} unusable.`;
}
