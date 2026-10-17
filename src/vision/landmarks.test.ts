import { describe, expect, it } from 'vitest';
import { EYE_A, EYE_B, toPixels } from './landmarks.ts';

describe('landmark constants', () => {
  it('eye lists are the PROJECT_SPEC 5.3 starting sets (verified, see docs/METHODS.md)', () => {
    expect(EYE_A).toEqual([33, 160, 158, 133, 153, 144]);
    expect(EYE_B).toEqual([362, 385, 387, 263, 373, 380]);
  });

  it('toPixels scales x by width and y by height', () => {
    expect(toPixels([{ x: 0.5, y: 0.25 }], 640, 480)).toEqual([{ x: 320, y: 120 }]);
  });
});
