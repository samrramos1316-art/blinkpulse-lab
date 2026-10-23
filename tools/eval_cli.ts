/**
 * Offline pulse evaluation (PROJECT_SPEC 7.3). Replays a numeric frame trace through
 * the app's own TypeScript pipeline (src/rppg) and compares the shown estimates with
 * a reference log.
 *
 *   npm run eval -- frames.csv reference.csv [--mode fused|forehead|leftCheek|rightCheek|all]
 *
 * The fused mode is reported twice: as the app runs it, and as it ran before
 * SPEC_AMENDMENT_03 Patch D (no pooled fallback, first estimate shown at once).
 *
 * frames.csv: exported by the app ("Record numeric trace") or produced by a dataset
 *   extraction tool in the same format (src/rppg/traceCsv.ts).
 * reference.csv: `t_ms,bpm` in the trace's time base, or `wall_time_ms,bpm` (the
 *   trace's "# wall_offset_ms=" line converts it).
 */

import { readFileSync } from 'node:fs';
import { BEFORE_PATCH_D, evaluateTrace, formatEval } from '../src/rppg/evaluate.ts';
import { REGION_IDS } from '../src/rppg/roi.ts';
import { parseFramesCsv, parseReferenceCsv } from '../src/rppg/traceCsv.ts';

const args = process.argv.slice(2);
const modeIdx = args.indexOf('--mode');
const modeArg = modeIdx >= 0 ? args[modeIdx + 1] : 'all';
const files = modeIdx >= 0 ? args.filter((_, i) => i !== modeIdx && i !== modeIdx + 1) : args;
const [framesPath, refPath] = files;
const modes = ['fused', ...REGION_IDS] as const;
type Mode = (typeof modes)[number];

if (!framesPath || !refPath || !(modeArg === 'all' || modes.includes(modeArg as Mode))) {
  console.error(
    'Usage: npm run eval -- frames.csv reference.csv [--mode fused|forehead|leftCheek|rightCheek|all]',
  );
  process.exit(2);
}

const framesText = readFileSync(framesPath, 'utf8');
const frames = parseFramesCsv(framesText);
const ref = parseReferenceCsv(readFileSync(refPath, 'utf8'));
let readings = ref.readings;
if (ref.clock === 'wall_time_ms') {
  const m = /^#\s*wall_offset_ms=(-?[\d.]+)/m.exec(framesText);
  if (!m?.[1]) {
    console.error('The reference uses wall_time_ms but the trace has no "# wall_offset_ms=" line.');
    process.exit(2);
  }
  const offset = Number(m[1]);
  readings = readings.map((r) => ({ tMs: r.tMs - offset, bpm: r.bpm }));
}

console.log(
  `Trace: ${String(frames.length)} frames; reference: ${String(readings.length)} readings`,
);
const run: Mode[] = modeArg === 'all' ? [...modes] : [modeArg as Mode];
for (const mode of run) {
  console.log('');
  console.log(formatEval(evaluateTrace(frames, readings, mode)));
  if (mode === 'fused') {
    // V2b also reports the pipeline before Patch D (SPEC_AMENDMENT_03).
    const before = { name: 'before Patch D', options: BEFORE_PATCH_D };
    console.log('');
    console.log(formatEval(evaluateTrace(frames, readings, mode, undefined, before)));
  }
}
