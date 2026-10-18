/**
 * Converts a contact PPG signal to a reference pulse-rate log for `npm run eval`
 * (V2a, PROJECT_SPEC 7.3), using the app's own windows and spectral estimate.
 *
 *   npm run ppg:ref -- ppg.csv reference.csv
 *
 * ppg.csv: `t_ms,ppg`, in the same time base as the frames CSV (the video's media
 *   time, 0 = first frame). Converting a dataset's own ground-truth file to this
 *   format is dataset-specific and done by the user.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parsePpgCsv, referenceFromPpg, referenceToCsv } from '../src/rppg/reference.ts';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('Usage: npm run ppg:ref -- ppg.csv reference.csv');
  process.exit(2);
}
const { tMs, ppg } = parsePpgCsv(readFileSync(inPath, 'utf8'));
const { readings, failed } = referenceFromPpg(tMs, ppg);
writeFileSync(outPath, referenceToCsv(readings));
console.log(
  `${String(tMs.length)} samples -> ${String(readings.length)} readings (${String(failed)} windows without an estimate) -> ${outPath}`,
);
