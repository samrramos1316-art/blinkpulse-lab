import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, contrastRatio } from '../src/ui/theme/contrast.ts';

const css = readFileSync(new URL('../src/ui/theme/tokens.css', import.meta.url), 'utf8');

/** Returns the body of the first `{...}` block that follows `selector`, honouring nesting. */
function blockAfter(source: string, selector: string): string {
  const at = source.indexOf(selector);
  if (at < 0) throw new Error(`Selector not found: ${selector}`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`Unclosed block after: ${selector}`);
}

function colourTokens(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const m of block.matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    const [, name, value] = m;
    if (name && value) tokens.set(name, value);
  }
  return tokens;
}

const themes = {
  light: colourTokens(blockAfter(css, ':root {')),
  dark: colourTokens(blockAfter(css, ":root:not([data-theme='light'])")),
  darkOverride: colourTokens(blockAfter(css, ":root[data-theme='dark']")),
};

/** [foreground, background, minimum ratio, why]. Every pair the UI actually uses goes here. */
const PAIRS: [string, string, number, string][] = [
  ['--color-text', '--color-bg', AA_TEXT, 'body text'],
  ['--color-text', '--color-surface', AA_TEXT, 'card text'],
  ['--color-text', '--color-surface-raised', AA_TEXT, 'raised card text'],
  ['--color-text', '--color-surface-sunken', AA_TEXT, 'preview panel text'],
  ['--color-text-muted', '--color-bg', AA_TEXT, 'footer / secondary text'],
  ['--color-text-muted', '--color-surface', AA_TEXT, 'card labels'],
  ['--color-text-muted', '--color-surface-raised', AA_TEXT, 'raised card labels'],
  ['--color-text-muted', '--color-surface-sunken', AA_TEXT, 'preview panel hint'],
  ['--color-accent', '--color-surface', AA_TEXT, 'accent text and links on cards'],
  ['--color-accent', '--color-bg', AA_TEXT, 'accent text on page'],
  ['--color-accent', '--color-accent-soft', AA_TEXT, 'privacy badge'],
  ['--color-on-accent', '--color-accent-strong', AA_TEXT, 'primary button label'],
  ['--color-quality-good', '--color-surface', AA_TEXT, 'quality chip text'],
  ['--color-quality-fair', '--color-surface', AA_TEXT, 'quality chip text'],
  ['--color-quality-poor', '--color-surface', AA_TEXT, 'quality chip text'],
  ['--color-focus', '--color-bg', AA_NON_TEXT, 'focus ring on page'],
  ['--color-focus', '--color-surface', AA_NON_TEXT, 'focus ring on cards'],
  ['--color-accent-strong', '--color-surface', AA_NON_TEXT, 'primary button boundary'],
  ['--color-accent', '--color-surface-sunken', AA_NON_TEXT, 'setup hint icon'],
  ['--color-quality-fair', '--color-surface', AA_NON_TEXT, 'warning icon in status line'],
  ['--color-quality-fair', '--color-surface-sunken', AA_NON_TEXT, 'warning icon in setup hint'],
  ['--color-quality-poor', '--color-surface', AA_NON_TEXT, 'error icon in status line'],
  ['--color-quality-poor', '--color-surface-sunken', AA_NON_TEXT, 'error icon in setup alert'],
];

describe('design tokens', () => {
  it('light and dark themes define the same colour tokens', () => {
    expect([...themes.dark.keys()].sort()).toEqual([...themes.light.keys()].sort());
    expect(themes.light.size).toBeGreaterThan(10);
  });

  it('manual dark override matches the system dark theme exactly', () => {
    expect(Object.fromEntries(themes.darkOverride)).toEqual(Object.fromEntries(themes.dark));
  });

  for (const themeName of ['light', 'dark'] as const) {
    describe(`${themeName} theme meets WCAG AA`, () => {
      for (const [fg, bg, min, why] of PAIRS) {
        it(`${fg} on ${bg} (${why}) >= ${min}`, () => {
          const theme = themes[themeName];
          const fgHex = theme.get(fg);
          const bgHex = theme.get(bg);
          expect(fgHex, `${fg} missing`).toBeDefined();
          expect(bgHex, `${bg} missing`).toBeDefined();
          if (!fgHex || !bgHex) return;
          expect(contrastRatio(fgHex, bgHex)).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
