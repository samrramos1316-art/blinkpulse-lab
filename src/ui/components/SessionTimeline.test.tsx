import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionSummary } from '../../blink/sessionSummary.ts';
import { SESSION_COPY } from '../copy.ts';
import { SessionTimeline } from './SessionTimeline.tsx';

function bins() {
  const s = new SessionSummary();
  for (let t = 0; t < 60_000; t += 20) s.addSample({ tMs: t, valid: true });
  for (let t = 60_000; t < 120_000; t += 20)
    s.addSample({ tMs: t, valid: false, reason: 'headTurned' });
  for (let t = 120_000; t < 181_000; t += 20) s.addSample({ tMs: t, valid: true });
  s.addEvent({
    startMs: 1_000,
    endMs: 1_150,
    durationMs: 150,
    kind: 'blink',
    lowConfidence: false,
    samplesBelow: 4,
    minEar: 0.05,
  });
  return s.bins();
}

describe('SessionTimeline', () => {
  it('shows the empty state before the session starts', () => {
    expect(renderToString(<SessionTimeline bins={[]} />)).toContain(SESSION_COPY.empty);
  });

  const html = renderToString(<SessionTimeline bins={bins()} />);

  it('describes each plot in text, counting unusable minutes', () => {
    expect(html).toContain(
      'aria-label="Blink rate over 4 minutes: range 0 per minute to 1 per minute, 2 minutes unusable."',
    );
    expect(html).toContain(
      'aria-label="Median blink duration over 4 minutes: 150 ms in every minute with a value, no value in 1 minute without blinks, 2 minutes unusable."',
    );
  });

  it('shows an unusable minute as "-" with its reason, never as 0', () => {
    const row2 = /<tr><th scope="row">2<\/th>(.*?)<\/tr>/.exec(html)?.[1] ?? '';
    expect(row2).toContain('mostly head turned away');
    expect(row2).not.toMatch(/>0(\.0)?</);
    expect((row2.match(/>-</g) ?? []).length).toBe(5);
  });

  it('labels every coverage cell in text and asks before exporting', () => {
    expect(html).toContain('Minute 2: 0% usable, mostly head turned away');
    expect(html).toContain('Export per-minute table...');
    expect(html).not.toContain('Save CSV');
  });
});
