/**
 * The fixed processing parameters, read from the modules that use them, for the
 * About dialog (PROJECT_SPEC 5.5 "Settings"). They are shown, not editable: they are
 * frozen for validation (PROJECT_SPEC 7.1) and the study protocol (gate G-E).
 */

import { BLINK_MAX_MS, DEFAULT_MAX_GAP_MS, LONG_CLOSURE_MAX_MS } from '../blink/blinkDetector.ts';
import { CLOSE_FRACTION, REOPEN_FRACTION } from '../blink/calibration.ts';
import { MIN_COVERAGE, LOW_FPS } from '../blink/sessionSummary.ts';
import {
  LONG_WINDOW_MS,
  MIN_WINDOW_BLINKS,
  PERCLOS_FRACTION,
  PROVISIONAL_BANDS,
  SHORT_WINDOW_MS,
} from '../blink/sleepiness.ts';
import { CALIBRATION_MS } from '../app/blinkPipeline.ts';
import {
  BAND_HIGH_HZ,
  BAND_LOW_HZ,
  CROSS_CHECK_BPM,
  HOP_MS,
  WINDOW_MS,
} from '../rppg/hrEstimator.ts';
import { FPS_MIN, FPS_WARN, SQI_FAIR, SQI_GOOD } from '../rppg/quality.ts';
import { MAX_ABS_PITCH_DEG, MAX_ABS_YAW_DEG } from '../vision/headPose.ts';

export interface ParameterGroup {
  title: string;
  rows: { name: string; value: string }[];
}

const s = (ms: number) => `${String(ms / 1000)} s`;
const pct = (f: number) => `${String(Math.round(f * 100))}%`;

export const PARAMETERS: readonly ParameterGroup[] = [
  {
    title: 'Blinks',
    rows: [
      { name: 'Calibration length', value: s(CALIBRATION_MS) },
      {
        name: 'Eye counts as closing below',
        value: `${pct(CLOSE_FRACTION)} of your open-eye level`,
      },
      {
        name: 'Eye counts as open again above',
        value: `${pct(REOPEN_FRACTION)} of your open-eye level`,
      },
      { name: 'Blink', value: `shorter than ${String(BLINK_MAX_MS)} ms` },
      {
        name: 'Long closure',
        value: `${String(BLINK_MAX_MS)}-${String(LONG_CLOSURE_MAX_MS)} ms (longer: extended closure)`,
      },
      { name: 'Largest frame gap inside a blink', value: `${String(DEFAULT_MAX_GAP_MS)} ms` },
      {
        name: 'Head turned beyond',
        value: `${String(MAX_ABS_YAW_DEG)} degrees sideways or ${String(MAX_ABS_PITCH_DEG)} degrees up or down`,
      },
      { name: 'Usable minute', value: `at least ${pct(MIN_COVERAGE)} measured time` },
    ],
  },
  {
    title: 'Pulse rate',
    rows: [
      { name: 'Window', value: `${s(WINDOW_MS)}, updated every ${s(HOP_MS)}` },
      {
        name: 'Pulse band',
        value: `${BAND_LOW_HZ.toFixed(1)}-${BAND_HIGH_HZ.toFixed(1)} Hz (${String(BAND_LOW_HZ * 60)}-${String(BAND_HIGH_HZ * 60)} per minute)`,
      },
      {
        name: 'Signal quality index',
        value: `Good from ${SQI_GOOD.toFixed(2)}, Fair from ${SQI_FAIR.toFixed(2)}`,
      },
      { name: 'Cross-check disagreement', value: `more than ${String(CROSS_CHECK_BPM)} BPM` },
      {
        name: 'Frame rate',
        value: `quality lowered below ${String(FPS_WARN)} fps, no estimate below ${String(FPS_MIN)} fps`,
      },
    ],
  },
  {
    title: 'Eye-closure indicator',
    rows: [
      {
        name: 'Windows',
        value: `${s(SHORT_WINDOW_MS)} and ${String(LONG_WINDOW_MS / 60_000)} min`,
      },
      {
        name: 'Eye counts as closed at or below',
        value: `${pct(PERCLOS_FRACTION)} of your open-eye level`,
      },
      {
        name: 'Needed for a value',
        value: `${pct(MIN_COVERAGE)} measured time, ${String(LOW_FPS)} fps, ${String(MIN_WINDOW_BLINKS)} blinks`,
      },
      {
        name: 'Provisional bands',
        value: `from ${PROVISIONAL_BANDS.somewhatAbove.toFixed(1)} and ${PROVISIONAL_BANDS.wellAbove.toFixed(1)} times the baseline`,
      },
    ],
  },
];
