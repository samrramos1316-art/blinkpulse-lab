/**
 * While a study session runs, leaving `#study` would unmount it and lose the data
 * collected so far. The browser Back button only changes the hash, so Root asks here
 * before switching view; the session's own Stop button is the way out.
 */

let studyRunning = false;

export function setStudyRunning(running: boolean): void {
  studyRunning = running;
}

/** The view to show for `hash`: stays on `#study` while a session runs. */
export function routeFor(hash: string): string {
  return studyRunning && hash !== '#study' ? '#study' : hash;
}
