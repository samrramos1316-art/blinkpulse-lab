import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_MS,
  ISI_MAX_MS,
  ISI_MIN_MS,
  PVT_DURATION_MS,
  PvtRun,
  TIMEOUT_MS,
  summarizePvt,
  type PvtTrial,
} from './pvt.ts';

/** Advance a run frame by frame (16 ms) until `untilMs`; returns the last view. */
function runTo(run: PvtRun, fromMs: number, untilMs: number) {
  let view = run.frame(fromMs);
  for (let t = fromMs + 16; t <= untilMs; t += 16) view = run.frame(t);
  return view;
}

/** Frames until the next stimulus shows; returns its onset. */
function nextOnset(run: PvtRun, fromMs: number): number {
  for (let t = fromMs; t < fromMs + 10_000; t += 16) {
    if (run.frame(t).kind === 'stimulus') return t;
  }
  throw new Error('no stimulus');
}

describe('PvtRun', () => {
  it('shows the first stimulus 1-4 s after the start, at the frame that shows it', () => {
    const run = new PvtRun({ random: () => 0.5 }); // ISI 2500 ms
    run.start(1000);
    expect(run.frame(3400).kind).toBe('waiting');
    expect(run.frame(3516)).toEqual({ kind: 'stimulus', elapsedMs: 0 });
    expect(run.frame(3616)).toEqual({ kind: 'stimulus', elapsedMs: 100 });
  });

  it('records RT from the onset frame to the input event and shows it for 1 s', () => {
    const run = new PvtRun({ random: () => 0 }); // ISI 1000 ms
    run.start(0);
    const onset = nextOnset(run, 0);
    run.respond(onset + 250);
    expect(run.trials).toEqual([
      {
        stimulusMs: onset,
        responseMs: onset + 250,
        rtMs: 250,
        lapse: false,
        falseStart: false,
        timeout: false,
      },
    ]);
    expect(run.frame(onset + 300)).toEqual({ kind: 'feedback', rtMs: 250 });
    // ISI 1000 ms from the response includes the 1 s feedback: next stimulus right after.
    expect(run.frame(onset + 250 + FEEDBACK_MS).kind).toBe('stimulus');
  });

  it('the next stimulus comes 1-4 s after the response, never during the feedback', () => {
    const run = new PvtRun({ random: () => 1 }); // ISI 4000 ms
    run.start(0);
    const onset = nextOnset(run, 0);
    run.respond(onset + 300);
    const next = nextOnset(run, onset + 316);
    expect(next - (onset + 300)).toBeGreaterThanOrEqual(ISI_MAX_MS);
    expect(next - (onset + 300)).toBeLessThan(ISI_MAX_MS + 16);
  });

  it('a lapse is RT >= 355 ms (Basner et al. 2011), 354 ms is not', () => {
    const run = new PvtRun({ random: () => 0 });
    run.start(0);
    let onset = nextOnset(run, 0);
    run.respond(onset + 354);
    onset = nextOnset(run, onset + 354 + ISI_MIN_MS);
    run.respond(onset + 355);
    expect(run.trials.map((t) => t.lapse)).toEqual([false, true]);
  });

  it('RT < 100 ms and a response with no stimulus are false starts, and restart the interval', () => {
    const run = new PvtRun({ random: () => 0 });
    run.start(0);
    run.respond(500); // nothing showing
    expect(run.frame(600)).toEqual({ kind: 'falseStart' });
    expect(run.frame(1499).kind).toBe('falseStart');
    const onset = nextOnset(run, 1500);
    expect(onset).toBe(1500);
    run.respond(onset + 99);
    const [a, b] = run.trials as [PvtTrial, PvtTrial];
    expect(a).toMatchObject({ stimulusMs: null, falseStart: true, lapse: false, rtMs: null });
    expect(b).toMatchObject({ stimulusMs: onset, rtMs: 99, falseStart: true, lapse: false });
  });

  it('a response timestamped before the onset frame is a false start (negative RT)', () => {
    const run = new PvtRun({ random: () => 0 });
    run.start(0);
    const onset = nextOnset(run, 0);
    run.respond(onset - 5);
    expect(run.trials[0]).toMatchObject({ rtMs: -5, falseStart: true });
  });

  it('no response within 30 s ends the trial as a lapse (decision D7)', () => {
    const run = new PvtRun({ random: () => 0 });
    run.start(0);
    const onset = nextOnset(run, 0);
    expect(run.frame(onset + TIMEOUT_MS - 1).kind).toBe('stimulus');
    expect(run.frame(onset + TIMEOUT_MS).kind).toBe('timeout');
    expect(run.trials[0]).toEqual({
      stimulusMs: onset,
      responseMs: null,
      rtMs: null,
      lapse: true,
      falseStart: false,
      timeout: true,
    });
  });

  it('ends after 3 minutes; a stimulus still showing then is not scored', () => {
    const run = new PvtRun({ random: () => 0 });
    run.start(0);
    let t = 0;
    while (t < PVT_DURATION_MS - 2000) {
      const onset = nextOnset(run, t);
      run.respond(onset + 300);
      t = onset + 300 + 16;
    }
    const before = run.trials.length;
    expect(runTo(run, t, PVT_DURATION_MS + 32).kind).toBe('done');
    expect(run.finished).toBe(true);
    expect(run.endMs).toBe(PVT_DURATION_MS);
    expect(run.trials.length).toBe(before);
    run.respond(PVT_DURATION_MS + 100);
    expect(run.trials.length).toBe(before);
  });

  it('every interval over a full run is within 1-4 s of the previous response', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const run = new PvtRun({ random });
    run.start(0);
    let t = 0;
    let lastResponse = 0;
    for (;;) {
      let onset: number | null = null;
      for (; t < PVT_DURATION_MS + 50; t += 16) {
        const v = run.frame(t);
        if (v.kind === 'done') break;
        if (v.kind === 'stimulus') {
          onset = t;
          break;
        }
      }
      if (onset === null) break;
      const gap = onset - lastResponse;
      expect(gap).toBeGreaterThanOrEqual(ISI_MIN_MS);
      expect(gap).toBeLessThan(ISI_MAX_MS + 16);
      lastResponse = onset + 280;
      run.respond(lastResponse);
      t = lastResponse + 16;
    }
    // About 180 s / (2.5 s mean ISI + 0.28 s RT) stimuli.
    expect(run.trials.length).toBeGreaterThan(50);
    expect(run.trials.length).toBeLessThan(80);
  });
});

