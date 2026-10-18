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

export const SESSION_COPY = {
  empty:
    'The session timeline starts after calibration. Each minute appears here as it is measured.',
  intro:
    'One point per minute since measuring started. Minutes with less than 70% usable time are shown as gaps, not zeros. Descriptive only: these numbers describe this session and are not compared with any norm.',
  exportInfo:
    'This saves a CSV file with one row per minute: time, usable-time coverage, blink count and rate, blink durations, long closures, eye-closed fraction, and lost time by reason. It contains no video, images, or face landmarks. Your browser saves the file; the app keeps no copy.',
} as const;

/** Why a minute was not usable (coverage bar and table). */
export const LOST_REASON_TEXT = {
  noFace: 'face not found',
  headTurned: 'head turned away',
  gap: 'video paused or frames missing',
  calibrating: 'calibrating',
  lowFps: 'low frame rate',
} as const;

/** Pulse card and region table (SPEC_AMENDMENT_02 Part 3: reason plus suggested fix). */
export const PULSE_COPY = {
  warmingUp: 'Warming up... hold still for about 10 seconds.',
  notCalibrated: 'Measuring needs your face in view.',
  noFace: 'Face not found. Centre your face in the frame.',
  headTurned: 'Turn your head towards the screen.',
  gap: 'Paused while your face was out of view or the video stopped. Measuring again...',
  fpsTooLow:
    'The camera is too slow for a pulse reading (under 15 frames per second). More light often helps.',
  notEnoughSignal: 'Not enough signal. Hold still and face the light.',
  singleRegion: 'Based on one skin region only.',
  regionsDisagree: 'Regions disagree.',
} as const;

/** One sentence per quality flag, most important first (used for the main reason). */
export const PULSE_FLAG_TEXT = {
  motion: 'Too much movement. Hold still for a few seconds.',
  dark: 'Too dark for a pulse reading. Try facing a window or lamp.',
  saturated: 'Too bright on your skin. Avoid direct light or glare.',
  lightingChange: 'The lighting changed. Keep the light steady.',
  lowCoverage: 'Part of this region is not visible skin (hair, glasses, or shadow).',
  lowFps: 'The camera is running slowly (under 20 frames per second). More light often helps.',
  crossCheck: 'The two estimation methods disagree.',
} as const;

export const REGION_LABEL = {
  forehead: 'Forehead',
  leftCheek: 'Left cheek',
  rightCheek: 'Right cheek',
} as const;

/** "Record numeric trace" (PROJECT_SPEC 5.5, 8: numbers only, after explicit action). */
export const RECORD_COPY = {
  info: 'Recording keeps numbers in memory until you stop: per frame, the time, the average red, green, and blue of each skin region, how much of each region was usable, and the nose position for the movement check; plus one pulse estimate per second with the clock time. No video, images, or face landmarks are recorded. When you stop, your browser saves two CSV files; the app keeps no copy. Recording stops after 30 minutes.',
  start: 'Record numeric trace...',
  confirm: 'Start recording',
  stop: 'Stop and save',
  active: 'Recording numeric trace.',
} as const;

/**
 * Eye-closure indicator panel (PROJECT_SPEC 5.7, Patch C2). The approved indicator
 * labels themselves live in strings.ts; nothing here may name a state of the user.
 */
export const INDICATOR_COPY = {
  notCalibrated: 'Press Calibrate first. The indicator compares against your calibrated eyes.',
  noBaseline: 'Record your alert baseline in the Eye closure tab to start.',
  baselineRunning: (pct: number) => `Recording your alert baseline: ${pct.toFixed(0)}% done.`,
  baselineIntro:
    'The indicator compares your eyelid behaviour now with an alert baseline: 3 minutes of usable time recorded while you feel rested and are doing your usual work at the screen.',
  baselineConfirm:
    'Start this only while you feel rested. Keep working as usual with your face in view. It needs 3 minutes of usable time and stops after 6 minutes if it cannot get them. The baseline is kept in memory only, until you recalibrate or close the page.',
  baselineStart: 'Record alert baseline...',
  baselineAgain: 'Record again...',
  baselineFailed: {
    notEnoughValid:
      'The baseline did not get 3 minutes of usable time within 6 minutes. Keep your face in view and facing the screen, then try again.',
    tooFewBlinks:
      'Too few blinks were measured during the baseline (fewer than 10). Try again while working as usual.',
  },
  provisional:
    'The band cut-offs (1.5 and 2.5 times your baseline) are provisional and have not been validated.',
  windowLegend: 'Window',
  axis: 'Horizontal axis: minutes since the indicator started (one point every 10 seconds).',
  blinkRateNote:
    'Blink rate is shown for comparison only and is not part of the indicator: concentrating lowers it, so it can move either way.',
} as const;

/** Why a window has no indicator value (after "Not enough data: "). */
export const INDICATOR_REASON_TEXT = {
  noCalibration: 'press Calibrate first.',
  noBaseline: 'record your alert baseline first.',
  warmingUp: 'still collecting this window.',
  noFace: 'face not found for too much of this window.',
  headTurned: 'head turned away for too much of this window.',
  gap: 'video paused or frames missing.',
  lowFps: 'the camera is below 24 frames per second. More light often helps.',
  tooFewBlinks: 'too few blinks in this window to measure their duration.',
} as const;
