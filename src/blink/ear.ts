/**
 * Eye Aspect Ratio (PROJECT_SPEC 5.3; Soukupova & Cech 2016):
 *
 *   EAR = ( |P2 - P6| + |P3 - P5| ) / ( 2 |P1 - P4| )
 *
 * P1 and P4 are the eye corners, P2/P3 the upper lid, P6/P5 the lower lid
 * directly below them. Points must be in PIXELS: landmarks are normalised
 * separately in x and y, so distances in normalised units are distorted by the
 * frame's aspect ratio (CLAUDE.md).
 */

export interface Point {
  x: number;
  y: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** EAR of one eye from its six points [P1..P6] in pixels. NaN if degenerate. */
export function eyeAspectRatio(p: readonly [Point, Point, Point, Point, Point, Point]): number {
  const [p1, p2, p3, p4, p5, p6] = p;
  const width = dist(p1, p4);
  if (!(width > 0)) return NaN;
  return (dist(p2, p6) + dist(p3, p5)) / (2 * width);
}

/** Six-index list P1..P6 for one eye. */
export type EyeIndices = readonly [number, number, number, number, number, number];

/** EAR of one eye, picking its points from a full landmark array (pixels). */
export function eyeAspectRatioAt(points: readonly Point[], idx: EyeIndices): number {
  const pick = (i: number): Point => {
    const pt = points[i];
    if (!pt) throw new RangeError(`eyeAspectRatioAt: missing landmark ${i}`);
    return pt;
  };
  return eyeAspectRatio([
    pick(idx[0]),
    pick(idx[1]),
    pick(idx[2]),
    pick(idx[3]),
    pick(idx[4]),
    pick(idx[5]),
  ]);
}

export interface EarReading {
  /** Mean of the two eyes (the per-frame value). */
  ear: number;
  eyeA: number;
  eyeB: number;
}

/** Per-frame EAR = mean of both eyes; each eye is kept too, for checking. */
export function earBothEyes(
  points: readonly Point[],
  eyeA: EyeIndices,
  eyeB: EyeIndices,
): EarReading {
  const a = eyeAspectRatioAt(points, eyeA);
  const b = eyeAspectRatioAt(points, eyeB);
  return { ear: (a + b) / 2, eyeA: a, eyeB: b };
}
