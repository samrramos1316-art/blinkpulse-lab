import { describe, expect, it } from 'vitest';
import {
  rng,
  synthEar,
  truthEvents,
  typicalBlink,
  type BlinkShape,
  type SynthEarOptions,
} from '../../tools/synth.ts';
import {
  BlinkDetector,
  classifyDuration,
  crossingTime,
  type BlinkEvent,
  type EarSample,
} from './blinkDetector.ts';
import { thresholdsFromBaseline } from './calibration.ts';
import { matchEvents } from './eventMatching.ts';

const BASELINE = 0.3;
const TH = thresholdsFromBaseline(BASELINE);

function run(samples: readonly EarSample[], th = TH): { events: BlinkEvent[]; det: BlinkDetector } {
  const det = new BlinkDetector(th);
  const events: BlinkEvent[] = [];
  for (const s of samples) {
    const e = det.push(s);
    if (e) events.push(e);
  }
  return { events, det };
}

/** Blinks at random times, at least `minSpacingMs` apart (seeded). */
function randomBlinks(n: number, durationMs: number, seed: number, scale = 1): BlinkShape[] {
  const r = rng(seed);
  const out: BlinkShape[] = [];
  let t = 800;
  const step = (durationMs - 1600) / n;
  for (let i = 0; i < n; i++) {
    out.push(typicalBlink(t + r() * (step - 600), scale * (0.7 + 0.6 * r())));
    t += step;
  }
  return out;
}

function evaluate(opts: SynthEarOptions) {
  const truth = truthEvents(opts, TH.closeEar, TH.reopenEar);
  const { events, det } = run(synthEar(opts));
  const m = matchEvents(truth, events);
  const maxDurErr = Math.max(0, ...m.durationErrorsMs);
  return { truth, events, m, maxDurErr, det };
}

describe('crossingTime and classifyDuration', () => {
  it('interpolates linearly between two samples', () => {
    expect(crossingTime(0, 0.3, 40, 0.1, 0.2)).toBeCloseTo(20, 12);
    expect(crossingTime(100, 0.1, 110, 0.3, 0.25)).toBeCloseTo(107.5, 12);
  });
  it('classifies durations descriptively', () => {
    expect(classifyDuration(499)).toBe('blink');
    expect(classifyDuration(500)).toBe('long_closure');
    expect(classifyDuration(2000)).toBe('long_closure');
    expect(classifyDuration(2001)).toBe('extended_closure');
  });
});

