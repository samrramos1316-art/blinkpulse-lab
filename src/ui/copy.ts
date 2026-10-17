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

export const BLINK_STATUS = {
  loading: 'Loading face tracking...',
  error: 'Face tracking could not start. Reload the page to try again.',
  noFace: 'Face not found. Centre your face in the frame.',
  headTurned: 'Turn your head towards the screen.',
  notCalibrated: 'Press Calibrate to start blink measurement. Look at the screen for 10 seconds.',
  calibrating: 'Calibrating: look at the screen and blink normally.',
  calibrationFailed:
    'Calibration needs your face in view. Centre your face, then press Calibrate again.',
  measuring: 'Measuring blinks.',
} as const;

export const POSITION_HINT = {
  loading: 'Loading face tracking...',
  trackingError: 'Face tracking could not start. Reload the page to try again.',
  noFace: 'Face not found. Centre your face inside the outline.',
  tooFar: 'Move a little closer.',
  tooClose: 'Move back a little so your whole face fits.',
  tooDark: 'Face the light. Try facing a window or a lamp.',
  ok: 'Good position.',
} as const;

export const CALIBRATION_COPY = {
  intro:
    'Look at the screen naturally for 10 seconds and blink as you normally do. This sets your personal open-eye level.',
  running: 'Keep looking at the screen and blink normally.',
  failed:
    'Calibration needs your face in view for most of the 10 seconds. Centre your face, then try again.',
  done: 'Calibration done. You can recalibrate at any time with the Calibrate button.',
} as const;
