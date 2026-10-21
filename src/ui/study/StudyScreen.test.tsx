import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlinkPipeline } from '../../app/blinkPipeline.ts';
import type { BaselineState } from '../../blink/sleepiness.ts';
import { RATING_EVERY_MS, StudySession, type StudyStep } from '../../study/session.ts';
import { EYE_A, EYE_B } from '../../vision/landmarks.ts';
import { INDICATOR, METRIC } from '../strings.ts';
import { StudyScreen, type StudyScreenProps } from './StudyScreen.tsx';
import { RATING_COPY, STUDY_COPY } from './studyCopy.ts';

const done: BaselineState = {
  phase: 'done',
  values: {
    closedFraction: 0.04,
    longPerMin: 0,
    meanBlinkMs: 150,
    blinksPerMin: 15,
    validMs: 180_000,
    blinkCount: 45,
  },
};
const noop = () => undefined;

/** A session advanced to `step` (and exported, if asked). */
function sessionAt(step: StudyStep, exported = false): StudySession | null {
  if (step === 'setup') return null;
  const s = new StudySession(
    { participantId: 'P01', sessionNumber: 1, glasses: 'none' },
    0,
    new Date(2026, 9, 19, 9, 0),
  );
  const order: StudyStep[] = ['calibration', 'baselineRating', 'baseline', 'pvt1', 'work', 'pvt2'];
  const advance: Record<string, () => void> = {
    calibration: () => {
      s.calibrationDone({ baseline: 0.3, closeEar: 0.2, reopenEar: 0.22 }, 10);
    },
    baselineRating: () => s.answerRating(3, 20),
    baseline: () => {
      s.tick(200_000, done);
    },
    pvt1: () => {
      s.pvtDone({ startMs: 200_000, endMs: 380_000, trials: [] }, 380_000);
    },
    work: () => {
      for (let k = 1; k <= 5; k++) {
        s.tick(380_000 + k * RATING_EVERY_MS, done);
        s.answerRating(4, 380_000 + k * RATING_EVERY_MS + 1);
      }
      s.tick(380_000 + 6 * RATING_EVERY_MS, done);
    },
    pvt2: () => {
      s.pvtDone({ startMs: 2_200_000, endMs: 2_380_000, trials: [] }, 2_380_000);
    },
  };
  for (const st of order) {
    if (s.step === step) break;
    advance[st]?.();
  }
  if (exported) s.markExported();
  expect(s.step).toBe(step);
  return s;
}

function render(step: StudyStep, opts: { exported?: boolean; promptOpen?: boolean } = {}) {
  const session = sessionAt(step, opts.exported);
  if (session && opts.promptOpen) session.tick(session.workStart + RATING_EVERY_MS, done);
  const props: StudyScreenProps = {
    step,
    session,
    nowMs: 0,
    camera: { status: 'running', hidden: false, onStart: noop },
    preview: <div className="fake-preview">camera preview</div>,
    calibration: {
      status: 'Face found',
      canCalibrate: true,
      calibrated: true,
      onCalibrate: noop,
      onContinue: noop,
    },
    face: 'ok',
    baselineProgress: 0.4,
    review: { indicator: new BlinkPipeline(EYE_A, EYE_B).snapshot().indicator, bins: [] },
    actions: {
      begin: noop,
      answerRating: noop,
      pvtDone: noop,
      stop: noop,
      exportCsv: noop,
      reset: noop,
    },
  };
  return renderToString(<StudyScreen {...props} />);
}

const IN_SESSION: StudyStep[] = [
  'setup',
  'calibration',
  'baselineRating',
  'baseline',
  'pvt1',
  'work',
  'pvt2',
  'finished',
];

describe('StudyScreen blinding (SPEC_AMENDMENT_01 C3, protocol D5)', () => {
  it.each(IN_SESSION)('step %s: no indicator, factors, bands, or blink measurements', (step) => {
    const html = render(step, { promptOpen: step === 'work' });
    expect(html).not.toContain(INDICATOR.title);
    expect(html).not.toContain(INDICATOR.subtitle);
    for (const band of Object.values(INDICATOR.bands)) expect(html).not.toContain(band);
    for (const f of Object.values(INDICATOR.factors)) expect(html).not.toContain(f);
    expect(html).not.toContain(METRIC.blinkRate);
    expect(html).not.toContain(METRIC.eyeClosedFraction);
    expect(html).not.toContain(METRIC.pulseRate);
  });

  it('the camera preview is shown only while calibrating, but always mounted', () => {
    for (const step of IN_SESSION) {
      const html = render(step);
      expect(html).toContain('camera preview');
      const hidden = /class="study__preview study__preview--hidden" aria-hidden="true"/.test(html);
      expect(hidden).toBe(step !== 'calibration');
    }
  });

  it('the review with the indicator appears only after the export', () => {
    expect(render('finished', { exported: true })).toContain(INDICATOR.title);
    expect(render('finished', { exported: true })).toContain(STUDY_COPY.reviewNote);
  });
});

describe('StudyScreen steps', () => {
  it('setup asks for a code and the consent check, with Begin disabled', () => {
    const html = render('setup');
    expect(html).toContain('Participant code');
    expect(html).toContain(STUDY_COPY.consent);
    expect(html).toMatch(/<button type="submit" class="btn btn-primary" disabled="">Begin session/);
  });

  it('the first rating is inline; work-block prompts sit in the corner', () => {
    expect(render('baselineRating')).toContain(RATING_COPY.question);
    expect(render('work')).not.toContain(RATING_COPY.question);
    const withPrompt = render('work', { promptOpen: true });
    expect(withPrompt).toContain('rating rating--corner');
  });

  it('the work block shows only the face status and the clock', () => {
    const html = render('work');
    expect(html).toContain('Face found.');
    expect(html).toContain('of 25 minutes');
  });

  it('PVT-B shows instructions and a Start button first', () => {
    expect(render('pvt1')).toContain('Reaction-time task 1 of 2');
    expect(render('pvt1')).toContain('Start the task');
  });

  it('finished offers the export', () => {
    expect(render('finished')).toContain('Export session (CSV, numbers only)');
  });
});
