/**
 * Second-order sections (biquads): filtering, zero-phase filtering, and frequency response.
 *
 * Section layout follows SciPy: [b0, b1, b2, a0, a1, a2] with a0 = 1.
 * Each section runs in direct form II transposed, as scipy.signal.sosfilt does.
 */

export type SosSection = readonly [number, number, number, number, number, number];
export type Sos = readonly SosSection[];

/** Two state values per section (DF-II transposed delays). */
export type SosState = Float64Array[];

function checkSos(sos: Sos): void {
  if (sos.length === 0) throw new RangeError('sos must have at least one section');
  for (const s of sos) {
    if (s[3] !== 1) throw new RangeError(`sos sections must be normalised (a0 = 1), got ${s[3]}`);
  }
}

/**
 * Filters `x` through the cascade. `zi` (optional, per-section [z0, z1]) is the
 * initial state; it is not modified. Returns the output and the final state.
 */
export function sosfiltWithState(
  sos: Sos,
  x: ArrayLike<number>,
  zi?: SosState,
): { y: Float64Array; zf: SosState } {
  checkSos(sos);
  if (zi && zi.length !== sos.length) throw new RangeError('zi must have one entry per section');
  const y = Float64Array.from(x);
  const zf: SosState = [];
  for (let s = 0; s < sos.length; s++) {
    const [b0, b1, b2, , a1, a2] = sos[s] as SosSection;
    let z0 = zi?.[s]?.[0] ?? 0;
    let z1 = zi?.[s]?.[1] ?? 0;
    for (let n = 0; n < y.length; n++) {
      const xn = y[n] as number;
      const yn = b0 * xn + z0;
      z0 = b1 * xn - a1 * yn + z1;
      z1 = b2 * xn - a2 * yn;
      y[n] = yn;
    }
    zf.push(Float64Array.of(z0, z1));
  }
  return { y, zf };
}

/** Causal filtering with zero initial state (scipy.signal.sosfilt). */
export function sosfilt(sos: Sos, x: ArrayLike<number>): Float64Array {
  return sosfiltWithState(sos, x).y;
}

/**
 * Steady-state initial state of one section for a unit-step input (scipy lfilter_zi
 * for a second-order section): solves zi = A*zi + B for the 2x2 companion system.
 */
export function sectionZi(section: SosSection): Float64Array {
  const [b0, b1, b2, , a1, a2] = section;
  // (I - companion(a).T) = [[1 + a1, -1], [a2, 1]];  B = [b1 - a1*b0, b2 - a2*b0]
  const m00 = 1 + a1;
  const m01 = -1;
  const m10 = a2;
  const m11 = 1;
  const r0 = b1 - a1 * b0;
  const r1 = b2 - a2 * b0;
  const det = m00 * m11 - m01 * m10;
  if (det === 0) throw new RangeError('sectionZi: singular system (pole at z = 1)');
  return Float64Array.of((r0 * m11 - m01 * r1) / det, (m00 * r1 - m10 * r0) / det);
}

/** Steady-state initial state for the cascade (scipy.signal.sosfilt_zi). */
export function sosfiltZi(sos: Sos): SosState {
  checkSos(sos);
  const zi: SosState = [];
  let scale = 1;
  for (const section of sos) {
    const z = sectionZi(section);
    zi.push(Float64Array.of((z[0] as number) * scale, (z[1] as number) * scale));
    const [b0, b1, b2, a0, a1, a2] = section;
    scale *= (b0 + b1 + b2) / (a0 + a1 + a2); // section DC gain
  }
  return zi;
}

/**
 * Odd extension by `n` samples at each end (scipy.signal._arraytools.odd_ext):
 * reflects the signal through its end points, so the ends stay continuous in
 * value and slope.
 */
