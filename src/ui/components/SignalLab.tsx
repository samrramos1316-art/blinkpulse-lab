import { useState } from 'react';
import type { PulseUpdate } from '../../rppg/pulseEstimator.ts';
import { REGION_IDS, type RegionId } from '../../rppg/roi.ts';
import { LAB_STEPS, REGION_LABEL } from '../copy.ts';
import {
  describeFilter,
  describeRgb,
  describeSpectrum,
  describeUnfiltered,
  describeWaveform,
  filterSpec,
  rgbSpec,
  spectrumSpec,
  unfilteredSpec,
  waveformSpec,
} from '../plot/pulsePlots.ts';
import { labSummary, showsBpm } from '../pulseDisplay.ts';
import { Chart } from './Chart.tsx';

const FILTER_SPEC = filterSpec();
const FILTER_TEXT = describeFilter();

/**
 * Signal Lab (PROJECT_SPEC 5.5, SPEC_AMENDMENT_01 Patch A): every step of the pulse
 * estimate for one region, from the same window the app used.
 */
export function SignalLab({ pulse }: { pulse: PulseUpdate | null }) {
  const [region, setRegion] = useState<RegionId>('forehead');
  const report = pulse?.regions.find((r) => r.id === region) ?? null;
  const est = report?.estimate ?? null;
  const label = REGION_LABEL[region];
  const version = pulse ? `${String(pulse.tMs)}-${region}` : region;
  const kept = (pulse?.fusion?.kept ?? []).includes(region);
  const show = showsBpm(report);

  return (
    <section className="card lab" aria-labelledby="lab-title">
      <h2 id="lab-title" className="section-title">
        Signal Lab
      </h2>
      <p className="session__intro">
        How the pulse rate is worked out, step by step, from the last 10 seconds of one skin region.
        The plots update once per second while the camera runs.
      </p>

      <fieldset className="pulse__regions">
        <legend className="plot__title">Skin region</legend>
        {REGION_IDS.map((id) => (
          <label key={id} className="tool__radio">
            <input
              type="radio"
              name="lab-region"
              checked={region === id}
              onChange={() => {
                setRegion(id);
              }}
            />
            {REGION_LABEL[id]}
          </label>
        ))}
      </fieldset>

      <p className="lab__summary" role="status">
        {labSummary(report, kept)}
      </p>

      <ol className="lab__steps">
        <li className="lab__step">
          <Chart
            title={`1. Skin colour (${label})`}
            spec={est ? rgbSpec(est) : null}
            description={describeRgb(est, label)}
            version={version}
          />
          <p className="lab__caption">{LAB_STEPS.rgb}</p>
          <p className="plot__legend">Thick solid line: green. Dashed: red. Dotted: blue.</p>
        </li>
        <li className="lab__step">
          <Chart
            title="2. Combined by POS"
            spec={est ? unfilteredSpec(est) : null}
            description={describeUnfiltered(est, label)}
            version={version}
          />
          <p className="lab__caption">{LAB_STEPS.pos}</p>
        </li>
        <li className="lab__step">
          <Chart
            title="3. Band-pass filter response"
            spec={FILTER_SPEC}
            description={FILTER_TEXT}
            version="filter"
          />
          <p className="lab__caption">{LAB_STEPS.filter}</p>
          <p className="plot__legend">Dashed lines: the cut-offs.</p>
        </li>
        <li className="lab__step">
          <Chart
            title="4. Filtered pulse signal"
            spec={est ? waveformSpec(est) : null}
            description={describeWaveform(est, label, show)}
            version={version}
          />
          <p className="lab__caption">{LAB_STEPS.waveform}</p>
        </li>
        <li className="lab__step">
          <Chart
            title="5. Spectrum"
            spec={est ? spectrumSpec(est, show) : null}
            description={describeSpectrum(est, label, show)}
            version={version}
          />
          <p className="lab__caption">{LAB_STEPS.spectrum}</p>
          <p className="plot__legend">
            Shaded: the 0.7-3.0 Hz pulse band. Triangle: the strongest peak.
          </p>
        </li>
      </ol>
    </section>
  );
}
