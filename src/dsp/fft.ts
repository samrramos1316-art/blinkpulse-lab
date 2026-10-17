/**
 * Iterative radix-2 Cooley-Tukey FFT (decimation in time).
 *
 * Twiddle factors come from a cos/sin table computed directly per index, not by
 * repeated multiplication, so rounding error does not accumulate across stages.
 */

export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/** Smallest power of two >= n (n >= 1). */
export function nextPowerOfTwo(n: number): number {
  if (!(n >= 1)) throw new RangeError(`nextPowerOfTwo: n must be >= 1, got ${n}`);
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Copies `x` into a new zero-filled array of length `n` (n >= x.length). */
export function zeroPad(x: ArrayLike<number>, n: number): Float64Array {
  if (n < x.length) throw new RangeError(`zeroPad: n (${n}) < input length (${x.length})`);
  const out = new Float64Array(n);
  for (let i = 0; i < x.length; i++) out[i] = x[i] as number;
  return out;
}

const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array }>();

function twiddles(n: number): { cos: Float64Array; sin: Float64Array } {
  let t = twiddleCache.get(n);
  if (!t) {
    const half = n >> 1;
    const cos = new Float64Array(half);
    const sin = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      const angle = (-2 * Math.PI * k) / n;
      cos[k] = Math.cos(angle);
      sin[k] = Math.sin(angle);
    }
    t = { cos, sin };
    twiddleCache.set(n, t);
  }
  return t;
}

function bitReverse(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      re[i] = re[j] as number;
      re[j] = tr;
      const ti = im[i] as number;
      im[i] = im[j] as number;
      im[j] = ti;
    }
  }
}

/**
 * In-place forward FFT: X[k] = sum_n x[n] exp(-2*pi*i*k*n/N), same sign and
 * scaling convention as numpy.fft.fft. Length must be a power of two.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (im.length !== n) throw new RangeError('fft: re and im must have the same length');
  if (!isPowerOfTwo(n)) throw new RangeError(`fft: length must be a power of two, got ${n}`);
  if (n === 1) return;

  bitReverse(re, im);
  const { cos, sin } = twiddles(n);

  for (let size = 2; size <= n; size *= 2) {
    const half = size >> 1;
    const step = n / size; // twiddle index stride for this stage
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step] as number;
        const wi = sin[k * step] as number;
        const a = start + k;
        const b = a + half;
        const br = re[b] as number;
        const bi = im[b] as number;
        const tr = wr * br - wi * bi;
        const ti = wr * bi + wi * br;
        const ar = re[a] as number;
        const ai = im[a] as number;
        re[b] = ar - tr;
        im[b] = ai - ti;
        re[a] = ar + tr;
        im[a] = ai + ti;
      }
    }
  }
}

/** In-place inverse FFT, scaled by 1/N (numpy.fft.ifft convention). */
export function ifftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -(im[i] as number);
  fftInPlace(re, im);
  for (let i = 0; i < n; i++) {
    re[i] = (re[i] as number) / n;
    im[i] = -(im[i] as number) / n;
  }
}

export interface ComplexArray {
  re: Float64Array;
  im: Float64Array;
}

/** Forward FFT of complex input (copies; inputs are not modified). */
export function fft(re: ArrayLike<number>, im?: ArrayLike<number>): ComplexArray {
  const outRe = Float64Array.from(re);
  const outIm = im ? Float64Array.from(im) : new Float64Array(outRe.length);
  fftInPlace(outRe, outIm);
  return { re: outRe, im: outIm };
}

/**
 * FFT of real input, zero-padded to `n` (default: next power of two), returning
 * the n/2 + 1 non-negative-frequency bins (numpy.fft.rfft convention).
 */
export function rfft(x: ArrayLike<number>, n: number = nextPowerOfTwo(x.length)): ComplexArray {
  if (!isPowerOfTwo(n)) throw new RangeError(`rfft: n must be a power of two, got ${n}`);
  const re = zeroPad(x, n);
  const im = new Float64Array(n);
  fftInPlace(re, im);
  const bins = n / 2 + 1;
  return { re: re.slice(0, bins), im: im.slice(0, bins) };
}
