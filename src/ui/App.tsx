import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useBlink } from '../app/useBlink.ts';
import { useCapture } from '../app/useCapture.ts';
import { useComfortReminder } from '../app/useComfortReminder.ts';
import { useHistory } from '../app/useHistory.ts';
import { useMiniWindow } from '../app/useMiniWindow.ts';
import { dayKey } from '../history/history.ts';
import { useWakeLock } from '../app/useWakeLock.ts';
import { blinkRateCard, closedFractionCard } from './blinkDisplay.ts';
import { indicatorCard } from './indicatorDisplay.ts';
import { pulseCard } from './pulseDisplay.ts';
import { liveStatusText } from './captureStatus.ts';
import { EyeIcon, GaugeIcon, PulseIcon, TimerIcon } from './icons/Icons.tsx';
import { EarPlot } from './components/EarPlot.tsx';
import { FaceOverlay } from './components/FaceOverlay.tsx';
import { IndicatorGauge } from './components/IndicatorGauge.tsx';
import { IndicatorPanel } from './components/IndicatorPanel.tsx';
import { PulsePanel } from './components/PulsePanel.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { MiniView } from './components/MiniView.tsx';
import { ReminderBanner } from './components/ReminderBanner.tsx';
import { TrackingCard } from './components/TrackingCard.tsx';
import { TRACKING_COPY } from './copy.ts';
import { useNow } from './useNow.ts';
import { SignalLab } from './components/SignalLab.tsx';
import { AboutDialog } from './components/AboutDialog.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { MetricCard } from './components/MetricCard.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { SessionTimeline } from './components/SessionTimeline.tsx';
import { SetupGuide } from './components/SetupGuide.tsx';
import { SkipLink } from './components/SkipLink.tsx';
import { Tabs } from './components/Tabs.tsx';
import { readSetupDone, writeSetupDone } from './setup.ts';
import { INDICATOR, METRIC } from './strings.ts';

interface AppProps {
  /** Override the stored first-run flag (tests). */
  initialSetupOpen?: boolean;
  /** Open the Signal Lab view first (tests). */
  initialLab?: boolean;
}

export function App({ initialSetupOpen, initialLab = false }: AppProps) {
  const capture = useCapture();
  const blink = useBlink(capture);
  const [setupOpen, setSetupOpen] = useState(() => initialSetupOpen ?? !readSetupDone());
  const [showTiming, setShowTiming] = useState(import.meta.env.DEV);
  const [view, setView] = useState<'signals' | 'lab' | 'history'>(initialLab ? 'lab' : 'signals');
  const toggle = (v: 'lab' | 'history') => {
    setView((cur) => (cur === v ? 'signals' : v));
  };
  const [aboutOpen, setAboutOpen] = useState(false);

  const live = capture.snapshot.status === 'running';
  useWakeLock(live);
  const history = useHistory(blink, capture);
  const reminder = useComfortReminder(blink.snapshot.session, history.baseline);
  const mini = useMiniWindow();
  const pulse = pulseCard(blink.pulse, live, blink.snapshot.faceStatus);
  const regionLevels = Object.fromEntries((blink.pulse?.regions ?? []).map((r) => [r.id, r.level]));
  const rateCard = blinkRateCard(blink.snapshot, live);
  const closedCard = closedFractionCard(blink.snapshot, live);
  const calibrated = blink.snapshot.thresholds !== null;
  const eciCard = indicatorCard(blink.snapshot.indicator, live, calibrated);
  const start = () => {
    blink.ensureLandmarker();
    capture.start();
  };
  const calibrating = blink.snapshot.calibration.phase === 'running';
  const status = liveStatusText(capture.snapshot, blink.snapshot, blink.landmarker.status);
  const today = dayKey(useNow());
  const historyNote =
    history.enabled && history.rows
      ? TRACKING_COPY.history.saved(
          history.rows.filter((r) => dayKey(r.startMs) === today).length,
          history.rows.length,
        )
      : null;

  return (
    <>
      <SkipLink />
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
        onOpenAbout={() => {
          setAboutOpen(true);
        }}
        lab={{
          open: view === 'lab',
          onToggle: () => {
            toggle('lab');
          },
        }}
        history={{
          open: view === 'history',
          onToggle: () => {
            toggle('history');
          },
        }}
      />
      <AboutDialog
        open={aboutOpen}
        onClose={() => {
          setAboutOpen(false);
        }}
      />
      <main id="main" className="app-main" tabIndex={-1}>
        <ReminderBanner open={reminder.bannerOpen} onDismiss={reminder.dismiss} />
        <div className="layout">
          <PreviewPanel
            videoRef={capture.videoRef}
            snapshot={capture.snapshot}
            showTiming={showTiming}
            onToggleTiming={() => {
              setShowTiming((v) => !v);
            }}
            status={status}
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
                value={eciCard.value}
                {...(eciCard.gauge === null ? {} : { unit: 'x baseline' })}
                status={eciCard.status}
              >
                {eciCard.gauge === null ? null : <IndicatorGauge value={eciCard.gauge} />}
              </MetricCard>
            </div>
          )}
        </div>
        {view === 'lab' ? (
          <SignalLab pulse={blink.pulse} />
        ) : view === 'history' ? (
          <HistoryView history={history} />
        ) : (
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
                {
                  id: 'eye-closure',
                  label: 'Eye closure',
                  render: () => (
                    <IndicatorPanel
                      indicator={blink.snapshot.indicator}
                      controls={{
                        calibrated,
                        live,
                        start: blink.startBaseline,
                        cancel: blink.cancelBaseline,
                      }}
                    />
                  ),
                },
              ]}
            />
          </section>
        )}
        <TrackingCard
          mini={mini}
          history={history}
          reminder={reminder}
          onOpenHistory={() => {
            setView('history');
          }}
        />
      </main>
      {mini.container
        ? createPortal(
            <MiniView
              live={live}
              status={status}
              blinkRate={rateCard}
              pulse={pulse}
              historyNote={historyNote}
              reminder={{ open: reminder.bannerOpen, dismiss: reminder.dismiss }}
              onStart={start}
              onStop={capture.stop}
            />,
            mini.container,
          )
        : null}
      <Footer />
    </>
  );
}
