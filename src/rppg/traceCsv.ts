/**
 * Numeric trace files (PROJECT_SPEC 5.5 "record numeric trace", 7.3 offline
 * evaluation). Pure. Numbers only: per-frame region means and quality numbers,
 * nose-tip position and inter-ocular distance for the motion flag. No images, no
 * landmark sets.
 *
 * frames CSV: one row per frame, replayable through PulseEstimator by
 *   tools/eval_cli.ts. Empty cells = not available.
 * estimates CSV: one row per estimate hop, with wall-clock time for aligning with
 *   a reference device (V2b).
 * reference CSV: `t_ms,bpm` (same time base as the frames) or `wall_time_ms,bpm`.
 */

import type { PulseFrame, PulseUpdate } from './pulseEstimator.ts';
import { REGION_IDS, type RegionId, type RoiStats } from './roi.ts';

const REGION_COLS = ['r', 'g', 'b', 'coverage', 'saturated', 'luma'] as const;

export const FRAME_HEADER = [
  't_ms',
  'gap_before',
  'face_valid',
  ...REGION_IDS.flatMap((id) => REGION_COLS.map((c) => `${id}_${c}`)),
  'nose_x',
  'nose_y',
  'iod_px',
];

const num = (v: number | undefined | null, digits = 3) =>
  v === undefined || v === null || !Number.isFinite(v)
    ? ''
    : String(Math.round(v * 10 ** digits) / 10 ** digits);

export function frameRow(f: PulseFrame): string {
  const cells: string[] = [num(f.tMs), f.gapBefore ? '1' : '0', f.faceValid ? '1' : '0'];
  for (const id of REGION_IDS) {
    const s = f.regions[id];
    cells.push(
      num(s?.r, 4),
      num(s?.g, 4),
      num(s?.b, 4),
      num(s?.coverage, 4),
      num(s?.saturatedFraction, 4),
      num(s?.meanLuma, 2),
    );
  }
  cells.push(num(f.motion?.noseTip.x, 2), num(f.motion?.noseTip.y, 2), num(f.motion?.iodPx, 2));
  return cells.join(',');
}

export function framesToCsv(frames: readonly PulseFrame[]): string {
  return `${[FRAME_HEADER.join(','), ...frames.map(frameRow)].join('\n')}\n`;
}

function rows(text: string): { header: string[]; rows: { line: number; cells: string[] }[] } {
  const lines = text.split(/\r?\n/);
  let header: string[] | null = null;
  const out: { line: number; cells: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = (lines[i] as string).trim();
    if (!l || l.startsWith('#')) continue;
    const cells = l.split(',').map((c) => c.trim());
    if (header === null) header = cells;
    else out.push({ line: i + 1, cells });
  }
  return { header: header ?? [], rows: out };
}

export function parseFramesCsv(text: string): PulseFrame[] {
  const { header, rows: rs } = rows(text);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Missing column "${name}"`);
    return i;
  };
  const idx = Object.fromEntries(FRAME_HEADER.map((h) => [h, col(h)])) as Record<string, number>;
  const val = (cells: string[], name: string) => {
    const c = cells[idx[name] as number];
    return c === undefined || c === '' ? NaN : Number(c);
  };
  return rs.map(({ line, cells }) => {
    const tMs = val(cells, 't_ms');
    if (!Number.isFinite(tMs)) throw new Error(`Line ${String(line)}: "t_ms" is not a number`);
    const regions: Partial<Record<RegionId, RoiStats | null>> = {};
    for (const id of REGION_IDS) {
      const r = val(cells, `${id}_r`);
      regions[id] = Number.isFinite(r)
        ? {
            r,
            g: val(cells, `${id}_g`),
            b: val(cells, `${id}_b`),
            polygonPixels: NaN,
            coverage: val(cells, `${id}_coverage`),
            saturatedFraction: val(cells, `${id}_saturated`),
            meanLuma: val(cells, `${id}_luma`),
          }
        : null;
    }
    const nx = val(cells, 'nose_x');
    const ny = val(cells, 'nose_y');
    const iod = val(cells, 'iod_px');
    return {
      tMs,
      gapBefore: cells[idx.gap_before as number] === '1',
      faceValid: cells[idx.face_valid as number] === '1',
      regions,
      motion:
        Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(iod)
          ? { noseTip: { x: nx, y: ny }, iodPx: iod }
          : null,
    };
  });
}

export const ESTIMATE_HEADER = [
  't_ms',
  'wall_time_ms',
  'status',
  'display_bpm',
  'fused_bpm',
  'level',
  'agreement_bpm',
  ...REGION_IDS.flatMap((id) => [`${id}_bpm`, `${id}_sqi`, `${id}_level`]),
  'flags',
  // Pooled-region fallback (Patch D); pooled_used = 1 when the shown value came from it.
  'pooled_bpm',
  'pooled_sqi',
  'pooled_level',
  'pooled_used',
];

/** `wallTimeMs` NaN leaves the cell empty (no wall clock, e.g. a video file). */
export function estimateRow(u: PulseUpdate, wallTimeMs: number): string {
  const cells = [
    num(u.tMs),
    Number.isFinite(wallTimeMs) ? String(Math.round(wallTimeMs)) : '',
    u.status,
    num(u.displayBpm, 2),
    num(u.rawBpm, 2),
    u.level ?? '',
    num(u.fusion?.agreementBpm, 2),
  ];
  for (const id of REGION_IDS) {
    const r = u.regions.find((x) => x.id === id);
    cells.push(num(r?.bpm, 2), num(r?.sqi, 3), r?.level ?? '');
  }
  cells.push(u.globalFlags.join(' '));
  const p = u.pooled;
  cells.push(num(p?.bpm, 2), num(p?.sqi, 3), p?.level ?? '', p ? (p.used ? '1' : '0') : '');
  return cells.join(',');
}

export interface ReferenceReading {
  tMs: number;
  bpm: number;
}

/** Reference log: columns `t_ms,bpm` or `wall_time_ms,bpm` (which one is reported). */
export function parseReferenceCsv(text: string): {
  clock: 't_ms' | 'wall_time_ms';
  readings: ReferenceReading[];
} {
  const { header, rows: rs } = rows(text);
  const clock = header.includes('t_ms')
    ? 't_ms'
    : header.includes('wall_time_ms')
      ? 'wall_time_ms'
      : null;
  const b = header.indexOf('bpm');
  if (!clock || b < 0) throw new Error('Reference needs columns "t_ms,bpm" or "wall_time_ms,bpm"');
  const t = header.indexOf(clock);
  const readings = rs.map(({ line, cells }) => {
    const tMs = Number(cells[t]);
    const bpm = Number(cells[b]);
    if (!Number.isFinite(tMs) || !Number.isFinite(bpm))
      throw new Error(`Line ${String(line)}: not a number`);
    return { tMs, bpm };
  });
  readings.sort((x, y) => x.tMs - y.tMs);
  return { clock, readings };
}
