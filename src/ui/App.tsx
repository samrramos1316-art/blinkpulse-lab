import { useState } from 'react';
import { useCapture } from '../app/useCapture.ts';
import { EyeIcon, GaugeIcon, PulseIcon, TimerIcon } from './icons/Icons.tsx';
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
  const [setupOpen, setSetupOpen] = useState(() => initialSetupOpen ?? !readSetupDone());
  const [showTiming, setShowTiming] = useState(import.meta.env.DEV);

  const live = capture.snapshot.status === 'running';
  // Blink and pulse processing arrive in Phases 3 and 4; never show a placeholder number.
  const metricStatus = live ? 'Available in a later version' : 'Not started';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header
        status={capture.snapshot.status}
        onStart={capture.start}
        onStop={capture.stop}
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
          />
          {setupOpen ? (
            <SetupGuide
              snapshot={capture.snapshot}
              getVideo={capture.getVideo}
              onStartCamera={capture.start}
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
                value="-"
                unit="/min"
                status={metricStatus}
              />
              <MetricCard
                icon={<PulseIcon />}
                label={METRIC.pulseRate}
                value="-"
                unit="bpm"
                status={metricStatus}
              />
              <MetricCard
                icon={<TimerIcon />}
                label={METRIC.eyeClosedFraction}
                value="-"
                unit="%"
                status={metricStatus}
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
          <p className="plots__empty">Live signal plots appear here once measuring starts.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
