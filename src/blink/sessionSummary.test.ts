import { describe, expect, it } from 'vitest';
import {
  synthEar,
  truthEvents,
  typicalBlink,
  type BlinkShape,
  type SynthEarOptions,
} from '../../tools/synth.ts';
import { BlinkDetector, type BlinkEvent } from './blinkDetector.ts';
import { thresholdsFromBaseline } from './calibration.ts';
import { median } from '../dsp/stats.ts';
import { BIN_MS, SessionSummary, sessionToCsv, type SessionSample } from './sessionSummary.ts';

const event = (
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

/** Valid samples every `stepMs` over [fromMs, toMs). */
function feed(
  s: SessionSummary,
  fromMs: number,
  toMs: number,
  stepMs = 10,
  extra: Partial<SessionSample> = {},
) {
  for (let t = fromMs; t < toMs; t += stepMs) s.addSample({ tMs: t, valid: true, ...extra });
}

describe('SessionSummary bins', () => {
  it('splits valid time exactly at minute boundaries', () => {
    const s = new SessionSummary();
    feed(s, 0, 120_000);
    const [a, b] = s.bins();
    expect(a?.validMs).toBeCloseTo(60_000, 6);
    expect(b?.validMs).toBeCloseTo(59_990, 6);
    expect(a?.usable).toBe(true);
    expect(a?.medianFrameMs).toBeCloseTo(10, 9);
  });

  it('a usable minute with no blinks reports 0 blinks and null durations', () => {
    const s = new SessionSummary();
    feed(s, 0, 61_000);
    const b = s.bins()[0];
    expect(b?.blinkCount).toBe(0);
    expect(b?.ratePerMin).toBe(0);
    expect(b?.closedFraction).toBe(0);
    expect(b?.medianDurationMs).toBeNull();
  });

  it('an unusable minute reports null for every value, never 0', () => {
    const s = new SessionSummary();
    feed(s, 0, 30_000);
    feed(s, 30_000, 61_000, 10, { valid: false, reason: 'noFace' });
    s.addEvent(event(5_000, 150));
    const b = s.bins()[0];
    expect(b?.usable).toBe(false);
    expect(b?.coverage).toBeCloseTo(0.5, 3);
    expect(b?.mainReason).toBe('noFace');
    for (const k of [
      'blinkCount',
      'ratePerMin',
      'medianDurationMs',
      'meanDurationMs',
      'longClosures',
      'extendedClosures',
      'closedFraction',
    ] as const) {
      expect(b?.[k], k).toBeNull();
    }
  });

  it('the current, partial minute stays unusable until it has 70% of a minute of valid time', () => {
    const s = new SessionSummary();
    feed(s, 0, 40_000);
    expect(s.bins()[0]?.usable).toBe(false);
    feed(s, 40_000, 43_000);
    expect(s.bins()[0]?.usable).toBe(true);
  });

  it('attributes lost time to the right reason', () => {
    const s = new SessionSummary();
    feed(s, 0, 10_000);
    feed(s, 10_000, 15_000, 10, { valid: false, reason: 'headTurned' });
    feed(s, 15_000, 20_000, 10, { valid: false, reason: 'calibrating' });
    feed(s, 20_000, 25_000); // first interval back is lost to the previous reason
    s.addSample({ tMs: 30_000, valid: true }); // 5 s gap (> 100 ms)
    s.addSample({ tMs: 30_010, valid: true, gapBefore: true }); // flagged gap
    const lost = s.bins()[0]?.lostMs;
    expect(lost?.headTurned).toBeCloseTo(5_000, 6);
    expect(lost?.calibrating).toBeCloseTo(5_010, 6); // plus the 10 ms interval back to valid
    expect(lost?.gap).toBeCloseTo(5_020, 6); // 24.99 s -> 30 s, plus the flagged 10 ms
    expect(lost?.noFace).toBe(0);
  });

  it('assigns events by start and splits closed time across the boundary', () => {
    const s = new SessionSummary();
    feed(s, 0, 120_000);
    s.addEvent(event(59_900, 200)); // 100 ms in each minute
    s.addEvent(event(70_000, 800, 'long_closure'));
    s.addEvent(event(80_000, 3000, 'extended_closure'));
    const [a, b] = s.bins();
    expect(a?.blinkCount).toBe(1);
    expect(b?.blinkCount).toBe(1); // the long closure; extended closures are not blinks
    expect(b?.longClosures).toBe(1);
    expect(b?.extendedClosures).toBe(1);
    expect(a?.closedFraction).toBeCloseTo(100 / 60_000, 9);
    expect(b?.closedFraction).toBeCloseTo((100 + 800 + 3000) / 59_990, 9);
  });

  it('marks a bin below 24 fps as low FPS', () => {
    const s = new SessionSummary();
    feed(s, 0, 61_000, 50); // 20 fps
    expect(s.bins()[0]?.lowFps).toBe(true);
    expect(s.bins()[0]?.mainReason).toBe('lowFps');
  });

  it('exports numbers only, with empty cells for unusable minutes', () => {
    const s = new SessionSummary();
    feed(s, 0, 60_000);
    feed(s, 60_000, 90_000, 10, { valid: false, reason: 'noFace' });
    const lines = sessionToCsv(s.bins()).trim().split('\n');
    expect(lines[0]?.split(',')).toContain('closed_fraction');
    expect(lines[1]).toMatch(/^1,0,60,1\.000,1,0,0\.00,,,0,0,0\.0000,/);
    expect(lines[2]).toMatch(/^2,60,120,0\.000,0,,,,,,,,30\.0,/);
  });
});

describe('SessionSummary on a synthetic 5-minute session (Patch B tests)', () => {
  const BASELINE = 0.3;
  const TH = thresholdsFromBaseline(BASELINE);
  const at = (from: number, n: number, spacing: number, scale = 1) =>
    Array.from({ length: n }, (_, i) => typicalBlink(from + i * spacing, scale));
  const long = (atMs: number): BlinkShape => ({ ...typicalBlink(atMs), holdMs: 700 });

  const noFace: [number, number] = [70_000, 100_000]; // minute 2: 30 s face lost
  const turned: [number, number] = [125_000, 150_000]; // minute 3: 25 s head turned
  const drop: [number, number] = [190_000, 210_000]; // minute 4: 20 s without frames
  const opts: SynthEarOptions = {
    durationMs: 300_000,
    fps: 30,
    baseline: BASELINE,
    noiseSd: 0.005,
    jitterMs: 2,
    seed: 7,
    blinks: [
      ...at(2_000, 12, 4_800), // minute 1: 12 blinks
      ...at(62_000, 3, 2_500), // minute 2 (unusable)
      ...at(102_000, 4, 4_000),
      ...at(152_000, 3, 2_500), // minute 3 (unusable)
      ...at(182_000, 2, 3_000), // minute 4 (unusable)
      ...at(212_000, 6, 4_000),
      ...at(242_000, 6, 4_000, 1.3), // minute 5: 6 slower blinks + 2 long closures
      long(270_000),
      long(285_000),
    ],
    invalid: [noFace, turned],
    drops: [drop],
  };
  const inside = (t: number, [a, b]: [number, number]) => t >= a && t < b;

  const det = new BlinkDetector(TH);
  const s = new SessionSummary();
  for (const x of synthEar(opts)) {
    const reason = inside(x.tMs, turned) ? 'headTurned' : 'noFace';
    const sample = { tMs: x.tMs, ear: x.ear, valid: x.valid };
    s.addSample(x.valid ? { tMs: x.tMs, valid: true } : { tMs: x.tMs, valid: false, reason });
    const e = det.push(sample);
    if (e) s.addEvent(e);
  }
  const bins = s.bins();
  const truth = truthEvents(opts, TH.closeEar, TH.reopenEar);
  const truthIn = (i: number) => truth.filter((e) => Math.floor(e.startMs / BIN_MS) === i);

  it('has 5 bins; minutes 2-4 are unusable for the right reason', () => {
    expect(bins.map((b) => b.usable)).toEqual([true, false, false, false, true]);
    expect(bins.map((b) => b.mainReason)).toEqual([null, 'noFace', 'headTurned', 'gap', null]);
    expect(bins[1]?.blinkCount).toBeNull();
    expect(bins[3]?.ratePerMin).toBeNull();
  });

  it('usable minutes: counts exact, rates and fractions within tolerance', () => {
    for (const i of [0, 4]) {
      const b = bins[i];
      const t = truthIn(i);
      const blinksT = t.filter((e) => e.durationMs <= 500);
      const longT = t.filter((e) => e.durationMs > 500 && e.durationMs <= 2000);
      expect(b?.blinkCount, `minute ${String(i + 1)}`).toBe(t.length);
      expect(b?.longClosures).toBe(longT.length);
      expect(b?.ratePerMin).toBeCloseTo((t.length * 60_000) / (b?.validMs ?? NaN), 9);
      // Each detected duration is within one frame (33 ms) of the truth; see METHODS.
      const closedT = t.reduce((acc, e) => acc + e.durationMs, 0) / (b?.validMs ?? NaN);
      expect(Math.abs((b?.closedFraction ?? NaN) - closedT)).toBeLessThan((t.length * 34) / 60_000);
      expect(
        Math.abs(
          (b?.medianDurationMs ?? NaN) - median([...blinksT, ...longT].map((e) => e.durationMs)),
        ),
      ).toBeLessThan(34);
    }
    expect(bins[0]?.blinkCount).toBe(12);
    expect(bins[4]?.longClosures).toBe(2);
  });

  it('lost time matches the injected dropout, head turn, and gap', () => {
    expect((bins[1]?.lostMs.noFace ?? 0) / 1000).toBeCloseTo(30, 0);
    expect((bins[2]?.lostMs.headTurned ?? 0) / 1000).toBeCloseTo(25, 0);
    expect((bins[3]?.lostMs.gap ?? 0) / 1000).toBeCloseTo(20, 0);
    expect(bins[0]?.coverage).toBeGreaterThan(0.99);
  });
});
