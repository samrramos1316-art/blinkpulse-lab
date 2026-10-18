/**
 * Skin regions of interest from face landmarks, and per-frame pixel statistics
 * inside a polygon mask (PROJECT_SPEC 5.4, SPEC_AMENDMENT_01 Patch A). Pure: the
 * caller passes RGBA pixels of the region's bounding box.
 *
 * Index choices (verification record in docs/METHODS.md, "rPPG regions"):
 * - Forehead (PROJECT_SPEC 5.4 candidates): a parallelogram whose bottom corners
 *   are the brow points 105 and 334 moved up by 25% of the vector 9 -> 10, and
 *   whose top corners are moved up by 65%. On MediaPipe's canonical face model, 10
 *   is the topmost midline vertex, 9 the midline vertex at brow level, and 105/334 a
 *   mirror-symmetric brow pair.
 * - Cheeks (Patch A): the convex hull of canonical-model vertices with
 *   2.6 <= |x| <= 4.45 cm (outside the nose wing, inside the outer eye corner) and
 *   -2.0 <= y <= 1.2 cm (above the lips, below the eye contour). The two hulls are
 *   exact mirror images.
 * - Live verification in the Landmark Explorer: NOT YET DONE.
 */

import type { Point } from '../blink/ear.ts';

export type RegionId = 'forehead' | 'leftCheek' | 'rightCheek';
export const REGION_IDS: readonly RegionId[] = ['forehead', 'leftCheek', 'rightCheek'];

export const FOREHEAD = { brows: [105, 334], midline: [9, 10], from: 0.25, to: 0.65 } as const;
/** Subject's right cheek (same side as eye A, landmark 33). */
export const RIGHT_CHEEK = [118, 205, 36, 119] as const;
/** Subject's left cheek (mirror of RIGHT_CHEEK). */
export const LEFT_CHEEK = [347, 425, 266, 348] as const;

/** Polygons in pixel coordinates; null for a region whose landmarks are missing. */
export function regionPolygons(points: readonly Point[]): Record<RegionId, Point[] | null> {
  const at = (i: number) => points[i];
  const poly = (idx: readonly number[]) => {
    const out = idx.map(at);
    return out.every((p): p is Point => p !== undefined) ? out : null;
  };
  const b1 = at(FOREHEAD.brows[0]);
  const b2 = at(FOREHEAD.brows[1]);
  const m0 = at(FOREHEAD.midline[0]);
  const m1 = at(FOREHEAD.midline[1]);
  let forehead: Point[] | null = null;
  if (b1 && b2 && m0 && m1) {
    const vx = m1.x - m0.x;
    const vy = m1.y - m0.y;
    const up = (p: Point, f: number): Point => ({ x: p.x + f * vx, y: p.y + f * vy });
    forehead = [
      up(b1, FOREHEAD.from),
      up(b2, FOREHEAD.from),
      up(b2, FOREHEAD.to),
      up(b1, FOREHEAD.to),
    ];
  }
  return { forehead, leftCheek: poly(LEFT_CHEEK), rightCheek: poly(RIGHT_CHEEK) };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Integer pixel bounding box of a polygon, clipped to the frame; null if empty. */
export function boundingBox(poly: readonly Point[], frameW: number, frameH: number): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const x = Math.max(0, Math.floor(x0));
  const y = Math.max(0, Math.floor(y0));
  const xe = Math.min(frameW, Math.ceil(x1));
  const ye = Math.min(frameH, Math.ceil(y1));
  return xe > x && ye > y ? { x, y, w: xe - x, h: ye - y } : null;
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Point;
    const b = poly[j] as Point;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Pixel rejection levels (0-255). Saturated: any channel at or above SATURATED.
 * Dark: luma below DARK. Starting values, not tuned on real video.
 */
export const SATURATED = 250;
export const DARK = 20;

export interface RoiStats {
  /** Means over accepted pixels (NaN when none). */
  r: number;
  g: number;
  b: number;
  /** Pixels inside the polygon. */
  polygonPixels: number;
  /** Accepted / polygon pixels (Patch A "mask coverage"). */
  coverage: number;
  saturatedFraction: number;
  /** Mean luma (Rec. 601) over all polygon pixels, 0-255. */
  meanLuma: number;
}

/**
 * Statistics of the pixels inside `poly` (frame pixel coordinates). `rgba` holds
 * the box's pixels row by row (ImageData layout). Pixel centres are tested.
 */
export function roiStats(rgba: ArrayLike<number>, box: Box, poly: readonly Point[]): RoiStats {
  let n = 0;
  let accepted = 0;
  let saturated = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let luma = 0;
  for (let row = 0; row < box.h; row++) {
    const y = box.y + row + 0.5;
    for (let col = 0; col < box.w; col++) {
      if (!pointInPolygon(box.x + col + 0.5, y, poly)) continue;
      const k = 4 * (row * box.w + col);
      const r = rgba[k] as number;
      const g = rgba[k + 1] as number;
      const b = rgba[k + 2] as number;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      n++;
      luma += l;
      if (r >= SATURATED || g >= SATURATED || b >= SATURATED) {
        saturated++;
        continue;
      }
      if (l < DARK) continue;
      accepted++;
      sr += r;
      sg += g;
      sb += b;
    }
  }
  return {
    r: accepted ? sr / accepted : NaN,
    g: accepted ? sg / accepted : NaN,
    b: accepted ? sb / accepted : NaN,
    polygonPixels: n,
    coverage: n ? accepted / n : 0,
    saturatedFraction: n ? saturated / n : 0,
    meanLuma: n ? luma / n : 0,
  };
}
