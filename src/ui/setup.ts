/**
 * First-run setup flag. This flag and the theme are the only things stored
 * (SPEC_AMENDMENT_02 Part 3). Storage failures are ignored: setup then shows again.
 */

const STORAGE_KEY = 'blinkpulse.setupDone';

export function readSetupDone(): boolean {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSetupDone(): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode or blocked storage: setup will show again next visit.
  }
}

export type SetupStep = 'welcome' | 'camera' | 'position' | 'done';

/** Calibration joins between 'position' and 'done' in Phase 3. */
export const SETUP_STEPS: readonly SetupStep[] = ['welcome', 'camera', 'position', 'done'];
