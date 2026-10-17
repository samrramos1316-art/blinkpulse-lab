import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CALIBRATION_MS, type BlinkSnapshot } from '../../app/blinkPipeline.ts';
import type { CaptureSnapshot } from '../../app/captureController.ts';
import { useBrightness } from '../../app/useBrightness.ts';
import type { LandmarkerStatus } from '../../app/useBlink.ts';
import { captureStatusText } from '../captureStatus.ts';
import { CALIBRATION_COPY, CAMERA_EFFECTS_TIP, CAMERA_PRIVACY, POSITION_HINT } from '../copy.ts';
import { AlertIcon, CheckIcon, InfoIcon, LockIcon, SunLightIcon } from '../icons/Icons.tsx';
import { SETUP_STEPS, type SetupStep } from '../setup.ts';
import { positionHint } from '../setupHints.ts';
import { PRIVACY_BADGE } from '../strings.ts';

interface SetupGuideProps {
  snapshot: CaptureSnapshot;
  getVideo: () => HTMLVideoElement | null;
  onStartCamera: () => void;
  blink: BlinkSnapshot;
  tracking: LandmarkerStatus;
  onCalibrate: () => void;
  /** Called when setup is finished or skipped. */
  onClose: () => void;
}

/** First-run setup (SPEC_AMENDMENT_02 Part 3): welcome, camera, position, calibrate, done. */
export function SetupGuide({
  snapshot,
  getVideo,
  onStartCamera,
  blink,
  tracking,
  onCalibrate,
  onClose,
}: SetupGuideProps) {
  const [step, setStep] = useState<SetupStep>('welcome');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const running = snapshot.status === 'running';
  const brightness = useBrightness(getVideo, step === 'position' && running);

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const stepNumber = SETUP_STEPS.indexOf(step) + 1;
  const go = (next: SetupStep) => {
    setStep(next);
  };

  let body: ReactNode;
  switch (step) {
    case 'welcome':
      body = (
        <>
          <StepHeading ref={headingRef}>Welcome</StepHeading>
          <p>
            BlinkPulse Lab estimates blink metrics and pulse rate from your webcam, using signal
            processing you can inspect. Setup takes about a minute.
          </p>
          <p className="setup__privacy">
            <LockIcon size={18} />
            <span>{PRIVACY_BADGE}</span>
          </p>
          <Actions>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                go('camera');
              }}
            >
              Get started
            </button>
          </Actions>
        </>
      );
      break;

    case 'camera': {
      const failed = snapshot.status === 'error' || snapshot.status === 'ended';
      body = (
        <>
          <StepHeading ref={headingRef}>Allow the camera</StepHeading>
          <p>Your browser will ask for permission to use the camera.</p>
          <p className="setup__note">
            <LockIcon size={18} />
            <span>{CAMERA_PRIVACY}</span>
          </p>
          <p className="setup__note">
            <InfoIcon size={18} />
            <span>
              <strong>Tip:</strong> {CAMERA_EFFECTS_TIP}
            </span>
          </p>
          {failed ? (
            <p className="setup__alert" role="alert">
              <AlertIcon size={18} />
              <span>{captureStatusText(snapshot).text}</span>
            </p>
          ) : null}
          <Actions>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                go('welcome');
              }}
            >
              Back
            </button>
            {running ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  go('position');
                }}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={snapshot.status === 'starting'}
                onClick={() => {
                  onStartCamera();
                }}
              >
                {snapshot.status === 'starting'
                  ? 'Waiting for permission...'
                  : failed
                    ? 'Try again'
                    : 'Allow camera'}
              </button>
            )}
          </Actions>
        </>
      );
      break;
    }

    case 'position':
      body = (
        <>
          <StepHeading ref={headingRef}>Position yourself</StepHeading>
          <ul className="setup__tips">
            <li>Centre your face inside the outline on the preview.</li>
            <li>Sit so your whole face fits comfortably, not too close.</li>
            <li>Light your face from the front; avoid a bright window behind you.</li>
          </ul>
          {running ? (
            <LiveHint hint={positionHint(blink, brightness, tracking)} />
          ) : (
            <p className="setup__alert" role="alert">
              <AlertIcon size={18} />
              <span>{captureStatusText(snapshot).text}</span>
            </p>
          )}
          <Actions>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                go('camera');
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                go('calibrate');
              }}
            >
              Next
            </button>
          </Actions>
        </>
      );
      break;

    case 'calibrate': {
      const c = blink.calibration;
      const canCalibrate = running && tracking === 'ready' && c.phase !== 'running';
      const secondsLeft =
        c.phase === 'running'
          ? Math.max(0, Math.ceil((CALIBRATION_MS * (1 - c.progress)) / 1000))
          : 0;
      body = (
        <>
          <StepHeading ref={headingRef}>Calibrate</StepHeading>
          <div className="calibrate">
            <ProgressRing
              progress={c.phase === 'running' ? c.progress : c.phase === 'done' ? 1 : 0}
              label={
                c.phase === 'running'
                  ? `${secondsLeft.toFixed(0)} s`
                  : c.phase === 'done'
                    ? 'Done'
                    : `${(CALIBRATION_MS / 1000).toFixed(0)} s`
              }
            />
            <div className="calibrate__text">
              {c.phase === 'running' ? (
                <p role="status">{CALIBRATION_COPY.running}</p>
              ) : c.phase === 'done' ? (
                <p className="setup__live" role="status" data-tone="ok">
                  <CheckIcon size={18} />
                  <span>
                    {`${CALIBRATION_COPY.done} Open-eye level ${c.result.baseline.toFixed(2)} from ${c.result.n.toFixed(0)} frames.`}
                  </span>
                </p>
              ) : (
                <p>{CALIBRATION_COPY.intro}</p>
              )}
              {c.phase === 'failed' ? (
                <p className="setup__alert" role="alert">
                  <AlertIcon size={18} />
                  <span>{CALIBRATION_COPY.failed}</span>
                </p>
              ) : null}
              {!running ? (
                <p className="setup__alert" role="alert">
                  <AlertIcon size={18} />
                  <span>{captureStatusText(snapshot).text}</span>
                </p>
              ) : c.phase === 'done' ? null : (
                <LiveHint hint={positionHint(blink, 'unknown', tracking)} />
              )}
            </div>
          </div>
          <Actions>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                go('position');
              }}
            >
              Back
            </button>
            {c.phase === 'done' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  go('done');
                }}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canCalibrate}
                onClick={onCalibrate}
              >
                {c.phase === 'running'
                  ? 'Calibrating...'
                  : c.phase === 'failed'
                    ? 'Try again'
                    : 'Start calibration'}
              </button>
            )}
          </Actions>
        </>
      );
      break;
    }

    case 'done':
      body = (
        <>
          <StepHeading ref={headingRef}>You are set</StepHeading>
          <p>
            Press <strong>Stop</strong> at any time to turn the camera off. You can reopen this
            guide with the <strong>Guide</strong> button at the top.
          </p>
          <Actions>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                go('calibrate');
              }}
            >
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Finish
            </button>
          </Actions>
        </>
      );
      break;
  }

  return (
    <section className="card setup" aria-labelledby="setup-step-title">
      <div className="setup__top">
        <p className="setup__progress">{`Step ${stepNumber} of ${SETUP_STEPS.length}`}</p>
        <ol className="setup__dots" aria-hidden="true">
          {SETUP_STEPS.map((s, i) => (
            <li
              key={s}
              data-state={i + 1 < stepNumber ? 'done' : i + 1 === stepNumber ? 'current' : 'todo'}
            />
          ))}
        </ol>
        {step === 'done' ? null : (
          <button type="button" className="btn-link" onClick={onClose}>
            Skip setup
          </button>
        )}
      </div>
      <div className="setup__body">{body}</div>
    </section>
  );
}

