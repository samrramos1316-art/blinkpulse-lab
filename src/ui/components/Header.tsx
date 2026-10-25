import type { CaptureStatus } from '../../app/captureController.ts';
import { APP_NAME, PRIVACY_BADGE, PRIVACY_BADGE_SHORT } from '../strings.ts';
import { EyeIcon, HelpIcon, LockIcon, LogoMark, PlayIcon, StopIcon } from '../icons/Icons.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

interface HeaderProps {
  status: CaptureStatus;
  onStart: () => void;
  onStop: () => void;
  onOpenGuide: () => void;
  onOpenAbout: () => void;
  /** Signal Lab view toggle. */
  lab: { open: boolean; onToggle: () => void };
  /** History view toggle (SPEC_AMENDMENT_04 F4). */
  history: { open: boolean; onToggle: () => void };
  calibrate: { enabled: boolean; label: string; onClick: () => void };
}

export function Header({
  status,
  onStart,
  onStop,
  onOpenGuide,
  onOpenAbout,
  lab,
  history,
  calibrate,
}: HeaderProps) {
  // Stop is offered while waiting for permission too, so the request can be abandoned.
  const active = status === 'running' || status === 'starting';

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="brand">
          <span className="brand__mark">
            <LogoMark size={22} />
          </span>
          <span className="brand__name">{APP_NAME}</span>
        </div>

        <p className="privacy-badge">
          <LockIcon size={16} />
          <span className="privacy-badge__full">{PRIVACY_BADGE}</span>
          <span className="privacy-badge__short" aria-hidden="true">
            {PRIVACY_BADGE_SHORT}
          </span>
        </p>

        <div className="app-header__actions">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={onOpenGuide}>
            <HelpIcon size={18} />
            <span className="btn-label-wide">Guide</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenAbout}>
            About
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={lab.open}
            onClick={lab.onToggle}
          >
            Signal Lab
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={history.open}
            onClick={history.onToggle}
          >
            History
          </button>
          {status === 'running' ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!calibrate.enabled}
              onClick={calibrate.onClick}
            >
              <EyeIcon size={18} />
              <span>{calibrate.label}</span>
            </button>
          ) : null}
          {active ? (
            <button type="button" className="btn btn-primary" onClick={onStop}>
              <StopIcon size={18} />
              <span>Stop</span>
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onStart}>
              <PlayIcon size={18} />
              <span>Start</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
