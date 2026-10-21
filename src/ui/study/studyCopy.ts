/**
 * Study-mode wording (PROJECT_SPEC 5.8, docs/STUDY_PROTOCOL.md). Nothing here
 * describes the participant's state: the indicator stays hidden until the review.
 */

import type { FaceStatus } from '../../app/blinkPipeline.ts';
import type { EndReason, Glasses } from '../../study/session.ts';

/**
 * PLACEHOLDER rating wording. The Karolinska Sleepiness Scale text is copyright
 * (protocol decision D2) and is not reproduced until written permission arrives;
 * the export marks every session `rating_wording=placeholder` until then.
 */
export const RATING_COPY = {
  question: 'How sleepy have you felt during the last 5 minutes?',
  low: '1: not sleepy at all',
  high: '9: extremely sleepy',
  placeholderNote:
    'Placeholder wording: the official rating-scale text will replace it once permission is received.',
} as const;

export const STUDY_COPY = {
  title: 'Study session',
  draftNote:
    'The study protocol is a draft and is not frozen. Use this mode for testing on yourself only; ' +
    'do not collect participant data yet.',
  setupIntro:
    'For the researcher. Enter the participant code (never a name) and confirm the signed forms.',
  consent:
    'The signed consent form for this participant code is on file (for anyone under 18: the ' +
    'parent/guardian permission form and the signed assent form).',
  calibration:
    'Start the camera, sit the way you normally work, and press Calibrate. Look at the screen and ' +
    'blink normally for 10 seconds.',
  baseline:
    'Work as you normally would for about 3 minutes. Keep this window visible, for example side by ' +
    'side with your work.',
  work:
    'Work on your own tasks. Keep this window visible, for example side by side with your work. ' +
    'A rating box appears here every 5 minutes.',
  pvtIntro:
    'Reaction-time task, 3 minutes. Look at the box. When numbers start counting up, press the ' +
    'Space bar or tap the box as fast as you can. Do not press before the numbers appear.',
  finished: 'The session is over. Thank you.',
  finishedResearcher:
    'For the researcher: remind the participant of the safety note on their form. Export the ' +
    'session before reviewing it.',
  reviewNote:
    'Review: shown only after the session was exported, so it could not affect the ratings.',
} as const;

export const STEP_LABEL = {
  setup: 'Set up',
  calibration: 'Calibrate',
  baselineRating: 'First rating',
  baseline: 'Alert baseline',
  pvt1: 'Reaction-time task 1',
  work: 'Work block',
  pvt2: 'Reaction-time task 2',
  finished: 'Finished',
} as const;

export const END_REASON_TEXT: Record<EndReason, string> = {
  completed: 'All steps completed.',
  stopped: 'Stopped before the end.',
  cameraStopped: 'Ended because the camera stopped.',
  baselineNotEnoughValid:
    'Ended: the alert baseline did not get 3 minutes of usable measurement within 6 minutes.',
  baselineTooFewBlinks: 'Ended: too few blinks were measured during the alert baseline.',
};

export const GLASSES_LABEL: Record<Glasses, string> = {
  none: 'Neither',
  glasses: 'Glasses',
  contacts: 'Contact lenses',
};

/** Text-only face status shown instead of the camera preview (decision D5). */
export function faceStatusText(status: FaceStatus, hidden: boolean): string {
  if (hidden) return 'Window hidden: measuring is paused. Keep this window visible.';
  if (status === 'noFace') return 'Face not found: move back into view of the camera.';
  if (status === 'headTurned') return 'Head turned: face the screen.';
  return 'Face found.';
}
