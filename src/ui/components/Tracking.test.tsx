import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ComfortReminder } from '../../app/useComfortReminder.ts';
import type { History } from '../../app/useHistory.ts';
import type { MiniWindow } from '../../app/useMiniWindow.ts';
import { DEFAULT_REMINDER } from '../../blink/comfortReminder.ts';
import type { HistoryRow } from '../../history/history.ts';
import { HISTORY_COPY, REMINDER_COPY, TRACKING_COPY } from '../copy.ts';
import { INDICATOR } from '../strings.ts';
import { HistoryView } from './HistoryView.tsx';
import { MiniView } from './MiniView.tsx';
import { ReminderBanner } from './ReminderBanner.tsx';
import { TrackingCard } from './TrackingCard.tsx';

const noop = () => undefined;

const history = (over: Partial<History> = {}): History => ({
  available: true,
  enabled: false,
  setEnabled: noop,
  rows: [],
  load: noop,
  error: null,
  baseline: null,
  deleteAll: () => Promise.resolve(),
  exportCsv: noop,
  ...over,
});

const reminder: ComfortReminder = {
  settings: DEFAULT_REMINDER,
  setSettings: noop,
  baseline: null,
  bannerOpen: false,
  dismiss: noop,
};

const mini = (supported: boolean): MiniWindow => ({
  supported,
  container: null,
  open: noop,
  close: noop,
  error: null,
});

/** Today's local minutes from 09:00. */
function rows(n: number, over: Partial<HistoryRow> = {}): HistoryRow[] {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => ({
    id: `s:${String(i)}`,
    sessionId: 's',
    minute: i,
    startMs: start.getTime() + i * 60_000,
    elapsedMs: 60_000,
    validMs: 60_000,
    coverage: 1,
    usable: true,
    medianFrameMs: 33.3,
    lowFps: false,
    blinkCount: 15,
    ratePerMin: 15,
    medianDurationMs: 150,
    meanDurationMs: 160,
    longClosures: 0,
    extendedClosures: 0,
    closedFraction: 0.02,
    pulseBpm: 70,
    pulseShownHops: 40,
    pulseHops: 60,
    eci: i < 5 ? 1.1 : null,
    eciBand: i < 5 ? 'near' : null,
    ...over,
  }));
}

describe('tracking card (SPEC_AMENDMENT_04)', () => {
  it('everything is off by default: history and reminder unchecked', () => {
    const html = renderToString(
      <TrackingCard
        mini={mini(true)}
        history={history()}
        reminder={reminder}
        onOpenHistory={noop}
      />,
    );
    expect(html).toContain(TRACKING_COPY.mini.open);
    expect(html).toContain(TRACKING_COPY.history.enable);
    expect(html).toContain(REMINDER_COPY.enable);
    expect(html).not.toMatch(/checked=""/);
  });

  it('without mini-window support it says to keep the window visible', () => {
    const html = renderToString(
      <TrackingCard
        mini={mini(false)}
        history={history()}
        reminder={reminder}
        onOpenHistory={noop}
      />,
    );
    expect(html).toContain(TRACKING_COPY.mini.unsupported);
    expect(html).not.toContain(TRACKING_COPY.mini.open);
  });

  it('history unavailable in this browser is said plainly', () => {
    const html = renderToString(
      <TrackingCard
        mini={mini(true)}
        history={history({ available: false })}
        reminder={reminder}
        onOpenHistory={noop}
      />,
    );
    expect(html).toContain(TRACKING_COPY.history.unavailable);
  });
});

describe('history view (SPEC_AMENDMENT_04 F4)', () => {
  it('loading, off, and empty states', () => {
    expect(renderToString(<HistoryView history={history({ rows: null })} />)).toContain(
      HISTORY_COPY.loading,
    );
    expect(renderToString(<HistoryView history={history()} />)).toContain(
      HISTORY_COPY.off.replace(/"/g, '&quot;'),
    );
    expect(renderToString(<HistoryView history={history({ enabled: true })} />)).toContain(
      HISTORY_COPY.empty,
    );
  });

  it('a day with enough minutes shows values with their minute counts', () => {
    const html = renderToString(
      <HistoryView history={history({ enabled: true, rows: rows(12) })} />,
    );
    // Blink rate 15.0, pulse 70 from 12 minutes, 12 usable minutes.
    expect(html).toMatch(/<td class="tabular">15\.0<\/td>/);
    expect(html).toContain('70 (12)');
    expect(html).toContain(HISTORY_COPY.pulseNote);
    // Indicator table: approved wording, minutes per band.
    expect(html).toContain(INDICATOR.title);
    expect(html).toContain(INDICATOR.bands.near);
    expect(html).toContain(INDICATOR.notEnoughData);
  });

  it('a day with fewer than 10 usable minutes shows "-" for blink values', () => {
    const html = renderToString(
      <HistoryView history={history({ enabled: true, rows: rows(9) })} />,
    );
    expect(html).not.toMatch(/<td class="tabular">15\.0<\/td>/);
    expect(html).toContain('70 (9)');
  });
});

describe('mini view and reminder banner', () => {
  it('mini view: status, blink rate, pulse with quality, and Stop', () => {
    const html = renderToString(
      <MiniView
        live
        status={{ text: 'Measuring.', tone: 'neutral' }}
        blinkRate={{ value: '14', status: '' }}
        pulse={{ value: '72', status: '', level: 'good' }}
        historyNote="Saved today: 3 minutes. In total: 3 minutes."
        reminder={{ open: true, dismiss: noop }}
        onStart={noop}
        onStop={noop}
      />,
    );
    expect(html).toContain('Measuring.');
    expect(html).toContain('>14<');
    expect(html).toContain('>72<');
    expect(html).toContain('Quality: Good');
    expect(html).toContain('Saved today: 3 minutes.');
    expect(html).toContain(REMINDER_COPY.banner.replace(/'/g, '&#x27;'));
    expect(html).toContain('Stop');
  });

  it('closed banner keeps an empty live region', () => {
    const html = renderToString(<ReminderBanner open={false} onDismiss={noop} />);
    expect(html).toBe('<div class="reminder-banner" role="status" aria-live="polite"></div>');
  });
});
