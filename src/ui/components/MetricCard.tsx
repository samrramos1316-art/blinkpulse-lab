import type { ReactNode } from 'react';

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  /** Shown large. Use "-" when there is no value; never show a fake number. */
  value: string;
  unit?: string;
  /** One-line plain-language status under the value. */
  status: string;
}

export function MetricCard({ icon, label, value, unit, status }: MetricCardProps) {
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
      <p className="metric-card__status">{status}</p>
    </article>
  );
}
