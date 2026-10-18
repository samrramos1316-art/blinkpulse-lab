import { useEffect, useRef, useState } from 'react';
import { buildSeriesPlot, indexAtX, type RefLine } from '../plot/seriesPlotModel.ts';

const PAD = { left: 40, right: 12, top: 10, bottom: 22 };

interface DrawOptions {
  values: readonly (number | null)[];
  fixedMax: number | undefined;
  format: (v: number) => string;
  usable: readonly boolean[] | undefined;
  integer: boolean;
  xLabels: readonly (string | null)[] | undefined;
  markers: boolean;
  refLines: readonly RefLine[];
  /** Point under the pointer (readout), or null. */
  hover: number | null;
  pointName: (i: number) => string;
}

function plotRect(w: number, h: number) {
  return {
    x: PAD.left,
    y: PAD.top,
    w: Math.max(10, w - PAD.left - PAD.right),
    h: Math.max(10, h - PAD.top - PAD.bottom),
  };
}

function draw(canvas: HTMLCanvasElement, o: DrawOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(canvas);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const rect = plotRect(w, h);
  const m = buildSeriesPlot(o.values, rect, o.fixedMax, o.usable, o.integer, o.xLabels, o.refLines);
  ctx.font = '11px system-ui, sans-serif';

  // Unusable points: hatched columns (pattern, not colour alone).
  ctx.save();
  ctx.strokeStyle = v('--color-border');
  ctx.lineWidth = 1;
  for (const g of m.gaps) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x0, rect.y, g.x1 - g.x0, rect.h);
    ctx.clip();
    for (let x = g.x0 - rect.h; x < g.x1; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, rect.y + rect.h);
      ctx.lineTo(x + rect.h, rect.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle = v('--color-border');
  ctx.fillStyle = v('--color-text-muted');
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of m.yTicks) {
    ctx.beginPath();
    ctx.moveTo(rect.x, t.y);
    ctx.lineTo(rect.x + rect.w, t.y);
    ctx.stroke();
    if (t.value === 0 || t.value === m.yMax || t.value === m.yMax / 2) {
      ctx.fillText(o.format(t.value), rect.x - 6, t.y);
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of m.xTicks) ctx.fillText(t.label, t.x, rect.y + rect.h + 6);

  // Reference lines: dashed, each with a text label (never colour alone).
  ctx.save();
  ctx.strokeStyle = v('--color-text-muted');
  ctx.fillStyle = v('--color-text-muted');
  ctx.setLineDash([5, 4]);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  for (const r of m.refs) {
    ctx.beginPath();
    ctx.moveTo(rect.x, r.y);
    ctx.lineTo(rect.x + rect.w, r.y);
    ctx.stroke();
    ctx.fillText(r.label, rect.x + rect.w - 2, r.y - 2);
  }
  ctx.restore();

  ctx.strokeStyle = v('--color-accent');
  ctx.fillStyle = v('--color-accent');
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (const seg of m.segments) {
    ctx.beginPath();
    seg.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }
  for (const p of o.markers ? m.markers : []) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Pointer readout: a vertical line and the value of the point under it.
  if (o.hover !== null && o.values.length > 0) {
    const i = o.hover;
    const x = rect.x + ((i + 0.5) / o.values.length) * rect.w;
    const value = o.values[i];
    const text = `${o.pointName(i)}: ${
      value === null || value === undefined || !Number.isFinite(value) ? 'no data' : o.format(value)
    }`;
    ctx.save();
    ctx.strokeStyle = v('--color-text');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.h);
    ctx.stroke();
    ctx.font = '600 11px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 12;
    const bx = Math.min(Math.max(x - tw / 2, rect.x), rect.x + rect.w - tw);
    ctx.fillStyle = v('--color-surface');
    ctx.strokeStyle = v('--color-border');
    ctx.beginPath();
    ctx.roundRect(bx, rect.y, tw, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = v('--color-text');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 6, rect.y + 10);
    ctx.restore();
  }
}

interface SeriesPlotProps {
  title: string;
  values: readonly (number | null)[];
  description: string;
  format: (v: number) => string;
  fixedMax?: number;
  /** Per-point usable flags; unusable points are hatched. */
  usable?: readonly boolean[];
  /** Whole-number series (counts). */
  integer?: boolean;
  /** Custom x-axis labels (null = no tick); default: minute numbers. */
  xLabels?: readonly (string | null)[];
  /** Draw a dot on every point (off for dense series). */
  markers?: boolean;
  /** Dashed horizontal reference lines with labels. */
  refLines?: readonly RefLine[];
  /** Taller canvas for the main plot of a view. */
  size?: 'small' | 'large';
  /** Shown next to the title, e.g. the latest value. */
  headline?: string | undefined;
  /** Name of point i in the pointer readout; default "Minute i+1". */
  pointName?: (i: number) => string;
}

const NO_REFS: readonly RefLine[] = [];
const minuteName = (i: number) => `Minute ${String(i + 1)}`;

/** One time-series plot (canvas, hand-drawn). Redraws only when its data or the pointer changes. */
export function SeriesPlot({
  title,
  values,
  description,
  format,
  fixedMax,
  usable,
  integer = false,
  xLabels,
  markers = true,
  refLines = NO_REFS,
  size = 'small',
  headline,
  pointName = minuteName,
}: SeriesPlotProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const key = values
    .map((x, i) => `${x === null ? 'n' : x.toFixed(4)}${usable?.[i] === false ? 'u' : ''}`)
    .join(',');
  const refKey = refLines.map((r) => `${String(r.value)}:${r.label}`).join('|');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const opts: DrawOptions = {
      values,
      fixedMax,
      format,
      usable,
      integer,
      xLabels,
      markers,
      refLines,
      hover,
      pointName,
    };
    draw(canvas, opts);
    const ro = new ResizeObserver(() => {
      draw(canvas, opts);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
    };
    // `key` and `refKey` capture the data; re-draw only when they or the pointer change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refKey, fixedMax, integer, markers, hover]);

  return (
    <figure className="plot">
      <figcaption className="plot__head">
        <span className="plot__title">{title}</span>
        {headline ? <span className="plot__headline tabular">{headline}</span> : null}
      </figcaption>
      <canvas
        ref={ref}
        className={`plot__canvas ${size === 'large' ? 'plot__canvas--large' : 'plot__canvas--small'}`}
        role="img"
        aria-label={description}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(indexAtX(e.clientX - r.left, values.length, plotRect(r.width, r.height)));
        }}
        onPointerLeave={() => {
          setHover(null);
        }}
      />
    </figure>
  );
}
