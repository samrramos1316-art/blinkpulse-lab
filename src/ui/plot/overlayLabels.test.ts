import { describe, expect, it } from 'vitest';
import { labelPosition } from './overlayLabels.ts';

const box = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('labelPosition', () => {
  // A small phone preview: cheeks 40 px apart, labels 95 px wide.
  const W = 330;
  const left = labelPosition(box(120, 150, 150, 180), 95, 'leftCheek', W);
  const right = labelPosition(box(190, 150, 220, 180), 95, 'rightCheek', W);

  it('puts cheek labels below the cheeks, aligned outward, without overlap', () => {
    expect(left).toEqual({ x: 150 - 95, y: 183, baseline: 'top' });
    expect(right).toEqual({ x: 190, y: 183, baseline: 'top' });
    expect(left.x + 95).toBeLessThanOrEqual(right.x);
  });

  it('centres the forehead label above it', () => {
    expect(labelPosition(box(130, 60, 200, 90), 100, 'forehead', W)).toEqual({
      x: 115,
      y: 57,
      baseline: 'bottom',
    });
  });

  it('keeps labels inside the canvas', () => {
    expect(labelPosition(box(5, 100, 30, 120), 95, 'rightCheek', 120).x).toBe(2);
    expect(labelPosition(box(300, 100, 328, 120), 95, 'rightCheek', W).x).toBe(W - 95 - 2);
  });
});
