/**
 * General user-facing text for capture and first-run setup (SPEC_AMENDMENT_02 Part 3:
 * short, friendly sentences with a suggested fix, never internal flag names).
 * Claims-governed wording (disclaimer, indicator) lives in strings.ts instead.
 */

import type { TraceEnd } from '../app/traceRecorder.ts';
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
  // PROJECT_SPEC 5.1 wording, plus the mini window (SPEC_AMENDMENT_04 F1).
  hidden:
    'Keep this window visible (e.g. side-by-side) for measurements. In Chrome or Edge on a computer, the mini window also works.',
  wasHidden:
    'Paused while this window was hidden. Keep this window visible (e.g. side-by-side) for measurements. In Chrome or Edge on a computer, the mini window also works.',
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
  confirming: 'Checking the reading... hold still.',
  singleRegion: 'Based on one skin region only.',
  regionsDisagree: 'Regions disagree.',
  pooled: 'Weak signal in each region, so the regions were pooled into one estimate.',
  pooledUsed: 'Used: no single region was clear enough on its own.',
  pooledUnused: 'Pooling the regions did not give a clear signal either.',
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
  flicker:
    'The light around you seems to pulse at the same rate. Flickering lamps or screens can ' +
    'cause this; daylight or another lamp may help.',
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
  ended: (why: TraceEnd, durationMs: number) =>
    `${why === 'limit' ? 'Recording reached the 30-minute limit' : 'The camera stopped, so recording ended'} after ${(durationMs / 1000).toFixed(0)} s. Save the numbers?`,
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

/** About dialog (PROJECT_SPEC 5.5). The disclaimer itself is in strings.ts. */
export const ABOUT_COPY = {
  methods: [
    'Face tracking: MediaPipe Face Landmarker (a pre-trained model, run on this device) finds 478 points on the face in every video frame. Everything after that is written for this project.',
    'Blinks: the eye aspect ratio compares the height of each eye with its width. A 10-second calibration finds your open-eye level, and a blink is timed from the moment the eye drops below 70% of that level until it rises above 80% again.',
    'Pulse rate: the average colour of three skin regions (forehead and both cheeks) changes very slightly with each heartbeat. The POS method combines the colours, a band-pass filter keeps 42-180 beats per minute, and the strongest rhythm in a 10-second window gives the estimate. Regions with good signal are combined; when none is clear enough, the regions are pooled into one signal and tried again. A first estimate is shown only once the next one agrees with it. The light beside your face is checked too: if it pulses at the same rate (a flickering lamp or screen), the quality is lowered.',
    'Eye-closure indicator: compares how much your eyes are closed, how often they close for half a second or more, and how long your blinks last with your own baseline from earlier in the same session.',
    'History (off unless you turn it on): each finished minute is saved as numbers in this browser only, never uploaded, and deleted after 90 days. You can export or delete it at any time.',
  ],
  limitations: [
    'Accuracy on real people has not been measured yet; see docs/VALIDATION.md.',
    'Head position, looking down, glasses, lighting, camera effects, and movement all change the measurements.',
    'At 30 frames per second, blink durations are accurate to about one frame (33 ms).',
    'The colour signal is stronger for some skin tones and lighting conditions than others, so the pulse rate may work worse for some people.',
    'Measurements pause while this window is hidden or minimised, unless the mini window is open.',
  ],
  parametersNote:
    'These values are fixed so that results can be checked against the validation studies. They cannot be changed in the app.',
  docs: 'Full details: docs/METHODS.md, docs/LIMITATIONS.md, docs/VALIDATION.md and docs/ETHICS_AND_PRIVACY.md in the project repository.',
} as const;

/** Captions for each processing step (PROJECT_SPEC 5.5 Signal Lab). */
export const LAB_STEPS = {
  rgb:
    'The average red, green and blue of the skin region on every frame, resampled to an even ' +
    '30 samples per second. Each line is shown as a change from its own average. The pulse ' +
    'changes skin colour by well under 1%, so most of what you see here is lighting and movement.',
  pos:
    'POS ("plane orthogonal to skin") combines the three colours so that changes shared by all of ' +
    'them, such as brightness, cancel out, and the small colour change of the pulse remains.',
  filter:
    'A band-pass filter keeps only rhythms between 0.7 and 3.0 per second (42-180 per minute). ' +
    'It is run forwards and backwards, so the waveform is not delayed.',
  waveform:
    'The filtered signal. Triangles mark the beats found in it; their spacing gives a second, ' +
    'independent estimate used as a cross-check.',
  spectrum:
    'How strong each rhythm is in the filtered signal. The strongest peak in the shaded band gives ' +
    'the estimate; how much of the power sits in that peak gives the signal quality index.',
} as const;

