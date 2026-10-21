import { describe, expect, it } from 'vitest';
import type { BaselineValues, EciResult, TrendPoint } from '../blink/sleepiness.ts';
import { PvtRun } from './pvt.ts';
import { RATING_EVERY_MS, StudySession, WORK_MS } from './session.ts';
import { buildStudyCsv, parseStudyCsv, studyCsvFileName } from './studyCsv.ts';

const values: BaselineValues = {
  closedFraction: 0.04,
  longPerMin: 0,
  meanBlinkMs: 150,
  blinksPerMin: 15,
  validMs: 180_000,
  blinkCount: 45,
};
const quality = { lost: { noFace: 1200, headTurned: 0, gap: 0 }, medianFps: 30 };
const okResult = (tMs: number, eci: number): EciResult => ({
  ok: true,
  tMs,
  eci,
  band: 'near',
  factors: { closedFraction: 0.05, longPerMin: 0.2, meanBlinkMs: 160, blinksPerMin: 14 },
  ratios: { closedFraction: 1.25, longClosures: 1, blinkDuration: 1.0667, blinkRate: 0.9333 },
  coverage: 0.98,
  ...quality,
});
const failResult = (tMs: number): EciResult => ({
  ok: false,
  tMs,
  reason: 'noFace',
  coverage: 0.4,
  ...quality,
});

/** A complete synthetic session starting at t0 = 10 000 ms. */
function completeSession(baselineRating = 3) {
  const t0 = 10_000;
  const s = new StudySession(
    { participantId: 'P07', sessionNumber: 2, glasses: 'contacts' },
    t0,
    new Date(2026, 9, 19, 20, 15),
  );
  s.calibrationDone({ baseline: 0.31, closeEar: 0.21, reopenEar: 0.23 }, t0 + 20_000);
  s.answerRating(baselineRating, t0 + 22_000);
  s.addEvent({
    startMs: t0 + 30_000,
    endMs: t0 + 30_180,
    durationMs: 180,
    kind: 'blink',
    lowConfidence: true,
    samplesBelow: 1,
    minEar: 0.1,
  });
  s.tick(t0 + 210_000, { phase: 'done', values });
  const pvt = (start: number, run: 1 | 2) => {
    const r = new PvtRun({ random: () => 0 });
    r.start(start);
    for (let t = start; !r.finished; t += 16) {
      const v = r.frame(t);
      if (v.kind === 'stimulus' && v.elapsedMs >= 240) r.respond(t);
    }
    s.pvtDone({ startMs: r.startMs, endMs: r.endMs, trials: r.trials }, r.endMs + 1000);
    return run;
  };
  pvt(t0 + 220_000, 1);
  const w = s.workStart;
  for (let k = 1; k <= 5; k++) {
    s.tick(w + k * RATING_EVERY_MS, { phase: 'done', values });
    if (k !== 3) s.answerRating(4 + (k % 3), w + k * RATING_EVERY_MS + 4000);
    else s.tick(w + k * RATING_EVERY_MS + 60_000, { phase: 'done', values });
  }
  s.tick(w + WORK_MS + 5000, { phase: 'done', values });
  pvt(w + WORK_MS + 10_000, 2);
  s.resolveWindows(Infinity, (windowMs, endMs) =>
    windowMs === 180_000 ? failResult(endMs) : okResult(endMs, 1.2),
  );
  const trend: TrendPoint[] = [
    { tMs: t0 - 5000, short: failResult(t0 - 5000), long: failResult(t0 - 5000) }, // before: dropped
    { tMs: t0 + 230_000, short: okResult(t0 + 230_000, 1.1), long: failResult(t0 + 230_000) },
  ];
  return {
    s,
    csv: buildStudyCsv({
      session: s,
      appCommit: 'abc1234',
      timestampSource: 'captureTime',
      camera: { width: 640, height: 480, frameRate: 30 },
      trend,
      ratingWording: 'placeholder',
    }),
  };
}

