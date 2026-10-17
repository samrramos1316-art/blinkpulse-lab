/**
 * Window functions and their gains.
 *
 * Symmetric windows match scipy.signal.windows.hann(n, sym=True); periodic
 * ("DFT-even") windows match sym=False and are the usual choice for spectra.
 */

export interface WindowOptions {
  /** true: symmetric (filter design). false: periodic (spectral analysis). Default false. */
  symmetric?: boolean;
}

export function hann(n: number, { symmetric = false }: WindowOptions = {}): Float64Array {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`hann: n must be >= 1, got ${n}`);
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  const denom = symmetric ? n - 1 : n;
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
  return w;
}

export function rectangular(n: number): Float64Array {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`rectangular: n must be >= 1, got ${n}`);
  return new Float64Array(n).fill(1);
}

/** Coherent gain = mean(w). A sinusoid's spectral peak amplitude is scaled by this. */
export function coherentGain(w: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < w.length; i++) sum += w[i] as number;
  return sum / w.length;
}

/**
 * Equivalent noise bandwidth in bins: N * sum(w^2) / sum(w)^2.
 * 1 for rectangular, 1.5 for Hann.
 */
export function enbwBins(w: ArrayLike<number>): number {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < w.length; i++) {
    const v = w[i] as number;
    sum += v;
    sumSq += v * v;
  }
  return (w.length * sumSq) / (sum * sum);
}

/** Element-wise product x * w (same length), as a new array. */
export function applyWindow(x: ArrayLike<number>, w: ArrayLike<number>): Float64Array {
  if (x.length !== w.length) {
    throw new RangeError(`applyWindow: lengths differ (${x.length} vs ${w.length})`);
  }
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] as number) * (w[i] as number);
  return out;
}
