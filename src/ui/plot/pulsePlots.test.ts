import { describe, expect, it } from 'vitest';
import { synthRgb } from '../../../tools/synth.ts';
import { estimateWindow, type WindowEstimate } from '../../rppg/hrEstimator.ts';
import { projectChart, symmetricRange } from './chart.ts';
import {
  describeFilter,
  describeSpectrum,
  describeWaveform,
  filterSpec,
  spectrumSpec,
  waveformSpec,
} from './pulsePlots.ts';

const rect = { x: 0, y: 0, w: 100, h: 50 };

function estimate(): WindowEstimate {
  const s = synthRgb({ durationMs: 10_000, fps: 30, bpm: 72, amplitude: 0.005 });
  const r = estimateWindow({ tMs: s.tMs, r: s.r, g: s.g, b: s.b });
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe('projectChart', () => {
  it('maps axis ranges to the rectangle and breaks lines at NaN and out-of-range x', () => {
    const g = projectChart(
      {
        x: { min: 0, max: 10, ticks: [0, 5, 10, 20], format: String },
        y: { min: -1, max: 1, ticks: [0], format: String },
        lines: [{ xs: [0, 5, 6, 10, 20], ys: [-1, 1, NaN, 0, 0], style: 'main' }],
        markers: [{ x: 5, y: 1, shape: 'triangle' }],
        bands: [{ x0: -5, x1: 5 }],
        vlines: [{ x: 11, label: 'out' }],
      },
      rect,
    );
    expect(g.lines[0]?.points).toEqual([
      [
        { x: 0, y: 50 },
        { x: 50, y: 0 },
      ],
      [{ x: 100, y: 25 }],
    ]);
    expect(g.markers).toEqual([{ x: 50, y: 0, shape: 'triangle' }]);
    expect(g.bands).toEqual([{ x0: 0, x1: 50 }]);
    expect(g.vlines).toEqual([]);
    expect(g.xTicks.map((t) => t.label)).toEqual(['0', '5', '10']);
  });

  it('symmetricRange', () => {
    expect(symmetricRange([0.5, -2, NaN])).toBe(2);
  });
});

describe('pulse plots', () => {
  const est = estimate();

  it('waveform spans the last 10 s with one marker per detected beat', () => {
    const s = waveformSpec(est);
    expect(s.x.min).toBeCloseTo(-10, 1);
    expect(s.markers).toHaveLength(est.peaks.length);
  });

  it('spectrum marks the peak with its BPM and shades the pulse band', () => {
    const s = spectrumSpec(est);
    expect(s.markers[0]?.label).toBe('72 BPM');
    expect(s.bands[0]).toMatchObject({ x0: 0.7, x1: 3 });
  });

  it('filter response shows the cut-offs; descriptions give the numbers', () => {
    expect(filterSpec().vlines.map((v) => v.label)).toEqual(['0.7 Hz', '3.0 Hz']);
    expect(describeFilter()).toContain('-3.0 dB at 0.7 Hz and -3.0 dB at 3.0 Hz');
    expect(describeSpectrum(est, 'Forehead')).toContain('(72 BPM)');
    expect(describeWaveform(est, 'Forehead')).toMatch(
      /^Filtered pulse signal \(Forehead\), last 10 s: 1[12] beats/,
    );
    expect(describeWaveform(null, 'Forehead')).toContain('no complete 10 s window yet');
  });
});
