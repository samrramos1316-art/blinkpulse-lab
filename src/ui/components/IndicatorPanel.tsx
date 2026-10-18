import { useEffect, useRef, useState } from 'react';
import type { IndicatorSnapshot } from '../../app/blinkPipeline.ts';
import {
  EVAL_HOP_MS,
  PROVISIONAL_BANDS,
  RATIO_CAP,
  summarizeTrend,
  type Band,
  type BaselineValues,
  type EciResult,
} from '../../blink/sleepiness.ts';
import { INDICATOR_COPY } from '../copy.ts';
import {
  describeTrend,
  formatEci,
  notEnoughDataText,
  trendLabels,
  type IndicatorWindow,
} from '../indicatorDisplay.ts';
import type { RefLine } from '../plot/seriesPlotModel.ts';
import { INDICATOR } from '../strings.ts';
import { IndicatorGauge } from './IndicatorGauge.tsx';
import { SeriesPlot } from './SeriesPlot.tsx';

interface BaselineControls {
  calibrated: boolean;
  live: boolean;
  start: () => void;
  cancel: () => void;
}

type Ok = Extract<EciResult, { ok: true }>;

const WINDOW_LABEL: Record<IndicatorWindow, string> = { short: '60 seconds', long: '5 minutes' };
const WINDOW_TEXT: Record<IndicatorWindow, string> = {
  short: '(60-second window)',
  long: '(5-minute window)',
};
const times = (v: number) => `${formatEci(v)} times baseline`;
const timesShort = (v: number) => `${formatEci(v)}x`;
const mins = (m: number) => `${m.toFixed(1)} min`;
const fmt = (v: number | null | undefined, digits: number, unit = '') =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(digits)}${unit}`;

const BASELINE_LINE: RefLine = { value: 1, label: 'baseline' };
const ECI_LINES: readonly RefLine[] = [
  BASELINE_LINE,
  { value: PROVISIONAL_BANDS.somewhatAbove, label: 'somewhat above' },
  { value: PROVISIONAL_BANDS.wellAbove, label: 'well above' },
];
const FACTOR_LINES: readonly RefLine[] = [BASELINE_LINE];
/** Point i of the trend: minutes since the indicator started. */
const trendPointName = (i: number) => `${((i * EVAL_HOP_MS) / 60_000).toFixed(1)} min`;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt className="stat__label">{label}</dt>
      <dd className="stat__value tabular">{value}</dd>
    </div>
  );
}

function BaselineStats({ values }: { values: BaselineValues }) {
  return (
    <dl className="stats">
      <StatTile label="Blink rate" value={fmt(values.blinksPerMin, 1, ' /min')} />
      <StatTile label="Mean blink" value={fmt(values.meanBlinkMs, 0, ' ms')} />
      <StatTile label="Eyes closed" value={fmt(values.closedFraction * 100, 1, ' %')} />
      <StatTile label="Long closures" value={fmt(values.longPerMin, 1, ' /min')} />
    </dl>
  );
}

function BaselineSection({
  ind,
  controls,
}: {
  ind: IndicatorSnapshot;
  controls: BaselineControls;
}) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);
  const b = ind.baseline;

  const body = (() => {
    if (!controls.calibrated) return <p>{INDICATOR_COPY.notCalibrated}</p>;
    if (b.phase === 'running') {
      return (
        <>
          <label htmlFor="baseline-progress">
            {INDICATOR_COPY.baselineRunning(b.progress * 100)}
          </label>
          <progress id="baseline-progress" max={1} value={b.progress} />
          <div>
            <button type="button" className="btn btn-ghost" onClick={controls.cancel}>
              Cancel baseline
            </button>
          </div>
        </>
      );
    }
    return (
      <>
        {b.phase === 'done' ? (
          <BaselineStats values={b.values} />
        ) : (
          <p>{INDICATOR_COPY.baselineIntro}</p>
        )}
        {b.phase === 'failed' ? (
          <p role="status">{INDICATOR_COPY.baselineFailed[b.reason]}</p>
        ) : null}
        {confirming ? (
          <div
            className="session__confirm"
            ref={confirmRef}
            tabIndex={-1}
            role="region"
            aria-label="Record alert baseline"
          >
            <p>{INDICATOR_COPY.baselineConfirm}</p>
            <div className="setup__actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!controls.live}
                onClick={() => {
                  controls.start();
                  setConfirming(false);
                }}
              >
                Start baseline
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!controls.live}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {b.phase === 'done' ? INDICATOR_COPY.baselineAgain : INDICATOR_COPY.baselineStart}
            </button>
          </div>
        )}
        {!controls.live ? (
          <p className="tool__note">Start the camera to record a baseline.</p>
        ) : null}
      </>
    );
  })();

  return (
    <section className="subcard indicator__baseline" aria-labelledby="baseline-title">
      <h3 id="baseline-title" className="subsection-title">
        Alert baseline
      </h3>
      {body}
    </section>
  );
}

/** Ratio bar: 0 to the cap, with a mark at 1 (the baseline). Decorative; the cell text has the value. */
function RatioBar({ ratio }: { ratio: number | null }) {
  const pct = (v: number) => `${String((Math.min(Math.max(v, 0), RATIO_CAP) / RATIO_CAP) * 100)}%`;
  return (
    <span className="ratio-bar" aria-hidden="true">
      <span className="ratio-bar__base" style={{ left: pct(1) }} />
      {ratio === null ? null : <span className="ratio-bar__fill" style={{ width: pct(ratio) }} />}
    </span>
  );
}

function FactorTable({ r, base }: { r: Ok | null; base: BaselineValues | null }) {
  const rows: [string, string, string, number | null][] = [
    [
      INDICATOR.factors.closedFraction,
      fmt(r && r.factors.closedFraction * 100, 1, ' %'),
      fmt(base && base.closedFraction * 100, 1, ' %'),
      r?.ratios.closedFraction ?? null,
    ],
    [
      INDICATOR.factors.longClosures,
      fmt(r?.factors.longPerMin, 1, ' /min'),
      fmt(base?.longPerMin, 1, ' /min'),
      r?.ratios.longClosures ?? null,
    ],
    [
      INDICATOR.factors.blinkDuration,
      fmt(r?.factors.meanBlinkMs, 0, ' ms'),
      fmt(base?.meanBlinkMs, 0, ' ms'),
      r?.ratios.blinkDuration ?? null,
    ],
  ];
  return (
    <div className="session__scroll">
      <table className="tool__table factor-table">
        <caption className="plot__title pulse__caption">By factor (latest window)</caption>
        <thead>
          <tr>
            <th scope="col">Factor</th>
            <th scope="col">Now</th>
            <th scope="col">Baseline</th>
            <th scope="col">Ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, now, was, ratio]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="tabular">{now}</td>
              <td className="tabular">{was}</td>
              <td className="factor-table__ratio">
                <span className="tabular">{fmt(ratio, 1, 'x')}</span>
                <RatioBar ratio={ratio} />
              </td>
            </tr>
          ))}
          <tr className="factor-table__aside">
            <th scope="row">Blink rate (not part of the indicator)</th>
            <td className="tabular">{fmt(r?.factors.blinksPerMin, 1, ' /min')}</td>
            <td className="tabular">{fmt(base?.blinksPerMin, 1, ' /min')}</td>
            <td className="factor-table__ratio">
              <span className="tabular">{fmt(r?.ratios.blinkRate, 1, 'x')}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const BAND_ORDER: Band[] = ['near', 'somewhatAbove', 'wellAbove'];

/** Minutes per band as one stacked bar; the legend carries the same numbers as text. */
function BandBar({ minutes, none }: { minutes: Record<Band, number>; none: number }) {
  const total = BAND_ORDER.reduce((s, b) => s + minutes[b], none);
  const w = (m: number) => `${String(total > 0 ? (m / total) * 100 : 0)}%`;
  return (
    <div className="bandbar">
      <div className="bandbar__track" aria-hidden="true">
        {BAND_ORDER.map((b) =>
          minutes[b] > 0 ? (
            <span key={b} className="bandbar__seg" data-band={b} style={{ width: w(minutes[b]) }} />
          ) : null,
        )}
        {none > 0 ? (
          <span className="bandbar__seg" data-band="none" style={{ width: w(none) }} />
        ) : null}
      </div>
      <ul className="bandbar__legend">
        {BAND_ORDER.map((b) => (
          <li key={b}>
            <span className="bandbar__key" data-band={b} aria-hidden="true" />
            {`${INDICATOR.bands[b]}: ${mins(minutes[b])}`}
          </li>
        ))}
        <li>
          <span className="bandbar__key" data-band="none" aria-hidden="true" />
          {`${INDICATOR.notEnoughData}: ${mins(none)}`}
        </li>
      </ul>
    </div>
  );
}

/** Eye closure tab: baseline, current value by factor, trends, session summary. */
export function IndicatorPanel({
  indicator: ind,
  controls,
}: {
  indicator: IndicatorSnapshot;
  controls: BaselineControls;
}) {
  const [win, setWin] = useState<IndicatorWindow>('long');
  const latest = ind.latest[win];
  const base = ind.baseline.phase === 'done' ? ind.baseline.values : null;
  const series = (pick: (r: Ok) => number) =>
    ind.trend.map((p) => {
      const r = p[win];
      return r.ok ? pick(r) : null;
    });
  const labels = trendLabels(ind.trend);
  const windowText = WINDOW_TEXT[win];
  const summary = summarizeTrend(ind.trend);
  const lastOf = (values: (number | null)[]) => {
    const v = values[values.length - 1];
    return v === null || v === undefined ? 'now: no data' : `now ${timesShort(v)}`;
  };
  const plot = (
    title: string,
    values: (number | null)[],
    refLines: readonly RefLine[],
    size: 'small' | 'large' = 'small',
  ) => (
    <SeriesPlot
      title={title}
      values={values}
      format={formatEci}
      xLabels={labels}
      markers={false}
      refLines={refLines}
      size={size}
      headline={lastOf(values)}
      pointName={trendPointName}
      description={describeTrend(`${title} ${windowText}`, values, times)}
    />
  );

  return (
    <div className="indicator">
      <div className="callout">
        <p className="callout__title">
          {INDICATOR.title}
          <span className="callout__sub">{INDICATOR.subtitle}</span>
        </p>
        <p>{INDICATOR.tooltip}</p>
        {base ? <p>{INDICATOR_COPY.provisional}</p> : null}
      </div>

      <div className="indicator__top">
        <BaselineSection ind={ind} controls={controls} />

        {base ? (
          <section className="subcard indicator__now" aria-labelledby="now-title">
            <div className="indicator__now-head">
              <h3 id="now-title" className="subsection-title">
                Now
              </h3>
              <div className="segmented" role="radiogroup" aria-label={INDICATOR_COPY.windowLegend}>
                {(['short', 'long'] as const).map((w) => (
                  <label key={w} className="segmented__option">
                    <input
                      type="radio"
                      name="indicator-window"
                      checked={win === w}
                      onChange={() => {
                        setWin(w);
                      }}
                    />
                    <span>{WINDOW_LABEL[w]}</span>
                  </label>
                ))}
              </div>
            </div>
            {latest.ok ? (
              <>
                <p className="indicator__value">
                  <span className="tabular">{formatEci(latest.eci)}</span>
                  <span className="indicator__unit">times your baseline</span>
                </p>
                <p className="indicator__band">{INDICATOR.bands[latest.band]}</p>
                <IndicatorGauge value={latest.eci} />
              </>
            ) : (
              <p className="indicator__none">{notEnoughDataText(latest)}</p>
            )}
            <FactorTable r={latest.ok ? latest : null} base={base} />
          </section>
        ) : null}
      </div>

      {base ? (
        ind.trend.length === 0 ? (
          <p className="plots__empty">The trend starts once the camera is running.</p>
        ) : (
          <>
            <section className="indicator__section" aria-labelledby="trend-title">
              <h3 id="trend-title" className="subsection-title">
                Trend {windowText}
              </h3>
              {plot(
                'Eye-closure index',
                series((r) => r.eci),
                ECI_LINES,
                'large',
              )}
              <p className="plot__legend">
                {INDICATOR_COPY.axis} Dashed lines: your baseline (1x) and the provisional band
                cut-offs. Hatched or missing stretches mean not enough data, never zero. Point at a
                plot to read a value.
              </p>
            </section>

            <section className="indicator__section" aria-labelledby="factors-title">
              <h3 id="factors-title" className="subsection-title">
                The three factors, as ratios to your baseline
              </h3>
              <div className="plot-grid plot-grid--3">
                {plot(
                  INDICATOR.factors.closedFraction,
                  series((r) => r.ratios.closedFraction),
                  FACTOR_LINES,
                )}
                {plot(
                  INDICATOR.factors.longClosures,
                  series((r) => r.ratios.longClosures),
                  FACTOR_LINES,
                )}
                {plot(
                  INDICATOR.factors.blinkDuration,
                  series((r) => r.ratios.blinkDuration),
                  FACTOR_LINES,
                )}
              </div>
            </section>

            <section className="indicator__section" aria-labelledby="compare-title">
              <h3 id="compare-title" className="subsection-title">
                For comparison: blink rate
              </h3>
              {plot(
                'Blink rate vs baseline',
                series((r) => r.ratios.blinkRate),
                FACTOR_LINES,
              )}
              <p className="plot__legend">{INDICATOR_COPY.blinkRateNote}</p>
            </section>

            <section className="indicator__section" aria-labelledby="summary-title">
              <h3 id="summary-title" className="subsection-title">
                This session (5-minute window)
              </h3>
              <BandBar minutes={summary.minutesInBand} none={summary.minutesNotEnoughData} />
              <dl className="stats">
                <StatTile label="First usable value" value={fmt(summary.firstUsable, 1, 'x')} />
                <StatTile label="Last usable value" value={fmt(summary.lastUsable, 1, 'x')} />
                <StatTile
                  label="Time measured"
                  value={mins((ind.trend.length * EVAL_HOP_MS) / 60_000)}
                />
              </dl>
            </section>
          </>
        )
      ) : null}
    </div>
  );
}
