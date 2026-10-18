import { useState } from 'react';
import { useBlink } from '../app/useBlink.ts';
import { useCapture } from '../app/useCapture.ts';
import { blinkRateCard, closedFractionCard } from './blinkDisplay.ts';
import { pulseCard } from './pulseDisplay.ts';
import { liveStatusText } from './captureStatus.ts';
import { EyeIcon, GaugeIcon, PulseIcon, TimerIcon } from './icons/Icons.tsx';
import { EarPlot } from './components/EarPlot.tsx';
import { FaceOverlay } from './components/FaceOverlay.tsx';
import { PulsePanel } from './components/PulsePanel.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { MetricCard } from './components/MetricCard.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { SessionTimeline } from './components/SessionTimeline.tsx';
import { SetupGuide } from './components/SetupGuide.tsx';
import { Tabs } from './components/Tabs.tsx';
import { readSetupDone, writeSetupDone } from './setup.ts';
import { INDICATOR, METRIC } from './strings.ts';

interface AppProps {
  /** Override the stored first-run flag (tests). */
  initialSetupOpen?: boolean;
}

export function App({ initialSetupOpen }: AppProps) {
  const capture = useCapture();
  const blink = useBlink(capture);
  const [setupOpen, setSetupOpen] = useState(() => initialSetupOpen ?? !readSetupDone());
  const [showTiming, setShowTiming] = useState(import.meta.env.DEV);

  const live = capture.snapshot.status === 'running';
  const pulse = pulseCard(blink.pulse, live, blink.snapshot.faceStatus);
  const regionLevels = Object.fromEntries((blink.pulse?.regions ?? []).map((r) => [r.id, r.level]));
  const rateCard = blinkRateCard(blink.snapshot, live);
  const closedCard = closedFractionCard(blink.snapshot, live);
  const start = () => {
    blink.ensureLandmarker();
    capture.start();
  };
  const calibrating = blink.snapshot.calibration.phase === 'running';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header
        status={capture.snapshot.status}
        onStart={start}
        onStop={capture.stop}
        calibrate={{
          enabled: live && blink.landmarker.status === 'ready' && !calibrating,
          label: blink.snapshot.thresholds ? 'Recalibrate' : 'Calibrate',
          onClick: blink.calibrate,
        }}
        onOpenGuide={() => {
          setSetupOpen(true);
        }}
      />
      <main id="main" className="app-main" tabIndex={-1}>
        <div className="layout">
          <PreviewPanel
            videoRef={capture.videoRef}
            snapshot={capture.snapshot}
            showTiming={showTiming}
            onToggleTiming={() => {
              setShowTiming((v) => !v);
            }}
            status={liveStatusText(capture.snapshot, blink.snapshot, blink.landmarker.status)}
            tracking={{
              blink: blink.snapshot,
              inferenceMs: blink.inferenceMs,
              delegate: blink.landmarker.delegate,
              processingMs: blink.processingMs,
              cameraLock: blink.cameraLock,
            }}
            overlay={
              <FaceOverlay getOverlay={blink.getOverlay} levels={regionLevels} active={live} />
            }
          />
          {setupOpen ? (
            <SetupGuide
              snapshot={capture.snapshot}
              getVideo={capture.getVideo}
              onStartCamera={start}
              blink={blink.snapshot}
              tracking={blink.landmarker.status}
              onCalibrate={blink.calibrate}
              onClose={() => {
                writeSetupDone();
                setSetupOpen(false);
              }}
            />
          ) : (
            <div className="metrics" aria-label="Measurements">
              <MetricCard
                icon={<EyeIcon />}
                label={METRIC.blinkRate}
                value={rateCard.value}
                unit="/min"
                status={rateCard.status}
              />
              <MetricCard
                icon={<PulseIcon />}
                label={METRIC.pulseRate}
                value={pulse.value}
                unit="bpm"
                status={pulse.status}
                quality={pulse.level}
              />
              <MetricCard
                icon={<TimerIcon />}
                label={METRIC.eyeClosedFraction}
                value={closedCard.value}
                unit="%"
                status={closedCard.status}
              />
              <MetricCard
                icon={<GaugeIcon />}
                label={INDICATOR.title}
                value="-"
                status={INDICATOR.subtitle}
              />
            </div>
          )}
        </div>
        <section className="card plots" aria-labelledby="plots-title">
          <h2 id="plots-title" className="section-title">
            Signals
          </h2>
          <Tabs
            label="Signal views"
            tabs={[
              {
                id: 'blinks',
                label: 'Blinks',
                render: () => <EarPlot pipeline={blink.pipeline} active={live} />,
              },
              {
                id: 'pulse',
                label: 'Pulse',
                render: () => (
                  <PulsePanel
                    pulse={blink.pulse}
                    record={{
                      live,
                      recording: blink.recording,
                      start: blink.startRecording,
                      stop: blink.stopRecording,
                      pending: blink.pendingTrace,
                      clearPending: blink.clearPendingTrace,
                    }}
                  />
                ),
              },
              {
                id: 'session',
                label: 'Session timeline',
                render: () => <SessionTimeline bins={blink.snapshot.session} />,
              },
            ]}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
