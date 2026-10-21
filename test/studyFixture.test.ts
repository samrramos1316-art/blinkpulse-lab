/**
 * The sample study export that tools/test_analyze_v3.py reads. It is built here by the
 * app's own export code, so the Python analysis is tested against the real format.
 * If the format changes, regenerate it: UPDATE_FIXTURES=1 npx vitest run test/studyFixture
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  eciFromFactors,
  type BaselineValues,
  type EciResult,
  type EyeClosureFactors,
} from '../src/blink/sleepiness.ts';
import { PvtRun } from '../src/study/pvt.ts';
import { RATING_EVERY_MS, StudySession, WORK_MS } from '../src/study/session.ts';
import { buildStudyCsv } from '../src/study/studyCsv.ts';

const FIXTURE = 'test/fixtures/study/blinkpulse-study-P90-S1.csv';

const baseline: BaselineValues = {
  closedFraction: 0.03,
  longPerMin: 0,
  meanBlinkMs: 140,
  blinksPerMin: 16,
  validMs: 180_000,
  blinkCount: 48,
};
const quality = { lost: { noFace: 900, headTurned: 300, gap: 0 }, medianFps: 30 };

function ok(tMs: number, f: EyeClosureFactors): EciResult {
  const { eci, ratios } = eciFromFactors(f, baseline);
  return { ok: true, tMs, eci, band: 'near', factors: f, ratios, coverage: 0.95, ...quality };
}

/** Window values by rating index (1-5) and PVT run (1-2): rising closure, one gated window. */
const RATING_FACTORS: Record<number, EyeClosureFactors | null> = {
  1: { closedFraction: 0.03, longPerMin: 0, meanBlinkMs: 145, blinksPerMin: 15 },
  2: { closedFraction: 0.045, longPerMin: 0.2, meanBlinkMs: 150, blinksPerMin: 14 },
  3: null,
  4: { closedFraction: 0.06, longPerMin: 0.6, meanBlinkMs: 170, blinksPerMin: 13 },
  5: { closedFraction: 0.09, longPerMin: 1.0, meanBlinkMs: 190, blinksPerMin: 12 },
};
const PVT_FACTORS: Record<number, EyeClosureFactors> = {
  1: { closedFraction: 0.028, longPerMin: 0, meanBlinkMs: 138, blinksPerMin: 17 },
  2: { closedFraction: 0.07, longPerMin: 0.67, meanBlinkMs: 175, blinksPerMin: 12 },
};
const RATINGS = [3, 4, 5, null, 6, 7];

function fixtureCsv(): string {
  const t0 = 1_000;
  const s = new StudySession(
    { participantId: 'P90', sessionNumber: 1, glasses: 'none' },
    t0,
    new Date(2026, 9, 20, 20, 0),
  );
  s.calibrationDone({ baseline: 0.3, closeEar: 0.2, reopenEar: 0.22 }, t0 + 15_000);
  s.answerRating(RATINGS[0] ?? 0, t0 + 18_000);
  s.tick(t0 + 200_000, { phase: 'done', values: baseline });
  const runPvt = (start: number, rtMs: number) => {
    const r = new PvtRun({ random: () => 0.5 });
    r.start(start);
    for (let t = start; !r.finished; t += 10) {
      const v = r.frame(t);
      if (v.kind === 'stimulus' && v.elapsedMs >= rtMs) r.respond(t);
    }
    s.pvtDone({ startMs: r.startMs, endMs: r.endMs, trials: r.trials }, r.endMs + 500);
  };
  runPvt(t0 + 210_000, 250);
  const w = s.workStart;
  for (let k = 1; k <= 5; k++) {
    const shown = w + k * RATING_EVERY_MS;
    s.tick(shown, { phase: 'done', values: baseline });
    const rating = RATINGS[k];
    if (rating === null || rating === undefined) s.tick(shown + 60_000, { phase: 'none' });
    else s.answerRating(rating, shown + 3000);
  }
  s.tick(w + WORK_MS + 1000, { phase: 'none' });
  runPvt(w + WORK_MS + 5000, 380);
  for (const win of s.windows) {
    const f = win.kind === 'pvt' ? PVT_FACTORS[win.ref] : RATING_FACTORS[win.ref];
    s.resolveWindows(win.endMs + 5000, (_, endMs) =>
      f ? ok(endMs, f) : { ok: false, tMs: endMs, reason: 'noFace', coverage: 0.5, ...quality },
    );
  }
  return buildStudyCsv({
    session: s,
    appCommit: 'fixture',
    timestampSource: 'captureTime',
    camera: { width: 640, height: 480, frameRate: 30 },
    trend: [],
    ratingWording: 'placeholder',
  });
}

describe('study export fixture for the Python analysis', () => {
  it('matches the committed file', () => {
    const csv = fixtureCsv();
    if (process.env.UPDATE_FIXTURES === '1') writeFileSync(FIXTURE, csv);
    expect(readFileSync(FIXTURE, 'utf8')).toBe(csv);
  });
});