/** Optional eye-comfort reminder (PROJECT_SPEC 5.6). Informational; no health state. */
export const REMINDER_COPY = {
  title: 'Eye-comfort reminder',
  intro:
    'Off by default. Shows a gentle note when you have been blinking much less than your ' +
    'usual rate for a few minutes, and only while blink detection is working well. ' +
    'No sound. Nothing is stored.',
  enable: 'Remind me when I blink much less than usual',
  fraction: 'Remind below',
  fractionOption: (f: number) => `${String(Math.round(f * 100))}% of my usual rate`,
  minutes: 'For at least',
  minutesOption: (m: number) => `${String(m)} minutes`,
  cooldown: 'At most once every',
  cooldownOption: (m: number) => `${String(m)} minutes`,
  notify: 'Also show a silent system notification',
  notifyDenied:
    'Notifications are blocked for this site. Allow them in your browser settings to use this.',
  notifyUnsupported: 'This browser cannot show notifications from this page.',
  baselineNone:
    'Your usual rate is measured over your first 3 good minutes after calibration (about 3 to 4 minutes).',
  baselineSession: (rate: number) =>
    `Your usual rate this session: ${rate.toFixed(0)} blinks per minute (first 3 good minutes).`,
  baselineHistory: (rate: number, minutes: number) =>
    `Your usual rate from saved history: ${rate.toFixed(0)} blinks per minute (${String(minutes)} minutes over the last 14 days).`,
  banner:
    "You've been blinking less than your usual rate for a few minutes. If your eyes feel dry, " +
    'consider looking at something far away for 20 seconds.',
  dismiss: 'Dismiss',
  notificationTitle: 'Eye-comfort reminder',
} as const;

/** Tracking card (SPEC_AMENDMENT_04 F1-F2). */
export const TRACKING_COPY = {
  title: 'Tracking and reminders',
  mini: {
    title: 'Mini window',
    intro:
      'Keeps measuring while you work in other windows: a small window stays on top with the ' +
      'latest values. Closing it pauses measuring whenever this page is hidden.',
    open: 'Open mini window',
    close: 'Close mini window',
    isOpen: 'The mini window is open. You can now work in other windows.',
    unsupported:
      'This browser has no mini window (Chrome and Edge on a computer have one). Keep this ' +
      'window visible, for example side by side, while you work.',
  },
  history: {
    title: 'History on this device',
    intro:
      'Off by default. When on, each finished minute is saved in this browser as numbers only: ' +
      'blink measures, the pulse values shown, and the eye-closure indicator. No video, images, ' +
      'or face landmarks. Nothing is uploaded. Saved minutes are deleted after 90 days.',
    enable: 'Save per-minute numbers on this device',
    unavailable:
      'This browser cannot store history here (storage is blocked, for example in some private windows).',
    saved: (today: number, total: number) =>
      `Saved today: ${String(today)} minutes. In total: ${String(total)} minutes.`,
    turnedOff: 'History is off. Delete the minutes saved so far too?',
    keep: 'Keep them',
    delete: 'Delete saved history',
    open: 'Open history',
  },
} as const;

/** History view (SPEC_AMENDMENT_04 F3-F4). Descriptive only. */
export const HISTORY_COPY = {
  title: 'History',
  intro:
    'Numbers saved on this device, per day. They describe what was measured; they are not a ' +
    'health assessment. Every value shows how many minutes it comes from.',
  off: 'History is off. Turn it on under "Tracking and reminders" to save per-minute numbers on this device.',
  empty: 'Nothing saved yet. With history on, each finished minute of measuring is saved here.',
  loading: 'Loading history...',
  dayGate: 'A day shows blink values when it has at least 10 usable minutes.',
  pulseNote:
    'Estimated pulse rate: the median of the values the app showed (quality Fair or better). ' +
    'Accuracy not yet validated.',
  indicatorNote:
    "Minutes in each band of the 5-minute result, each compared with that session's own alert " +
    'baseline. Experimental and not validated.',
  exportCsv: 'Export CSV',
  deleteAll: 'Delete all history...',
  deleteConfirm: 'Delete every saved minute from this browser? This cannot be undone.',
  deleteYes: 'Delete all',
  cancel: 'Cancel',
  deleted: 'All saved history was deleted.',
  weekTitle: 'This week and last week',
  weekIntro:
    'The last 7 days including today, next to the 7 days before them. Values need at least 10 ' +
    'usable minutes in the week.',
  weekNote:
    'A change describes the measured minutes only. It can come from when and how long the app ' +
    'ran, the lighting, or the work you did, and says nothing about health.',
} as const;
