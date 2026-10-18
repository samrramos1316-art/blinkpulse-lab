import { describe, expect, it } from 'vitest';
import { classifyDuration, type BlinkEvent } from './blinkDetector.ts';
import {
  BASELINE_VALID_MS,
  EVAL_HOP_MS,
  EyeClosureTracker,
  LONG_WINDOW_MS,
  RATIO_CAP,
  SHORT_WINDOW_MS,
  bandOf,
  eciFromFactors,
  summarizeTrend,
  type EyeClosureFactors,
} from './sleepiness.ts';

/**
 * Synthetic eyelid behaviour: open EAR 0.30 (calibrated baseline 0.30, so the closed
 * level is 0.06), closed EAR 0.03 during each closure. Closures are given as
 * [start, duration] pairs; the matching detector events are pushed when they end.
 */
const OPEN = 0.3;
const CLOSED = 0.03;

interface Segment {
  fromMs: number;
  toMs: number;
  fps?: number;
  /** One blink of `blinkMs` every `everyMs`, the first at fromMs + everyMs / 2. */
  everyMs?: number;
  blinkMs?: number;
  /** Extra closures of `longMs` every `longEveryMs`. */
  longEveryMs?: number;
  longMs?: number;
  /** Per-frame validity override. */
  invalid?: (tMs: number) => 'noFace' | 'headTurned' | null;
  gapEvery?: number;
}

