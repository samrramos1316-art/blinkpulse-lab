import { REMINDER_COPY } from '../copy.ts';

/**
 * The eye-comfort reminder (PROJECT_SPEC 5.6): gentle, dismissible, no sound. The
 * live region stays mounted so screen readers announce the text when it appears.
 */
export function ReminderBanner({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  return (
    <div className="reminder-banner" role="status" aria-live="polite">
      {open ? (
        <div className="reminder-banner__body">
          <p>
            <strong>{REMINDER_COPY.title}.</strong> {REMINDER_COPY.banner}
          </p>
          <button type="button" className="btn btn-ghost btn-small" onClick={onDismiss}>
            {REMINDER_COPY.dismiss}
          </button>
        </div>
      ) : null}
    </div>
  );
}
