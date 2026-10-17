/**
 * WCAG 2.x contrast helpers. Pure (no DOM) so tests can check the token palette in Node.
 * Definitions: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rgb` or `#rrggbb`. Throws on anything else so bad tokens fail loudly. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Not a hex colour: ${hex}`);
  const digits = m[1];
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function channelToLinear(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** Contrast ratio between two hex colours, from 1 to 21. Order does not matter. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(parseHex(hexA));
  const lb = relativeLuminance(parseHex(hexB));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA minimums. */
export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;
