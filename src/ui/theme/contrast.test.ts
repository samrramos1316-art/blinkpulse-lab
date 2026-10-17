import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, relativeLuminance } from './contrast.ts';

describe('parseHex', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(parseHex('#0f6b64')).toEqual({ r: 15, g: 107, b: 100 });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects non-hex input', () => {
    expect(() => parseHex('red')).toThrow();
    expect(() => parseHex('#12345')).toThrow();
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#556070', '#556070')).toBeCloseTo(1, 10);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0f6b64', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#0f6b64'),
      12,
    );
  });

  it('matches the known AA boundary grey (#767676 on white is about 4.54)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('luminance is 0 for black and 1 for white', () => {
    expect(relativeLuminance(parseHex('#000'))).toBe(0);
    expect(relativeLuminance(parseHex('#fff'))).toBeCloseTo(1, 12);
  });
});
