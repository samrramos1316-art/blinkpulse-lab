/**
 * Pulse-rate estimate for one analysis window (PROJECT_SPEC 5.4). Pure.
 *
 *   irregular (t, R, G, B) -> uniform 30 Hz (gaps > 250 ms invalidate) -> POS ->
 *   Butterworth band-pass 0.7-3.0 Hz with filtfilt -> detrend + Hann + FFT (4096)
 *   -> strongest in-band peak, parabolic refinement -> BPM
 *
 * plus the SQI and a time-domain cross-check (peak detection, median IBI).
 */

import { filtfilt } from '../dsp/biquad.ts';
import { butterBandpass } from '../dsp/butterworth.ts';
import { findPeaks } from '../dsp/peaks.ts';
import { resampleUniform } from '../dsp/resample.ts';
import { bandPower, findBandPeak, powerSpectrum, type PowerSpectrum } from '../dsp/spectrum.ts';
import { median, std } from '../dsp/stats.ts';
import { pos } from './pos.ts';

export const FS = 30;
export const BAND_LOW_HZ = 0.7;
export const BAND_HIGH_HZ = 3.0;
export const WINDOW_MS = 10_000;
export const HOP_MS = 1_000;
/** Source frames further apart than this invalidate the window (PROJECT_SPEC 5.4). */
export const MAX_GAP_MS = 250;
export const NFFT = 4096;
/** SQI: power within +-0.1 Hz of the peak and of its second harmonic. */
export const SQI_HALF_WIDTH_HZ = 0.1;
/** Time-domain peaks: minimum spacing 0.33 s (PROJECT_SPEC 5.4). */
export const MIN_PEAK_SPACING_S = 0.33;
/**
 * Adaptive prominence for the time-domain peaks: this fraction of the filtered
 * waveform's standard deviation. A starting value, not tuned on real data.
 */
export const PROMINENCE_SD = 0.5;
/** Spectral and time-domain BPM disagreeing by more than this lowers confidence. */
export const CROSS_CHECK_BPM = 8;

/** Band-pass used everywhere (also shown as the filter response plot). */
export const BANDPASS = butterBandpass(4, BAND_LOW_HZ, BAND_HIGH_HZ, FS);

export interface TraceWindow {
  tMs: ArrayLike<number>;
  r: ArrayLike<number>;
  g: ArrayLike<number>;
  b: ArrayLike<number>;
}

export type WindowFailure = 'tooShort' | 'gap' | 'noPeak';

export interface WindowEstimate {
  ok: true;
  bpm: number;
  peakHz: number;
  /** 0..1 (PROJECT_SPEC 5.4 SQI). */
  sqi: number;
  /** 60 / median inter-beat interval, or null with fewer than 3 peaks. */
  timeBpm: number | null;
  /** |bpm - timeBpm| <= CROSS_CHECK_BPM; null when timeBpm is null. */
  crossCheckAgrees: boolean | null;
  /**
   * The resampled colour channels at FS, each as a fraction of its window mean
   * minus 1 (for the Signal Lab; 0.01 = 1% above the mean).
   */
  rgb: { r: Float64Array; g: Float64Array; b: Float64Array };
  /** The signal before the band-pass: POS output (or the green/raw comparison). */
  unfiltered: Float64Array;
  /** Band-passed pulse signal at FS (for the waveform plot). */
  filtered: Float64Array;
  /** Indices of the time-domain peaks in `filtered`. */
  peaks: number[];
  spectrum: PowerSpectrum;
}

export type WindowResult = WindowEstimate | { ok: false; reason: WindowFailure };

export interface EstimateOptions {
  /**
   * 'green' = raw green channel, for comparison tests only. 'raw' = the green input
   * minus its mean, unnormalised: for a contact PPG reference signal (reference.ts).
   */
  method?: 'pos' | 'green' | 'raw';
  /** Minimum time span of the window (ms). Default 95% of WINDOW_MS. */
  minSpanMs?: number;
}