export function oddExtend(x: ArrayLike<number>, n: number): Float64Array {
  const len = x.length;
  if (n < 1) return Float64Array.from(x);
  if (n > len - 1)
    throw new RangeError(`oddExtend: n (${n}) must not exceed length - 1 (${len - 1})`);
  const out = new Float64Array(len + 2 * n);
  const first = x[0] as number;
  const last = x[len - 1] as number;
  for (let i = 0; i < n; i++) out[i] = 2 * first - (x[n - i] as number);
  for (let i = 0; i < len; i++) out[n + i] = x[i] as number;
  for (let i = 0; i < n; i++) out[n + len + i] = 2 * last - (x[len - 2 - i] as number);
  return out;
}

/** Default edge padding used by scipy.signal.sosfiltfilt (padtype='odd', padlen=None). */
export function defaultPadLength(sos: Sos): number {
  let zeroB2 = 0;
  let zeroA2 = 0;
  for (const s of sos) {
    if (s[2] === 0) zeroB2++;
    if (s[5] === 0) zeroA2++;
  }
  const ntaps = 2 * sos.length + 1 - Math.min(zeroB2, zeroA2);
  return 3 * ntaps;
}

/**
 * Zero-phase forward-backward filtering, matching scipy.signal.sosfiltfilt with
 * padtype='odd': odd-extend both ends, run forward and backward with steady-state
 * initial conditions scaled to the first sample of each pass, then trim.
 * The magnitude response is squared (e.g. -6 dB at a Butterworth cutoff).
 */
export function filtfilt(
  sos: Sos,
  x: ArrayLike<number>,
  padLength: number = defaultPadLength(sos),
): Float64Array {
  if (x.length <= padLength) {
    throw new RangeError(
      `filtfilt: input length (${x.length}) must be greater than the pad length (${padLength})`,
    );
  }
  const ext = oddExtend(x, padLength);
  const zi = sosfiltZi(sos);
  const scaled = (k: number): SosState =>
    zi.map((z) => Float64Array.of((z[0] as number) * k, (z[1] as number) * k));

  const forward = sosfiltWithState(sos, ext, scaled(ext[0] as number)).y;
  forward.reverse();
  const backward = sosfiltWithState(sos, forward, scaled(forward[0] as number)).y;
  backward.reverse();
  return backward.slice(padLength, backward.length - padLength);
}

/**
 * Complex frequency response H(e^{jw}) of the cascade at the given frequencies
 * (scipy.signal.sosfreqz with worN = freqsHz, fs = fs).
 */
export function sosFrequencyResponse(
  sos: Sos,
  freqsHz: ArrayLike<number>,
  fs: number,
): { re: Float64Array; im: Float64Array } {
  checkSos(sos);
  const re = new Float64Array(freqsHz.length);
  const im = new Float64Array(freqsHz.length);
  for (let i = 0; i < freqsHz.length; i++) {
    const w = (2 * Math.PI * (freqsHz[i] as number)) / fs;
    // z^-1 = e^{-jw}, z^-2 = e^{-2jw}
    const c1 = Math.cos(w);
    const s1 = -Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = -Math.sin(2 * w);
    let hr = 1;
    let hi = 0;
    for (const [b0, b1, b2, a0, a1, a2] of sos) {
      const nr = b0 + b1 * c1 + b2 * c2;
      const ni = b1 * s1 + b2 * s2;
      const dr = a0 + a1 * c1 + a2 * c2;
      const di = a1 * s1 + a2 * s2;
      const dd = dr * dr + di * di;
      const qr = (nr * dr + ni * di) / dd;
      const qi = (ni * dr - nr * di) / dd;
      const tr = hr * qr - hi * qi;
      hi = hr * qi + hi * qr;
      hr = tr;
    }
    re[i] = hr;
    im[i] = hi;
  }
  return { re, im };
}

/** |H| in dB at the given frequencies. */
export function sosMagnitudeDb(sos: Sos, freqsHz: ArrayLike<number>, fs: number): Float64Array {
  const { re, im } = sosFrequencyResponse(sos, freqsHz, fs);
  const out = new Float64Array(re.length);
  for (let i = 0; i < re.length; i++) {
    const mag2 = (re[i] as number) ** 2 + (im[i] as number) ** 2;
    out[i] = 10 * Math.log10(mag2);
  }
  return out;
}
