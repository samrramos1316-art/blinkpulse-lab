import type { StatusText } from '../captureStatus.ts';
import type { QualityLevel } from '../../rppg/quality.ts';
import { EyeIcon, PlayIcon, PulseIcon, StopIcon } from '../icons/Icons.tsx';
import { METRIC } from '../strings.ts';
import { MetricCard } from './MetricCard.tsx';
import { ReminderBanner } from './ReminderBanner.tsx';

export interface MiniViewProps {
  live: boolean;
  status: StatusText;
  blinkRate: { value: string; status: string };
  pulse: { value: string; status: string; level: QualityLevel | null };
  /** "Saved today: ..." when history is on, else null. */
  historyNote: string | null;
  reminder: { open: boolean; dismiss: () => void };
  onStart: () => void;
  onStop: () => void;
}

/** Compact status for the mini window (SPEC_AMENDMENT_04 F1). */
export function MiniView(p: MiniViewProps) {
  return (
    <main className="mini" aria-label="BlinkPulse Lab mini window">
      <p className="mini__status" data-tone={p.status.tone} aria-live="polite">
        {p.status.text}
      </p>
      <ReminderBanner open={p.reminder.open} onDismiss={p.reminder.dismiss} />
      <div className="mini__cards">
        <MetricCard
          icon={<EyeIcon />}
          label={METRIC.blinkRate}
          value={p.blinkRate.value}
          unit="/min"
          status={p.blinkRate.status}
        />
        <MetricCard
          icon={<PulseIcon />}
          label={METRIC.pulseRate}
          value={p.pulse.value}
          unit="bpm"
          status={p.pulse.status}
          quality={p.pulse.level}
        />
      </div>
      <div className="mini__foot">
        {p.historyNote ? <p className="mini__note">{p.historyNote}</p> : <span />}
        {p.live ? (
          <button type="button" className="btn btn-primary btn-small" onClick={p.onStop}>
            <StopIcon size={16} />
            <span>Stop</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-small" onClick={p.onStart}>
            <PlayIcon size={16} />
            <span>Start</span>
          </button>
        )}
      </div>
    </main>
  );
}
