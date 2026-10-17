import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { CAPTURE_STATUS } from './copy.ts';
import { DISCLAIMER, PRIVACY_BADGE } from './strings.ts';

describe('App main view', () => {
  const html = renderToString(<App initialSetupOpen={false} />);

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

  it('offers an enabled Start button and the camera-off status', () => {
    expect(html).toMatch(/<button type="button" class="btn btn-primary">.*?Start<\/span>/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^]*?Start/);
    expect(html).toContain(CAPTURE_STATUS.idle);
  });

  it('renders the video element hidden until the camera runs', () => {
    expect(html).toMatch(/<video[^>]*class="preview__video"[^>]*hidden/);
  });
});

describe('App first run', () => {
  const html = renderToString(<App initialSetupOpen />);

  it('shows the setup guide instead of the metric cards', () => {
    expect(html).toContain('Step 1 of 4');
    expect(html).toContain('Get started');
    expect(html).toContain('Skip setup');
    expect(html).not.toContain('metric-card__value');
  });
});