describe('summarizePvt', () => {
  const trial = (rtMs: number | null, extra: Partial<PvtTrial> = {}): PvtTrial => ({
    stimulusMs: 0,
    responseMs: rtMs,
    rtMs,
    lapse: rtMs !== null && rtMs >= 355,
    falseStart: rtMs !== null && rtMs < 100,
    timeout: false,
    ...extra,
  });

  it('counts lapses and false starts; RT statistics skip false starts and timeouts', () => {
    const s = summarizePvt([
      trial(200),
      trial(250),
      trial(400),
      trial(50),
      trial(null, { stimulusMs: null, responseMs: 10, falseStart: true }),
      trial(null, { lapse: true, timeout: true }),
    ]);
    expect(s.stimuli).toBe(5);
    expect(s.lapses).toBe(2);
    expect(s.falseStarts).toBe(2);
    expect(s.medianRtMs).toBe(250);
    expect(s.meanReciprocalRt).toBeCloseTo((1000 / 200 + 1000 / 250 + 1000 / 400) / 3, 12);
  });

  it('has no RT statistics without valid responses', () => {
    const s = summarizePvt([]);
    expect(s).toEqual({
      stimuli: 0,
      lapses: 0,
      falseStarts: 0,
      medianRtMs: null,
      meanReciprocalRt: null,
    });
  });
});
