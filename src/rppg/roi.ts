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

/**
 * Background reference (PROJECT_SPEC 2 Phase 6, 5.4 "Flicker"): two rectangles beside
 * the face, level with the eyes and nose, used to see whether a periodic light change
 * is in the whole scene rather than in the skin. With the face's landmark bounding box
 * (width W, height H), each rectangle starts BACKGROUND.gap x W outside the box and is
 * BACKGROUND.width x W wide, from BACKGROUND.top to BACKGROUND.bottom of H. Starting
 * values, chosen to clear the ears and stay above the shoulders on a frontal face;
 * like the skin regions, to be checked live in the Landmark Explorer. A rectangle
 * less than half inside the frame is dropped.
 */
export const BACKGROUND = { gap: 0.25, width: 0.3, top: 0.2, bottom: 0.6 } as const;
/** Every BACKGROUND_STEP-th row and column of the background is read (cost, Phase 6). */
export const BACKGROUND_STEP = 2;

export function backgroundPolygons(
  points: readonly Point[],
  frameW: number,
  frameH: number,
): Point[][] {
  if (points.length === 0) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  if (!(w > 0 && h > 0)) return [];
  const top = y0 + BACKGROUND.top * h;
  const bottom = y0 + BACKGROUND.bottom * h;
  const bw = BACKGROUND.width * w;
  const rects: [number, number][] = [
    [x0 - BACKGROUND.gap * w - bw, x0 - BACKGROUND.gap * w],
    [x1 + BACKGROUND.gap * w, x1 + BACKGROUND.gap * w + bw],
  ];
  const out: Point[][] = [];
  for (const [left, right] of rects) {
    const insideW = Math.min(right, frameW) - Math.max(left, 0);
    const insideH = Math.min(bottom, frameH) - Math.max(top, 0);
    if (insideW < 0.5 * bw || insideH < 0.5 * (bottom - top)) continue;
    const l = Math.max(left, 0);
    const r = Math.min(right, frameW);
    const t = Math.max(top, 0);
    const b = Math.min(bottom, frameH);
    out.push([
      { x: l, y: t },
      { x: r, y: t },
      { x: r, y: b },
      { x: l, y: b },
    ]);
  }
  return out;
}

/** Combine the statistics of several polygons as if they were one (pixel-weighted). */
export function mergeStats(list: readonly RoiStats[]): RoiStats | null {
  let n = 0;
  let accepted = 0;
  let saturated = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let luma = 0;
  for (const s of list) {
    const a = s.coverage * s.polygonPixels;
    n += s.polygonPixels;
    luma += s.meanLuma * s.polygonPixels;
    saturated += s.saturatedFraction * s.polygonPixels;
    if (a > 0) {
      accepted += a;
      sr += s.r * a;
      sg += s.g * a;
      sb += s.b * a;
    }
  }
  if (n === 0) return null;
  return {
    r: accepted ? sr / accepted : NaN,
    g: accepted ? sg / accepted : NaN,
    b: accepted ? sb / accepted : NaN,
    polygonPixels: n,
    coverage: accepted / n,
    saturatedFraction: saturated / n,
    meanLuma: luma / n,
  };
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
 * the box's pixels row by row (ImageData layout). Pixel centres are tested. `step`
 * > 1 uses every step-th row and column only (the background reference, where a
 * mean light level is enough); polygonPixels then counts the pixels used.
 */
export function roiStats(
  rgba: ArrayLike<number>,
  box: Box,
  poly: readonly Point[],
  step = 1,
): RoiStats {
  let n = 0;
  let accepted = 0;
  let saturated = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let luma = 0;
  for (let row = 0; row < box.h; row += step) {
    const y = box.y + row + 0.5;
    for (let col = 0; col < box.w; col += step) {
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