function StepHeading({
  ref,
  children,
}: {
  ref: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}) {
  return (
    <h2 id="setup-step-title" className="setup__title" ref={ref} tabIndex={-1}>
      {children}
    </h2>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="setup__actions">{children}</div>;
}

function LiveHint({ hint }: { hint: keyof typeof POSITION_HINT }) {
  const tone = hint === 'ok' ? 'ok' : hint === 'tooDark' ? 'tooDark' : 'unknown';
  return (
    <p className="setup__live" role="status" data-tone={tone}>
      {hint === 'ok' ? (
        <CheckIcon size={18} />
      ) : hint === 'tooDark' ? (
        <SunLightIcon size={18} />
      ) : (
        <InfoIcon size={18} />
      )}
      <span>{POSITION_HINT[hint]}</span>
    </p>
  );
}

/** Calibration progress ring with the countdown in the middle (SPEC_AMENDMENT_02 Part 3). */
function ProgressRing({ progress, label }: { progress: number; label: string }) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      className="ring"
      role="progressbar"
      aria-label="Calibration progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <circle className="ring__track" cx="40" cy="40" r={r} />
        <circle
          className="ring__bar"
          cx="40"
          cy="40"
          r={r}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span className="ring__label tabular">{label}</span>
    </div>
  );
}