describe('study CSV export', () => {
  const { s, csv } = completeSession();
  const parsed = parseStudyCsv(csv);
  const section = (name: string) => {
    const t = parsed.sections[name];
    if (!t) throw new Error(`missing section ${name}`);
    return t;
  };
  const col = (name: string, column: string) => {
    const t = section(name);
    const i = t.header.indexOf(column);
    return t.rows.map((r) => r[i]);
  };

  it('names the file by the pseudonymous session ID', () => {
    expect(studyCsvFileName(s)).toBe('blinkpulse-study-P07-S2.csv');
  });

  it('header has the session details and the display rules', () => {
    expect(parsed.meta).toMatchObject({
      format: 'blinkpulse-study-1',
      app_commit: 'abc1234',
      participant: 'P07',
      session: '2',
      session_id: 'P07-S2',
      started_local: '2026-10-19 20:15',
      time_slot: 'evening',
      glasses: 'contacts',
      display_rules: 'on',
      rating_wording: 'placeholder',
      end_reason: 'completed',
      timestamp_source: 'captureTime',
      camera: '640x480@30',
    });
  });

  it('has calibration and baseline values, with times relative to the session start', () => {
    expect(section('calibration').rows).toEqual([['0.31', '0.21', '0.23']]);
    expect(section('baseline').rows).toEqual([
      ['0.04', '0', '150', '15', '180000', '45', '3', '0'],
    ]);
    expect(col('steps', 'step')).toEqual([
      'calibration',
      'baselineRating',
      'baseline',
      'pvt1',
      'work',
      'pvt2',
      'finished',
    ]);
    expect(col('steps', 'start_ms')[0]).toBe('0');
    expect(col('events', 'start_ms')).toEqual(['30000']);
    expect(col('events', 'low_confidence')).toEqual(['1']);
  });

  it('every rating prompt, answered or missing', () => {
    expect(col('ratings', 'rating')).toEqual(['3', '5', '6', '', '5', '6']);
    expect(col('ratings', 'answered_ms')[3]).toBe('');
  });

  it('a window per rating and per PVT-B run; failed windows have a reason and no number', () => {
    expect(col('windows', 'kind')).toEqual([
      'pvt',
      'rating',
      'rating',
      'rating',
      'rating',
      'rating',
      'pvt',
    ]);
    expect(col('windows', 'ok')).toEqual(['0', '1', '1', '1', '1', '1', '0']);
    const pvtRow = section('windows').rows[0] as string[];
    const h = section('windows').header;
    expect(pvtRow[h.indexOf('eci')]).toBe('');
    expect(pvtRow[h.indexOf('reason')]).toBe('noFace');
    expect(pvtRow[h.indexOf('ratio_closed')]).toBe('');
    expect(pvtRow[h.indexOf('lost_no_face_ms')]).toBe('1200');
    expect(col('windows', 'eci')[1]).toBe('1.2');
  });

  it('the trend is limited to the session, both windows per point', () => {
    expect(col('trend', 't_ms')).toEqual(['230000', '230000']);
    expect(col('trend', 'window_ms')).toEqual(['60000', '300000']);
  });

  it('PVT-B trials and summaries', () => {
    const trials = section('pvt_trials').rows;
    expect(trials.length).toBeGreaterThan(40);
    expect(col('pvt_summary', 'run')).toEqual(['1', '2']);
    expect(col('pvt_summary', 'lapses')).toEqual(['0', '0']);
    // Responses land on the first 16 ms frame at or after 240 ms.
    expect(Number(col('pvt_summary', 'median_rt_ms')[0])).toBe(240);
  });

  it('contains numbers and short codes only (no media, landmarks, or free text)', () => {
    for (const t of Object.values(parsed.sections)) {
      for (const row of t.rows) {
        expect(row).toHaveLength(t.header.length);
        for (const cell of row) expect(cell).toMatch(/^(-?\d+(\.\d+)?|[A-Za-z0-9_]*)$/);
      }
    }
    expect(csv).not.toMatch(/data:|base64|x_px|y_px/i);
  });

  it('marks a baseline rating of 6 or more as not alert', () => {
    const notAlert = parseStudyCsv(completeSession(6).csv).sections.baseline?.rows[0];
    expect(notAlert?.slice(-2)).toEqual(['6', '1']);
  });
});
