/**
 * Reference pulse rate from a contact PPG signal (PROJECT_SPEC 7.3, V2a: "using the
 * dataset's ground-truth pulse signal"). Pure.
 *
 * Same windows as the app (WINDOW_MS ending at each HOP_MS step) and the same
 * resampling, band-pass, and spectral peak, applied to the PPG minus its mean, so
 * each reading lines up with the app's estimate at the same time.
 */

import { HOP_MS, WINDOW_MS, estimateWindow } from './hrEstimator.ts';
import type { ReferenceReading } from './traceCsv.ts';

export interface PpgReference {
  readings: ReferenceReading[];
  /** Windows with no estimate (gap, too short, no peak). */
  failed: number;
}

/** `tMs` must be increasing. The first reading is at tMs[0] + WINDOW_MS. */
export function referenceFromPpg(tMs: readonly number[], ppg: readonly number[]): PpgReference {
  const readings: ReferenceReading[] = [];
  let failed = 0;
  const n = tMs.length;
  if (n < 2) return { readings, failed };
  const first = tMs[0] as number;
  const last = tMs[n - 1] as number;
  let lo = 0;
  let hi = 0;
  for (let end = first + WINDOW_MS; end <= last; end += HOP_MS) {
    const start = end - WINDOW_MS;
    while (lo < n && (tMs[lo] as number) < start) lo++;
    while (hi < n && (tMs[hi] as number) <= end) hi++;
    const t = tMs.slice(lo, hi);
    const v = ppg.slice(lo, hi);
    const est = estimateWindow({ tMs: t, r: v, g: v, b: v }, { method: 'raw' });
    if (est.ok) readings.push({ tMs: end, bpm: est.bpm });
    else failed++;
  }
  return { readings, failed };
}

/** Input `t_ms,ppg` (comment lines start with #). */
export function parsePpgCsv(text: string): { tMs: number[]; ppg: number[] } {
  const tMs: number[] = [];
  const ppg: number[] = [];
  let header: string[] | null = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] as string).trim();
    if (!l || l.startsWith('#')) continue;
    const cells = l.split(',').map((c) => c.trim());
    if (header === null) {
      header = cells;
      if (!header.includes('t_ms') || !header.includes('ppg'))
        throw new Error('PPG file needs columns "t_ms,ppg"');
      continue;
    }
    const t = Number(cells[header.indexOf('t_ms')]);
    const p = Number(cells[header.indexOf('ppg')]);
    if (!Number.isFinite(t) || !Number.isFinite(p))
      throw new Error(`Line ${String(i + 1)}: not a number`);
    if (tMs.length && t <= (tMs[tMs.length - 1] as number))
      throw new Error(`Line ${String(i + 1)}: t_ms must increase`);
    tMs.push(t);
    ppg.push(p);
  }
  return { tMs, ppg };
}

export function referenceToCsv(readings: readonly ReferenceReading[]): string {
  const rows = readings.map((r) => `${String(Math.round(r.tMs))},${r.bpm.toFixed(2)}`);
  return `${['t_ms,bpm', ...rows].join('\n')}\n`;
}
