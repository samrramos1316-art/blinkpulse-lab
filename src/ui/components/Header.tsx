import type { CaptureStatus } from '../../app/captureController.ts';
import { APP_NAME, PRIVACY_BADGE } from '../strings.ts';
import { HelpIcon, LockIcon, LogoMark, PlayIcon, StopIcon } from '../icons/Icons.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

interface HeaderProps {
  status: CaptureStatus;
  onStart: () => void;
  onStop: () => void;
  onOpenGuide: () => void;
}

export function Header({ status, onStart, onStop, onOpenGuide }: HeaderProps) {
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
          <span>{PRIVACY_BADGE}</span>
        </p>

        <div className="app-header__actions">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={onOpenGuide}>
            <HelpIcon size={18} />
            <span>Guide</span>
          </button>
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
