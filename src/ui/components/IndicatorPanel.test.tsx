import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IndicatorSnapshot } from '../../app/blinkPipeline.ts';
import type { EciResult } from '../../blink/sleepiness.ts';
import { INDICATOR_COPY } from '../copy.ts';
import { INDICATOR } from '../strings.ts';
import { IndicatorPanel } from './IndicatorPanel.tsx';

const controls = { calibrated: true, live: true, start: () => undefined, cancel: () => undefined };

const ok: EciResult = {
  ok: true,
  tMs: 0,
  eci: 1.1,
  band: 'near',
  factors: { closedFraction: 0.05, longPerMin: 0.4, meanBlinkMs: 160, blinksPerMin: 12 },
  ratios: { closedFraction: 1.25, longClosures: 1, blinkDuration: 1.07, blinkRate: 0.8 },
  coverage: 0.9,
  lost: { noFace: 0, headTurned: 0, gap: 0 },
  medianFps: 30,
};
const gap: EciResult = {
  ok: false,
  tMs: 0,
  reason: 'gap',
  coverage: 0.3,
  lost: { noFace: 0, headTurned: 0, gap: 0 },
  medianFps: 30,
};

const done: IndicatorSnapshot = {
  baseline: {
    phase: 'done',
    values: {
      closedFraction: 0.04,
      longPerMin: 0,
      meanBlinkMs: 150,
      blinksPerMin: 15,
      validMs: 180_000,
      blinkCount: 45,
    },
  },
  latest: { tMs: 0, short: ok, long: ok },
  trend: [
    { tMs: 0, short: ok, long: ok },
    { tMs: 10_000, short: gap, long: gap },
    { tMs: 20_000, short: ok, long: ok },
  ],
};

describe('IndicatorPanel', () => {
  it('asks for calibration first', () => {
    const html = renderToString(
      <IndicatorPanel
        indicator={{ ...done, baseline: { phase: 'none' } }}
        controls={{ ...controls, calibrated: false }}
      />,
    );
    expect(html).toContain(INDICATOR_COPY.notCalibrated);
  });

  it('offers to record the baseline, with no trend before it exists', () => {
    const html = renderToString(
      <IndicatorPanel indicator={{ ...done, baseline: { phase: 'none' } }} controls={controls} />,
    );
    expect(html).toContain(INDICATOR_COPY.baselineStart);
    expect(html).not.toContain('Eye-closure index');
  });

  it('shows the approved wording, factor plots, blink rate kept apart, and the summary', () => {
    const html = renderToString(<IndicatorPanel indicator={done} controls={controls} />);
    expect(html).toContain(INDICATOR.title);
    for (const label of Object.values(INDICATOR.factors)) expect(html).toContain(label);
    expect(html).toContain('Blink rate (not part of the indicator)');
    expect(html).toContain(INDICATOR_COPY.provisional);
    // Text alternative mentions the gap rather than a zero.
    expect(html).toContain('not enough data for 0.2 minutes');
    expect(html).toContain(`${INDICATOR.notEnoughData}: 0.2 min`);
  });
});
