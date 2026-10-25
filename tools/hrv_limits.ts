/**
 * Offline HRV limits (PROJECT_SPEC 7.4): how well can the app's pulse waveform time
 * individual beats, and what does that do to RMSSD? Documentation only; HRV is
 * never shown in the app.
 *
 *   npm run hrv:limits                                  synthetic conditions
 *   npm run hrv:limits -- frames.csv rr.csv [region]    a recorded trace against a
 *                                                       reference RR log (t_ms,rr_ms)
 *
 * Synthetic: 60 s streams with a known, variable heart rate (mean 70 BPM, random
 * IBI sd 20 ms plus a 0.25 Hz modulation of +-30 ms). Beats are compared between
 * 2 s and 58 s to avoid filter edge effects.
 */

import { readFileSync } from 'node:fs';
import { median } from '../src/dsp/stats.ts';
import { parseFramesCsv } from '../src/rppg/traceCsv.ts';
import type { RegionId } from '../src/rppg/roi.ts';
import { detectBeats, diffs, matchBeats, rmssd, synthBeats, within } from './hrv.ts';

const SEEDS = 20;
const DURATION_MS = 60_000;
const EDGE_MS = 2_000;

interface Condition {
  name: string;
  fps: number;
  noiseSd: number;
  jitterMs: number;
  amplitude: number;
}

const CONDITIONS: Condition[] = [
  {
    name: '30 fps, no noise (timing grid only)',
    fps: 30,
    noiseSd: 0,
    jitterMs: 0,
    amplitude: 0.004,
  },
  { name: '60 fps, no noise', fps: 60, noiseSd: 0, jitterMs: 0, amplitude: 0.004 },
  {
    name: '30 fps, noise sd 0.3, jitter 3 ms',
    fps: 30,
    noiseSd: 0.3,
    jitterMs: 3,
    amplitude: 0.004,
  },
  {
    name: '30 fps, noise sd 0.6, jitter 3 ms',
    fps: 30,
    noiseSd: 0.6,
    jitterMs: 3,
    amplitude: 0.004,
  },
  {
    name: '30 fps, noise sd 1.0, jitter 3 ms',
    fps: 30,
    noiseSd: 1.0,
    jitterMs: 3,
    amplitude: 0.004,
  },
];

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-');

function synthetic(): void {
  console.log(
    `${String(SEEDS)} streams of ${String(DURATION_MS / 1000)} s per condition; beats compared from 2 s to 58 s.`,
  );
  console.log(
    'condition                            | peak time   | beats missed / extra | beat timing sd | RMSSD true | RMSSD est. | |error| median | |error| / true',
  );
  for (const c of CONDITIONS) {
    for (const interpolate of [false, true]) {
      let truthBeats = 0;
      let missed = 0;
      let extra = 0;
      const timing: number[] = [];
      const trueR: number[] = [];
      const estR: number[] = [];
      const absErr: number[] = [];
      const relErr: number[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        const s = synthBeats({
          durationMs: DURATION_MS,
          fps: c.fps,
          meanBpm: 70,
          ibiSdMs: 20,
          rsaMs: 30,
          amplitude: c.amplitude,
          noiseSd: c.noiseSd,
          jitterMs: c.jitterMs,
          seed,
        });
        const beats = detectBeats(s.window, interpolate);
        const truth = within(s.truthMs, EDGE_MS, DURATION_MS - EDGE_MS);
        const det = beats ? within(beats, EDGE_MS, DURATION_MS - EDGE_MS) : [];
        const m = matchBeats(det, truth);
        truthBeats += truth.length;
        missed += m.missed;
        extra += m.extra;
        const mean = m.errorsMs.reduce((a, b) => a + b, 0) / Math.max(1, m.errorsMs.length);
        timing.push(...m.errorsMs.map((e) => e - mean));
        const rt = rmssd(diffs(truth));
        const re = rmssd(diffs(det));
        trueR.push(rt);
        estR.push(re);
        absErr.push(Math.abs(re - rt));
        relErr.push(Math.abs(re - rt) / rt);
      }
      const sd = Math.sqrt(timing.reduce((a, e) => a + e * e, 0) / Math.max(1, timing.length - 1));
      console.log(
        [
          c.name.padEnd(36),
          (interpolate ? 'interpolated' : '30 Hz grid  ').padEnd(11),
          `${pct(missed, truthBeats)} / ${pct(extra, truthBeats)}`.padStart(20),
          `${f1(sd)} ms`.padStart(14),
          `${f1(median(trueR))} ms`.padStart(10),
          `${f1(median(estR))} ms`.padStart(10),
          `${f1(median(absErr))} ms`.padStart(14),
          pct(median(relErr), 1).padStart(14),
        ].join(' | '),
      );
    }
  }
  console.log(`n per row: ${String(SEEDS)} windows (one per stream).`);
}

