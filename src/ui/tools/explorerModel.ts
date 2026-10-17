/**
 * Landmark Explorer helpers (PROJECT_SPEC Phase 3: "Never trust a landmark index
 * from memory. Verify every index list ... in the Landmark Explorer"). Pure.
 */

import type { Point } from '../../blink/ear.ts';
import { EYE_A, EYE_B, LANDMARK_COUNT } from '../../vision/landmarks.ts';

export type PresetId = 'all' | 'eyeA' | 'eyeB' | 'eyes' | 'custom';

export interface Preset {
  id: PresetId;
  label: string;
  /** Indices to highlight; null = all points. */
  indices: readonly number[] | null;
  /** Labels drawn next to each highlighted point (EAR order P1..P6). */
  pointLabels?: readonly string[];
}

const P_LABELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;

export const PRESETS: readonly Preset[] = [
  { id: 'all', label: 'All 478 points', indices: null },
  { id: 'eyeA', label: 'Eye A (EAR P1-P6)', indices: EYE_A, pointLabels: P_LABELS },
  { id: 'eyeB', label: 'Eye B (EAR P1-P6)', indices: EYE_B, pointLabels: P_LABELS },
  { id: 'eyes', label: 'Both EAR eyes', indices: [...EYE_A, ...EYE_B] },
  { id: 'custom', label: 'Custom list or range', indices: [] },
];

/**
 * Parse "33, 133, 160-163" into indices. Returns the valid indices and the parts
 * that were not understood, so the UI can say what was ignored.
 */
export function parseIndexList(text: string): { indices: number[]; invalid: string[] } {
  const out = new Set<number>();
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    const range = /^(\d+)-(\d+)$/.exec(raw);
    if (range?.[1] !== undefined && range[2] !== undefined) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a <= b && b < LANDMARK_COUNT) {
        for (let i = a; i <= b; i++) out.add(i);
        continue;
      }
    } else if (/^\d+$/.test(raw) && Number(raw) < LANDMARK_COUNT) {
      out.add(Number(raw));
      continue;
    }
    invalid.push(raw);
  }
  return { indices: [...out].sort((x, y) => x - y), invalid };
}

/** Index of the landmark nearest to `p` (pixel space), or -1 for no points. */
export function nearestLandmark(points: readonly Point[], p: Point): number {
  let best = -1;
  let bestD = Infinity;
  points.forEach((q, i) => {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
