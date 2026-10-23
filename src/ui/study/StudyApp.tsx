import { useEffect, useState } from 'react';
import { useBlink } from '../../app/useBlink.ts';
import { useCapture } from '../../app/useCapture.ts';
import { useStudy } from '../../app/useStudy.ts';
import { useWakeLock } from '../../app/useWakeLock.ts';
import { liveStatusText } from '../captureStatus.ts';
import { Footer } from '../components/Footer.tsx';
import { PreviewPanel } from '../components/PreviewPanel.tsx';
import { SkipLink } from '../components/SkipLink.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { downloadText } from '../download.ts';
import { setStudyRunning } from '../leaveGuard.ts';
import { LockIcon, LogoMark, PlayIcon, StopIcon } from '../icons/Icons.tsx';
import { APP_NAME, PRIVACY_BADGE, PRIVACY_BADGE_SHORT } from '../strings.ts';
import { StudyScreen } from './StudyScreen.tsx';

/** performance.now(), refreshed every second while `active` (work-block clock). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const update = () => {
      setNow(performance.now());
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [active]);
  return now;
}

const noop = () => undefined;

/** `#study`: study mode (PROJECT_SPEC 5.8). Has its own camera and pipeline. */
export function StudyApp() {
  const capture = useCapture();
  const blink = useBlink(capture);
  const study = useStudy(capture, blink);
  const live = capture.snapshot.status === 'running';
  const active = capture.snapshot.status === 'starting' || live;
  useWakeLock(live);
  const nowMs = useNow(study.step === 'work');
  const start = () => {
    blink.ensureLandmarker();
    capture.start();
  };
  const calibrating = blink.snapshot.calibration.phase === 'running';
  const baseline = blink.snapshot.indicator.baseline;
  const inSession = study.session !== null && study.step !== 'finished';
  // Back, reload, or closing the tab would lose the session: keep the view and ask first.
  useEffect(() => {
    if (!inSession) return;
    setStudyRunning(true);
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      setStudyRunning(false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [inSession]);

  return (
    <>
      <SkipLink />
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <span className="brand__mark">
              <LogoMark size={22} />
            </span>
            <span className="brand__name">{APP_NAME}: study mode</span>
          </div>
          <p className="privacy-badge">
            <LockIcon size={16} />
            <span className="privacy-badge__full">{PRIVACY_BADGE}</span>
            <span className="privacy-badge__short" aria-hidden="true">
              {PRIVACY_BADGE_SHORT}
            </span>
          </p>
          <div className="app-header__actions">
            <ThemeToggle />
            {inSession ? null : (
              <a className="btn btn-ghost" href="#">
                Leave study mode
              </a>
            )}
            {active ? (
              <button type="button" className="btn btn-primary" onClick={capture.stop}>
                <StopIcon size={18} />
                <span>Stop camera</span>
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={start}>
                <PlayIcon size={18} />
                <span>Start camera</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="app-main" tabIndex={-1}>
        <StudyScreen
          step={study.step}
          session={study.session}
          nowMs={nowMs}
          camera={{
            status: capture.snapshot.status,
            hidden: capture.snapshot.hidden,
            onStart: start,
          }}
          preview={
            <PreviewPanel
              videoRef={capture.videoRef}
              snapshot={capture.snapshot}
              showTiming={false}
              onToggleTiming={noop}
              status={liveStatusText(capture.snapshot, blink.snapshot, blink.landmarker.status)}
            />
          }
          calibration={{
            status: liveStatusText(capture.snapshot, blink.snapshot, blink.landmarker.status).text,
            canCalibrate: live && blink.landmarker.status === 'ready' && !calibrating,
            calibrated: blink.snapshot.thresholds !== null && !calibrating,
            onCalibrate: blink.calibrate,
            onContinue: study.continueAfterCalibration,
          }}
          face={blink.snapshot.faceStatus}
          baselineProgress={baseline.phase === 'running' ? baseline.progress : null}
          review={{ indicator: blink.snapshot.indicator, bins: blink.snapshot.session }}
          actions={{
            begin: study.begin,
            answerRating: study.answerRating,
            pvtDone: study.pvtDone,
            stop: study.stop,
            exportCsv: () => {
              const file = study.exportCsv();
              if (file) downloadText(file.name, file.text);
            },
            // A fresh page: the next session gets its own calibration and baseline.
            reset: () => {
              window.location.reload();
            },
          }}
        />
      </main>
      <Footer />
    </>
  );
}
