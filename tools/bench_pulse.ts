/**
 * Low-quality pulse benchmark on synthetic traces (SPEC_AMENDMENT_03 Patch D). Runs
 * 60 s three-region streams through the app's PulseEstimator in three variants and
 * reports how often a value is shown and how accurate the shown values are.
 *
 *   npm run bench:pulse
 *
 * Synthetic data only (tools/synth.ts): the pulse is identical in every region and
 * the noise is independent Gaussian noise per region. Real faces add motion,
 * lighting, and noise shared between regions; this says nothing about them (V2b).
 */

import {
  PulseEstimator,
  type PulseEstimatorOptions,
  type PulseFrame,
} from '../src/rppg/pulseEstimator.ts';
import type { RoiStats } from '../src/rppg/roi.ts';
import { synthRgb } from './synth.ts';

const RATES = [55, 72, 95, 130, 165];
const SEEDS = 8;
const DURATION_MS = 60_000;
const AMPLITUDE = 0.004;

type Sds = readonly [number, number, number];

function frames(bpm: number, sds: Sds, seed: number, amplitude: number): PulseFrame[] {
  const regs = sds.map((noiseSd, k) =>
    synthRgb({
      durationMs: DURATION_MS,
      fps: 30,
      bpm,
      amplitude,
      noiseSd,
      seed: seed * 7 + k,
      jitterMs: 3,
      driftPerMin: 0.03,
      means: k === 0 ? [165, 125, 105] : [145, 105, 88],
    }),
  );
  const [a, b, c] = regs as [(typeof regs)[0], (typeof regs)[0], (typeof regs)[0]];
  const stats = (s: typeof a, i: number): RoiStats => ({
    r: s.r[i] as number,
    g: s.g[i] as number,
    b: s.b[i] as number,
    polygonPixels: NaN,
    coverage: 0.95,
    saturatedFraction: 0,
    meanLuma: 110,
  });
  return a.tMs.map((tMs, i) => ({
    tMs,
    gapBefore: false,
    faceValid: true,
    regions: { forehead: stats(a, i), leftCheek: stats(b, i), rightCheek: stats(c, i) },
    motion: { noseTip: { x: 320, y: 240 }, iodPx: 100 },
  }));
}

interface Row {
  hops: number;
  shown: number;
  pooled: number;
  off5: number;
  absErr: number;
}

function run(options: PulseEstimatorOptions, sds: Sds, amplitude: number): Row {
  const row: Row = { hops: 0, shown: 0, pooled: 0, off5: 0, absErr: 0 };
  for (const bpm of RATES) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const est = new PulseEstimator(options);
      for (const f of frames(bpm, sds, seed, amplitude)) {
        const u = est.push(f);
        if (!u || u.status === 'warmingUp') continue;
        row.hops++;
        if (u.displayBpm === null) continue;
        row.shown++;
        if (u.pooled?.used) row.pooled++;
        const e = Math.abs(u.displayBpm - bpm);
        row.absErr += e;
        if (e > 5) row.off5++;
      }
    }
  }
  return row;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const VARIANTS: [string, PulseEstimatorOptions][] = [
  ['before', { pooling: false, confirmFirst: false }],
  ['confirm only', { pooling: false, confirmFirst: true }],
  ['confirm + pool', { pooling: true, confirmFirst: true }],
];
const SCENARIOS: [string, Sds, number][] = [
  ['noise sd 0.3', [0.3, 0.3, 0.3], AMPLITUDE],
  ['noise sd 0.6', [0.6, 0.6, 0.6], AMPLITUDE],
  ['noise sd 0.8', [0.8, 0.8, 0.8], AMPLITUDE],
  ['noise sd 1.0', [1, 1, 1], AMPLITUDE],
  ['noise sd 1.3', [1.3, 1.3, 1.3], AMPLITUDE],
  ['sd 0.5 / 1 / 1', [0.5, 1, 1], AMPLITUDE],
  ['no pulse', [1, 1, 1], 0],
];

console.log(
  `${String(RATES.length * SEEDS)} streams of ${String(DURATION_MS / 1000)} s per scenario (rates ${RATES.join('/')} BPM, ${String(SEEDS)} seeds), pulse amplitude ${String(AMPLITUDE * 100)}% in green.`,
);
console.log(
  'scenario        | variant         | hops | shown  | pooled | shown off >5 BPM | MAE shown',
);
for (const [name, sds, amp] of SCENARIOS) {
  for (const [variant, options] of VARIANTS) {
    const r = run(options, sds, amp);
    console.log(
      [
        name.padEnd(15),
        variant.padEnd(15),
        String(r.hops).padStart(4),
        pct(r.shown, r.hops).padStart(6),
        pct(r.pooled, r.hops).padStart(6),
        pct(r.off5, r.shown).padStart(16),
        (r.shown ? (r.absErr / r.shown).toFixed(2) : '-').padStart(9),
      ].join(' | '),
    );
  }
}
