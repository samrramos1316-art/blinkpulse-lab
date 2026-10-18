import type { Point } from '../../blink/ear.ts';
import type { RegionId } from '../../rppg/roi.ts';

/**
 * Where a region's label goes: the forehead's above it, centred; each cheek's below
 * it, aligned to the cheek's outer side, so the two cheek labels never overlap
 * even on a small phone preview. Kept inside the canvas.
 */
export function labelPosition(
  pts: readonly Point[],
  textWidth: number,
  id: RegionId,
  canvasWidth: number,
): { x: number; y: number; baseline: 'bottom' | 'top' } {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const clamp = (x: number) => Math.min(Math.max(x, 2), Math.max(2, canvasWidth - textWidth - 2));
  if (id === 'forehead') {
    return {
      x: clamp((minX + maxX) / 2 - textWidth / 2),
      y: Math.min(...ys) - 3,
      baseline: 'bottom',
    };
  }
  const onLeft = (minX + maxX) / 2 < canvasWidth / 2;
  return {
    x: clamp(onLeft ? maxX - textWidth : minX),
    y: Math.max(...ys) + 3,
    baseline: 'top',
  };
}
