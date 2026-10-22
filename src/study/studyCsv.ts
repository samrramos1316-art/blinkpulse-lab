/**
 * One numeric CSV per study session (docs/STUDY_PROTOCOL.md Section 10). Pure.
 *
 * `#` lines carry the session details; `#section=<name>` starts a table with its
 * own header row. Times are ms since the session start. There are no video,
 * images, landmarks, names, or contact details: only the pseudonymous code.
 */

import type { EciResult, TrendPoint } from '../blink/sleepiness.ts';
import { summarizePvt } from './pvt.ts';
import { timeSlotOf, type StudySession } from './session.ts';

export const STUDY_CSV_FORMAT = 'blinkpulse-study-1';
/** A KSS rating at or above this at baseline marks the session "baseline not alert". */
export const NOT_ALERT_RATING = 6;

export interface StudyExportInput {
  session: StudySession;
  /** Git commit the app was built from. */
  appCommit: string;
  timestampSource: string | null;
  camera: { width: number; height: number; frameRate: number } | null;
  /** The tracker's 10 s trend, with times on the session's clock. */
  trend: readonly TrendPoint[];
  /** The rating wording is a placeholder until the KSS permission (protocol D2). */
  ratingWording: 'placeholder' | 'kss';
}

const ECI_COLUMNS = [
  'ok',
  'eci',
  'reason',
  'coverage',
  'closed_fraction',
  'long_per_min',
  'mean_blink_ms',
  'blinks_per_min',
  'ratio_closed',
  'ratio_long',
  'ratio_duration',
  'ratio_blink_rate',
  'lost_no_face_ms',
  'lost_head_turned_ms',
  'lost_gap_ms',
  'median_fps',
];

const num = (v: number | null | undefined, dp: number): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '' : String(Number(v.toFixed(dp)));
const flag = (b: boolean) => (b ? '1' : '0');

function eciCells(r: EciResult | null): string[] {
  if (r === null) return ECI_COLUMNS.map(() => '');
  const quality = [
    num(r.coverage, 4),
    ...(r.ok
      ? [
          num(r.factors.closedFraction, 5),
          num(r.factors.longPerMin, 4),
          num(r.factors.meanBlinkMs, 1),
          num(r.factors.blinksPerMin, 3),
          num(r.ratios.closedFraction, 4),
          num(r.ratios.longClosures, 4),
          num(r.ratios.blinkDuration, 4),
          num(r.ratios.blinkRate, 4),
        ]
      : ['', '', '', '', '', '', '', '']),
    num(r.lost.noFace, 0),
    num(r.lost.headTurned, 0),
    num(r.lost.gap, 0),
    num(r.medianFps, 2),
  ];
  return [flag(r.ok), r.ok ? num(r.eci, 4) : '', r.ok ? '' : r.reason, ...quality];
}

function localTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function sessionId(s: StudySession): string {
  return `${s.info.participantId}-S${String(s.info.sessionNumber)}`;
}

export function studyCsvFileName(s: StudySession): string {
  return `blinkpulse-study-${sessionId(s)}.csv`;
}

