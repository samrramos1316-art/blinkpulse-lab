import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../test/helpers.ts';
import { FrameClock, spansGap, type FrameTick } from './frameClock.ts';

function pushAll(clock: FrameClock, raws: readonly number[]): (FrameTick | null)[] {
  return raws.map((r) => clock.push(r));
}

/** Regular timestamps starting at `start` with step `dt`. */
const regular = (n: number, dt: number, start = 5000) =>
  Array.from({ length: n }, (_, i) => start + i * dt);

describe('FrameClock: monotonic milliseconds', () => {
  it('measures time from the first frame', () => {
    const ticks = pushAll(new FrameClock(), [12345.5, 12378.8, 12412.1]);
    expect(ticks.map((t) => t?.tMs)).toEqual([0, expect.closeTo(33.3, 9), expect.closeTo(66.6, 9)]);
    expect(ticks[0]?.dtMs).toBeNaN();
    expect(ticks[2]?.dtMs).toBeCloseTo(33.3, 9);
    expect(ticks.map((t) => t?.index)).toEqual([0, 1, 2]);
  });

  it('rejects repeated, decreasing, and non-finite timestamps', () => {
    const clock = new FrameClock();
    const ticks = pushAll(clock, [100, 133, 133, 120, NaN, Infinity, 166]);
    expect(ticks.map((t) => t?.tMs ?? null)).toEqual([0, 33, null, null, null, null, 66]);
    expect(clock.stats().rejected).toBe(4);
    expect(clock.stats().frames).toBe(3);
  });

  it('accepted tMs is strictly increasing under random jitter', () => {
    const rand = seededRandom(3);
    const clock = new FrameClock();
    let last = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const tick = clock.push(1000 + i * 33.3 + (rand() * 2 - 1) * 20);
      if (tick) {
        expect(tick.tMs).toBeGreaterThan(last);
        last = tick.tMs;
      }
    }
  });
});

describe('FrameClock: median dt, jitter, fps', () => {
  it('reports NaN until enough intervals', () => {
    const clock = new FrameClock({ minIntervals: 5 });
    pushAll(clock, regular(5, 33)); // 4 intervals
    expect(clock.stats().medianDtMs).toBeNaN();
    expect(clock.stats().jitterMs).toBeNaN();
    clock.push(5000 + 5 * 33);
    expect(clock.stats().medianDtMs).toBeCloseTo(33, 9);
  });

  it('steady 30 fps: median 33.33 ms, zero jitter, 30 fps', () => {
    const clock = new FrameClock();
    pushAll(clock, regular(100, 1000 / 30));
    const s = clock.stats();
    expect(s.medianDtMs).toBeCloseTo(1000 / 30, 9);
    expect(s.jitterMs).toBeCloseTo(0, 9);
    expect(s.fps).toBeCloseTo(30, 9);
    expect(s.gaps).toBe(0);
  });

  it('jitter equals the population std of the window intervals', () => {
    const dts = [30, 36, 30, 36, 30, 36, 30, 36]; // std = 3 exactly
    const raws = [0];
    for (const dt of dts) raws.push((raws[raws.length - 1] as number) + dt);
    const clock = new FrameClock({ windowSize: 8 });
    pushAll(clock, raws);
    expect(clock.stats().jitterMs).toBeCloseTo(3, 12);
    expect(clock.stats().medianDtMs).toBeCloseTo(33, 12);
  });

  it('uses only the last windowSize intervals (adapts to a new frame rate)', () => {
    const clock = new FrameClock({ windowSize: 30 });
    const a = regular(60, 1000 / 30, 0);
    const b = regular(60, 1000 / 60, (a[a.length - 1] as number) + 1000 / 60);
    pushAll(clock, [...a, ...b]);
    expect(clock.stats().fps).toBeCloseTo(60, 6);
  });

  it('a speed-up never counts as a gap', () => {
    const clock = new FrameClock();
    pushAll(clock, [...regular(20, 33, 0), ...regular(20, 16, 20 * 33)]);
    expect(clock.stats().gaps).toBe(0);
  });
});