function recorded(framesPath: string, rrPath: string, region: RegionId): void {
  const frames = parseFramesCsv(readFileSync(framesPath, 'utf8'));
  const rrLines = readFileSync(rrPath, 'utf8').trim().split(/\r?\n/);
  const header = (rrLines[0] ?? '').split(',').map((h) => h.trim());
  const ti = header.indexOf('t_ms');
  const ri = header.indexOf('rr_ms');
  if (ti < 0 || ri < 0) throw new Error('RR file needs columns "t_ms,rr_ms" (trace time base)');
  // Reference beat times: the t_ms of each RR interval's END beat.
  const refBeats = rrLines
    .slice(1)
    .map((l) => Number(l.split(',')[ti]))
    .filter(Number.isFinite);
  const t0 = frames[0]?.tMs ?? 0;
  const tEnd = frames.at(-1)?.tMs ?? 0;
  console.log(`Region: ${region}. 60 s windows, beats compared 2 s inside each edge.`);
  console.log('window start | beats ref | missed / extra | RMSSD ref | RMSSD est. | |error|');
  let n = 0;
  for (let start = t0; start + DURATION_MS <= tEnd; start += DURATION_MS) {
    const end = start + DURATION_MS;
    const fs = frames.filter((f) => f.tMs >= start && f.tMs < end && f.faceValid);
    const stats = fs.map((f) => f.regions[region]).filter((s) => s != null);
    if (stats.length < 0.8 * (fs.length || 1) || fs.some((f) => f.gapBefore)) {
      console.log(
        `${(start / 1000).toFixed(0).padStart(10)} s | skipped (gap, face lost, or region missing)`,
      );
      continue;
    }
    const usable = fs.filter((f) => f.regions[region] != null);
    const beats = detectBeats(
      {
        tMs: usable.map((f) => f.tMs),
        r: usable.map((f) => f.regions[region]?.r ?? NaN),
        g: usable.map((f) => f.regions[region]?.g ?? NaN),
        b: usable.map((f) => f.regions[region]?.b ?? NaN),
      },
      true,
    );
    const ref = within(refBeats, start + EDGE_MS, end - EDGE_MS);
    const det = beats ? within(beats, start + EDGE_MS, end - EDGE_MS) : [];
    const m = matchBeats(det, ref);
    const rr = rmssd(diffs(ref));
    const re = rmssd(diffs(det));
    n++;
    console.log(
      `${(start / 1000).toFixed(0).padStart(10)} s | ${String(ref.length).padStart(9)} | ${`${String(m.missed)} / ${String(m.extra)}`.padStart(14)} | ${`${f1(rr)} ms`.padStart(9)} | ${`${f1(re)} ms`.padStart(10)} | ${f1(Math.abs(re - rr))} ms`,
    );
  }
  console.log(`n = ${String(n)} windows.`);
}

const [framesPath, rrPath, region] = process.argv.slice(2);
if (framesPath && rrPath) recorded(framesPath, rrPath, (region ?? 'forehead') as RegionId);
else synthetic();
