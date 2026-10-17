import { describe, expect, it } from 'vitest';
import type { EarHistory } from '../../app/blinkPipeline.ts';
import type { BlinkEvent } from '../../blink/blinkDetector.ts';
import { buildEarPlot, describeEarPlot, earAxisMax } from './earPlotModel.ts';

const rect = { x: 0, y: 0, w: 200, h: 100 };
const thresholds = { baseline: 0.3, closeEar: 0.21, reopenEar: 0.24 };

function history(ear: number[], fps = 10, events: BlinkEvent[] = []): EarHistory {
  return {
    t: Float64Array.from(ear, (_, i) => (i * 1000) / fps),
    ear: Float64Array.from(ear),
    events,
    thresholds,
  };
}

const event = (startMs: number, durationMs: number): BlinkEvent => ({
  startMs,
  endMs: startMs + durationMs,
  durationMs,
  kind: durationMs < 500 ? 'blink' : 'long_closure',
  lowConfidence: false,
  samplesBelow: 2,
  minEar: 0.05,
});

describe('earAxisMax', () => {
  it('is at least 0.4 and rounds the data maximum up to 0.1', () => {
    expect(earAxisMax([0.2, 0.3], 0.3)).toBe(0.4);
    expect(earAxisMax([0.2, 0.45], null)).toBe(0.5);
    expect(earAxisMax([NaN, 3], null)).toBe(1);
  });
});

describe('buildEarPlot', () => {
  it('maps the last sample to the right edge and EAR 0 to the bottom', () => {
    const m = buildEarPlot(history([0, 0.36]), rect, 1000); // axis max 0.4
    const seg = m.segments[0] ?? [];
    expect(seg.at(-1)?.x).toBeCloseTo(200, 9);
    expect(seg[0]?.y).toBeCloseTo(100, 9);
    expect(seg.at(-1)?.y).toBeCloseTo(100 - (0.36 / 0.4) * 100, 9);
  });

  it('splits the line at invalid samples instead of bridging them', () => {
    const m = buildEarPlot(history([0.3, 0.3, NaN, NaN, 0.3, 0.3, 0.3]), rect);
    expect(m.segments.map((s) => s.length)).toEqual([2, 3]);
  });

  it('drops samples older than the window', () => {
    const ear = Array.from({ length: 300 }, () => 0.3); // 30 s at 10 fps
    const m = buildEarPlot(history(ear), rect, 20_000);
    expect(m.segments[0]?.length).toBe(201); // t in [9.9 s, 29.9 s]
    expect(m.segments[0]?.[0]?.x).toBeCloseTo(0, 9);
  });

  it('places thresholds with distinct dash styles, not only colour', () => {
    const m = buildEarPlot(history([0.3, 0.3]), rect);
    expect(m.thresholds.map((t) => [t.label, t.dash])).toEqual([
      ['baseline', 'solid'],
      ['reopen', 'dotted'],
      ['close', 'dashed'],
    ]);
    expect(m.thresholds[2]?.y).toBeCloseTo(100 - (0.21 / 0.4) * 100, 9);
  });

  it('clips events that started before the window to its left edge', () => {
    const ear = Array.from({ length: 300 }, () => 0.3);
    const m = buildEarPlot(history(ear, 10, [event(9_000, 1_500), event(20_000, 200)]), rect);
    expect(m.events).toHaveLength(2);
    expect(m.events[0]?.x0).toBeCloseTo(0, 9);
    expect(m.events[1]?.x1).toBeGreaterThan(m.events[1]?.x0 ?? Infinity);
  });

  it('labels x ticks in seconds before now', () => {
    const m = buildEarPlot(history([0.3, 0.3]), rect);
    expect(m.xTicks.map((t) => t.label)).toEqual(['-20 s', '-15 s', '-10 s', '-5 s', 'now']);
  });
});

describe('describeEarPlot', () => {
  it('says when there is no data', () => {
    expect(describeEarPlot({ ...history([]), thresholds: null })).toMatch(/no data/);
  });

  it('summarises current value, usable frames, thresholds, and events', () => {
    const text = describeEarPlot(
      history([0.3, NaN, 0.3, 0.28], 10, [event(0, 150), event(100, 180)]),
    );
    expect(text).toContain('Current 0.28.');
    expect(text).toContain('75% of frames usable.');
    expect(text).toContain('close threshold 0.21');
    expect(text).toContain('2 blinks marked; the last lasted 180 ms.');
  });

  it('notes a missing calibration', () => {
    expect(describeEarPlot({ ...history([0.3]), thresholds: null })).toContain('Not calibrated');
  });
});
