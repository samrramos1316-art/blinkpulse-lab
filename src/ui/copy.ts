/**
 * General user-facing text for capture and first-run setup (SPEC_AMENDMENT_02 Part 3:
 * short, friendly sentences with a suggested fix, never internal flag names).
 * Claims-governed wording (disclaimer, indicator) lives in strings.ts instead.
 */

import type { CameraErrorKind } from '../capture/cameraErrors.ts';

export const CAMERA_ERROR: Record<CameraErrorKind, string> = {
  insecure:
    'The camera needs a secure connection. Open the app over https, or on localhost when running it yourself.',
  unsupported:
    'This browser does not support camera access. Try a current version of Chrome, Edge, Firefox, or Safari.',
  denied:
    'Camera permission was not given. Allow the camera for this site in your browser settings, then press Start.',
  notFound: 'No camera was found. Connect a camera, then press Start.',
  inUse:
    'The camera could not be started. It may be in use by another app: close other apps that use it, then press Start.',
  overconstrained: 'Your camera does not offer a usable video mode. Try another camera.',
  aborted: 'The camera could not be started. Press Start to try again.',
  playback: 'The camera opened but the video would not play. Press Start to try again.',
  unknown: 'The camera could not be started. Press Start to try again.',
};

export const CAPTURE_STATUS = {
  idle: 'Camera off. Press Start to begin.',
  starting: 'Waiting for camera permission...',
  running: 'Camera on.',
  runningSlow:
    'Camera on, but below 24 frames per second. More light often lets the camera run faster.',
  ended:
    'The camera stopped. It may have been disconnected or turned off. Press Start to try again.',
  // PROJECT_SPEC 5.1 wording.
  hidden: 'Keep this window visible (e.g. side-by-side) for measurements.',
  wasHidden:
    'Paused while this window was hidden. Keep this window visible (e.g. side-by-side) for measurements.',
} as const;

export const CAMERA_PRIVACY =
  'Video stays on this device. Frames are analysed in memory and are never recorded, stored, or uploaded.';

export const CAMERA_EFFECTS_TIP =
  'Turn off camera effects such as background blur, auto-framing, or face retouching. They change the video and can disturb the measurements.';

export const BRIGHTNESS_HINT = {
  tooDark: 'Too dark. Try facing a window or a lamp.',
  ok: 'Lighting looks fine.',
  unknown: 'Checking the light...',
} as const;
