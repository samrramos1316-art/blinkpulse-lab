/**
 * Canvas plots read their colours from the CSS tokens when they draw, so they must
 * redraw when the theme changes: the manual choice (`data-theme` on <html>) or the
 * system setting. Returns a number that changes on each theme change.
 */

import { useEffect, useState } from 'react';

export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => {
      setVersion((v) => v + 1);
    };
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', bump);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', bump);
    };
  }, []);
  return version;
}
