/**
 * Windowed, zero-padded power spectrum and band-limited peak search.
 *
 * Note (for docs/METHODS.md): the true frequency resolution is about 1/T for a
 * window of T seconds (0.1 Hz = 6 BPM for 10 s). Zero padding only interpolates
 * the spectrum between those points; parabolic interpolation then refines the
 * peak location. Accuracy depends on SNR, not on the padding length.
 */

import { rfft, isPowerOfTwo, nextPowerOfTwo } from './fft.ts';
import { detrendLinear } from './stats.ts';
import { applyWindow, hann, rectangular } from './window.ts';

export interface SpectrumOptions {
  /** FFT length (power of two, >= signal length). Default: next power of two. */
  nfft?: number;
  /** Default 'hann' (periodic). */
  window?: 'hann' | 'rectangular';
  /** Remove a linear trend before windowing. Default true. */
  detrend?: boolean;
}

export interface PowerSpectrum {
  /** Bin frequencies in Hz, 0 .. fs/2 (nfft/2 + 1 bins). */
  freqs: Float64Array;
  /**
   * One-sided power, scaled so a sinusoid of amplitude A that falls exactly on a
   * bin reads A^2 / 2 at that bin (window coherent gain corrected).
   */
  power: Float64Array;
  fs: number;
  nfft: number;
}

export function powerSpectrum(
  x: ArrayLike<number>,
  fs: number,
  options: SpectrumOptions = {},
): PowerSpectrum {
  if (x.length < 2) throw new RangeError('powerSpectrum: need at least 2 samples');
  if (!(fs > 0)) throw new RangeError(`powerSpectrum: fs must be > 0, got ${fs}`);
  const nfft = options.nfft ?? nextPowerOfTwo(x.length);
  if (!isPowerOfTwo(nfft) || nfft < x.length) {
    throw new RangeError(`powerSpectrum: nfft must be a power of two >= ${x.length}, got ${nfft}`);
  }

  const prepared = (options.detrend ?? true) ? detrendLinear(x) : Float64Array.from(x);
  const w = (options.window ?? 'hann') === 'hann' ? hann(x.length) : rectangular(x.length);
  let wSum = 0;
  for (const v of w) wSum += v;

  const { re, im } = rfft(applyWindow(prepared, w), nfft);
  const bins = re.length;
  const freqs = new Float64Array(bins);
  const power = new Float64Array(bins);
  const norm = 1 / (wSum * wSum);
  for (let k = 0; k < bins; k++) {
    freqs[k] = (k * fs) / nfft;
    const p = ((re[k] as number) ** 2 + (im[k] as number) ** 2) * norm;
    // One-sided: double everything except DC and Nyquist. |X|^2/wSum^2 = A^2/4 per side.
    power[k] = k === 0 || k === bins - 1 ? p : 2 * p;
  }
  return { freqs, power, fs, nfft };
}

export interface SpectralPeak {
  /** Refined peak frequency (Hz). */
  freqHz: number;
  /** Bin index of the raw maximum. */
  bin: number;
  /** Power at the raw maximum bin. */
  power: number;
  /** True when the maximum sits on a band edge bin (refinement is less reliable). */
  atBandEdge: boolean;
}

/**
 * Parabolic interpolation offset (in bins, -0.5..0.5) of a peak from three samples
 * around it. Applied to log power, which fits a Hann main lobe closely.
 */
export function parabolicOffset(left: number, center: number, right: number): number {
  const denom = left - 2 * center + right;
  if (denom === 0) return 0;
  const delta = (0.5 * (left - right)) / denom;
  return Math.max(-0.5, Math.min(0.5, delta));
}

/**
 * Strongest spectral peak with lowHz <= f <= highHz, refined by parabolic
 * interpolation of log power. Returns null if no bin lies in the band or the band
 * has no power.
 */
export function findBandPeak(
  spectrum: PowerSpectrum,
  lowHz: number,
  highHz: number,
): SpectralPeak | null {
  const { freqs, power, fs, nfft } = spectrum;
  let best = -1;
  let first = -1;
  let last = -1;
  for (let k = 0; k < freqs.length; k++) {
    const f = freqs[k] as number;
    if (f < lowHz || f > highHz) continue;
    if (first < 0) first = k;
    last = k;
    if (best < 0 || (power[k] as number) > (power[best] as number)) best = k;
  }
  if (best < 0 || !((power[best] as number) > 0)) return null;

  const atBandEdge = best === first || best === last;
  let offset = 0;
  if (best > 0 && best < power.length - 1) {
    const l = power[best - 1] as number;
    const c = power[best] as number;
    const r = power[best + 1] as number;
    if (l > 0 && r > 0) offset = parabolicOffset(Math.log(l), Math.log(c), Math.log(r));
  }
  return {
    freqHz: ((best + offset) * fs) / nfft,
    bin: best,
    power: power[best] as number,
    atBandEdge,
  };
}

/** Sum of power over lowHz <= f <= highHz. */
export function bandPower(spectrum: PowerSpectrum, lowHz: number, highHz: number): number {
  let sum = 0;
  for (let k = 0; k < spectrum.freqs.length; k++) {
    const f = spectrum.freqs[k] as number;
    if (f >= lowHz && f <= highHz) sum += spectrum.power[k] as number;
  }
  return sum;
}
