/**
 * All user-facing wording that is governed by the claims policy lives here
 * (PROJECT_SPEC 1.3 + Appendix B, SPEC_AMENDMENT_01 Patch C1).
 *
 * The words "fatigue" and "drowsiness" may appear ONLY in this file
 * (enforced by test/designRules.test.ts). Do not edit the indicator strings
 * once docs/STUDY_PROTOCOL.md is committed (gate G-D).
 */

export const APP_NAME = 'BlinkPulse Lab';

/** PROJECT_SPEC 1.3 disclaimer, with the indicator sentence updated per Patch C1. */
export const DISCLAIMER =
  'BlinkPulse Lab is an experimental educational signal-processing and research project. ' +
  'It is not a medical device and does not diagnose, monitor, or treat any condition. ' +
  'Its eye-closure fatigue/drowsiness indicator compares your eyelid behaviour with your own ' +
  'baseline and has not yet been validated (see docs/VALIDATION.md); it must not ' +
  'be used for driving or any safety-critical decision. Estimates can be wrong, especially with ' +
  'motion, poor lighting, or camera processing. All processing happens on your device; no video ' +
  'or images are uploaded or stored.';

export const PRIVACY_BADGE = 'Processing on this device. Nothing is uploaded.';
/** Narrow screens (phones); the full sentence stays available to screen readers. */
export const PRIVACY_BADGE_SHORT = 'On-device only';

/** Appendix B general strings. */
export const METRIC = {
  pulseRate: 'Estimated pulse rate',
  blinkRate: 'Blink rate',
  eyeClosedFraction: 'Eye-closed fraction',
  measuring: 'Measuring...',
  notEnoughSignal: 'Not enough signal',
  quality: { good: 'Quality: Good', fair: 'Quality: Fair', poor: 'Quality: Poor' },
} as const;

/** Approved indicator wording (Patch C1). Frozen with the study protocol. */
export const INDICATOR = {
  title: 'Eye-closure fatigue/drowsiness indicator (experimental)',
  subtitle: 'Compared with your own alert baseline',
  bands: {
    near: 'Near your baseline',
    somewhatAbove: 'Somewhat above your baseline',
    wellAbove: 'Well above your baseline',
  },
  notEnoughData: 'Not enough data',
  factors: {
    closedFraction: 'Eye-closed fraction vs baseline',
    longClosures: 'Long closures vs baseline',
    blinkDuration: 'Blink duration vs baseline',
  },
  tooltip:
    'Compares your eyelid behaviour with your own alert baseline. Experimental. It does not ' +
    'detect or diagnose fatigue or drowsiness, and may be affected by concentration, glasses, ' +
    'lighting, and head position.',
} as const;
