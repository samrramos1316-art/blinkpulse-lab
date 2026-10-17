/**
 * Shared test helpers. Pure (no Node APIs) so tests inside src/dsp can import them.
 */

/**
 * Relative error used by the Phase 1 acceptance criteria:
 * max |actual - expected| / max |expected|.
 * Normalising by the largest reference magnitude (not element by element) keeps the
 * measure meaningful where the reference passes through zero.
 */
export function relativeError(actual: ArrayLike<number>, expected: ArrayLike<number>): number {
  if (actual.length !== expected.length) {
    throw new Error(`length mismatch: ${actual.length} vs ${expected.length}`);
  }
  let maxErr = 0;
  let maxRef = 0;
  for (let i = 0; i < expected.length; i++) {
    maxErr = Math.max(maxErr, Math.abs((actual[i] as number) - (expected[i] as number)));
    maxRef = Math.max(maxRef, Math.abs(expected[i] as number));
  }
  return maxRef === 0 ? maxErr : maxErr / maxRef;
}

/** Relative error for complex arrays, using complex magnitudes. */
export function complexRelativeError(
  actualRe: ArrayLike<number>,
  actualIm: ArrayLike<number>,
  expectedRe: ArrayLike<number>,
  expectedIm: ArrayLike<number>,
): number {
  let maxErr = 0;
  let maxRef = 0;
  for (let i = 0; i < expectedRe.length; i++) {
    const dr = (actualRe[i] as number) - (expectedRe[i] as number);
    const di = (actualIm[i] as number) - (expectedIm[i] as number);
    maxErr = Math.max(maxErr, Math.hypot(dr, di));
    maxRef = Math.max(maxRef, Math.hypot(expectedRe[i] as number, expectedIm[i] as number));
  }
  return maxRef === 0 ? maxErr : maxErr / maxRef;
}

/** Deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples (Box-Muller) from a seeded PRNG. */
export function seededNormal(seed: number): () => number {
  const rand = seededRandom(seed);
  return () => {
    const u = 1 - rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** x[i] = amplitude * sin(2*pi*f*t_i + phase) with t_i = i / fs. */
export function sine(
  n: number,
  freqHz: number,
  fs: number,
  amplitude = 1,
  phase = 0,
): Float64Array {
  return Float64Array.from(
    { length: n },
    (_, i) => amplitude * Math.sin((2 * Math.PI * freqHz * i) / fs + phase),
  );
}
