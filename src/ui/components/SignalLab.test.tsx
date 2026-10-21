import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { DISCLAIMER } from '../strings.ts';
import { AboutContent } from './AboutDialog.tsx';
import { LAB_STEPS } from '../copy.ts';
import { SignalLab } from './SignalLab.tsx';

describe('Signal Lab', () => {
  const html = renderToString(<SignalLab pulse={null} />);

  it('shows the five processing steps in order, each with its caption', () => {
    const titles = [...html.matchAll(/<figcaption class="plot__title">([^<]*)</g)].map((m) => m[1]);
    expect(titles).toEqual([
      '1. Skin colour (Forehead)',
      '2. Combined by POS',
      '3. Band-pass filter response',
      '4. Filtered pulse signal',
      '5. Spectrum',
    ]);
    for (const caption of Object.values(LAB_STEPS)) {
      expect(html).toContain(caption.slice(0, 40).replaceAll('"', '&quot;'));
    }
  });

  it('says why plots are empty instead of drawing zeros', () => {
    expect(html).toContain('No estimate yet: start the camera and wait 10 seconds.');
    expect(html).toContain('no complete 10 s window yet');
    // The filter response is a property of the code, so it is drawn even with no camera.
    expect(html).toContain('role="img" aria-label="Band-pass filter');
  });

  it('describes the line styles in words, not colour alone', () => {
    expect(html).toContain('Thick solid line: green. Dashed: red. Dotted: blue.');
  });

  it('is a separate view: the main tabs are replaced, the header toggle is pressed', () => {
    const main = renderToString(<App initialSetupOpen={false} />);
    const lab = renderToString(<App initialSetupOpen={false} initialLab />);
    expect(main).toContain('aria-pressed="false">Signal Lab');
    expect(lab).toContain('aria-pressed="true">Signal Lab');
    expect(main).toContain('Session timeline');
    expect(lab).not.toContain('Session timeline');
    expect(lab).toContain('id="lab-title"');
  });
});

describe('About', () => {
  const html = renderToString(<AboutContent />);

  it('includes the full disclaimer (CLAUDE.md: footer, README, and About)', () => {
    expect(html).toContain(DISCLAIMER.replaceAll("'", '&#x27;'));
  });

  it('lists the fixed parameters from the code', () => {
    expect(html).toContain('70% of your open-eye level');
    expect(html).toContain('0.7-3.0 Hz (42-180 per minute)');
    expect(html).toContain('25 degrees sideways or 20 degrees up or down');
    expect(html).toContain('They cannot be changed in the app.');
  });
});
