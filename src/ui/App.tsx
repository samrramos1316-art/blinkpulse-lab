import { useState } from 'react';
import { useBlink } from '../app/useBlink.ts';
import { useCapture } from '../app/useCapture.ts';
import { blinkRateCard, closedFractionCard } from './blinkDisplay.ts';
import { liveStatusText } from './captureStatus.ts';
import { EyeIcon, GaugeIcon, PulseIcon, TimerIcon } from './icons/Icons.tsx';
import { EarPlot } from './components/EarPlot.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { MetricCard } from './components/MetricCard.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { SetupGuide } from './components/SetupGuide.tsx';
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
  // Pulse arrives in Phase 4; never show a placeholder number.
  const pulseStatus = live ? 'Available in a later version' : 'Not started';
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
            }}
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
                value="-"
                unit="bpm"
                status={pulseStatus}
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
          <EarPlot pipeline={blink.pipeline} active={live} />
          <p className="plots__empty">Pulse plots arrive in a later version.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
