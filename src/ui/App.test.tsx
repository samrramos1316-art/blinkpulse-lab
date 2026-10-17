import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { DISCLAIMER, PRIVACY_BADGE } from './strings.ts';

describe('App placeholder page', () => {
  const html = renderToString(<App />);

  it('renders the app name, privacy badge, and disclaimer', () => {
    expect(html).toContain('BlinkPulse Lab');
    expect(html).toContain(PRIVACY_BADGE);
    expect(html).toContain(DISCLAIMER.slice(0, 60));
  });

  it('shows no fake measurement numbers before measuring', () => {
    const values = [...html.matchAll(/metric-card__value"><span class="tabular">([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(values.length).toBe(4);
    expect(values.every((v) => v === '-')).toBe(true);
  });
});
