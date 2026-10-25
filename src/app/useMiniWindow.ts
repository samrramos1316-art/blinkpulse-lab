/**
 * Mini window (SPEC_AMENDMENT_04 F1): a small always-on-top window (Document
 * Picture-in-Picture, Chrome and Edge on desktop) showing a compact status, so the
 * app keeps measuring while the user works in other windows. The page's styles and
 * theme are copied into it; React renders into `container` through a portal.
 * Closing it (by the user or the browser) at any time is normal.
 */

import { useCallback, useEffect, useState } from 'react';
import { miniWindowState } from './miniWindowState.ts';

/** The parts of the Document Picture-in-Picture API used here (not yet in lib.dom). */
interface DocumentPip {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
}

function pipApi(): DocumentPip | null {
  if (typeof window === 'undefined') return null; // server-side render (tests)
  return (
    (window as Window & { documentPictureInPicture?: DocumentPip }).documentPictureInPicture ?? null
  );
}

export interface MiniWindow {
  supported: boolean;
  /** Where the mini view renders while the window is open, else null. */
  container: HTMLElement | null;
  open: () => void;
  close: () => void;
  error: string | null;
}

/** Copy the page's stylesheets and theme attribute; keep the theme in step. */
function adoptStyles(from: Document, to: Document): () => void {
  for (const node of from.querySelectorAll('link[rel="stylesheet"], style')) {
    to.head.append(node.cloneNode(true));
  }
  const sync = () => {
    const theme = from.documentElement.getAttribute('data-theme');
    if (theme === null) to.documentElement.removeAttribute('data-theme');
    else to.documentElement.setAttribute('data-theme', theme);
    to.documentElement.lang = from.documentElement.lang;
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(from.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    observer.disconnect();
  };
}

export function useMiniWindow(): MiniWindow {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = pipApi() !== null;

  const open = useCallback(() => {
    const pip = pipApi();
    if (!pip || pip.window) return;
    setError(null);
    pip.requestWindow({ width: 340, height: 300 }).then(
      (win) => {
        const stopSync = adoptStyles(document, win.document);
        win.document.title = 'BlinkPulse Lab';
        const root = win.document.createElement('div');
        root.className = 'mini-root';
        win.document.body.append(root);
        win.addEventListener(
          'pagehide',
          () => {
            stopSync();
            miniWindowState.set(false);
            setContainer(null);
          },
          { once: true },
        );
        miniWindowState.set(true);
        setContainer(root);
      },
      (err: unknown) => {
        console.error('Mini window failed', err);
        setError('The mini window could not be opened.');
      },
    );
  }, []);

  const close = useCallback(() => {
    pipApi()?.window?.close();
  }, []);

  // Close it with the app.
  useEffect(() => close, [close]);

  return { supported, container, open, close, error };
}
