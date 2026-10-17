import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/fft.json';
import { complexRelativeError, seededNormal } from '../../test/helpers.ts';
import { fft, ifftInPlace, isPowerOfTwo, nextPowerOfTwo, rfft, zeroPad } from './fft.ts';

/** Naive O(N^2) DFT, the independent reference. */
function naiveDft(re: ArrayLike<number>, im: ArrayLike<number>) {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * ((k * t) % n)) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      sr += (re[t] as number) * c - (im[t] as number) * s;
      si += (re[t] as number) * s + (im[t] as number) * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}

const TOL = 1e-9; // Phase 1 acceptance: relative error < 1e-9

describe('fft vs NumPy fixtures', () => {
  for (const c of fixture.complex) {
    it(`n = ${c.n}`, () => {
      const out = fft(c.re, c.im);
      expect(complexRelativeError(out.re, out.im, c.outRe, c.outIm)).toBeLessThan(TOL);
    });
  }

  it('rfft of 300 real samples zero-padded to 4096', () => {
    const out = rfft(fixture.rfft.x, fixture.rfft.n);
    expect(out.re.length).toBe(fixture.rfft.n / 2 + 1);
    expect(
      complexRelativeError(out.re, out.im, fixture.rfft.outRe, fixture.rfft.outIm),
    ).toBeLessThan(TOL);
  });
});

describe('fft vs naive DFT', () => {
  const randn = seededNormal(1);
  for (const n of [1, 2, 4, 16, 128, 512]) {
    it(`n = ${n}`, () => {
      const re = Float64Array.from({ length: n }, randn);
      const im = Float64Array.from({ length: n }, randn);
      const fast = fft(re, im);
      const slow = naiveDft(re, im);
      expect(complexRelativeError(fast.re, fast.im, slow.re, slow.im)).toBeLessThan(TOL);
    });
  }
});

describe('fft properties', () => {
  const randn = seededNormal(2);
  const n = 256;
  const a = Float64Array.from({ length: n }, randn);
  const b = Float64Array.from({ length: n }, randn);

  it('is linear: FFT(2a + 3b) = 2 FFT(a) + 3 FFT(b)', () => {
    const lhs = fft(a.map((v, i) => 2 * v + 3 * (b[i] as number)));
    const fa = fft(a);
    const fb = fft(b);
    const rhsRe = fa.re.map((v, i) => 2 * v + 3 * (fb.re[i] as number));
    const rhsIm = fa.im.map((v, i) => 2 * v + 3 * (fb.im[i] as number));
    expect(complexRelativeError(lhs.re, lhs.im, rhsRe, rhsIm)).toBeLessThan(TOL);
  });

  it("satisfies Parseval's theorem: sum |x|^2 = sum |X|^2 / N", () => {
    const { re, im } = fft(a);
    let timeEnergy = 0;
    let freqEnergy = 0;
    for (let i = 0; i < n; i++) {
      timeEnergy += (a[i] as number) ** 2;
      freqEnergy += (re[i] as number) ** 2 + (im[i] as number) ** 2;
    }
    expect(Math.abs(freqEnergy / n - timeEnergy) / timeEnergy).toBeLessThan(TOL);
  });

  it('inverse FFT recovers the input', () => {
    const { re, im } = fft(a, b);
    ifftInPlace(re, im);
    expect(complexRelativeError(re, im, a, b)).toBeLessThan(TOL);
  });

  it('puts a pure tone in the expected bin', () => {
    const k = 5;
    const x = Float64Array.from({ length: 64 }, (_, i) => Math.cos((2 * Math.PI * k * i) / 64));
    const { re } = fft(x);
    expect(re[k]).toBeCloseTo(32, 10);
    expect(re[64 - k]).toBeCloseTo(32, 10);
  });
});

describe('fft helpers and validation', () => {
  it('rejects lengths that are not powers of two', () => {
    expect(() => fft([1, 2, 3])).toThrow(RangeError);
    expect(() => rfft([1, 2, 3], 6)).toThrow(RangeError);
  });

  it('nextPowerOfTwo / isPowerOfTwo / zeroPad', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(300)).toBe(512);
    expect(nextPowerOfTwo(512)).toBe(512);
    expect(isPowerOfTwo(4096)).toBe(true);
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(12)).toBe(false);
    expect(Array.from(zeroPad([1, 2], 4))).toEqual([1, 2, 0, 0]);
    expect(() => zeroPad([1, 2, 3], 2)).toThrow(RangeError);
  });
});
