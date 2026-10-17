import { describe, expect, it } from 'vitest';
import { earBothEyes, eyeAspectRatio, eyeAspectRatioAt, type Point } from './ear.ts';

/** Six points of an idealised eye: width w, lid opening h at both lid points. */
function eye(
  cx: number,
  cy: number,
  w: number,
  h: number,
): [Point, Point, Point, Point, Point, Point] {
  return [
    { x: cx - w / 2, y: cy }, // P1 corner
    { x: cx - w / 6, y: cy - h / 2 }, // P2 upper
    { x: cx + w / 6, y: cy - h / 2 }, // P3 upper
    { x: cx + w / 2, y: cy }, // P4 corner
    { x: cx + w / 6, y: cy + h / 2 }, // P5 lower
    { x: cx - w / 6, y: cy + h / 2 }, // P6 lower
  ];
}

describe('eyeAspectRatio', () => {
  it('equals opening / width for a symmetric eye', () => {
    expect(eyeAspectRatio(eye(100, 100, 30, 9))).toBeCloseTo(0.3, 12);
    expect(eyeAspectRatio(eye(100, 100, 30, 0))).toBeCloseTo(0, 12);
  });

  it('is scale and translation invariant', () => {
    const a = eyeAspectRatio(eye(10, 10, 30, 9));
    const b = eyeAspectRatio(eye(500, 300, 90, 27));
    expect(a).toBeCloseTo(b, 12);
  });

  it('is NaN when the corners coincide', () => {
    const p = eye(0, 0, 0, 5);
    expect(eyeAspectRatio(p)).toBeNaN();
  });

  it('pixel vs normalised coordinates: normalised space distorts EAR on a 4:3 frame', () => {
    // Real eye in pixels on a 640x480 frame: EAR 0.3.
    const px = eye(320, 240, 40, 12);
    const truth = eyeAspectRatio(px);
    const norm = px.map((p) => ({ x: p.x / 640, y: p.y / 480 })) as typeof px;
    // In normalised units x is divided by 640 and y by 480, inflating EAR by 640/480.
    expect(eyeAspectRatio(norm)).toBeCloseTo(truth * (640 / 480), 9);
    expect(truth).toBeCloseTo(0.3, 12);
  });
});

describe('eyeAspectRatioAt / earBothEyes', () => {
  const points: Point[] = [];
  eye(100, 100, 30, 9).forEach((p, i) => (points[10 + i] = p)); // indices 10..15
  eye(200, 100, 30, 6).forEach((p, i) => (points[20 + i] = p)); // indices 20..25

  it('picks points by index list', () => {
    expect(eyeAspectRatioAt(points, [10, 11, 12, 13, 14, 15])).toBeCloseTo(0.3, 12);
  });

  it('per-frame value is the mean of both eyes, each kept', () => {
    const r = earBothEyes(points, [10, 11, 12, 13, 14, 15], [20, 21, 22, 23, 24, 25]);
    expect(r.eyeA).toBeCloseTo(0.3, 12);
    expect(r.eyeB).toBeCloseTo(0.2, 12);
    expect(r.ear).toBeCloseTo(0.25, 12);
  });

  it('throws on a missing landmark', () => {
    expect(() => eyeAspectRatioAt(points, [10, 11, 12, 13, 14, 99])).toThrow(RangeError);
  });
});
