import { useEffect, useRef, useState } from 'react';
import type { BlinkPipeline } from '../../app/blinkPipeline.ts';
import { buildEarPlot, describeEarPlot, type EarPlotModel } from '../plot/earPlotModel.ts';

/** Redraw rate: 10 Hz normally, 4 Hz with reduced motion (drawing only, no React state). */
const REDRAW_MS = 100;
const REDRAW_REDUCED_MS = 250;
const DESCRIBE_MS = 2000;

const PAD = { left: 36, right: 64, top: 8, bottom: 22 };

interface Colours {
  text: string;
  muted: string;
  grid: string;
  line: string;
  event: string;
}

function readColours(el: Element): Colours {
  const s = getComputedStyle(el);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    text: v('--color-text'),
    muted: v('--color-text-muted'),
    grid: v('--color-border'),
    line: v('--color-accent'),
    event: v('--color-accent-soft'),
  };
}

const DASH: Record<EarPlotModel['thresholds'][number]['dash'], number[]> = {
  solid: [],
  dashed: [6, 4],
  dotted: [2, 3],
};

function draw(canvas: HTMLCanvasElement, pipeline: BlinkPipeline): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const c = readColours(canvas);
  const rect = {
    x: PAD.left,
    y: PAD.top,
    w: Math.max(10, cssW - PAD.left - PAD.right),
    h: Math.max(10, cssH - PAD.top - PAD.bottom),
  };
  const m = buildEarPlot(pipeline.history(), rect);
  ctx.font = '11px system-ui, sans-serif';

  // Events first, as shaded bands behind everything.
  ctx.fillStyle = c.event;
  for (const e of m.events) ctx.fillRect(e.x0, rect.y, Math.max(2, e.x1 - e.x0), rect.h);

  // Grid and axes.
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = c.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of m.yTicks) {
    ctx.beginPath();
    ctx.moveTo(rect.x, t.y);
    ctx.lineTo(rect.x + rect.w, t.y);
    ctx.stroke();
    ctx.fillText(t.value.toFixed(1), rect.x - 6, t.y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of m.xTicks) ctx.fillText(t.label, t.x, rect.y + rect.h + 6);

  // Thresholds: dash pattern plus a text label, never colour alone.
  ctx.strokeStyle = c.text;
  ctx.fillStyle = c.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const t of m.thresholds) {
    ctx.setLineDash(DASH[t.dash]);
    ctx.beginPath();
    ctx.moveTo(rect.x, t.y);
    ctx.lineTo(rect.x + rect.w, t.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Labels are nudged apart when the lines are close together.
  let lastY = -Infinity;
  for (const t of [...m.thresholds].sort((a, b) => a.y - b.y)) {
    const y = Math.max(t.y, lastY + 12);
    ctx.fillText(t.label, rect.x + rect.w + 6, y);
    lastY = y;
  }

  // EAR trace.
  ctx.strokeStyle = c.line;
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
}

/** EAR trace with thresholds and detected events, drawn on a canvas (no chart library). */
export function EarPlot({ pipeline, active }: { pipeline: BlinkPipeline; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [description, setDescription] = useState(() => describeEarPlot(pipeline.history()));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, pipeline);
    if (!active) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setInterval(
      () => {
        draw(canvas, pipeline);
      },
      reduced ? REDRAW_REDUCED_MS : REDRAW_MS,
    );
    const textId = window.setInterval(() => {
      setDescription(describeEarPlot(pipeline.history()));
    }, DESCRIBE_MS);
    return () => {
      window.clearInterval(id);
      window.clearInterval(textId);
    };
  }, [pipeline, active]);

  return (
    <figure className="plot">
      <figcaption className="plot__title">Eye aspect ratio (EAR)</figcaption>
      <canvas ref={canvasRef} className="plot__canvas" role="img" aria-label={description} />
      <p className="plot__legend">
        Line: EAR (both eyes averaged). Solid: your baseline. Dotted: reopen threshold. Dashed:
        close threshold. Shaded: detected blinks and closures.
      </p>
      <details className="plot__text">
        <summary>Describe this plot</summary>
        <p>{description}</p>
      </details>
    </figure>
  );
}
