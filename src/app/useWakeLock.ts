/**
 * Keeps the screen on while the camera is measuring (phones dim and lock the screen
 * otherwise, which pauses measurement). Screen Wake Lock API: the browser releases
 * the lock when the page is hidden, so it is requested again when the page becomes
 * visible. Unsupported browsers or refusals (e.g. battery saver) are ignored: the
 * app works without it.
 */

import { useEffect } from 'react';

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const request = () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      navigator.wakeLock.request('screen').then(
        (s) => {
          if (stopped) void s.release();
          else sentinel = s;
        },
        () => undefined,
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release();
    };
  }, [active]);
}
