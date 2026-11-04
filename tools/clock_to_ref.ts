/**
 * Converts a hand-written V2b reference log for `npm run eval`.
 *
 *   npm run ref:clock -- clock.csv 2026-11-03 reference.csv
 *
 * clock.csv: `time,bpm`, with times such as 16:05:10 read from this computer's clock.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { clockLogToReference } from './clock_log.ts';

const [inPath, date, outPath] = process.argv.slice(2);
if (!inPath || !date || !outPath) {
  console.error('Usage: npm run ref:clock -- clock.csv 2026-11-03 reference.csv');
  process.exit(2);
}

try {
  const { csv, readings, longGaps } = clockLogToReference(readFileSync(inPath, 'utf8'), date);
  writeFileSync(outPath, csv);
  console.log(`${String(readings)} readings -> ${outPath}`);
  if (longGaps.length > 0) {
    console.log(
      `Warning: values in these gaps will not be compared, because readings are over 15 s apart: ${longGaps.join(', ')}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
