import { PROVISIONAL_BANDS } from '../../blink/sleepiness.ts';

/** Gauge scale: 0 to 3 times the baseline; higher values sit at the end. */
const GAUGE_MAX = 3;
const pct = (v: number) => `${String((Math.min(Math.max(v, 0), GAUGE_MAX) / GAUGE_MAX) * 100)}%`;

/**
 * Continuous gauge for the Eye-Closure Index (PROJECT_SPEC 5.7). Decorative: the
 * card's number and band label carry the same information as text, so it is hidden
 * from assistive technology. Band edges are tick marks, not colours.
 */
export function IndicatorGauge({ value }: { value: number }) {
  return (
    <div className="gauge" aria-hidden="true">
      <div className="gauge__track">
        <span className="gauge__tick" style={{ left: pct(1) }} />
        <span
          className="gauge__tick gauge__tick--band"
          style={{ left: pct(PROVISIONAL_BANDS.somewhatAbove) }}
        />
        <span
          className="gauge__tick gauge__tick--band"
          style={{ left: pct(PROVISIONAL_BANDS.wellAbove) }}
        />
        <span className="gauge__marker" style={{ left: pct(value) }} />
      </div>
      <div className="gauge__labels">
        <span style={{ left: pct(1) }}>1x</span>
        <span style={{ left: pct(PROVISIONAL_BANDS.somewhatAbove) }}>1.5x</span>
        <span style={{ left: pct(PROVISIONAL_BANDS.wellAbove) }}>2.5x</span>
      </div>
    </div>
  );
}
