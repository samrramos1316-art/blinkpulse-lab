import { describe, expect, it } from 'vitest';
import type { IndicatorSnapshot } from '../app/blinkPipeline.ts';
import type { EciResult, TrendPoint } from '../blink/sleepiness.ts';
import { INDICATOR_COPY } from './copy.ts';
import { describeTrend, indicatorCard, trendLabels } from './indicatorDisplay.ts';
import { INDICATOR } from './strings.ts';

const fail = (reason: Extract<EciResult, { ok: false }>['reason']): EciResult => ({
  ok: false,
  tMs: 0,
  reason,
  coverage: 0.4,
  lost: { noFace: 0, headTurned: 0, gap: 0 },
  medianFps: 30,
});

const value = (eci: number): EciResult => ({
  ok: true,
  tMs: 0,
  eci,
  band: eci >= 2.5 ? 'wellAbove' : eci >= 1.5 ? 'somewhatAbove' : 'near',
  factors: { closedFraction: 0.04, longPerMin: 0, meanBlinkMs: 150, blinksPerMin: 15 },
  ratios: { closedFraction: 1, longClosures: 1, blinkDuration: 1, blinkRate: 1 },
  coverage: 0.95,
  lost: { noFace: 0, headTurned: 0, gap: 0 },
  medianFps: 30,
});

const point = (long: EciResult): TrendPoint => ({ tMs: 0, short: long, long });

const done: IndicatorSnapshot['baseline'] = {
  phase: 'done',
  values: {
    closedFraction: 0.04,
    longPerMin: 0,
    meanBlinkMs: 150,
    blinksPerMin: 15,
    validMs: 180_000,
    blinkCount: 45,
  },
};

describe('indicatorCard', () => {
  it('never shows a number before calibration or baseline', () => {
    const ind: IndicatorSnapshot = {
      baseline: { phase: 'none' },
      latest: point(fail('noBaseline')),
      trend: [],
    };
    expect(indicatorCard(ind, true, false)).toEqual({
      value: '-',
      status: INDICATOR_COPY.notCalibrated,
      gauge: null,
    });
    expect(indicatorCard(ind, true, true).value).toBe('-');
    expect(indicatorCard(ind, true, true).status).toBe(INDICATOR_COPY.noBaseline);
  });

  it('shows baseline progress', () => {
    const ind: IndicatorSnapshot = {
      baseline: { phase: 'running', startedMs: 0, validMs: 90_000, progress: 0.5 },
      latest: point(fail('noBaseline')),
      trend: [],
    };
    expect(indicatorCard(ind, true, true).status).toBe(INDICATOR_COPY.baselineRunning(50));
  });

  it('gated windows say "Not enough data" with the reason', () => {
    const ind: IndicatorSnapshot = { baseline: done, latest: point(fail('noFace')), trend: [] };
    const card = indicatorCard(ind, true, true);
    expect(card.value).toBe('-');
    expect(card.gauge).toBeNull();
    expect(card.status.startsWith(`${INDICATOR.notEnoughData}: `)).toBe(true);
  });

  it('a usable window shows the value, the approved band label, and the gauge', () => {
    const ind: IndicatorSnapshot = { baseline: done, latest: point(value(1.62)), trend: [] };
    expect(indicatorCard(ind, true, true)).toEqual({
      value: '1.6',
      status: INDICATOR.bands.somewhatAbove,
      gauge: 1.62,
    });
    expect(indicatorCard(ind, false, true).value).toBe('-');
  });
});

describe('trend text', () => {
  it('labels whole minutes only', () => {
    const trend = Array.from({ length: 13 }, () => point(value(1)));
    expect(trendLabels(trend)).toEqual([
      '0',
      null,
      null,
      null,
      null,
      null,
      '1',
      null,
      null,
      null,
      null,
      null,
      '2',
    ]);
  });

  it('describes range and missing time', () => {
    const f = (v: number) => v.toFixed(1);
    expect(describeTrend('Index', [], f)).toBe('Index: nothing measured yet.');
    expect(describeTrend('Index', [1, null, null, null, null, null, 1.4], f)).toBe(
      'Index over 1.2 minutes: range 1.0 to 1.4, not enough data for 0.8 minutes.',
    );
    expect(describeTrend('Index', [null, null], f)).toBe(
      'Index over 0.3 minutes: not enough data at any point.',
    );
  });
});
