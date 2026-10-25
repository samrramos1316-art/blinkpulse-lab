import { useEffect, useMemo, useState } from 'react';
import type { History } from '../../app/useHistory.ts';
import {
  byDay,
  dayKey,
  hourOfDay,
  poolPulse,
  rangeStart,
  summarizeDay,
  MIN_DAY_USABLE_MINUTES,
  type DaySummary,
  type HistoryRow,
} from '../../history/history.ts';
import { HISTORY_COPY } from '../copy.ts';
import { useNow } from '../useNow.ts';
import { describeSeries } from '../plot/seriesPlotModel.ts';
import { INDICATOR, METRIC } from '../strings.ts';
import { SeriesPlot } from './SeriesPlot.tsx';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const fmt = (v: number | null | undefined, digits: number) =>
  v === null || v === undefined ? '-' : v.toFixed(digits);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 24" from "2026-10-24". */
function shortDay(key: string): string {
  const [, m, d] = key.split('-');
  return `${MONTHS[Number(m) - 1] ?? ''} ${String(Number(d))}`;
}

function hoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return h ? `${String(h)} h ${String(m)} min` : `${String(m)} min`;
}

/** Every local day from the range start to today, oldest first. */
function dayKeys(nowMs: number, days: number): string[] {
  const out: string[] = [];
  const d = new Date(rangeStart(nowMs, days));
  for (let i = 0; i < days; i++) {
    out.push(dayKey(d.getTime()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Sparse x labels: about `count` evenly spaced labels. */
function sparse(labels: readonly string[], count: number): (string | null)[] {
  const step = Math.max(1, Math.ceil(labels.length / count));
  return labels.map((l, i) => (i % step === 0 ? l : null));
}

function DayDetail({ day, rows }: { day: string; rows: readonly HistoryRow[] }) {
  const times = rows.map((r) => {
    const d = new Date(r.startMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const rate = rows.map((r) => (r.usable && !r.lowFps ? r.ratePerMin : null));
  const usable = rows.map((r) => r.usable && !r.lowFps);
  const pulse = rows.map((r) => r.pulseBpm);
  const perMin = (v: number) => `${v.toFixed(0)} per minute`;
  const bpm = (v: number) => `${v.toFixed(0)} BPM`;
  return (
    <div className="plot-grid plot-grid--2">
      <SeriesPlot
        title={`${METRIC.blinkRate} per minute, ${shortDay(day)}`}
        values={rate}
        format={(v) => v.toFixed(0)}
        usable={usable}
        xLabels={sparse(times, 6)}
        pointName={(i) => times[i] ?? ''}
        description={describeSeries(`${METRIC.blinkRate} per minute`, rate, perMin, usable)}
      />
      <SeriesPlot
        title={`${METRIC.pulseRate} per minute (shown values), ${shortDay(day)}`}
        values={pulse}
        format={(v) => v.toFixed(0)}
        xLabels={sparse(times, 6)}
        pointName={(i) => times[i] ?? ''}
        description={describeSeries(METRIC.pulseRate, pulse, bpm)}
      />
    </div>
  );
}

/** Long-term history (SPEC_AMENDMENT_04 F4). Tracking keeps running while it is open. */
export function HistoryView({ history }: { history: History }) {
  const [range, setRange] = useState<Range>(30);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const { load } = history;
  useEffect(() => {
    load();
  }, [load]);

  const rows = history.rows;
  const now = useNow();
  const view = useMemo(() => {
    const inRange = (rows ?? []).filter((r) => r.startMs >= rangeStart(now, range));
    const grouped = byDay(inRange);
    const keys = dayKeys(now, range);
    const days = keys.map((k) => {
      const rs = grouped.get(k);
      return rs ? summarizeDay(k, rs) : null;
    });
    return { inRange, grouped, keys, days, hours: hourOfDay(inRange) };
  }, [rows, range, now]);

  if (rows === null) return <p className="plots__empty">{HISTORY_COPY.loading}</p>;

  const header = (
    <div className="history__top">
      <div>
        <h2 id="history-view-title" className="section-title">
          {HISTORY_COPY.title}
        </h2>
        <p className="session__intro">{HISTORY_COPY.intro}</p>
      </div>
    </div>
  );

  if (rows.length === 0) {
    return (
      <section className="card plots" aria-labelledby="history-view-title">
        {header}
        {deleted ? <p className="tool__note">{HISTORY_COPY.deleted}</p> : null}
        <p className="plots__empty">{history.enabled ? HISTORY_COPY.empty : HISTORY_COPY.off}</p>
      </section>
    );
  }

  const { inRange, grouped, keys, days, hours } = view;
  const withData = days.filter((d): d is DaySummary => d !== null);
  const measured = inRange.reduce((a, r) => a + r.elapsedMs, 0) / 60_000;
  const usableMinutes = inRange.filter((r) => r.usable && !r.lowFps).length;
  const pulseAll = poolPulse(inRange);
  const labels = sparse(keys.map(shortDay), 7);
  const dayName = (i: number) => shortDay(keys[i] ?? '');
  const series = (f: (d: DaySummary) => number | null) => days.map((d) => (d ? f(d) : null));
  const rate = series((d) => d.blinks.ratePerMin);
  const closed = series((d) =>
    d.blinks.closedFraction === null ? null : d.blinks.closedFraction * 100,
  );
  const long = series((d) => d.blinks.longPerHour);
  const pulse = series((d) => d.pulse.bpm);
  const hourRate = hours.map((h) => h.blinks.ratePerMin);
  const hourLabels = hours.map((h) => (h.hour % 3 === 0 ? `${String(h.hour)}:00` : null));
  const perMin = (v: number) => `${v.toFixed(1)} per minute`;
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const perHour = (v: number) => `${v.toFixed(1)} per hour`;
  const bpm = (v: number) => `${v.toFixed(0)} BPM`;
  const newestFirst = [...withData].reverse();

  return (
    <section className="card plots" aria-labelledby="history-view-title">
      {header}
      <div className="history__ranges" role="group" aria-label="Range">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className="btn btn-ghost btn-small"
            aria-pressed={range === r}
            onClick={() => {
              setRange(r);
            }}
          >
            {`Last ${String(r)} days`}
          </button>
        ))}
      </div>

      <dl className="stats">
        <div className="stat">
          <dt className="stat__label">Days with data</dt>
          <dd className="stat__value tabular">{withData.length}</dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Time measured</dt>
          <dd className="stat__value tabular">{hoursMinutes(measured)}</dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Usable minutes</dt>
          <dd className="stat__value tabular">{usableMinutes}</dd>
        </div>
        <div className="stat">
          <dt className="stat__label">Minutes with a pulse value</dt>
          <dd className="stat__value tabular">{pulseAll.minutes}</dd>
        </div>
      </dl>

      <div className="plot-grid plot-grid--2">
        <SeriesPlot
          title={`${METRIC.blinkRate} per day (per minute)`}
          values={rate}
          format={(v) => v.toFixed(0)}
          xLabels={labels}
          pointName={dayName}
          description={describeSeries(
            `${METRIC.blinkRate} per day`,
            rate,
            perMin,
            undefined,
            'day',
          )}
        />
        <SeriesPlot
          title={`${METRIC.eyeClosedFraction} per day (%)`}
          values={closed}
          format={(v) => v.toFixed(1)}
          xLabels={labels}
          pointName={dayName}
          description={describeSeries(
            `${METRIC.eyeClosedFraction} per day`,
            closed,
            pct,
            undefined,
            'day',
          )}
        />
        <SeriesPlot
          title="Long closures (0.5-2 s) per hour, per day"
          values={long}
          format={(v) => v.toFixed(0)}
          xLabels={labels}
          pointName={dayName}
          description={describeSeries('Long closures per hour', long, perHour, undefined, 'day')}
        />
        <SeriesPlot
          title={`${METRIC.pulseRate} per day (median of shown values)`}
          values={pulse}
          format={(v) => v.toFixed(0)}
          xLabels={labels}
          pointName={dayName}
          description={describeSeries(`${METRIC.pulseRate} per day`, pulse, bpm, undefined, 'day')}
        />
        <SeriesPlot
          title={`${METRIC.blinkRate} by hour of day (per minute)`}
          values={hourRate}
          format={(v) => v.toFixed(0)}
          xLabels={hourLabels}
          pointName={(i) => `${String(i)}:00 to ${String(i + 1)}:00`}
          description={describeSeries(
            `${METRIC.blinkRate} by hour of day`,
            hourRate,
            perMin,
            undefined,
            'hour',
          )}
        />
      </div>
      <p className="plot__legend">
        Gaps: days or hours without enough usable minutes. {HISTORY_COPY.dayGate}{' '}
        {HISTORY_COPY.pulseNote}
      </p>

      <h3 className="subsection-title">Per day</h3>
      <div className="session__scroll">
        <table className="tool__table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Measured</th>
              <th scope="col">Usable min</th>
              <th scope="col">Blinks /min</th>
              <th scope="col">Eye closed %</th>
              <th scope="col">Long /h</th>
              <th scope="col">Median ms</th>
              <th scope="col">Pulse bpm (min)</th>
              <th scope="col">Minutes</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((d) => (
              <tr key={d.day}>
                <th scope="row">{shortDay(d.day)}</th>
                <td className="tabular">{hoursMinutes(d.measuredMinutes)}</td>
                <td className="tabular">{d.blinks.minutes}</td>
                <td className="tabular">{fmt(d.blinks.ratePerMin, 1)}</td>
                <td className="tabular">
                  {fmt(d.blinks.closedFraction === null ? null : d.blinks.closedFraction * 100, 1)}
                </td>
                <td className="tabular">{fmt(d.blinks.longPerHour, 1)}</td>
                <td className="tabular">{fmt(d.blinks.medianDurationMs, 0)}</td>
                <td className="tabular">
                  {d.pulse.bpm === null
                    ? '-'
                    : `${d.pulse.bpm.toFixed(0)} (${String(d.pulse.minutes)})`}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-link"
                    aria-pressed={selected === d.day}
                    onClick={() => {
                      setSelected(selected === d.day ? null : d.day);
                    }}
                  >
                    {selected === d.day ? 'Hide' : 'Show'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="plot__legend">
        {`Blink values need at least ${String(MIN_DAY_USABLE_MINUTES)} usable minutes in a day; "-" means not enough data.`}
      </p>
      {selected && grouped.get(selected) ? (
        <DayDetail day={selected} rows={grouped.get(selected) ?? []} />
      ) : null}

      <h3 className="subsection-title">{INDICATOR.title}</h3>
      <p className="tool__note">
        {INDICATOR.subtitle}. {HISTORY_COPY.indicatorNote}
      </p>
      <div className="session__scroll">
        <table className="tool__table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{INDICATOR.bands.near}</th>
              <th scope="col">{INDICATOR.bands.somewhatAbove}</th>
              <th scope="col">{INDICATOR.bands.wellAbove}</th>
              <th scope="col">{INDICATOR.notEnoughData}</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((d) => (
              <tr key={d.day}>
                <th scope="row">{shortDay(d.day)}</th>
                <td className="tabular">{d.indicator.bands.near}</td>
                <td className="tabular">{d.indicator.bands.somewhatAbove}</td>
                <td className="tabular">{d.indicator.bands.wellAbove}</td>
                <td className="tabular">{d.indicator.notEnoughData}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="plot__legend">Minutes per day.</p>

      <div className="history__actions">
        <button type="button" className="btn btn-ghost" onClick={history.exportCsv}>
          {HISTORY_COPY.exportCsv}
        </button>
        {confirming ? (
          <div className="session__confirm" role="region" aria-label="Delete all history">
            <p>{HISTORY_COPY.deleteConfirm}</p>
            <div className="setup__actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                {HISTORY_COPY.cancel}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void history.deleteAll().then(() => {
                    setConfirming(false);
                    setDeleted(true);
                    setSelected(null);
                  });
                }}
              >
                {HISTORY_COPY.deleteYes}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {HISTORY_COPY.deleteAll}
          </button>
        )}
      </div>
    </section>
  );
}
