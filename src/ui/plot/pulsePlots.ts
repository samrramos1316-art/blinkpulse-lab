/**
 * Chart specs and text descriptions for the pulse plots (PROJECT_SPEC 5.4/5.5:
 * filtered waveform, spectrum with the detected peak, filter magnitude response).
 * Pure.
 */

import { sosMagnitudeDb } from '../../dsp/biquad.ts';
import {
  BAND_HIGH_HZ,
  BAND_LOW_HZ,
  BANDPASS,
  FS,
  type WindowEstimate,
} from '../../rppg/hrEstimator.ts';
import type { ChartSpec } from './chart.ts';
import { symmetricRange } from './chart.ts';

const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
};

export function waveformSpec(est: WindowEstimate): ChartSpec {
  const n = est.filtered.length;
  const dur = n / FS;
  const xs = Float64Array.from({ length: n }, (_, i) => i / FS - dur);
  const m = symmetricRange(est.filtered) * 1.1;
  return {
    x: {
      min: -dur,
      max: 0,
      ticks: range(-10, 0, 2),
      format: (v) => (v === 0 ? 'now' : `${v.toFixed(0)} s`),
    },
    y: { min: -m, max: m, ticks: [0], format: () => '0' },
    lines: [{ xs, ys: est.filtered, style: 'main' }],
    markers: est.peaks.map((i) => ({
      x: xs[i] as number,
      y: est.filtered[i] as number,
      shape: 'triangle',
    })),
    bands: [],
    vlines: [],
  };
}

export function spectrumSpec(est: WindowEstimate): ChartSpec {
  const { freqs, power } = est.spectrum;
  const xs: number[] = [];
  const ys: number[] = [];
  let max = 0;
  for (let k = 0; k < freqs.length; k++) {
    const f = freqs[k] as number;
    if (f > 4) break;
    xs.push(f);
    ys.push(power[k] as number);
    if (f >= BAND_LOW_HZ && f <= BAND_HIGH_HZ) max = Math.max(max, power[k] as number);
  }
  return {
    x: { min: 0, max: 4, ticks: range(0, 4, 0.5), format: (v) => v.toFixed(1) },
    y: { min: 0, max: max * 1.1 || 1, ticks: [0], format: () => '0' },
    lines: [{ xs, ys, style: 'main' }],
    markers: [
      {
        x: est.peakHz,
        y: Math.max(...ys.filter((_, i) => Math.abs((xs[i] as number) - est.peakHz) < 0.05), 0),
        shape: 'triangle',
        label: `${est.bpm.toFixed(0)} BPM`,
      },
    ],
    bands: [{ x0: BAND_LOW_HZ, x1: BAND_HIGH_HZ, label: 'pulse band' }],
    vlines: [],
  };
}

/** Theoretical magnitude response of the band-pass (single pass), 0-6 Hz. */
export function filterSpec(): ChartSpec {
  const xs = range(0.02, 6, 0.02);
  const ys = Array.from(sosMagnitudeDb(BANDPASS, xs, FS));
  return {
    x: { min: 0, max: 6, ticks: range(0, 6, 1), format: (v) => `${v.toFixed(0)} Hz` },
    y: { min: -60, max: 3, ticks: [-60, -40, -20, 0], format: (v) => `${v.toFixed(0)} dB` },
    lines: [{ xs, ys, style: 'main' }],
    markers: [],
    bands: [],
    vlines: [
      { x: BAND_LOW_HZ, label: `${BAND_LOW_HZ.toFixed(1)} Hz` },
      { x: BAND_HIGH_HZ, label: `${BAND_HIGH_HZ.toFixed(1)} Hz` },
    ],
  };
}

export function describeWaveform(est: WindowEstimate | null, region: string): string {
  if (!est) return `Filtered pulse signal (${region}): no complete 10 s window yet.`;
  const beats = est.peaks.length;
  return (
    `Filtered pulse signal (${region}), last 10 s: ${beats.toFixed(0)} beats detected` +
    (est.timeBpm === null ? '.' : `; their spacing gives about ${est.timeBpm.toFixed(0)} BPM.`)
  );
}

export function describeSpectrum(est: WindowEstimate | null, region: string): string {
  if (!est) return `Spectrum (${region}): no complete 10 s window yet.`;
  return (
    `Spectrum (${region}): strongest peak in the 0.7-3.0 Hz band at ${est.peakHz.toFixed(2)} Hz ` +
    `(${est.bpm.toFixed(0)} BPM); signal quality index ${est.sqi.toFixed(2)}.`
  );
}

export function describeFilter(): string {
  const [lo, hi, a, b] = sosMagnitudeDb(BANDPASS, [BAND_LOW_HZ, BAND_HIGH_HZ, 0.1, 8], FS);
  const f = (v: number | undefined) => (v ?? NaN).toFixed(1);
  return (
    `Band-pass filter (Butterworth, 0.7-3.0 Hz at ${FS.toFixed(0)} Hz sampling): ` +
    `${f(lo)} dB at 0.7 Hz and ${f(hi)} dB at 3.0 Hz, ${f(a)} dB at 0.1 Hz and ${f(b)} dB at 8 Hz. ` +
    'It is applied forwards and backwards, which doubles these dB values and removes the delay.'
  );
}
