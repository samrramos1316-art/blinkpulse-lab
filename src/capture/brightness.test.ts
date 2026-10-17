import { describe, expect, it } from 'vitest';
import { DARK_LUMA, brightnessHint, meanLuma } from './brightness.ts';

const rgba = (...pixels: [number, number, number][]) =>
  Uint8ClampedArray.from(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));

describe('meanLuma', () => {
  it('uses Rec. 601 weights and ignores alpha', () => {
    expect(meanLuma(rgba([255, 255, 255]))).toBeCloseTo(255, 9);
    expect(meanLuma(rgba([255, 0, 0]))).toBeCloseTo(0.299 * 255, 9);
    expect(meanLuma(rgba([0, 255, 0], [0, 0, 255]))).toBeCloseTo((0.587 + 0.114) * 127.5, 9);
  });

  it('is NaN with no pixels', () => {
    expect(meanLuma([])).toBeNaN();
  });
});

describe('brightnessHint', () => {
  it('classifies around DARK_LUMA', () => {
    expect(brightnessHint(DARK_LUMA - 1)).toBe('tooDark');
    expect(brightnessHint(DARK_LUMA)).toBe('ok');
    expect(brightnessHint(NaN)).toBe('unknown');
  });
});