export function buildStudyCsv(input: StudyExportInput): string {
  const { session: s } = input;
  const rel = (ms: number) => num(ms - s.t0Ms, 1);
  const endMs = s.steps[s.steps.length - 1]?.startMs ?? Infinity;
  const lines: string[] = [
    '# BlinkPulse Lab study session. Numbers only: no video, images, landmarks, or names.',
    `# format=${STUDY_CSV_FORMAT}`,
    `# app_commit=${input.appCommit}`,
    `# participant=${s.info.participantId}`,
    `# session=${String(s.info.sessionNumber)}`,
    `# session_id=${sessionId(s)}`,
    `# started_local=${localTime(s.startedAt)}`,
    `# time_slot=${timeSlotOf(s.startedAt)}`,
    `# glasses=${s.info.glasses}`,
    '# display_rules=on',
    `# rating_wording=${input.ratingWording}`,
    `# end_reason=${s.endReason ?? 'notFinished'}`,
    `# timestamp_source=${input.timestampSource ?? 'unknown'}`,
    `# camera=${
      input.camera
        ? `${String(input.camera.width)}x${String(input.camera.height)}@${num(input.camera.frameRate, 2)}`
        : 'unknown'
    }`,
    '# times=ms since session start',
  ];
  const table = (name: string, header: string[], rows: string[][]) => {
    lines.push(`#section=${name}`, header.join(','), ...rows.map((r) => r.join(',')));
  };

  table(
    'steps',
    ['step', 'start_ms'],
    s.steps.map((x) => [x.step, rel(x.startMs)]),
  );
  const c = s.calibration;
  table(
    'calibration',
    ['ear_baseline', 'close_ear', 'reopen_ear'],
    c ? [[num(c.baseline, 5), num(c.closeEar, 5), num(c.reopenEar, 5)]] : [],
  );
  const b = s.baseline;
  const baseRating = s.ratings.find((r) => r.kind === 'baseline')?.rating ?? null;
  table(
    'baseline',
    [
      'closed_fraction',
      'long_per_min',
      'mean_blink_ms',
      'blinks_per_min',
      'valid_ms',
      'blink_count',
      'rating',
      'not_alert',
    ],
    b
      ? [
          [
            num(b.closedFraction, 5),
            num(b.longPerMin, 4),
            num(b.meanBlinkMs, 1),
            num(b.blinksPerMin, 3),
            num(b.validMs, 0),
            String(b.blinkCount),
            num(baseRating, 0),
            baseRating === null ? '' : flag(baseRating >= NOT_ALERT_RATING),
          ],
        ]
      : [],
  );
  table(
    'ratings',
    ['kind', 'index', 'shown_ms', 'answered_ms', 'rating'],
    s.ratings.map((r) => [
      r.kind,
      String(r.index),
      rel(r.shownMs),
      r.answeredMs === null ? '' : rel(r.answeredMs),
      num(r.rating, 0),
    ]),
  );
  table(
    'windows',
    ['kind', 'ref', 'start_ms', 'end_ms', ...ECI_COLUMNS],
    s.windows.map((w) => [
      w.kind,
      String(w.ref),
      rel(w.startMs),
      rel(w.endMs),
      ...eciCells(w.result),
    ]),
  );
  table(
    'trend',
    ['t_ms', 'window_ms', ...ECI_COLUMNS],
    input.trend
      .filter((p) => p.tMs >= s.t0Ms && p.tMs <= endMs)
      .flatMap((p) => [
        [rel(p.tMs), '60000', ...eciCells(p.short)],
        [rel(p.tMs), '300000', ...eciCells(p.long)],
      ]),
  );
  table(
    'events',
    ['start_ms', 'duration_ms', 'kind', 'low_confidence'],
    s.events.map((e) => [rel(e.startMs), num(e.durationMs, 1), e.kind, flag(e.lowConfidence)]),
  );
  table(
    'pvt_trials',
    ['run', 'trial', 'stimulus_ms', 'response_ms', 'rt_ms', 'lapse', 'false_start', 'timeout'],
    s.pvtRuns.flatMap((run) =>
      run.trials.map((t, i) => [
        String(run.run),
        String(i + 1),
        t.stimulusMs === null ? '' : rel(t.stimulusMs),
        t.responseMs === null ? '' : rel(t.responseMs),
        num(t.rtMs, 1),
        flag(t.lapse),
        flag(t.falseStart),
        flag(t.timeout),
      ]),
    ),
  );
  table(
    'pvt_summary',
    [
      'run',
      'start_ms',
      'end_ms',
      'stimuli',
      'lapses',
      'false_starts',
      'median_rt_ms',
      'mean_reciprocal_rt',
    ],
    s.pvtRuns.map((run) => {
      const m = summarizePvt(run.trials);
      return [
        String(run.run),
        rel(run.startMs),
        rel(run.endMs),
        String(m.stimuli),
        String(m.lapses),
        String(m.falseStarts),
        num(m.medianRtMs, 1),
        num(m.meanReciprocalRt, 4),
      ];
    }),
  );
  return `${lines.join('\n')}\n`;
}

export interface ParsedStudyCsv {
  meta: Record<string, string>;
  sections: Record<string, { header: string[]; rows: string[][] }>;
}

/** Reads the format back (tests; tools/ has the Python equivalent). */
export function parseStudyCsv(text: string): ParsedStudyCsv {
  const meta: Record<string, string> = {};
  const sections: ParsedStudyCsv['sections'] = {};
  let current: { header: string[]; rows: string[][] } | null = null;
  let needHeader = false;
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const section = /^#section=(.+)$/.exec(line);
    if (section) {
      current = { header: [], rows: [] };
      sections[section[1] as string] = current;
      needHeader = true;
      continue;
    }
    const kv = /^# ([a-z_]+)=(.*)$/.exec(line);
    if (kv) {
      meta[kv[1] as string] = kv[2] as string;
      continue;
    }
    if (line.startsWith('#') || !current) continue;
    if (needHeader) {
      current.header = line.split(',');
      needHeader = false;
    } else current.rows.push(line.split(','));
  }
  return { meta, sections };
}
