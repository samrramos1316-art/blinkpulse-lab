/**
 * Silent local system notifications for the eye-comfort reminder (SPEC_AMENDMENT_04
 * E1). Browser-only. Shown by the page itself: no push service, no network.
 */

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Ask for permission (call from a user action). */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

/**
 * Show one silent notification; clicking it brings the app forward. Returns false
 * when it could not be shown (no permission, or the browser only allows
 * notifications from a service worker, as Chrome on Android does).
 */
export function showNotification(title: string, body: string): boolean {
  if (notifyPermission() !== 'granted') return false;
  try {
    const n = new Notification(title, { body, silent: true, tag: 'blinkpulse-eye-comfort' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
