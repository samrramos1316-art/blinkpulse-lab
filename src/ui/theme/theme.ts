/**
 * Theme preference: follow the system, or force light/dark.
 * Only the preference is stored (SPEC_AMENDMENT_02 Part 3); storage failures are ignored.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'blinkpulse.theme';
const ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(pref: ThemePreference): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
}

/** Sets or clears `data-theme` on <html>; tokens.css reacts to it. */
export function applyThemePreference(pref: ThemePreference, root: HTMLElement): void {
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function nextThemePreference(pref: ThemePreference): ThemePreference {
  const i = ORDER.indexOf(pref);
  return ORDER[(i + 1) % ORDER.length] ?? 'system';
}
