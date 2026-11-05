/**
 * Break-it Lab presets over many seeds (SPEC_AMENDMENT_05), for docs/METHODS.md.
 *
 *   npm run bench:break
 *
 * Simulated signals through the app's own estimator. This shows how the checks respond
 * to each condition; it says nothing about accuracy on real people.
 */

import { runScenario } from '../src/rppg/simulate.ts';
import { applyPreset, PRESETS } from '../src/ui/tools/breakItModel.ts';

const SEEDS = 50;

console.log(`${String(SEEDS)} seeds per row, 50 seconds of values per seed`);
console.log('');
console.log('| Preset | Seconds | Shown | Wrong | Worst error (BPM) |');
console.log('| --- | --- | --- | --- | --- |');
for (const preset of PRESETS) {
  let seconds = 0;
  let shown = 0;
  let wrong = 0;
  let worst: number | null = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = runScenario(applyPreset(preset, seed));
    seconds += r.hops.length;
    shown += r.shown;
    wrong += r.wrong;
    if (r.maxAbsError !== null) worst = Math.max(worst ?? 0, r.maxAbsError);
  }
  console.log(
    `| ${preset.label} | ${String(seconds)} | ${String(shown)} | ${String(wrong)} | ${worst === null ? '-' : worst.toFixed(1)} |`,
  );
}

/** Median and 95th percentile (nearest rank) of a list. */
function percentiles(values: number[]): { median: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? NaN;
  return { median: at(0.5), p95: at(0.95) };
}

const CROSS_SEEDS = 10;
console.log('');
console.log(
  `Cross-check by rate and noise: ${String(CROSS_SEEDS)} seeds, per region and second, pulse 0.8%`,
);
console.log('');
console.log(
  '| True BPM | Noise | Region-seconds | Cross-check fired | Spectral error median, p95 | Beat-spacing error median, p95 | Shown | Shown at Good |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
const base = applyPreset(PRESETS[0] as (typeof PRESETS)[number], 1);
for (const [bpm, noiseSd] of [
  [72, 0],
  [72, 0.2],
  [72, 0.5],
  [50, 0.5],
  [110, 0.5],
  [150, 0.5],
] as const) {
  const spectral: number[] = [];
  const beatSpacing: number[] = [];
  let regionSeconds = 0;
  let fired = 0;
  let shown = 0;
  let good = 0;
  for (let seed = 1; seed <= CROSS_SEEDS; seed++) {
    const r = runScenario({ ...base, bpm, noiseSd, seed });
    for (const { update } of r.hops) {
      if (update.displayBpm !== null) {
        shown++;
        if (update.level === 'good') good++;
      }
      for (const region of update.regions) {
        if (region.bpm === null) continue;
        regionSeconds++;
        if (region.flags.includes('crossCheck')) fired++;
        spectral.push(Math.abs(region.bpm - bpm));
        if (region.timeBpm !== null) beatSpacing.push(Math.abs(region.timeBpm - bpm));
      }
    }
  }
  const s = percentiles(spectral);
  const b = percentiles(beatSpacing);
  console.log(
    `| ${String(bpm)} | ${noiseSd.toFixed(1)} | ${String(regionSeconds)} | ${((fired / regionSeconds) * 100).toFixed(0)}% | ${s.median.toFixed(1)}, ${s.p95.toFixed(1)} | ${b.median.toFixed(1)}, ${b.p95.toFixed(1)} | ${String(shown)} | ${String(good)} |`,
  );
}
