/**
 * Offline evaluation (PROJECT_SPEC 7.3): replay a recorded numeric trace through the
 * SAME PulseEstimator the app uses and compare its estimates with a reference.
 * Pure: shared by tools/eval_cli.ts and the tests.
 */

import { agreement, referenceAt, type Agreement } from './agreement.ts';
import { PulseEstimator, type PulseFrame } from './pulseEstimator.ts';
import type { RegionId } from './roi.ts';
import type { ReferenceReading } from './traceCsv.ts';

export interface EvalResult {
  /** 'fused' or the single region evaluated (Patch A validation additions). */
  mode: 'fused' | RegionId;
  /** Estimate hops after warm-up. */
  hops: number;
  /** Hops where the app showed a value (quality at least Fair). */
  shown: number;
  /** Shown values with a reference available. */
  paired: number;
  /** Agreement of the values shown to the user (smoothed, Fair or better). */
  shownAgreement: Agreement;
}

/** Keep only one region's statistics (the others become unavailable). */
function only(frames: readonly PulseFrame[], id: RegionId): PulseFrame[] {
  return frames.map((f) => ({ ...f, regions: { [id]: f.regions[id] ?? null } }));
}

/**
 * `ref` times must be in the frames' time base (convert wall-clock references with
 * the trace's offset before calling).
 */
export function evaluateTrace(
  frames: readonly PulseFrame[],
  ref: readonly ReferenceReading[],
  mode: 'fused' | RegionId = 'fused',
  maxRefSpanMs?: number,
): EvalResult {
  const input = mode === 'fused' ? frames : only(frames, mode);
  const est = new PulseEstimator();
  let hops = 0;
  let shown = 0;
  const e: number[] = [];
  const r: number[] = [];
  for (const f of input) {
    const u = est.push(f);
    if (!u || u.status === 'warmingUp') continue;
    hops++;
    if (u.displayBpm === null) continue;
    shown++;
    const rv = referenceAt(ref, u.tMs, maxRefSpanMs);
    if (rv === null) continue;
    e.push(u.displayBpm);
    r.push(rv);
  }
  return { mode, hops, shown, paired: e.length, shownAgreement: agreement(e, r) };
}

const f2 = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/a');

export function formatEval(x: EvalResult): string {
  const a = x.shownAgreement;
  return [
    `Mode: ${x.mode}`,
    `Estimate hops: ${String(x.hops)}, shown (Fair or better): ${String(x.shown)} (${pct(x.hops ? x.shown / x.hops : NaN)}), paired with reference: ${String(x.paired)}`,
    `MAE ${f2(a.mae)} BPM, RMSE ${f2(a.rmse)} BPM, Pearson r ${f2(a.pearsonR, 3)}`,
    `Within +-5 BPM: ${pct(a.within5)}, within +-3 BPM: ${pct(a.within3)}`,
    `Bland-Altman: bias ${f2(a.bias)} BPM, 95% limits ${f2(a.loaLow)} to ${f2(a.loaHigh)} BPM (n = ${String(a.n)})`,
  ].join('\n');
}
