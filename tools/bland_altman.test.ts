import { describe, expect, it } from 'vitest';
import { agreement } from '../src/rppg/agreement.ts';
import { blandAltmanSvg, niceTicks } from './bland_altman.ts';

describe('niceTicks', () => {
  it('gives round, evenly spaced values inside the range', () => {
    expect(niceTicks(61.3, 88.7)).toEqual([65, 70, 75, 80, 85]);
    expect(niceTicks(-1.2, 1.2)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });

  it('handles a range with no width', () => {
    expect(niceTicks(3, 3)).toEqual([3]);
  });
});

describe('blandAltmanSvg', () => {
  const est = [70, 72, 80, 60];
  const ref = [71, 70, 74, 62];

  it('draws one point per pair and the same statistics as the agreement report', () => {
    const svg = blandAltmanSvg(est, ref, 'good-light');
    const a = agreement(est, ref);
    expect(svg.match(/<circle /g)).toHaveLength(4);
    expect(svg).toContain('n = 4 paired values');
    expect(svg).toContain(`Bias +${a.bias.toFixed(2)}`);
    expect(svg).toContain(`Upper +${a.loaHigh.toFixed(2)}`);
    expect(svg).toContain(`Lower ${a.loaLow.toFixed(2)}`);
    expect(svg).not.toContain('NaN');
  });

  it('puts a point at the right height: larger difference, higher up', () => {
    const svg = blandAltmanSvg([72, 80], [72, 70], 'x');
    const cy = [...svg.matchAll(/<circle [^>]*cy="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(cy).toHaveLength(2);
    expect(cy[1] as number).toBeLessThan(cy[0] as number);
  });

  it('tells the limit lines from the bias line without colour', () => {
    const svg = blandAltmanSvg(est, ref, 'x');
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(2);
    expect(svg.match(/stroke-width="2"/g)).toHaveLength(1);
  });

  it('with one pair, shows the bias but no limits', () => {
    const svg = blandAltmanSvg([70], [72], 'x');
    expect(svg.match(/<circle /g)).toHaveLength(1);
    expect(svg).not.toContain('Upper');
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('limits need at least 2 values');
  });

  it('with no pairs, says so and draws no points', () => {
    const svg = blandAltmanSvg([], [], 'x');
    expect(svg).toContain('No values were paired');
    expect(svg).not.toContain('<circle');
    expect(svg).not.toContain('NaN');
  });

  it('escapes the title', () => {
    const svg = blandAltmanSvg(est, ref, 'a<b & "c"');
    expect(svg).toContain('a&lt;b &amp; &quot;c&quot;');
    expect(svg).not.toContain('a<b');
  });
});
