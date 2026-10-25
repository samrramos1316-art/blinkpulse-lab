import { useState } from 'react';
import { COOLDOWN_CHOICES, FRACTION_CHOICES, MINUTE_CHOICES } from '../../blink/comfortReminder.ts';
import type { ComfortReminder } from '../../app/useComfortReminder.ts';
import { REMINDER_COPY } from '../copy.ts';
import { notifyPermission, requestNotifyPermission, type NotifyPermission } from '../notify.ts';

/** Settings for the optional eye-comfort reminder (off by default, PROJECT_SPEC 5.6). */
export function ReminderSettingsPanel({ reminder }: { reminder: ComfortReminder }) {
  const { settings: s, setSettings, baseline } = reminder;
  const [perm, setPerm] = useState<NotifyPermission>(notifyPermission);

  const toggleNotify = async (on: boolean) => {
    if (!on) {
      setSettings({ ...s, notify: false });
      return;
    }
    const p = await requestNotifyPermission();
    setPerm(p);
    setSettings({ ...s, notify: p === 'granted' });
  };

  const baselineText = !baseline
    ? REMINDER_COPY.baselineNone
    : baseline.source === 'history'
      ? REMINDER_COPY.baselineHistory(baseline.ratePerMin, baseline.minutes)
      : REMINDER_COPY.baselineSession(baseline.ratePerMin);

  return (
    <section className="subcard" aria-labelledby="reminder-title">
      <h3 id="reminder-title" className="subsection-title">
        {REMINDER_COPY.title}
      </h3>
      <p className="tool__note">{REMINDER_COPY.intro}</p>
      <label className="tool__check">
        <input
          type="checkbox"
          checked={s.enabled}
          onChange={(e) => {
            setSettings({ ...s, enabled: e.target.checked });
          }}
        />
        {REMINDER_COPY.enable}
      </label>
      {s.enabled ? (
        <>
          <div className="tool__row">
            <label className="tool__field">
              {REMINDER_COPY.fraction}
              <select
                value={s.fraction}
                onChange={(e) => {
                  setSettings({ ...s, fraction: Number(e.target.value) });
                }}
              >
                {FRACTION_CHOICES.map((f) => (
                  <option key={f} value={f}>
                    {REMINDER_COPY.fractionOption(f)}
                  </option>
                ))}
              </select>
            </label>
            <label className="tool__field">
              {REMINDER_COPY.minutes}
              <select
                value={s.minutes}
                onChange={(e) => {
                  setSettings({ ...s, minutes: Number(e.target.value) });
                }}
              >
                {MINUTE_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {REMINDER_COPY.minutesOption(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="tool__field">
              {REMINDER_COPY.cooldown}
              <select
                value={s.cooldownMin}
                onChange={(e) => {
                  setSettings({ ...s, cooldownMin: Number(e.target.value) });
                }}
              >
                {COOLDOWN_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {REMINDER_COPY.cooldownOption(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="tool__check">
            <input
              type="checkbox"
              checked={s.notify}
              disabled={perm === 'unsupported'}
              onChange={(e) => {
                void toggleNotify(e.target.checked);
              }}
            />
            {REMINDER_COPY.notify}
          </label>
          {perm === 'denied' ? (
            <p className="tool__note">{REMINDER_COPY.notifyDenied}</p>
          ) : perm === 'unsupported' ? (
            <p className="tool__note">{REMINDER_COPY.notifyUnsupported}</p>
          ) : null}
          <p className="tool__note">{baselineText}</p>
        </>
      ) : null}
    </section>
  );
}