function resampleAll(w: TraceWindow): { r: Float64Array; g: Float64Array; b: Float64Array } | null {
  const opts = { maxGapMs: MAX_GAP_MS } as const;
  const rs = resampleUniform(w.tMs, w.r, FS, opts);
  if (rs.valid.includes(0)) return null;
  return {
    r: rs.values,
    g: resampleUniform(w.tMs, w.g, FS, opts).values,
    b: resampleUniform(w.tMs, w.b, FS, opts).values,
  };
}

/**
 * SQI (PROJECT_SPEC 5.4): power within +-0.1 Hz of the peak plus within +-0.1 Hz of
 * its second harmonic, over total in-band power. Harmonic power is counted only
 * inside the band, so the SQI stays within 0..1.
 */
export function sqi(spectrum: PowerSpectrum, peakHz: number): number {
  const total = bandPower(spectrum, BAND_LOW_HZ, BAND_HIGH_HZ);
  if (!(total > 0)) return 0;
  const clip = (lo: number, hi: number) =>
    hi < BAND_LOW_HZ || lo > BAND_HIGH_HZ
      ? 0
      : bandPower(spectrum, Math.max(lo, BAND_LOW_HZ), Math.min(hi, BAND_HIGH_HZ));
  const w = SQI_HALF_WIDTH_HZ;
  const fund = clip(peakHz - w, peakHz + w);
  // Avoid double counting if the two bands overlap (peak below 0.2 Hz: not possible in band).
  const harm = clip(2 * peakHz - w, 2 * peakHz + w);
  return Math.min(1, (fund + harm) / total);
}

/** x / mean(x) - 1. */
function relative(x: Float64Array): Float64Array {
  let m = 0;
  for (const v of x) m += v;
  m /= x.length;
  return x.map((v) => (m === 0 ? 0 : v / m - 1));
}

export function estimateWindow(w: TraceWindow, options: EstimateOptions = {}): WindowResult {
  const n = w.tMs.length;
  const span = n >= 2 ? (w.tMs[n - 1] as number) - (w.tMs[0] as number) : 0;
  if (n < 2 || span < (options.minSpanMs ?? 0.95 * WINDOW_MS))
    return { ok: false, reason: 'tooShort' };
  const u = resampleAll(w);
  if (!u) return { ok: false, reason: 'gap' };

  let signal: Float64Array;
  if (options.method === 'green' || options.method === 'raw') {
    let m = 0;
    for (const v of u.g) m += v;
    m /= u.g.length;
    signal = options.method === 'raw' ? u.g.map((v) => v - m) : u.g.map((v) => v / m - 1);
  } else {
    signal = pos(u.r, u.g, u.b, FS);
  }
  const filtered = filtfilt(BANDPASS, signal);
  const spectrum = powerSpectrum(filtered, FS, { nfft: NFFT });
  const peak = findBandPeak(spectrum, BAND_LOW_HZ, BAND_HIGH_HZ);
  if (!peak) return { ok: false, reason: 'noPeak' };
  const bpm = 60 * peak.freqHz;

  const sd = std(filtered);
  const peaks = findPeaks(filtered, {
    minDistance: Math.ceil(MIN_PEAK_SPACING_S * FS),
    minProminence: PROMINENCE_SD * sd,
  }).indices;
  let timeBpm: number | null = null;
  if (peaks.length >= 3) {
    const ibis = peaks.slice(1).map((p, i) => (p - (peaks[i] as number)) / FS);
    timeBpm = 60 / median(ibis);
  }
  return {
    ok: true,
    bpm,
    peakHz: peak.freqHz,
    sqi: sqi(spectrum, peak.freqHz),
    timeBpm,
    crossCheckAgrees: timeBpm === null ? null : Math.abs(timeBpm - bpm) <= CROSS_CHECK_BPM,
    rgb: { r: relative(u.r), g: relative(u.g), b: relative(u.b) },
    unfiltered: signal,
    filtered,
    peaks,
    spectrum,
  };
}
