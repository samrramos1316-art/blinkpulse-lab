import { describe, expect, it } from 'vitest';
import type { BlinkEvent } from './blinkDetector.ts';
import { BlinkMetrics, MIN_VALID_MS_FOR_RATE } from './metrics.ts';

const ev = (
  startMs: number,
  durationMs: number,
  kind: BlinkEvent['kind'] = 'blink',
): BlinkEvent => ({
  startMs,
  endMs: startMs + durationMs,
  durationMs,
  kind,
  lowConfidence: false,
  samplesBelow: 3,
  minEar: 0.05,
});

/** Feed valid samples every 25 ms over [from, to], optionally invalid inside `bad`. */
function feed(m: BlinkMetrics, from: number, to: number, bad?: [number, number]) {
  for (let t = from; t <= to; t += 25) {
    const valid = !(bad && t >= bad[0] && t < bad[1]);
    m.addSample({ tMs: t, ear: 0.3, valid });
  }
}

describe('BlinkMetrics', () => {
  it('rate is per valid minute, not per wall-clock minute', () => {
    const m = new BlinkMetrics();
    // 60 s window, but the middle 30 s are invalid (head turned): 30 s valid time.
    feed(m, 0, 60_000, [15_000, 45_000]);
    for (let i = 0; i < 10; i++) m.addEvent(ev(1000 + i * 1000, 200));
    const s = m.snapshot();
    expect(s.validMs).toBeCloseTo(30_000, -2);
    expect(s.blinkCount).toBe(10);
    expect(s.ratePerMin).toBeCloseTo((10 * 60_000) / s.validMs, 9); // about 20/min
  });

  it('withholds rate and closed fraction until enough valid time', () => {
    const m = new BlinkMetrics();
    feed(m, 0, MIN_VALID_MS_FOR_RATE - 1000);
    m.addEvent(ev(1000, 200));
    const s = m.snapshot();
    expect(s.ratePerMin).toBeNull();
    expect(s.closedFraction).toBeNull();
    expect(s.lastDurationMs).toBe(200);
  });

  it('durations: median, mean, last; extended closures excluded from blinks', () => {
    const m = new BlinkMetrics();
    feed(m, 0, 30_000);
    [100, 200, 600].forEach((d, i) => {
      m.addEvent(ev(1000 + i * 2000, d, d < 500 ? 'blink' : 'long_closure'));
    });
    m.addEvent(ev(10_000, 3000, 'extended_closure'));
    const s = m.snapshot();
    expect(s.blinkCount).toBe(3);
    expect(s.medianDurationMs).toBe(200);
    expect(s.meanDurationMs).toBe(300);
    expect(s.lastDurationMs).toBe(600);
    expect(s.longClosures).toBe(1);
    expect(s.extendedClosures).toBe(1);
  });

  it('eye-closed fraction = closed time / valid time (all event kinds)', () => {
    const m = new BlinkMetrics();
    feed(m, 0, 40_000);
    m.addEvent(ev(1000, 400));
    m.addEvent(ev(5000, 1600, 'long_closure'));
    const s = m.snapshot();
    expect(s.closedFraction).toBeCloseTo(2000 / 40_000, 3);
  });

  it('drops events and valid time older than the 60 s window', () => {
    const m = new BlinkMetrics();
    feed(m, 0, 30_000);
    m.addEvent(ev(1000, 200));
    feed(m, 30_025, 100_000);
    m.addEvent(ev(90_000, 200));
    const s = m.snapshot();
    expect(s.blinkCount).toBe(1);
    expect(s.validMs).toBeCloseTo(60_000, -2);
  });

  it('gaps (> 100 ms or flagged) are not valid time', () => {
    const m = new BlinkMetrics();
    m.addSample({ tMs: 0, ear: 0.3, valid: true });
    m.addSample({ tMs: 50, ear: 0.3, valid: true });
    m.addSample({ tMs: 300, ear: 0.3, valid: true }); // 250 ms gap
    m.addSample({ tMs: 350, ear: 0.3, valid: true, gapBefore: true });
    m.addSample({ tMs: 400, ear: 0.3, valid: true });
    expect(m.snapshot().validMs).toBe(100);
  });
});
