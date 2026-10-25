import { useState } from 'react';
import type { ComfortReminder } from '../../app/useComfortReminder.ts';
import type { History } from '../../app/useHistory.ts';
import type { MiniWindow } from '../../app/useMiniWindow.ts';
import { dayKey } from '../../history/history.ts';
import { TRACKING_COPY } from '../copy.ts';
import { useNow } from '../useNow.ts';
import { ReminderSettingsPanel } from './ReminderSettingsPanel.tsx';

function MiniWindowPanel({ mini }: { mini: MiniWindow }) {
  const c = TRACKING_COPY.mini;
  const isOpen = mini.container !== null;
  return (
    <section className="subcard" aria-labelledby="mini-title">
      <h3 id="mini-title" className="subsection-title">
        {c.title}
      </h3>
      {mini.supported ? (
        <>
          <p className="tool__note">{c.intro}</p>
          <div>
            <button
              type="button"
              className="btn btn-ghost"
              aria-pressed={isOpen}
              onClick={isOpen ? mini.close : mini.open}
            >
              {isOpen ? c.close : c.open}
            </button>
          </div>
          {isOpen ? <p className="tool__note">{c.isOpen}</p> : null}
          {mini.error ? <p className="tool__error">{mini.error}</p> : null}
        </>
      ) : (
        <p className="tool__note">{c.unsupported}</p>
      )}
    </section>
  );
}

function HistoryPanel({ history, onOpen }: { history: History; onOpen: () => void }) {
  const c = TRACKING_COPY.history;
  const [askDelete, setAskDelete] = useState(false);
  const rows = history.rows ?? [];
  const today = dayKey(useNow());
  const savedToday = rows.filter((r) => dayKey(r.startMs) === today).length;
  return (
    <section className="subcard" aria-labelledby="history-title">
      <h3 id="history-title" className="subsection-title">
        {c.title}
      </h3>
      <p className="tool__note">{c.intro}</p>
      {history.available ? (
        <>
          <label className="tool__check">
            <input
              type="checkbox"
              checked={history.enabled}
              onChange={(e) => {
                const on = e.target.checked;
                history.setEnabled(on);
                // Turning it off asks whether to delete what is stored (F2).
                setAskDelete(!on);
                if (!on) history.load();
              }}
            />
            {c.enable}
          </label>
          {history.enabled && history.rows ? (
            <p className="tool__note" aria-live="polite">
              {c.saved(savedToday, rows.length)}
            </p>
          ) : null}
          {askDelete && !history.enabled && rows.length > 0 ? (
            <div className="session__confirm" role="region" aria-label={c.turnedOff}>
              <p>{c.turnedOff}</p>
              <div className="setup__actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setAskDelete(false);
                  }}
                >
                  {c.keep}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    void history.deleteAll().then(() => {
                      setAskDelete(false);
                    });
                  }}
                >
                  {c.delete}
                </button>
              </div>
            </div>
          ) : null}
          <div>
            <button type="button" className="btn btn-ghost" onClick={onOpen}>
              {c.open}
            </button>
          </div>
          {history.error ? <p className="tool__error">{history.error}</p> : null}
        </>
      ) : (
        <p className="tool__note">{c.unavailable}</p>
      )}
    </section>
  );
}

/** Mini window, history, and the eye-comfort reminder (SPEC_AMENDMENT_04). */
export function TrackingCard({
  mini,
  history,
  reminder,
  onOpenHistory,
}: {
  mini: MiniWindow;
  history: History;
  reminder: ComfortReminder;
  onOpenHistory: () => void;
}) {
  return (
    <section className="card tracking" aria-labelledby="tracking-title">
      <h2 id="tracking-title" className="section-title">
        {TRACKING_COPY.title}
      </h2>
      <div className="tracking__grid">
        <MiniWindowPanel mini={mini} />
        <HistoryPanel history={history} onOpen={onOpenHistory} />
        <ReminderSettingsPanel reminder={reminder} />
      </div>
    </section>
  );
}