describe('FrameClock: irregular intervals (> 1.5x) and gaps (> 2.5x), option A', () => {
  const dt = 1000 / 30;
  const base = regular(20, dt, 0);
  const lastT = base[base.length - 1] as number;
  const after = (factor: number) => {
    const clock = new FrameClock();
    pushAll(clock, base);
    return clock.push(lastT + factor * dt);
  };

  it('irregular just above 1.5x median, not just below; neither is a gap', () => {
    expect(after(1.49)).toMatchObject({ irregular: false, gap: false });
    expect(after(1.51)).toMatchObject({ irregular: true, gap: false, gapReason: null });
  });

  it('gap just above 2.5x median, not just below', () => {
    expect(after(2.49)).toMatchObject({ irregular: true, gap: false });
    expect(after(2.51)).toMatchObject({ irregular: true, gap: true, gapReason: 'interval' });
  });

  it('records the gap interval', () => {
    const clock = new FrameClock();
    const base = regular(20, 33, 0);
    pushAll(clock, base);
    const lastT = base[base.length - 1] as number;
    clock.push(lastT + 4 * 33); // three frames missing
    clock.push(lastT + 5 * 33);
    const s = clock.stats();
    expect(s.gaps).toBe(1);
    expect(clock.gapIntervals()).toEqual([
      { startMs: lastT, endMs: lastT + 4 * 33, reason: 'interval' },
    ]);
  });

  it('skewed but complete timing: fps from the mean; long intervals irregular, not gaps', () => {
    // Pattern seen from Chrome's fake camera at 30 fps: mostly ~31 ms with some ~48 ms
    // intervals. Here 7 x 31 ms + 1 x 48 ms = 265 ms per 8 frames (30.19 fps).
    const clock = new FrameClock({ windowSize: 80 });
    const raws = [0];
    for (let i = 0; i < 160; i++) {
      raws.push((raws[raws.length - 1] as number) + (i % 8 === 7 ? 48 : 31));
    }
    pushAll(clock, raws);
    const s = clock.stats();
    expect(s.medianDtMs).toBe(31);
    expect(s.fps).toBeCloseTo(8000 / 265, 9); // not 1000 / 31 = 32.3
    expect(s.irregularIntervals).toBe(20); // 48 > 1.5 x 31 (spec rule): a warning only
    expect(s.gaps).toBe(0); // 48 < 2.5 x 31: no data break, nothing invalidated
  });

  it('excludes gap intervals from jitter', () => {
    const clock = new FrameClock();
    const base = regular(30, 33, 0);
    pushAll(clock, base);
    clock.push((base[base.length - 1] as number) + 500);
    expect(clock.stats().jitterMs).toBeCloseTo(0, 9);
  });

  it('does not flag gaps before the median is available', () => {
    const clock = new FrameClock({ minIntervals: 5 });
    const ticks = pushAll(clock, [0, 33, 66, 1000]);
    expect(ticks.some((t) => t?.gap)).toBe(false);
  });

  it('markGap("dropped") makes the next interval a gap that still counts in the stats', () => {
    const clock = new FrameClock({ windowSize: 21 });
    pushAll(clock, regular(21, 33, 0));
    clock.markGap('dropped');
    const tick = clock.push(20 * 33 + 66);
    expect(tick).toMatchObject({ gap: true, gapReason: 'dropped' });
    expect(clock.stats().fps).toBeCloseTo(1000 / ((20 * 33 + 66) / 21), 9); // 21 intervals
  });

  it('markGap flags the next interval (hidden tab)', () => {
    const clock = new FrameClock();
    pushAll(clock, regular(20, 33, 0));
    clock.markGap('hidden');
    const tick = clock.push(19 * 33 + 33); // even a normal interval is flagged
    expect(tick?.gap).toBe(true);
    expect(tick?.gapReason).toBe('hidden');
    expect(clock.push(21 * 33)?.gap).toBe(false); // only one interval
  });

  it('a long hidden pause does not distort the median', () => {
    const clock = new FrameClock({ windowSize: 10 });
    pushAll(clock, regular(11, 33, 0));
    clock.markGap('hidden');
    clock.push(10 * 33 + 60_000);
    expect(clock.stats().medianDtMs).toBeCloseTo(33, 9);
  });

  it('rebase accepts a timestamp on a new clock and continues one median step later', () => {
    const clock = new FrameClock();
    pushAll(clock, regular(20, 33, 100_000));
    clock.rebase();
    const tick = clock.push(5); // much smaller: different time base
    expect(tick?.tMs).toBeCloseTo(19 * 33 + 33, 9);
    expect(tick?.gapReason).toBe('sourceChange');
    expect(clock.push(38)?.tMs).toBeCloseTo(19 * 33 + 66, 9);
  });

  it('keeps at most maxGapHistory gaps', () => {
    const clock = new FrameClock({ maxGapHistory: 3 });
    pushAll(clock, regular(10, 10, 0));
    let t = 90;
    for (let i = 0; i < 5; i++) {
      clock.markGap('hidden');
      t += 1000;
      clock.push(t);
    }
    expect(clock.gapIntervals().length).toBe(3);
    expect(clock.stats().gaps).toBe(5);
  });

  it('validates options', () => {
    expect(() => new FrameClock({ irregularFactor: 1 })).toThrow(RangeError);
    expect(() => new FrameClock({ gapFactor: 1.2 })).toThrow(RangeError);
    expect(() => new FrameClock({ windowSize: 3, minIntervals: 5 })).toThrow(RangeError);
  });
});

describe('spansGap', () => {
  const gaps = [{ startMs: 1000, endMs: 1500, reason: 'hidden' as const }];
  it('detects overlap', () => {
    expect(spansGap(gaps, 0, 1200)).toBe(true);
    expect(spansGap(gaps, 1100, 1200)).toBe(true);
    expect(spansGap(gaps, 1400, 3000)).toBe(true);
  });
  it('touching endpoints are not an overlap', () => {
    expect(spansGap(gaps, 0, 1000)).toBe(false);
    expect(spansGap(gaps, 1500, 2000)).toBe(false);
    expect(spansGap([], 0, 1e9)).toBe(false);
  });
});
