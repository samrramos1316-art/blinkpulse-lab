import { useEffect, useRef, useState } from 'react';
import type { RecordedTrace } from '../../app/useBlink.ts';
import type { PulseUpdate } from '../../rppg/pulseEstimator.ts';
import { REGION_IDS, type RegionId } from '../../rppg/roi.ts';
import { RECORD_COPY, REGION_LABEL } from '../copy.ts';
import { downloadText } from '../download.ts';
import {
  describeFilter,
  describeSpectrum,
  describeWaveform,
  filterSpec,
  spectrumSpec,
  waveformSpec,
} from '../plot/pulsePlots.ts';
import { regionRow } from '../pulseDisplay.ts';
import { Chart } from './Chart.tsx';

const FILTER_SPEC = filterSpec();
const FILTER_TEXT = describeFilter();

interface RecordingControls {
  live: boolean;
  recording: boolean;
  start: () => void;
  stop: () => RecordedTrace | null;
  pending: RecordedTrace | null;
  clearPending: () => void;
}

/** Pulse tab: per-region table, waveform and spectrum of a chosen region, filter response. */
export function PulsePanel({
  pulse,
  record,
}: {
  pulse: PulseUpdate | null;
  record: RecordingControls;
}) {
  const [region, setRegion] = useState<RegionId>('forehead');
  const report = pulse?.regions.find((r) => r.id === region) ?? null;
  const est = report?.estimate ?? null;
  const label = REGION_LABEL[region];
  const kept = new Set(pulse?.fusion?.kept ?? []);
  const version = pulse ? `${String(pulse.tMs)}-${region}` : region;

  return (
    <div className="pulse">
      <p className="session__intro">
        Pulse rate is estimated separately from three skin regions and then combined. Each estimate
        uses the last 10 seconds and updates once per second.
      </p>

      <div className="session__scroll">
        <table className="tool__table">
          <caption className="plot__title pulse__caption">Pulse by region</caption>
          <thead>
            <tr>
              <th scope="col">Region</th>
              <th scope="col">BPM (last 10 s)</th>
              <th scope="col">Quality</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {(pulse?.regions.length ? pulse.regions : []).map((r) => {
              const row = regionRow(r, kept.has(r.id));
              return (
                <tr key={r.id}>
                  <th scope="row">{row.label}</th>
                  <td className="tabular">{row.bpm}</td>
                  <td>{row.quality}</td>
                  <td>{row.reason}</td>
                </tr>
              );
            })}
            {pulse?.regions.length ? null : (
              <tr>
                <td colSpan={4}>No estimates yet: the first one comes after 10 seconds.</td>
              </tr>
            )}
          </tbody>
          {pulse?.fusion?.bpm != null ? (
            <tfoot>
              <tr>
                <th scope="row">Combined</th>
                <td className="tabular">{pulse.fusion.bpm.toFixed(0)}</td>
                <td colSpan={2}>
                  {pulse.fusion.agreementBpm === null
                    ? 'One region used.'
                    : `Regions agree within ${pulse.fusion.agreementBpm.toFixed(1)} BPM.`}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <fieldset className="pulse__regions">
        <legend className="plot__title">Show signals for</legend>
        {REGION_IDS.map((id) => (
          <label key={id} className="tool__radio">
            <input
              type="radio"
              name="pulse-region"
              checked={region === id}
              onChange={() => {
                setRegion(id);
              }}
            />
            {REGION_LABEL[id]}
          </label>
        ))}
      </fieldset>

      <div className="session__plots">
        <Chart
          title={`Filtered pulse signal (${label})`}
          spec={est ? waveformSpec(est) : null}
          description={describeWaveform(est, label)}
          version={version}
        />
        <Chart
          title={`Spectrum (${label})`}
          spec={est ? spectrumSpec(est) : null}
          description={describeSpectrum(est, label)}
          version={version}
        />
        <Chart
          title="Band-pass filter response"
          spec={FILTER_SPEC}
          description={FILTER_TEXT}
          version="filter"
        />
      </div>
      <p className="plot__legend">
        Triangles: detected beats (waveform) and the spectral peak (spectrum). Shaded: the 0.7-3.0
        Hz pulse band. Dashed lines: filter cut-offs.
      </p>

      <TraceRecorder {...record} />
    </div>
  );
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Explicit, two-step numeric recording (PROJECT_SPEC 8: numbers only, after user action). */
function save(t: RecordedTrace): string {
  const name = `blinkpulse-${stamp()}`;
  downloadText(`${name}-frames.csv`, t.frames);
  downloadText(`${name}-estimates.csv`, t.estimates);
  return `Saved ${(t.durationMs / 1000).toFixed(0)} s of numbers as two CSV files.`;
}

function TraceRecorder({ live, recording, start, stop, pending, clearPending }: RecordingControls) {
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirming) panelRef.current?.focus();
  }, [confirming]);

  if (recording) {
    return (
      <div className="session__confirm" role="region" aria-label="Numeric trace recording">
        <p role="status">{RECORD_COPY.active}</p>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const t = stop();
              if (t) setSaved(save(t));
            }}
          >
            {RECORD_COPY.stop}
          </button>
        </div>
      </div>
    );
  }
  if (pending) {
    return (
      <div className="session__confirm" role="region" aria-label="Recorded numeric trace">
        <p role="status">
          {`The camera stopped, so recording ended after ${(pending.durationMs / 1000).toFixed(0)} s. Save the numbers?`}
        </p>
        <div className="setup__actions">
          <button type="button" className="btn btn-ghost" onClick={clearPending}>
            Discard
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSaved(save(pending));
              clearPending();
            }}
          >
            Save CSV files
          </button>
        </div>
      </div>
    );
  }
  if (confirming) {
    return (
      <div
        className="session__confirm"
        ref={panelRef}
        tabIndex={-1}
        role="region"
        aria-label="Record a numeric trace"
      >
        <p>{RECORD_COPY.info}</p>
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
            disabled={!live}
            onClick={() => {
              start();
              setConfirming(false);
              setSaved(null);
            }}
          >
            {RECORD_COPY.confirm}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="tool__row">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={!live}
        onClick={() => {
          setConfirming(true);
        }}
      >
        {RECORD_COPY.start}
      </button>
      {saved ? (
        <p className="tool__note" role="status">
          {saved}
        </p>
      ) : null}
    </div>
  );
}
