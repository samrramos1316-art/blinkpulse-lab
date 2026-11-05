import { useDeferredValue, useMemo, useState } from 'react';
import { runScenario, type SimScenario } from '../../rppg/simulate.ts';
import { BREAK_IT_COPY } from '../copy.ts';
import { Chart } from '../components/Chart.tsx';
import { Footer } from '../components/Footer.tsx';
import {
  applyPreset,
  BASE_SCENARIO,
  describeResult,
  matchingPreset,
  PRESETS,
  resultChart,
  resultLines,
  warningsRaised,
  withheldReasons,
} from './breakItModel.ts';

interface SliderProps {
  id: keyof SimScenario;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  /** Explains a control whose effect isn't obvious from its name. */
  hint?: string;
}

const SLIDERS: readonly SliderProps[] = [
  {
    id: 'bpm',
    label: 'True pulse rate',
    min: 45,
    max: 170,
    step: 1,
    format: (v) => `${String(v)} BPM`,
  },
  {
    id: 'pulsePercent',
    label: 'Pulse strength',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: (v) => (v === 0 ? 'no pulse' : `${v.toFixed(2)}%`),
  },
  {
    id: 'noiseSd',
    label: 'Camera noise',
    min: 0,
    max: 3,
    step: 0.1,
    format: (v) => `${v.toFixed(1)} levels`,
  },
  {
    id: 'light',
    label: 'Light level',
    min: 0.1,
    max: 2,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    id: 'flickerPercent',
    label: 'Flickering light',
    min: 0,
    max: 5,
    step: 0.1,
    format: (v) => (v === 0 ? 'none' : `${v.toFixed(1)}%`),
  },
  {
    id: 'flickerBpm',
    label: 'Flicker rate',
    min: 45,
    max: 170,
    step: 1,
    format: (v) => `${String(v)} per minute`,
    hint: 'Set it to the true pulse rate to raise the flicker warning.',
  },
  {
    id: 'headSpeed',
    label: 'Head movement',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: (v) => (v === 0 ? 'still' : `${v.toFixed(2)} eye-widths/s`),
  },
  {
    id: 'fps',
    label: 'Camera frame rate',
    min: 10,
    max: 30,
    step: 1,
    format: (v) => `${String(v)} fps`,
  },
];

function Slider({
  slider,
  value,
  onChange,
}: {
  slider: SliderProps;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="tool__field breakit__slider">
      <span className="breakit__slider-head">
        <span>{slider.label}</span>
        <span className="tabular">{slider.format(value)}</span>
      </span>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        aria-valuetext={slider.format(value)}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
      {slider.hint ? <span className="tool__note">{slider.hint}</span> : null}
    </label>
  );
}

/** Break-it Lab (`#break`, SPEC_AMENDMENT_05 Patch G): no camera, nothing recorded. */
export function BreakItLab() {
  const [scenario, setScenario] = useState<SimScenario>(BASE_SCENARIO);
  // Sliders stay responsive: the 60 s run follows just behind them.
  const deferred = useDeferredValue(scenario);
  const result = useMemo(() => runScenario(deferred), [deferred]);
  const preset = matchingPreset(scenario);
  const reasons = withheldReasons(result);
  const warnings = warningsRaised(result);
  const version = JSON.stringify(deferred);

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <a className="btn-link" href="#">
              Back to the app
            </a>
            <h1 className="brand__name">{BREAK_IT_COPY.title}</h1>
          </div>
        </div>
      </header>
      <main id="main" className="app-main tool">
        <section className="card tool__view" aria-labelledby="breakit-results">
          <h2 id="breakit-results" className="section-title">
            What the app would report
          </h2>
          <p className="tool__note">{BREAK_IT_COPY.intro}</p>
          <Chart
            title="Pulse rate over 60 seconds"
            spec={resultChart(result)}
            description={describeResult(result)}
            version={version}
          />
          <p className="plot__legend">{BREAK_IT_COPY.legend}</p>
          <div role="status">
            {resultLines(result).map((line) => (
              <p key={line} className="breakit__line">
                {line}
              </p>
            ))}
          </div>
          {reasons.length > 0 ? (
            <table className="tool__table">
              <caption className="plot__title">Why the app showed "-"</caption>
              <thead>
                <tr>
                  <th scope="col">Reason, as the app words it</th>
                  <th scope="col">Seconds</th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((r) => (
                  <tr key={r.reason}>
                    <td>{r.reason}</td>
                    <td className="tabular">{r.seconds.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {warnings.length > 0 ? (
            <table className="tool__table">
              <caption className="plot__title">Warnings the checks raised</caption>
              <thead>
                <tr>
                  <th scope="col">Warning, as the app words it</th>
                  <th scope="col">Seconds</th>
                </tr>
              </thead>
              <tbody>
                {warnings.map((w) => (
                  <tr key={w.reason}>
                    <td>{w.reason}</td>
                    <td className="tabular">{w.seconds.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="tool__note">{BREAK_IT_COPY.honesty}</p>
        </section>

        <section className="card tool__panel" aria-labelledby="breakit-controls">
          <h2 id="breakit-controls" className="section-title">
            Change the conditions
          </h2>
          <fieldset className="breakit__presets">
            <legend className="plot__title">Start from</legend>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn btn-ghost btn-small"
                aria-pressed={preset?.id === p.id}
                onClick={() => {
                  setScenario(applyPreset(p, scenario.seed));
                }}
              >
                {p.label}
              </button>
            ))}
          </fieldset>
          {SLIDERS.map((slider) => (
            <Slider
              key={slider.id}
              slider={slider}
              value={scenario[slider.id] as number}
              onChange={(value) => {
                setScenario({ ...scenario, [slider.id]: value });
              }}
            />
          ))}
          <label className="tool__check">
            <input
              type="checkbox"
              checked={scenario.faceLost}
              onChange={(e) => {
                setScenario({ ...scenario, faceLost: e.target.checked });
              }}
            />
            Lose the face for 3 seconds
          </label>
          <div className="tool__row">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setScenario({ ...scenario, seed: scenario.seed + 1 });
              }}
            >
              New noise
            </button>
            <p className="tool__note tabular">Run {scenario.seed.toFixed(0)}</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
