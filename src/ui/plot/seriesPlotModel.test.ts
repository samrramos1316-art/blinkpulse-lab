import { describe, expect, it } from 'vitest';
import { buildSeriesPlot, describeSeries, niceCeil } from './seriesPlotModel.ts';

const rect = { x: 0, y: 0, w: 100, h: 50 };

describe('niceCeil', () => {
  it('rounds up to 1, 2, 2.5, or 5 times a power of ten', () => {
    expect([0.07, 0.2, 0.21, 3, 17, 26, 100].map(niceCeil)).toEqual([
      0.1, 0.2, 0.25, 5, 20, 50, 100,
    ]);
    expect(niceCeil(0)).toBe(1);
  });
});

describe('buildSeriesPlot', () => {
  it('breaks the line at unusable minutes and draws them as gap columns', () => {
    const m = buildSeriesPlot([10, 12, null, 8, null], rect);
    expect(m.segments.map((s) => s.length)).toEqual([2, 1]);
    expect(m.markers).toHaveLength(3);
    expect(m.gaps).toEqual([
      { x0: 40, x1: 60 },
      { x0: 80, x1: 100 },
    ]);
    expect(m.yMax).toBe(20);
  });

  it('centres minutes in their columns and maps 0 to the bottom', () => {
    const m = buildSeriesPlot([0, 5], rect, 5);
    expect(m.markers[0]).toEqual({ x: 25, y: 50 });
    expect(m.markers[1]).toEqual({ x: 75, y: 0 });
  });

  it('labels at most about 8 minutes on the x axis', () => {
    const m = buildSeriesPlot(
      Array.from({ length: 30 }, () => 1),
      rect,
    );
    expect(m.xTicks.map((t) => t.label)).toEqual(['1', '5', '9', '13', '17', '21', '25', '29']);
  });
});

describe('describeSeries', () => {
  const f = (v: number) => `${v.toFixed(0)} per minute`;

  it('gives range and unusable minutes', () => {
    expect(describeSeries('Blink rate', [8, null, 17, 12, null, null], f)).toBe(
      'Blink rate over 6 minutes: range 8 per minute to 17 per minute, 3 minutes unusable.',
    );
  });

  it('handles no data, no usable minutes, and a constant value', () => {
    expect(describeSeries('Blink rate', [], f)).toBe('Blink rate: no minutes measured yet.');
    expect(describeSeries('Blink rate', [null], f)).toBe(
      'Blink rate over 1 minute: no usable minutes.',
    );
    expect(describeSeries('Long closures', [2, 2], (v) => v.toFixed(0))).toBe(
      'Long closures over 2 minutes: 2 in every minute with a value, 0 minutes unusable.',
    );
  });

  it('separates usable minutes without a value from unusable minutes', () => {
    const ms = (v: number) => `${v.toFixed(0)} ms`;
    expect(describeSeries('Median duration', [150, null, null], ms, [true, true, false])).toBe(
      'Median duration over 3 minutes: 150 ms in every minute with a value, no value in 1 minute without blinks, 1 minute unusable.',
    );
  });
});

describe('buildSeriesPlot with usable flags', () => {
  it('draws only unusable minutes as gaps', () => {
    const m = buildSeriesPlot([150, null, null], rect, undefined, [true, true, false]);
    expect(m.gaps).toHaveLength(1);
    expect(m.gaps[0]?.x0).toBeCloseTo(200 / 3, 9);
    expect(m.markers).toHaveLength(1);
  });

  it('count axes use an even whole-number maximum', () => {
    expect(buildSeriesPlot([0, 1], rect, undefined, undefined, true).yMax).toBe(2);
    expect(buildSeriesPlot([3], rect, undefined, undefined, true).yMax).toBe(4);
  });
});