function closuresOf(seg: Segment): [number, number][] {
  const out: [number, number][] = [];
  if (seg.everyMs && seg.blinkMs) {
    for (let t = seg.fromMs + seg.everyMs / 2; t + seg.blinkMs < seg.toMs; t += seg.everyMs)
      out.push([t, seg.blinkMs]);
  }
  if (seg.longEveryMs && seg.longMs) {
    for (let t = seg.fromMs + seg.longEveryMs / 3; t + seg.longMs < seg.toMs; t += seg.longEveryMs)
      out.push([t, seg.longMs]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function event(startMs: number, durationMs: number): BlinkEvent {
  return {
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    kind: classifyDuration(durationMs),
    lowConfidence: false,
    samplesBelow: 3,
    minEar: CLOSED,
  };
}

function run(tr: EyeClosureTracker, seg: Segment): void {
  const fps = seg.fps ?? 30;
  const dt = 1000 / fps;
  const closures = closuresOf(seg);
  let next = 0;
  let frame = 0;
  for (let t = seg.fromMs; t < seg.toMs; t += dt, frame++) {
    const closed = closures.some(([s, d]) => t >= s && t < s + d);
    const bad = seg.invalid?.(t) ?? null;
    tr.addSample({
      tMs: t,
      ear: closed ? CLOSED : OPEN,
      valid: bad === null,
      ...(bad ? { reason: bad } : {}),
      gapBefore: seg.gapEvery !== undefined && frame % seg.gapEvery === 0,
    });
    while (next < closures.length) {
      const [s, d] = closures[next] as [number, number];
      if (s + d > t) break;
      tr.addEvent(event(s, d));
      next++;
    }
  }
}

/** A calibrated tracker with a finished baseline of 15 blinks/min, 150 ms each. */
function withBaseline(): EyeClosureTracker {
  const tr = new EyeClosureTracker();
  tr.setEarBaseline(OPEN);
  tr.startBaseline();
  run(tr, { fromMs: 0, toMs: BASELINE_VALID_MS + 2000, everyMs: 4000, blinkMs: 150 });
  return tr;
}

const BASE_END = BASELINE_VALID_MS + 2000;

describe('eciFromFactors', () => {
  const base: EyeClosureFactors = {
    closedFraction: 0.04,
    longPerMin: 0,
    meanBlinkMs: 150,
    blinksPerMin: 15,
  };

  it('a window equal to the baseline gives exactly 1, even with values under the floors', () => {
    expect(eciFromFactors(base, base).eci).toBe(1);
    const tiny = { ...base, closedFraction: 0.001 };
    expect(eciFromFactors(tiny, tiny).eci).toBe(1);
  });

  it('blink rate is reported as a ratio but never changes the ECI', () => {
    const r = eciFromFactors({ ...base, blinksPerMin: 30 }, base);
    expect(r.eci).toBe(1);
    expect(r.ratios.blinkRate).toBe(2);
  });

  it('caps each ratio', () => {
    const r = eciFromFactors({ ...base, longPerMin: 10 }, base);
    expect(r.ratios.longClosures).toBe(RATIO_CAP);
    expect(r.eci).toBeCloseTo((1 + RATIO_CAP + 1) / 3, 12);
  });

  it('bands use the provisional cut-offs', () => {
    expect(bandOf(1.49)).toBe('near');
    expect(bandOf(1.5)).toBe('somewhatAbove');
    expect(bandOf(2.5)).toBe('wellAbove');
  });
});

describe('alert baseline', () => {
  it('measures the known closed fraction, blink rate, and duration', () => {
    const b = withBaseline().baseline;
    expect(b.phase).toBe('done');
    if (b.phase !== 'done') return;
    // 150 ms closed per 4 s; closed frames counted on 33 ms intervals: within one frame per blink.
    expect(b.values.closedFraction).toBeCloseTo(150 / 4000, 2);
    expect(b.values.blinksPerMin).toBeCloseTo(15, 0);
    expect(b.values.meanBlinkMs).toBe(150);
    expect(b.values.longPerMin).toBe(0);
    expect(b.values.blinkCount).toBeGreaterThanOrEqual(10);
  });

  it('reports progress while running and fails without enough valid time', () => {
    const tr = new EyeClosureTracker();
    tr.setEarBaseline(OPEN);
    tr.startBaseline();
    run(tr, { fromMs: 0, toMs: 60_000, everyMs: 4000, blinkMs: 150 });
    const b = tr.baseline;
    expect(b.phase).toBe('running');
    if (b.phase === 'running') expect(b.progress).toBeCloseTo(60_000 / BASELINE_VALID_MS, 2);
    // Face lost from then on: 6 minutes of clock time pass without 3 valid minutes.
    run(tr, { fromMs: 60_000, toMs: 400_000, invalid: () => 'noFace' });
    expect(tr.baseline).toEqual({ phase: 'failed', reason: 'notEnoughValid' });
  });

  it('fails with too few blinks', () => {
    const tr = new EyeClosureTracker();
    tr.setEarBaseline(OPEN);
    tr.startBaseline();
    run(tr, { fromMs: 0, toMs: BASE_END, everyMs: 40_000, blinkMs: 150 });
    expect(tr.baseline).toEqual({ phase: 'failed', reason: 'tooFewBlinks' });
  });

  it('a new calibration clears the baseline', () => {
    const tr = withBaseline();
    tr.setEarBaseline(0.28);
    expect(tr.baseline.phase).toBe('none');
    expect(tr.evaluate(SHORT_WINDOW_MS, BASE_END).ok).toBe(false);
  });
});

describe('Eye-Closure Index on synthetic sequences', () => {
  it('behaviour like the baseline gives an ECI near 1', () => {
    const tr = withBaseline();
    run(tr, { fromMs: BASE_END, toMs: BASE_END + LONG_WINDOW_MS, everyMs: 4000, blinkMs: 150 });
    const r = tr.evaluate(LONG_WINDOW_MS, BASE_END + LONG_WINDOW_MS - 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eci).toBeCloseTo(1, 1);
    expect(r.band).toBe('near');
  });

  it('known closed fraction, long-closure rate, and duration give the expected ratios', () => {
    const tr = withBaseline();
    // Blinks twice as long (300 ms) plus one 800 ms closure per minute.
    run(tr, {
      fromMs: BASE_END,
      toMs: BASE_END + LONG_WINDOW_MS,
      everyMs: 4000,
      blinkMs: 300,
      longEveryMs: 60_000,
      longMs: 800,
    });
    const r = tr.evaluate(LONG_WINDOW_MS, BASE_END + LONG_WINDOW_MS - 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.factors.meanBlinkMs).toBe(300);
    expect(r.ratios.blinkDuration).toBe(2);
    expect(r.factors.longPerMin).toBeCloseTo(1, 1);
    // Baseline had no long closures, so the floor (0.2/min) is the denominator: 1 / 0.2 = 5.
    expect(r.ratios.longClosures).toBeCloseTo(RATIO_CAP, 1);
    // Closed time: (300 ms x 15 + 800 ms) per minute = 5.3 s/min vs 2.25 s/min at baseline.
    expect(r.ratios.closedFraction).toBeCloseTo(5300 / 2250, 1);
    expect(r.eci).toBeCloseTo((2 + 5 + 5300 / 2250) / 3, 1);
    expect(r.band).toBe('wellAbove');
  });

  it('a rising-closure sequence gives a non-decreasing 5-minute trend', () => {
    const tr = withBaseline();
    let t = BASE_END;
    for (let blinkMs = 150; blinkMs <= 400; blinkMs += 25) {
      run(tr, { fromMs: t, toMs: t + 60_000, everyMs: 4000, blinkMs });
      t += 60_000;
    }
    const values = tr.trend.flatMap((p) => (p.long.ok ? [p.long.eci] : []));
    expect(values.length).toBeGreaterThan(30);
    for (let i = 1; i < values.length; i++)
      expect(values[i] as number).toBeGreaterThanOrEqual((values[i - 1] as number) - 0.01);
    expect(values[values.length - 1] as number).toBeGreaterThan((values[0] as number) + 0.5);
  });

  it('evaluates both windows every 10 s once the baseline is done', () => {
    const tr = withBaseline();
    const before = tr.trend.length;
    run(tr, { fromMs: BASE_END, toMs: BASE_END + 60_000, everyMs: 4000, blinkMs: 150 });
    expect(tr.trend.length - before).toBe(60_000 / EVAL_HOP_MS);
  });
});

describe('gating: never a number from bad data', () => {
  const after = (seg: Omit<Segment, 'fromMs' | 'toMs'>, windowMs = SHORT_WINDOW_MS) => {
    const tr = withBaseline();
    run(tr, { fromMs: BASE_END, toMs: BASE_END + windowMs, everyMs: 4000, blinkMs: 150, ...seg });
    return tr.evaluate(windowMs, BASE_END + windowMs - 1);
  };

  it('no calibration and no baseline', () => {
    const tr = new EyeClosureTracker();
    expect(tr.evaluate(SHORT_WINDOW_MS, 0)).toMatchObject({ ok: false, reason: 'noCalibration' });
    tr.setEarBaseline(OPEN);
    run(tr, { fromMs: 0, toMs: 70_000, everyMs: 4000, blinkMs: 150 });
    expect(tr.evaluate(SHORT_WINDOW_MS, 69_000)).toMatchObject({ ok: false, reason: 'noBaseline' });
  });

  it('face lost for half the window', () => {
    const r = after({ invalid: (t) => (t % 20_000 < 10_000 ? 'noFace' : null) });
    expect(r).toMatchObject({ ok: false, reason: 'noFace' });
    expect(r.coverage).toBeCloseTo(0.5, 1);
  });

  it('head turned for most of the window', () => {
    expect(after({ invalid: (t) => (t % 10_000 < 6000 ? 'headTurned' : null) })).toMatchObject({
      ok: false,
      reason: 'headTurned',
    });
  });

  it('frame gaps', () => {
    expect(after({ gapEvery: 2 })).toMatchObject({ ok: false, reason: 'gap' });
  });

  it('low frame rate', () => {
    expect(after({ fps: 20 })).toMatchObject({ ok: false, reason: 'lowFps' });
  });

  it('too few blinks for a duration', () => {
    expect(after({ everyMs: 30_000 })).toMatchObject({ ok: false, reason: 'tooFewBlinks' });
  });

  it('a window longer than the measured time: warming up', () => {
    const tr = new EyeClosureTracker();
    tr.setEarBaseline(OPEN);
    tr.startBaseline();
    run(tr, { fromMs: 0, toMs: BASE_END, everyMs: 4000, blinkMs: 150 });
    // Baseline lasted ~3 min; a 5-minute window right after it is only ~60% recorded.
    expect(tr.evaluate(LONG_WINDOW_MS, BASE_END - 1)).toMatchObject({
      ok: false,
      reason: 'warmingUp',
    });
  });

  it('a camera restart keeps the baseline but clears the trend', () => {
    const tr = withBaseline();
    run(tr, { fromMs: BASE_END, toMs: BASE_END + 30_000, everyMs: 4000, blinkMs: 150 });
    tr.reset();
    expect(tr.trend).toHaveLength(0);
    expect(tr.baseline.phase).toBe('done');
  });
});

describe('summarizeTrend', () => {
  it('counts minutes per band and without data, first and last usable values', () => {
    const tr = withBaseline();
    // 5 normal minutes, then 1 minute without a face, then 2 minutes of longer blinks.
    const t1 = BASE_END + 300_000;
    const t2 = t1 + 60_000;
    run(tr, { fromMs: BASE_END, toMs: t1, everyMs: 4000, blinkMs: 150 });
    run(tr, { fromMs: t1, toMs: t2, invalid: () => 'noFace' });
    run(tr, { fromMs: t2, toMs: t2 + 120_000, everyMs: 4000, blinkMs: 400 });
    const s = summarizeTrend(tr.trend);
    const total =
      s.minutesInBand.near +
      s.minutesInBand.somewhatAbove +
      s.minutesInBand.wellAbove +
      s.minutesNotEnoughData;
    expect(total).toBeCloseTo((tr.trend.length * EVAL_HOP_MS) / 60_000, 9);
    expect(s.minutesInBand.near).toBeGreaterThan(0);
    expect(s.minutesNotEnoughData).toBeGreaterThan(0);
    expect(s.firstUsable).not.toBeNull();
    expect(s.lastUsable).not.toBeNull();
  });
});
