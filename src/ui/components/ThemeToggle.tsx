import { useEffect, useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from '../icons/Icons.tsx';
import {
  applyThemePreference,
  nextThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from '../theme/theme.ts';

const LABEL: Record<ThemePreference, string> = {
  system: 'Theme: match system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    applyThemePreference(pref, document.documentElement);
  }, [pref]);

  const Icon = pref === 'light' ? SunIcon : pref === 'dark' ? MoonIcon : MonitorIcon;

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={() => {
        const next = nextThemePreference(pref);
        writeThemePreference(next);
        setPref(next);
      }}
      aria-label={`${LABEL[pref]}. Change theme`}
      title={LABEL[pref]}
    >
      <Icon />
    </button>
  );
}
