import { useEffect, useRef, useState } from 'react';
import { MIN_COVERAGE, sessionToCsv, type MinuteBin } from '../../blink/sessionSummary.ts';
import { median } from '../../dsp/stats.ts';
import { LOST_REASON_TEXT, SESSION_COPY } from '../copy.ts';
import { downloadText } from '../download.ts';
import { describeSeries } from '../plot/seriesPlotModel.ts';
import { SeriesPlot } from './SeriesPlot.tsx';

const fmt = (v: number | null, digits: number) => (v === null ? '-' : v.toFixed(digits));

function minuteStatus(b: MinuteBin): string {
  const cov = `${(b.coverage * 100).toFixed(0)}% usable`;
  if (b.usable) return b.lowFps ? `${cov}, ${LOST_REASON_TEXT.lowFps}` : cov;
  const why = b.mainReason ? `, mostly ${LOST_REASON_TEXT[b.mainReason]}` : '';
  return b.elapsedMs < 60_000 ? `${cov} so far (in progress)` : `${cov}${why}`;
}

/** Session timeline (SPEC_AMENDMENT_01 Patch B): per-minute plots, coverage, table, export. */
export function SessionTimeline({ bins }: { bins: readonly MinuteBin[] }) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (bins.length === 0) return <p className="plots__empty">{SESSION_COPY.empty}</p>;

  const rate = bins.map((b) => b.ratePerMin);
  const dur = bins.map((b) => b.medianDurationMs);
  const closed = bins.map((b) => (b.closedFraction === null ? null : b.closedFraction * 100));
  const longs = bins.map((b) => b.longClosures);
  const usable = bins.map((b) => b.usable);
  const frames = bins.flatMap((b) => (b.medianFrameMs === null ? [] : [b.medianFrameMs]));
  const frameMs = frames.length ? median(frames) : null;
  const present = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
  const usableCount = usable.filter(Boolean).length;
  const rates = present(rate);
  const durs = present(dur);
  const longTotal = present(longs).reduce((a, b) => a + b, 0);

  const perMin = (v: number) => `${v.toFixed(0)} per minute`;
  const ms = (v: number) => `${v.toFixed(0)} ms`;
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const count = (v: number) => v.toFixed(0);
  /** Value of the last usable minute, for the plot header. */
  const latest = (xs: (number | null)[], f: (v: number) => string) => {
    for (let i = xs.length - 1; i >= 0; i--) {
      const x = xs[i];
      if (x !== null && x !== undefined) return `latest ${f(x)}`;
    }
    return undefined;
  };

  return (
    <div className="session">
      <p className="session__intro">{SESSION_COPY.intro}</p>

      <dl className="stats">
        <div className="stat">
          <dt className="stat__label">Minutes measured</dt>
          <dd className="stat__value tabular">{bins.length}</dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Usable minutes</dt>
          <dd className="stat__value tabular">{`${String(usableCount)} of ${String(bins.length)}`}</dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Median blink rate</dt>
          <dd className="stat__value tabular">
            {rates.length ? `${median(rates).toFixed(1)} /min` : '-'}
          </dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Median blink duration</dt>
          <dd className="stat__value tabular">
            {durs.length ? `${median(durs).toFixed(0)} ms` : '-'}
          </dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Long closures</dt>
          <dd className="stat__value tabular">{longTotal}</dd>
        </div>
      </dl>

      <div className="session__coverage">
        <p className="plot__title" id="coverage-title">
          Usable minutes
        </p>
        {/* Visual summary only; the per-minute table below carries the same information as text. */}
        <ol className="coverage" aria-labelledby="coverage-title">
          {bins.map((b) => (
            <li
              key={b.index}
              className="coverage__cell"
              data-usable={b.usable}
              title={`Minute ${String(b.index + 1)}: ${minuteStatus(b)}`}
            >
              <span className="visually-hidden">{`Minute ${String(b.index + 1)}: ${minuteStatus(b)}`}</span>
            </li>
          ))}
        </ol>
        <p className="plot__legend">
          Solid: usable minute (at least {(MIN_COVERAGE * 100).toFixed(0)}% of the minute measured).
          Hatched: not enough usable time.
        </p>
      </div>

      <div className="plot-grid plot-grid--2">
        <SeriesPlot
          title="Blink rate (per minute)"
          headline={latest(rate, perMin)}
          values={rate}
          format={count}
          usable={usable}
          description={describeSeries('Blink rate', rate, perMin, usable)}
        />
        <SeriesPlot
          title="Median blink duration (ms)"
          headline={latest(dur, ms)}
          values={dur}
          format={count}
          usable={usable}
          description={describeSeries('Median blink duration', dur, ms, usable)}
        />
        <SeriesPlot
          title="Eye-closed fraction (%)"
          headline={latest(closed, pct)}
          values={closed}
          format={(v) => v.toFixed(1)}
          usable={usable}
          description={describeSeries('Eye-closed fraction', closed, pct, usable)}
        />
        <SeriesPlot
          title="Long closures (0.5-2 s)"
          headline={latest(longs, count)}
          integer
          values={longs}
          format={count}
          usable={usable}
          description={describeSeries('Long closures', longs, count, usable)}
        />
      </div>
      <p className="plot__legend">
        Horizontal axis: minutes since measuring started.{' '}
        {frameMs === null
          ? ''
          : `Durations are accurate to about +-${frameMs.toFixed(0)} ms (one frame).`}
      </p>

      <details className="session__table">
        <summary>Per-minute table</summary>
        <div className="session__scroll">
          <table className="tool__table">
            <thead>
              <tr>
                <th scope="col">Minute</th>
                <th scope="col">Usable time</th>
                <th scope="col">Blinks</th>
                <th scope="col">Rate /min</th>
                <th scope="col">Median ms</th>
                <th scope="col">Long closures</th>
                <th scope="col">Closed %</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.index}>
                  <th scope="row">{b.index + 1}</th>
                  <td>{minuteStatus(b)}</td>
                  <td className="tabular">{fmt(b.blinkCount, 0)}</td>
                  <td className="tabular">{fmt(b.ratePerMin, 1)}</td>
                  <td className="tabular">{fmt(b.medianDurationMs, 0)}</td>
                  <td className="tabular">{fmt(b.longClosures, 0)}</td>
                  <td className="tabular">
                    {fmt(b.closedFraction === null ? null : b.closedFraction * 100, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {confirming ? (
        <div
          className="session__confirm"
          ref={confirmRef}
          tabIndex={-1}
          role="region"
          aria-label="Export the per-minute table"
        >
          <p>{SESSION_COPY.exportInfo}</p>
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
              onClick={() => {
                downloadText('blinkpulse-session-minutes.csv', sessionToCsv(bins));
                setConfirming(false);
              }}
            >
              Save CSV
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setConfirming(true);
            }}
          >
            Export per-minute table...
          </button>
        </div>
      )}
    </div>
  );
}
