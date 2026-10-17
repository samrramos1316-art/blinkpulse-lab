/**
 * Butterworth filter design as second-order sections.
 *
 * Steps (the same as scipy.signal.butter with output='sos'):
 *   1. Analogue prototype poles p_m = -exp(i*pi*m/(2N)), m = -N+1, -N+3, ..., N-1 (cutoff 1 rad/s).
 *   2. Pre-warp the cutoff so the digital -3 dB point lands exactly on it:
 *      warped = 2*fs' * tan(pi*Wn/fs'), using SciPy's normalisation fs' = 2, Wn = fc/(fs/2).
 *   3. Scale (low-pass) or invert (high-pass) the prototype to the warped cutoff.
 *   4. Bilinear transform z = (2fs' + s)/(2fs' - s); zeros at infinity map to z = -1.
 *   5. Pair conjugate poles into sections; poles closest to the unit circle go last
 *      (scipy zpk2sos, pairing='nearest'); the overall gain goes in the first section.
 *
 * Only even orders are supported: every pole then has a conjugate partner, which keeps
 * the section pairing simple. The spec needs orders 2 and 4.
 */

import type { Sos, SosSection } from './biquad.ts';

interface Complex {
  re: number;
  im: number;
}

const c = (re: number, im = 0): Complex => ({ re, im });
const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
const sub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);
const mul = (a: Complex, b: Complex): Complex =>
  c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const abs = (a: Complex): number => Math.hypot(a.re, a.im);
const prod = (xs: readonly Complex[]): Complex => xs.reduce(mul, c(1));

/** SciPy's bilinear-transform sample rate after normalising Wn to Nyquist. */
const FS_NORM = 2;

function prototypePoles(order: number): Complex[] {
  const poles: Complex[] = [];
  for (let m = -order + 1; m < order; m += 2) {
    const theta = (Math.PI * m) / (2 * order);
    poles.push(c(-Math.cos(theta), -Math.sin(theta)));
  }
  return poles;
}

function checkDesign(order: number, cutoffHz: number, fs: number): void {
  if (!Number.isInteger(order) || order < 2 || order % 2 !== 0) {
    throw new RangeError(`Butterworth order must be an even integer >= 2, got ${order}`);
  }
  if (!(fs > 0)) throw new RangeError(`fs must be > 0, got ${fs}`);
  if (!(cutoffHz > 0 && cutoffHz < fs / 2)) {
    throw new RangeError(`cutoff must satisfy 0 < cutoff < fs/2 (${fs / 2}), got ${cutoffHz}`);
  }
}

function prewarp(cutoffHz: number, fs: number): number {
  const wn = cutoffHz / (fs / 2);
  return 2 * FS_NORM * Math.tan((Math.PI * wn) / FS_NORM);
}

/** Bilinear transform of analogue poles; returns digital poles. */
function bilinearPoles(poles: readonly Complex[]): Complex[] {
  const fs2 = c(2 * FS_NORM);
  return poles.map((p) => div(add(fs2, p), sub(fs2, p)));
}

/**
 * Builds sections from digital poles (all in conjugate pairs) and a double real zero
 * per section at `zero` (-1 for low-pass, +1 for high-pass). Gain `k` goes in section 0.
 */
function toSos(digitalPoles: readonly Complex[], zero: number, k: number): SosSection[] {
  // One representative per conjugate pair (upper half plane).
  const reps = digitalPoles.filter((p) => p.im > 0);
  if (reps.length * 2 !== digitalPoles.length) {
    throw new Error('Butterworth design: expected only complex-conjugate pole pairs');
  }
  // zpk2sos fills sections from last to first, always taking the remaining pole
  // closest to the unit circle; so the first section has the farthest poles.
  const distance = (p: Complex) => Math.abs(1 - abs(p));
  reps.sort((a, b) => distance(b) - distance(a));

  return reps.map((p, i): SosSection => {
    const gain = i === 0 ? k : 1;
    // (1 - zero z^-1)^2 and (1 - p z^-1)(1 - conj(p) z^-1)
    return [gain, gain * -2 * zero, gain * zero * zero, 1, -2 * p.re, p.re * p.re + p.im * p.im];
  });
}

/** Butterworth low-pass as second-order sections (scipy.signal.butter(..., output='sos')). */
export function butterLowpass(order: number, cutoffHz: number, fs: number): Sos {
  checkDesign(order, cutoffHz, fs);
  const warped = prewarp(cutoffHz, fs);
  const analog = prototypePoles(order).map((p) => mul(p, c(warped)));
  const kAnalog = warped ** order;
  // Gain after bilinear: k * real(1 / prod(2fs' - p))  (no finite zeros).
  const fs2 = c(2 * FS_NORM);
  const k = kAnalog * div(c(1), prod(analog.map((p) => sub(fs2, p)))).re;
  return toSos(bilinearPoles(analog), -1, k);
}

/** Butterworth high-pass as second-order sections. */
export function butterHighpass(order: number, cutoffHz: number, fs: number): Sos {
  checkDesign(order, cutoffHz, fs);
  const warped = prewarp(cutoffHz, fs);
  const proto = prototypePoles(order);
  // lp2hp: p -> warped / p, N zeros at s = 0, k = real(1 / prod(-p)).
  const analog = proto.map((p) => div(c(warped), p));
  const kAnalog = div(c(1), prod(proto.map((p) => c(-p.re, -p.im)))).re;
  // Bilinear: zeros at s = 0 map to z = +1; gain * real(prod(2fs' - 0) / prod(2fs' - p)).
  const fs2 = c(2 * FS_NORM);
  const k = kAnalog * div(c((2 * FS_NORM) ** order), prod(analog.map((p) => sub(fs2, p)))).re;
  return toSos(bilinearPoles(analog), 1, k);
}

/**
 * Band-pass as a cascade: high-pass at `lowHz` followed by low-pass at `highHz`,
 * each of the given order (so 4 gives 4 high-pass + 4 low-pass poles).
 */
export function butterBandpass(order: number, lowHz: number, highHz: number, fs: number): Sos {
  if (!(lowHz < highHz))
    throw new RangeError(`band-pass needs lowHz < highHz, got ${lowHz}, ${highHz}`);
  return [...butterHighpass(order, lowHz, fs), ...butterLowpass(order, highHz, fs)];
}
