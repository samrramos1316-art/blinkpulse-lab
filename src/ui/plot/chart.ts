/**
 * Generic 2-D chart geometry for the hand-drawn canvas plots (no chart library).
 * Pure: maps data to pixels and builds ticks; the canvas component only draws.
 */

import type { PlotPoint, PlotRect } from './earPlotModel.ts';

export interface AxisSpec {
  min: number;
  max: number;
  ticks: readonly number[];
  format: (v: number) => string;
}

export interface ChartSpec {
  x: AxisSpec;
  y: AxisSpec;
  /** Line series; NaN values break the line. */
  lines: { xs: ArrayLike<number>; ys: ArrayLike<number>; style: 'main' | 'muted' }[];
  /** Point markers (shape distinguishes them, not colour alone). */
  markers: { x: number; y: number; shape: 'circle' | 'triangle'; label?: string }[];
  /** Shaded x ranges (e.g. the pass band). */
  bands: { x0: number; x1: number; label?: string }[];
  /** Vertical reference lines. */
  vlines: { x: number; label: string }[];
}

export interface ChartGeometry {
  lines: { points: PlotPoint[][]; style: 'main' | 'muted' }[];
  markers: (PlotPoint & { shape: 'circle' | 'triangle'; label?: string })[];
  bands: { x0: number; x1: number; label?: string }[];
  vlines: { x: number; label: string }[];
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; label: string }[];
}

export function projectChart(spec: ChartSpec, rect: PlotRect): ChartGeometry {
  const sx = (v: number) => rect.x + ((v - spec.x.min) / (spec.x.max - spec.x.min || 1)) * rect.w;
  const sy = (v: number) =>
    rect.y +
    rect.h -
    ((Math.min(spec.y.max, Math.max(spec.y.min, v)) - spec.y.min) /
      (spec.y.max - spec.y.min || 1)) *
      rect.h;
  const inX = (v: number) => v >= spec.x.min && v <= spec.x.max;

  const lines = spec.lines.map((l) => {
    const pieces: PlotPoint[][] = [];
    let cur: PlotPoint[] = [];
    for (let i = 0; i < l.xs.length; i++) {
      const x = l.xs[i] as number;
      const y = l.ys[i] as number;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !inX(x)) {
        if (cur.length) pieces.push(cur);
        cur = [];
        continue;
      }
      cur.push({ x: sx(x), y: sy(y) });
    }
    if (cur.length) pieces.push(cur);
    return { points: pieces, style: l.style };
  });

  const clampX = (v: number) => sx(Math.min(spec.x.max, Math.max(spec.x.min, v)));
  return {
    lines,
    markers: spec.markers
      .filter((m) => inX(m.x) && Number.isFinite(m.y))
      .map((m) => ({
        x: sx(m.x),
        y: sy(m.y),
        shape: m.shape,
        ...(m.label ? { label: m.label } : {}),
      })),
    bands: spec.bands.map((b) => ({
      x0: clampX(b.x0),
      x1: clampX(b.x1),
      ...(b.label ? { label: b.label } : {}),
    })),
    vlines: spec.vlines.filter((v) => inX(v.x)).map((v) => ({ x: sx(v.x), label: v.label })),
    xTicks: spec.x.ticks.filter(inX).map((v) => ({ x: sx(v), label: spec.x.format(v) })),
    yTicks: spec.y.ticks
      .filter((v) => v >= spec.y.min && v <= spec.y.max)
      .map((v) => ({ y: sy(v), label: spec.y.format(v) })),
  };
}

/** Symmetric range around the data (for waveforms): +-max|y|, at least `floor`. */
export function symmetricRange(ys: ArrayLike<number>, floor = 1e-9): number {
  let m = floor;
  for (let i = 0; i < ys.length; i++) {
    const v = Math.abs(ys[i] as number);
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
}
