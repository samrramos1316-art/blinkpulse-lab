import { describe, expect, it } from 'vitest';
import { nextThemePreference, readThemePreference } from './theme.ts';

describe('theme preference', () => {
  it('cycles system -> light -> dark -> system', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });

  it('falls back to system when storage is unavailable', () => {
    expect(readThemePreference()).toBe('system');
  });
});
