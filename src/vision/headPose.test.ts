import { describe, expect, it } from 'vitest';
import {
  eulerYXZ,
  headPoseFromMatrix,
  matrixLayout,
  poseWithinLimits,
  relativePose,
  rotationOf,
} from './headPose.ts';

const rad = (d: number) => (d * Math.PI) / 180;
type M3 = number[][];
const mul = (a: M3, b: M3): M3 =>
  [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => [0, 1, 2].reduce((s, k) => s + (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0), 0)),
  );
const Ry = (d: number): M3 => [
  [Math.cos(rad(d)), 0, Math.sin(rad(d))],
  [0, 1, 0],
  [-Math.sin(rad(d)), 0, Math.cos(rad(d))],
];
const Rx = (d: number): M3 => [
  [1, 0, 0],
  [0, Math.cos(rad(d)), -Math.sin(rad(d))],
  [0, Math.sin(rad(d)), Math.cos(rad(d))],
];
const Rz = (d: number): M3 => [
  [Math.cos(rad(d)), -Math.sin(rad(d)), 0],
  [Math.sin(rad(d)), Math.cos(rad(d)), 0],
  [0, 0, 1],
];

/** 4x4 affine (scale s, translation t) flattened in the given layout. */
function affine(R: M3, t: [number, number, number], layout: 'columnMajor' | 'rowMajor', s = 1) {
  const M = [
    [...(R[0] as number[]).map((v) => v * s), t[0]],
    [...(R[1] as number[]).map((v) => v * s), t[1]],
    [...(R[2] as number[]).map((v) => v * s), t[2]],
    [0, 0, 0, 1],
  ];
  const out: number[] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      const [r, c] = layout === 'rowMajor' ? [a, b] : [b, a];
      out.push(M[r]?.[c] ?? NaN);
    }
  }
  return out;
}

describe('head pose from a transformation matrix', () => {
  const T: [number, number, number] = [1.5, -2, -45];

  it('detects the layout from where the translation sits', () => {
    expect(matrixLayout(affine(Ry(10), T, 'columnMajor'))).toBe('columnMajor');
    expect(matrixLayout(affine(Ry(10), T, 'rowMajor'))).toBe('rowMajor');
    expect(matrixLayout(affine(Ry(10), [0, 0, 0], 'rowMajor'))).toBe('unknown');
    expect(matrixLayout([1, 2, 3])).toBe('unknown');
  });

  for (const layout of ['columnMajor', 'rowMajor'] as const) {
    it(`recovers yaw, pitch, roll exactly (${layout}, with scale)`, () => {
      for (const [y, p, r] of [
        [20, 0, 0],
        [0, -15, 0],
        [0, 0, 30],
        [-18, 12, -7],
        [35, -25, 10],
      ] as const) {
        const R = mul(mul(Ry(y), Rx(p)), Rz(r));
        const pose = headPoseFromMatrix(affine(R, T, layout, 1.7));
        expect(pose?.yawDeg).toBeCloseTo(y, 9);
        expect(pose?.pitchDeg).toBeCloseTo(p, 9);
        expect(pose?.rollDeg).toBeCloseTo(r, 9);
      }
    });
  }

  it('reading the transposed (wrong) layout negates a single-axis angle: gating unaffected', () => {
    const data = affine(Ry(22), T, 'columnMajor');
    const wrong = eulerYXZ(rotationOf(data, 'rowMajor'));
    expect(wrong.yawDeg).toBeCloseTo(-22, 9);
  });

  it('relativePose subtracts the reference and wraps to [-180, 180)', () => {
    const r = relativePose(
      { yawDeg: 170, pitchDeg: 30, rollDeg: -5 },
      { yawDeg: -170, pitchDeg: 19, rollDeg: 0 },
    );
    expect(r.yawDeg).toBeCloseTo(-20, 9);
    expect(r.pitchDeg).toBeCloseTo(11, 9);
    expect(r.rollDeg).toBeCloseTo(-5, 9);
  });

  it('gating limits are +-25 deg yaw and +-20 deg pitch, inclusive', () => {
    expect(poseWithinLimits({ yawDeg: 25, pitchDeg: -20, rollDeg: 80 })).toBe(true);
    expect(poseWithinLimits({ yawDeg: -25.1, pitchDeg: 0, rollDeg: 0 })).toBe(false);
    expect(poseWithinLimits({ yawDeg: 0, pitchDeg: 20.1, rollDeg: 0 })).toBe(false);
  });
});
