import { APP_NAME, PRIVACY_BADGE } from '../strings.ts';
import { LockIcon, LogoMark, PlayIcon } from '../icons/Icons.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

export function Header() {
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
          {/* Camera capture arrives in Phase 2; the button is shown so the layout is final. */}
          <button type="button" className="btn btn-primary" disabled aria-describedby="start-note">
            <PlayIcon size={18} />
            <span>Start</span>
          </button>
          <span id="start-note" className="visually-hidden">
            Not available yet: camera capture is built in a later phase.
          </span>
        </div>
      </div>
    </header>
  );
}
