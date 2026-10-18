import { useEffect, useRef } from 'react';
import { projectChart, type ChartSpec } from '../plot/chart.ts';

const PAD = { left: 48, right: 12, top: 14, bottom: 22 };

function draw(canvas: HTMLCanvasElement, spec: ChartSpec): void {
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
  const c = (name: string) => style.getPropertyValue(name).trim();
  const rect = {
    x: PAD.left,
    y: PAD.top,
    w: Math.max(10, w - PAD.left - PAD.right),
    h: Math.max(10, h - PAD.top - PAD.bottom),
  };
  const g = projectChart(spec, rect);
  ctx.font = '11px system-ui, sans-serif';

  ctx.fillStyle = c('--color-accent-soft');
  for (const b of g.bands) ctx.fillRect(b.x0, rect.y, b.x1 - b.x0, rect.h);

  ctx.strokeStyle = c('--color-border');
  ctx.fillStyle = c('--color-text-muted');
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of g.yTicks) {
    ctx.beginPath();
    ctx.moveTo(rect.x, t.y);
    ctx.lineTo(rect.x + rect.w, t.y);
    ctx.stroke();
    ctx.fillText(t.label, rect.x - 6, t.y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of g.xTicks) ctx.fillText(t.label, t.x, rect.y + rect.h + 6);

  ctx.strokeStyle = c('--color-text');
  ctx.fillStyle = c('--color-text');
  ctx.setLineDash([4, 3]);
  ctx.textBaseline = 'bottom';
  for (const v of g.vlines) {
    ctx.beginPath();
    ctx.moveTo(v.x, rect.y);
    ctx.lineTo(v.x, rect.y + rect.h);
    ctx.stroke();
    ctx.fillText(v.label, v.x, rect.y);
  }
  ctx.setLineDash([]);

  ctx.lineJoin = 'round';
  for (const l of g.lines) {
    ctx.strokeStyle = l.style === 'main' ? c('--color-accent') : c('--color-text-muted');
    ctx.lineWidth = l.style === 'main' ? 2 : 1;
    for (const seg of l.points) {
      ctx.beginPath();
      seg.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }

  ctx.fillStyle = c('--color-text');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (const m of g.markers) {
    ctx.beginPath();
    if (m.shape === 'triangle') {
      ctx.moveTo(m.x, m.y - 4);
      ctx.lineTo(m.x - 4, m.y - 11);
      ctx.lineTo(m.x + 4, m.y - 11);
      ctx.closePath();
    } else {
      ctx.arc(m.x, m.y, 3, 0, 2 * Math.PI);
    }
    ctx.fill();
    if (m.label) ctx.fillText(m.label, m.x + 6, m.y - 4);
  }
}

interface ChartProps {
  title: string;
  spec: ChartSpec | null;
  description: string;
  /** Redraw trigger: the chart redraws when this changes. */
  version: number | string;
  emptyText?: string;
}

/** A hand-drawn canvas chart with a text alternative (no chart library). */
export function Chart({ title, spec, description, version, emptyText }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !spec) return;
    draw(canvas, spec);
    const ro = new ResizeObserver(() => {
      draw(canvas, spec);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
    };
    // `version` identifies the data; `spec` is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, spec === null]);

  return (
    <figure className="plot">
      <figcaption className="plot__title">{title}</figcaption>
      {spec ? (
        <canvas
          ref={ref}
          className="plot__canvas plot__canvas--small"
          role="img"
          aria-label={description}
        />
      ) : (
        <p className="plots__empty plots__empty--small">{emptyText ?? description}</p>
      )}
    </figure>
  );
}
