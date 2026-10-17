/**
 * Score validation V1 from exported CSV files (PROJECT_SPEC 7.2).
 *
 *   npm run score:v1 -- labels.csv detections.csv [--tolerance 100]
 *
 * Runs on Node's built-in TypeScript type stripping and uses the same pure
 * scoring code as the in-browser V1 tool (src/blink/v1.ts).
 */

import { readFileSync } from 'node:fs';
import { formatV1Score, parseDetectionsCsv, parseLabelsCsv, scoreV1 } from '../src/blink/v1.ts';

const args = process.argv.slice(2);
const tolIdx = args.indexOf('--tolerance');
const tolerance = tolIdx >= 0 ? Number(args[tolIdx + 1]) : 100;
const files = tolIdx >= 0 ? args.filter((_, i) => i !== tolIdx && i !== tolIdx + 1) : args;
const [labelsPath, detectionsPath] = files;

if (!labelsPath || !detectionsPath || !Number.isFinite(tolerance)) {
  console.error('Usage: npm run score:v1 -- labels.csv detections.csv [--tolerance 100]');
  process.exit(2);
}

const labels = parseLabelsCsv(readFileSync(labelsPath, 'utf8'));
const detections = parseDetectionsCsv(readFileSync(detectionsPath, 'utf8'));
console.log(formatV1Score(scoreV1(labels, detections, tolerance)));
