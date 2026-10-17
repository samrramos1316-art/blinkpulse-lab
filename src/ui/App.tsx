import { EyeIcon, GaugeIcon, PulseIcon, TimerIcon } from './icons/Icons.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { MetricCard } from './components/MetricCard.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { INDICATOR, METRIC } from './strings.ts';

const NOT_STARTED = 'Not started';

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header />
      <main id="main" className="app-main" tabIndex={-1}>
        <div className="layout">
          <PreviewPanel />
          <div className="metrics" aria-label="Measurements">
            <MetricCard
              icon={<EyeIcon />}
              label={METRIC.blinkRate}
              value="-"
              unit="/min"
              status={NOT_STARTED}
            />
            <MetricCard
              icon={<PulseIcon />}
              label={METRIC.pulseRate}
              value="-"
              unit="bpm"
              status={NOT_STARTED}
            />
            <MetricCard
              icon={<TimerIcon />}
              label={METRIC.eyeClosedFraction}
              value="-"
              unit="%"
              status={NOT_STARTED}
            />
            <MetricCard
              icon={<GaugeIcon />}
              label={INDICATOR.title}
              value="-"
              status={INDICATOR.subtitle}
            />
          </div>
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