describe('BlinkDetector on synthetic EAR (PROJECT_SPEC 6.3)', () => {
  for (const fps of [24, 30, 60]) {
    const frameMs = 1000 / fps;

    it(`clean blinks at ${fps} fps: all found, duration error < 1 frame`, () => {
      const opts: SynthEarOptions = {
        durationMs: 60_000,
        fps,
        baseline: BASELINE,
        blinks: randomBlinks(15, 60_000, fps),
      };
      const { m, maxDurErr, truth } = evaluate(opts);
      expect(truth.length).toBe(15);
      expect(m.precision).toBe(1);
      expect(m.recall).toBe(1);
      expect(maxDurErr).toBeLessThan(frameMs);
    });

    it(`noisy baseline (sd 0.01) and 3 ms jitter at ${fps} fps`, () => {
      const opts: SynthEarOptions = {
        durationMs: 60_000,
        fps,
        baseline: BASELINE,
        blinks: randomBlinks(15, 60_000, fps + 1),
        noiseSd: 0.01,
        jitterMs: 3,
        seed: fps,
      };
      const { m, maxDurErr } = evaluate(opts);
      expect(m.precision).toBe(1);
      expect(m.recall).toBe(1);
      expect(maxDurErr).toBeLessThan(frameMs);
    });
  }

  it('fast blink (about 116 ms, under 3 frames) at 24 fps is still found', () => {
    const blink: BlinkShape = { atMs: 1000, closeMs: 50, holdMs: 20, openMs: 80, minRatio: 0.1 };
    const opts: SynthEarOptions = {
      durationMs: 3000,
      fps: 24,
      baseline: BASELINE,
      blinks: [blink],
    };
    const { m, truth, events } = evaluate(opts);
    expect(truth[0]?.durationMs).toBeLessThan(3 * (1000 / 24));
    expect(m.recall).toBe(1);
    expect(events[0]?.samplesBelow).toBeLessThanOrEqual(3);
  });

  it('slow blink (400 ms) is one "blink", not split', () => {
    const blink: BlinkShape = {
      atMs: 1000,
      closeMs: 150,
      holdMs: 100,
      openMs: 250,
      minRatio: 0.15,
    };
    const opts: SynthEarOptions = {
      durationMs: 3000,
      fps: 30,
      baseline: BASELINE,
      blinks: [blink],
    };
    const { events, truth } = evaluate(opts);
    expect(events.length).toBe(1);
    expect(events[0]?.kind).toBe('blink');
    expect(Math.abs((events[0]?.durationMs ?? 0) - (truth[0]?.durationMs ?? 0))).toBeLessThan(34);
  });

  it('long closure (1 s) and extended closure (3 s) are classified', () => {
    const opts: SynthEarOptions = {
      durationMs: 8000,
      fps: 30,
      baseline: BASELINE,
      blinks: [
        { atMs: 1000, closeMs: 100, holdMs: 900, openMs: 150, minRatio: 0.1 },
        { atMs: 4000, closeMs: 100, holdMs: 2900, openMs: 150, minRatio: 0.1 },
      ],
    };
    const { events } = evaluate(opts);
    expect(events.map((e) => e.kind)).toEqual(['long_closure', 'extended_closure']);
  });

  it('single-frame dip is reported with lowConfidence', () => {
    // One sample below the close threshold, neighbours open.
    const samples: EarSample[] = [0, 33, 66, 100, 133, 166].map((t, i) => ({
      tMs: t,
      ear: i === 3 ? 0.15 : BASELINE,
      valid: true,
    }));
    const { events } = run(samples);
    expect(events.length).toBe(1);
    expect(events[0]?.lowConfidence).toBe(true);
    expect(events[0]?.samplesBelow).toBe(1);
  });

  it('squint that never reaches the close threshold is not an event', () => {
    const opts: SynthEarOptions = {
      durationMs: 3000,
      fps: 30,
      baseline: BASELINE,
      blinks: [{ atMs: 1000, closeMs: 150, holdMs: 400, openMs: 150, minRatio: 0.75 }],
    };
    expect(truthEvents(opts, TH.closeEar, TH.reopenEar)).toEqual([]);
    expect(run(synthEar(opts)).events).toEqual([]);
  });

  it('hysteresis: dipping just below close and wobbling under reopen is one event', () => {
    const ears = [0.3, 0.3, 0.2, 0.22, 0.205, 0.23, 0.2, 0.3, 0.3];
    const samples = ears.map((ear, i) => ({ tMs: i * 33, ear, valid: true }));
    const { events } = run(samples);
    expect(events.length).toBe(1);
  });

  it('drifting baseline (-0.03 per minute) with fixed thresholds: all blinks found', () => {
    const opts: SynthEarOptions = {
      durationMs: 60_000,
      fps: 30,
      baseline: BASELINE,
      blinks: randomBlinks(15, 60_000, 77),
      driftPerMin: -0.03,
      noiseSd: 0.005,
      seed: 5,
    };
    const { m } = evaluate(opts);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
  });

  it('dropped frames: events spanning a gap > 100 ms are discarded, others kept', () => {
    const blinks = [typicalBlink(1000), typicalBlink(3000), typicalBlink(5000)];
    const opts: SynthEarOptions = {
      durationMs: 7000,
      fps: 30,
      baseline: BASELINE,
      blinks,
      drops: [[3080, 3220]], // 140 ms gap during the second blink
    };
    const { events, det } = evaluate(opts);
    expect(events.length).toBe(2);
    expect(events[0]?.startMs).toBeLessThan(1200);
    expect(events[1]?.startMs).toBeGreaterThan(4900);
    expect(det.aborted).toBe(1);
  });

  it('a single dropped frame (< 100 ms gap) does not break an event', () => {
    const opts: SynthEarOptions = {
      durationMs: 3000,
      fps: 30,
      baseline: BASELINE,
      blinks: [typicalBlink(1000)],
      drops: [[1110, 1140]],
    };
    expect(evaluate(opts).events.length).toBe(1);
  });

  it('invalid samples (no face) cannot create or complete an event', () => {
    const opts: SynthEarOptions = {
      durationMs: 5000,
      fps: 30,
      baseline: BASELINE,
      blinks: [typicalBlink(1000), typicalBlink(3000)],
      invalid: [[1150, 1250]], // during the first blink
    };
    const { events, det } = evaluate(opts);
    expect(events.length).toBe(1);
    expect(events[0]?.startMs).toBeGreaterThan(2900);
    expect(det.aborted).toBe(1);
  });

  it('a gap flag from FrameClock (hidden tab) aborts the event', () => {
    const samples: EarSample[] = [
      { tMs: 0, ear: 0.3, valid: true },
      { tMs: 33, ear: 0.3, valid: true },
      { tMs: 66, ear: 0.1, valid: true },
      { tMs: 99, ear: 0.3, valid: true, gapBefore: true },
      { tMs: 132, ear: 0.3, valid: true },
    ];
    expect(run(samples).events).toEqual([]);
  });

  it('starting with closed eyes does not produce an event until the eye opens first', () => {
    const ears = [0.1, 0.1, 0.3, 0.3, 0.1, 0.3];
    const { events } = run(ears.map((ear, i) => ({ tMs: i * 33, ear, valid: true })));
    expect(events.length).toBe(1);
    expect(events[0]?.startMs).toBeGreaterThan(99);
  });

  it('rejects bad thresholds', () => {
    expect(() => new BlinkDetector({ closeEar: 0.25, reopenEar: 0.2 })).toThrow(RangeError);
  });
});
