import { useEffect, useRef } from 'react';
import { buildSeriesPlot } from '../plot/seriesPlotModel.ts';

const PAD = { left: 40, right: 12, top: 8, bottom: 22 };

function draw(
  canvas: HTMLCanvasElement,
  values: readonly (number | null)[],
  fixedMax: number | undefined,
  format: (v: number) => string,
  usable: readonly boolean[] | undefined,
  integer: boolean,
): void {
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
  const rect = {
    x: PAD.left,
    y: PAD.top,
    w: Math.max(10, w - PAD.left - PAD.right),
    h: Math.max(10, h - PAD.top - PAD.bottom),
  };
  const m = buildSeriesPlot(values, rect, fixedMax, usable, integer);
  ctx.font = '11px system-ui, sans-serif';

  // Unusable minutes: hatched columns (pattern, not colour alone).
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
      ctx.fillText(format(t.value), rect.x - 6, t.y);
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of m.xTicks) ctx.fillText(t.label, t.x, rect.y + rect.h + 6);

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
  for (const p of m.markers) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

interface SeriesPlotProps {
  title: string;
  values: readonly (number | null)[];
  description: string;
  format: (v: number) => string;
  fixedMax?: number;
  /** Per-minute usable flags; unusable minutes are hatched. */
  usable?: readonly boolean[];
  /** Whole-number series (counts). */
  integer?: boolean;
}

/** One per-minute session plot (canvas, hand-drawn). Redraws only when its data changes. */
export function SeriesPlot({
  title,
  values,
  description,
  format,
  fixedMax,
  usable,
  integer = false,
}: SeriesPlotProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = values
    .map((x, i) => `${x === null ? 'n' : x.toFixed(4)}${usable?.[i] === false ? 'u' : ''}`)
    .join(',');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    draw(canvas, values, fixedMax, format, usable, integer);
    const ro = new ResizeObserver(() => {
      draw(canvas, values, fixedMax, format, usable, integer);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
    };
    // `key` captures the values; re-draw only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fixedMax, integer]);

  return (
    <figure className="plot">
      <figcaption className="plot__title">{title}</figcaption>
      <canvas
        ref={ref}
        className="plot__canvas plot__canvas--small"
        role="img"
        aria-label={description}
      />
    </figure>
  );
}
