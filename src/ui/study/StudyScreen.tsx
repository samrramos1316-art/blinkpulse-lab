import { useState, type ReactNode } from 'react';
import type { CaptureStatus } from '../../app/captureController.ts';
import type { FaceStatus, IndicatorSnapshot } from '../../app/blinkPipeline.ts';
import type { MinuteBin } from '../../blink/sessionSummary.ts';
import { summarizePvt } from '../../study/pvt.ts';
import {
  RATINGS_IN_WORK,
  WORK_MS,
  validParticipantId,
  type Glasses,
  type SessionInfo,
  type StudySession,
  type StudyStep,
} from '../../study/session.ts';
import { IndicatorPanel } from '../components/IndicatorPanel.tsx';
import { SessionTimeline } from '../components/SessionTimeline.tsx';
import { PlayIcon } from '../icons/Icons.tsx';
import { PvtTask, type PvtResult } from './PvtTask.tsx';
import { RatingPrompt } from './RatingPrompt.tsx';
import {
  END_REASON_TEXT,
  GLASSES_LABEL,
  STEP_LABEL,
  STUDY_COPY,
  faceStatusText,
} from './studyCopy.ts';

export interface StudyScreenProps {
  step: StudyStep;
  session: StudySession | null;
  /** performance.now() at the last render tick (work-block clock). */
  nowMs: number;
  camera: { status: CaptureStatus; hidden: boolean; onStart: () => void };
  /** The camera preview: always mounted (it holds the video), shown only while calibrating. */
  preview: ReactNode;
  calibration: {
    status: string;
    canCalibrate: boolean;
    calibrated: boolean;
    onCalibrate: () => void;
    onContinue: () => void;
  };
  face: FaceStatus;
  /** Alert-baseline progress 0..1 while it runs. */
  baselineProgress: number | null;
  /** Shown only after the export (Patch C3). */
  review: { indicator: IndicatorSnapshot; bins: readonly MinuteBin[] };
  actions: {
    begin: (info: SessionInfo) => void;
    answerRating: (rating: number) => void;
    pvtDone: (r: PvtResult) => void;
    stop: () => void;
    exportCsv: () => void;
    reset: () => void;
  };
}

const STEPS: readonly StudyStep[] = [
  'calibration',
  'baselineRating',
  'baseline',
  'pvt1',
  'work',
  'pvt2',
  'finished',
];

function SetupForm({ onBegin }: { onBegin: (info: SessionInfo) => void }) {
  const [id, setId] = useState('');
  const [sessionNumber, setSessionNumber] = useState('1');
  const [glasses, setGlasses] = useState<Glasses>('none');
  const [consent, setConsent] = useState(false);
  const n = Number(sessionNumber);
  const idOk = validParticipantId(id);
  const ready = idOk && Number.isInteger(n) && n >= 1 && n <= 99 && consent;

  return (
    <form
      className="card study__panel study-form"
      aria-labelledby="study-setup-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onBegin({ participantId: id, sessionNumber: n, glasses });
      }}
    >
      <h2 id="study-setup-title" className="section-title">
        {STUDY_COPY.title}
      </h2>
      <p className="study__note" role="note">
        {STUDY_COPY.draftNote}
      </p>
      <p>{STUDY_COPY.setupIntro}</p>
      <div className="study-form__row">
        <label htmlFor="study-pid">Participant code</label>
        <input
          id="study-pid"
          className="input"
          value={id}
          autoComplete="off"
          spellCheck={false}
          placeholder="P01"
          aria-describedby="study-pid-help"
          aria-invalid={id !== '' && !idOk}
          onChange={(e) => {
            setId(e.target.value.trim().toUpperCase());
          }}
        />
        <p id="study-pid-help" className="study-form__help">
          The letter P and 2 or 3 digits, for example P03.
        </p>
      </div>
      <div className="study-form__row">
        <label htmlFor="study-session">Session number</label>
        <input
          id="study-session"
          className="input input--short"
          type="number"
          min={1}
          max={99}
          value={sessionNumber}
          onChange={(e) => {
            setSessionNumber(e.target.value);
          }}
        />
      </div>
      <fieldset className="study-form__row">
        <legend>Glasses or contact lenses today</legend>
        {(Object.keys(GLASSES_LABEL) as Glasses[]).map((g) => (
          <label key={g} className="study-form__choice">
            <input
              type="radio"
              name="study-glasses"
              checked={glasses === g}
              onChange={() => {
                setGlasses(g);
              }}
            />
            {GLASSES_LABEL[g]}
          </label>
        ))}
      </fieldset>
      <label className="study-form__choice study-form__consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
          }}
        />
        {STUDY_COPY.consent}
      </label>
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        Begin session
      </button>
    </form>
  );
}

