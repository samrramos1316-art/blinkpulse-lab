import type { ReactNode } from 'react';
import type { QualityLevel } from '../../rppg/quality.ts';
import { METRIC } from '../strings.ts';

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  /** Shown large. Use "-" when there is no value; never show a fake number. */
  value: string;
  unit?: string;
  /** One-line plain-language status under the value. */
  status: string;
  /** Quality chip (text plus a shape per level, never colour alone). */
  quality?: QualityLevel | null;
  /** Extra visual under the value (e.g. a gauge); the text must carry the same meaning. */
  children?: ReactNode;
}

const CHIP_MARK: Record<QualityLevel, string> = { good: '●', fair: '◐', poor: '○' };

export function MetricCard({
  icon,
  label,
  value,
  unit,
  status,
  quality,
  children,
}: MetricCardProps) {
  return (
    <article className="card metric-card">
      <h2 className="metric-card__label">
        <span className="metric-card__icon">{icon}</span>
        {label}
      </h2>
      <p className="metric-card__value">
        <span className="tabular">{value}</span>
        {unit ? <span className="metric-card__unit">{unit}</span> : null}
      </p>
      {children}
      {quality ? (
        <p className="quality-chip" data-level={quality}>
          <span aria-hidden="true">{CHIP_MARK[quality]}</span>
          {METRIC.quality[quality]}
        </p>
      ) : null}
      <p className="metric-card__status">{status}</p>
    </article>
  );
}
