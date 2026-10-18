import { useEffect, useRef } from 'react';
import type { OverlayFrame } from '../../app/useBlink.ts';
import type { Point } from '../../blink/ear.ts';
import type { QualityLevel } from '../../rppg/quality.ts';
import { REGION_IDS, type RegionId } from '../../rppg/roi.ts';
import { REGION_LABEL } from '../copy.ts';

/** Line style per quality level: shape, not colour alone (Patch A). */
const DASH: Record<QualityLevel | 'none', number[]> = {
  good: [],
  fair: [6, 4],
  poor: [2, 4],
  none: [1, 5],
};
const LEVEL_TEXT: Record<QualityLevel | 'none', string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  none: '...',
};

interface FaceOverlayProps {
  getOverlay: () => OverlayFrame | null;
  levels: Partial<Record<RegionId, QualityLevel | null>>;
  active: boolean;
}

/**
 * Eye contours and pulse regions drawn over the mirrored preview, each region with a
 * text label ("Forehead: Good"). The preview video uses object-fit: cover and a CSS
 * mirror; the same mapping is applied here in code so labels are not mirrored.
 */
export function FaceOverlay({ getOverlay, levels, active }: FaceOverlayProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef(levels);
  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!active) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    let handle = 0;
    const frame = () => {
      drawOverlay(canvas, ctx, getOverlay(), levelsRef.current);
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(handle);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, getOverlay]);

  return <canvas ref={ref} className="preview__overlay" aria-hidden="true" />;
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  o: OverlayFrame | null,
  levels: Partial<Record<RegionId, QualityLevel | null>>,
): void {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!o || o.width === 0) return;

  // object-fit: cover, then mirror horizontally (as the CSS does for the video).
  const s = Math.max(W / o.width, H / o.height);
  const ox = (W - o.width * s) / 2;
  const oy = (H - o.height * s) / 2;
  const map = (p: Point) => ({ x: W - (ox + p.x * s), y: oy + p.y * s });

  const style = getComputedStyle(canvas);
  const fg = style.getPropertyValue('--color-on-video').trim();
  const shadow = style.getPropertyValue('--color-on-video-shadow').trim();
  const path = (pts: Point[], close: boolean) => {
    ctx.beginPath();
    pts.map(map).forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (close) ctx.closePath();
  };
  const stroke = (dash: number[]) => {
    ctx.setLineDash(dash);
    ctx.lineWidth = 3;
    ctx.strokeStyle = shadow;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = fg;
    ctx.stroke();
  };

  if (o.eyes) {
    for (const eye of o.eyes) {
      // P1..P6 order goes along the upper lid then back along the lower lid.
      path(eye, true);
      stroke([]);
    }
  }
  if (!o.regions) return;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  for (const id of REGION_IDS) {
    const poly = o.regions[id];
    if (!poly) continue;
    const level = levels[id] ?? 'none';
    path(poly, true);
    stroke(DASH[level]);
    const top = poly.map(map).reduce((a, b) => (b.y < a.y ? b : a));
    const text = `${REGION_LABEL[id]}: ${LEVEL_TEXT[level]}`;
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = shadow;
    ctx.strokeText(text, top.x - ctx.measureText(text).width / 2, top.y - 3);
    ctx.fillStyle = fg;
    ctx.fillText(text, top.x - ctx.measureText(text).width / 2, top.y - 3);
  }
}