function StopSession({ onStop }: { onStop: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Stop session
      </button>
    );
  }
  return (
    <span className="study__confirm" role="group" aria-label="Stop the session?">
      <span>Stop the session?</span>
      <button type="button" className="btn btn-primary btn-small" onClick={onStop}>
        Yes, stop
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => {
          setConfirming(false);
        }}
      >
        Keep going
      </button>
    </span>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="study__progress">
      <progress max={100} value={pct} aria-label={label} />
      <span className="tabular">{pct}%</span>
    </div>
  );
}

function FaceLine({ face, hidden }: { face: FaceStatus; hidden: boolean }) {
  return (
    <p className="study__face" role="status" data-ok={face === 'ok' && !hidden}>
      {faceStatusText(face, hidden)}
    </p>
  );
}

function Review({
  session,
  review,
}: {
  session: StudySession;
  review: StudyScreenProps['review'];
}) {
  return (
    <>
      <p className="study__note">{STUDY_COPY.reviewNote}</p>
      <section className="card study__panel" aria-labelledby="review-pvt">
        <h2 id="review-pvt" className="section-title">
          Reaction-time tasks
        </h2>
        <table className="factor-table">
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Stimuli</th>
              <th scope="col">Lapses (355 ms or more)</th>
              <th scope="col">False starts</th>
              <th scope="col">Median RT</th>
            </tr>
          </thead>
          <tbody>
            {session.pvtRuns.map((r) => {
              const m = summarizePvt(r.trials);
              return (
                <tr key={r.run}>
                  <th scope="row">{r.run}</th>
                  <td className="tabular">{m.stimuli}</td>
                  <td className="tabular">{m.lapses}</td>
                  <td className="tabular">{m.falseStarts}</td>
                  <td className="tabular">
                    {m.medianRtMs === null ? '-' : `${m.medianRtMs.toFixed(0)} ms`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p>
          Ratings:{' '}
          <span className="tabular">
            {session.ratings
              .map((r) => (r.rating === null ? 'missing' : String(r.rating)))
              .join(', ')}
          </span>
        </p>
      </section>
      <section className="card plots" aria-label="Eye-closure review">
        <IndicatorPanel
          indicator={review.indicator}
          controls={{
            calibrated: true,
            live: false,
            start: () => undefined,
            cancel: () => undefined,
          }}
        />
      </section>
      <section className="card plots" aria-label="Blink timeline review">
        <SessionTimeline bins={review.bins} />
      </section>
    </>
  );
}

function StepContent(p: StudyScreenProps & { session: StudySession }) {
  const { session, step } = p;
  switch (step) {
    case 'setup':
      return null;
    case 'calibration':
      return (
        <section className="card study__panel" aria-labelledby="study-cal-title">
          <h2 id="study-cal-title" className="section-title">
            {STEP_LABEL.calibration}
          </h2>
          <p>{STUDY_COPY.calibration}</p>
          <p role="status">{p.calibration.status}</p>
          <div className="study__actions">
            {p.camera.status === 'running' ? null : (
              <button type="button" className="btn btn-primary" onClick={p.camera.onStart}>
                <PlayIcon size={18} />
                <span>Start camera</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!p.calibration.canCalibrate}
              onClick={p.calibration.onCalibrate}
            >
              {p.calibration.calibrated ? 'Calibrate again' : 'Calibrate'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!p.calibration.calibrated || p.camera.status !== 'running'}
              onClick={p.calibration.onContinue}
            >
              Continue
            </button>
          </div>
        </section>
      );
    case 'baselineRating':
      return <RatingPrompt variant="inline" onAnswer={p.actions.answerRating} />;
    case 'baseline':
      return (
        <section className="card study__panel" aria-labelledby="study-base-title">
          <h2 id="study-base-title" className="section-title">
            {STEP_LABEL.baseline}
          </h2>
          <p>{STUDY_COPY.baseline}</p>
          <Progress label="Alert baseline progress" value={p.baselineProgress ?? 0} />
          <FaceLine face={p.face} hidden={p.camera.hidden} />
        </section>
      );
    case 'pvt1':
    case 'pvt2':
      return <PvtTask key={step} run={step === 'pvt1' ? 1 : 2} onDone={p.actions.pvtDone} />;
    case 'work': {
      const elapsed = Math.max(0, p.nowMs - session.workStart);
      const minutes = Math.min(WORK_MS, elapsed) / 60_000;
      const asked = session.ratings.filter((r) => r.kind === 'work').length;
      return (
        <section className="card study__panel" aria-labelledby="study-work-title">
          <h2 id="study-work-title" className="section-title">
            {STEP_LABEL.work}
          </h2>
          <p>{STUDY_COPY.work}</p>
          <p className="tabular">
            {`${String(Math.floor(minutes))} of ${String(WORK_MS / 60_000)} minutes. ` +
              `Ratings: ${String(asked)} of ${String(RATINGS_IN_WORK)}.`}
          </p>
          <Progress label="Work block progress" value={minutes / (WORK_MS / 60_000)} />
          <FaceLine face={p.face} hidden={p.camera.hidden} />
        </section>
      );
    }
    case 'finished':
      return (
        <section className="card study__panel" aria-labelledby="study-done-title">
          <h2 id="study-done-title" className="section-title">
            {STUDY_COPY.finished}
          </h2>
          <p>{session.endReason ? END_REASON_TEXT[session.endReason] : null}</p>
          <p className="study__note">{STUDY_COPY.finishedResearcher}</p>
          <div className="study__actions">
            <button type="button" className="btn btn-primary" onClick={p.actions.exportCsv}>
              {session.exported ? 'Export again' : 'Export session (CSV, numbers only)'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={p.actions.reset}>
              New session
            </button>
          </div>
        </section>
      );
  }
}

/**
 * Study mode screen. While the session runs, the indicator, its factors and
 * bands, the blink cards, the EAR plot, and the camera preview are NOT rendered
 * (SPEC_AMENDMENT_01 C3, protocol decision D5): only a text face status. The
 * review appears after the session is finished and exported.
 */
export function StudyScreen(p: StudyScreenProps) {
  const { session, step } = p;
  const showPreview = step === 'calibration';
  const index = STEPS.indexOf(step);

  return (
    <div className="study">
      {session ? (
        <div className="study__bar">
          <p className="study__who tabular">
            {`${session.info.participantId}, session ${String(session.info.sessionNumber)}`}
          </p>
          <ol className="study__steps" aria-label="Session steps">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={s === step ? 'step' : undefined} data-done={i < index}>
                {STEP_LABEL[s]}
              </li>
            ))}
          </ol>
          {step === 'finished' ? null : <StopSession onStop={p.actions.stop} />}
        </div>
      ) : null}

      {/* Always mounted: it holds the camera's video element. */}
      <div
        className={showPreview ? 'study__preview' : 'study__preview study__preview--hidden'}
        aria-hidden={!showPreview}
      >
        {p.preview}
      </div>

      {session ? <StepContent {...p} session={session} /> : <SetupForm onBegin={p.actions.begin} />}

      {session?.openRating && step === 'work' ? (
        <RatingPrompt variant="corner" onAnswer={p.actions.answerRating} />
      ) : null}

      {session && step === 'finished' && session.exported ? (
        <Review session={session} review={p.review} />
      ) : null}
    </div>
  );
}
