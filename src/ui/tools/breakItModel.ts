/**
 * What the Break-it Lab shows for one simulated run (SPEC_AMENDMENT_05 G3). Pure: reasons
 * come from the app's own `pulseCard`, so they read exactly as they do on the Pulse tab.
 */

import {
  SIM_DURATION_MS,
  SIM_OFF_BY_BPM,
  type SimResult,
  type SimScenario,
} from '../../rppg/simulate.ts';
import { HOP_MS, WINDOW_MS } from '../../rppg/hrEstimator.ts';
import type { ChartSpec } from '../plot/chart.ts';
import { PULSE_FLAG_TEXT } from '../copy.ts';
import { FLAG_ORDER, pulseCard } from '../pulseDisplay.ts';

export const BASE_SCENARIO: SimScenario = {
  bpm: 72,
  pulsePercent: 0.8,
  noiseSd: 0.5,
  light: 1,
  flickerPercent: 0,
  flickerBpm: 90,
  headSpeed: 0,
  fps: 30,
  faceLost: false,
  seed: 1,
};

export interface BreakItPreset {
  id: string;
  label: string;
  /** Differences from BASE_SCENARIO. */
  changes: Partial<SimScenario>;
}

export const PRESETS: readonly BreakItPreset[] = [
  { id: 'clean', label: 'Good conditions', changes: {} },
  { id: 'noPulse', label: 'No pulse at all', changes: { pulsePercent: 0 } },
  { id: 'weak', label: 'Weak signal', changes: { pulsePercent: 0.2, noiseSd: 1.2 } },
  { id: 'dim', label: 'Dim room', changes: { light: 0.25 } },
  { id: 'bright', label: 'Too bright', changes: { light: 2 } },
  {
    id: 'lamp',
    label: 'Lamp flickering at the pulse rate',
    changes: { flickerPercent: 1, flickerBpm: 72 },
  },
  { id: 'head', label: 'Head moving', changes: { headSpeed: 1 } },
  { id: 'lowFps', label: 'Slow camera', changes: { fps: 12 } },
  { id: 'faceLost', label: 'Face lost for 3 s', changes: { faceLost: true } },
];

export function applyPreset(preset: BreakItPreset, seed: number): SimScenario {
  return { ...BASE_SCENARIO, ...preset.changes, seed };
}

/** The preset the controls currently match (the seed aside), or null once they have been moved. */
export function matchingPreset(s: SimScenario): BreakItPreset | null {
  return PRESETS.find((p) => sameScenario(applyPreset(p, s.seed), s)) ?? null;
}

function sameScenario(a: SimScenario, b: SimScenario): boolean {
  return (Object.keys(a) as (keyof SimScenario)[]).every((k) => a[k] === b[k]);
}

export interface ReasonCount {
  reason: string;
  seconds: number;
}

/** Why "-" was shown, in the app's wording, most frequent first. */
export function withheldReasons(result: SimResult): ReasonCount[] {
  const counts = new Map<string, number>();
  for (const h of result.hops) {
    const card = pulseCard(h.update, true, h.faceLost ? 'noFace' : 'ok');
    if (card.value === '-') counts.set(card.status, (counts.get(card.status) ?? 0) + 1);
  }
  return [...counts]
    .map(([reason, seconds]) => ({ reason, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.reason.localeCompare(b.reason));
}

/** Warnings the checks raised in any region, including while a value was shown. */
export function warningsRaised(result: SimResult): ReasonCount[] {
  return FLAG_ORDER.map((flag) => ({
    reason: PULSE_FLAG_TEXT[flag],
    seconds: result.hops.filter((h) =>
      [...h.update.globalFlags, ...h.update.regions.flatMap((r) => r.flags)].includes(flag),
    ).length,
  }))
    .filter((w) => w.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

/** Seconds at each quality level, among those that showed a value. */
export function shownQuality(result: SimResult): { good: number; fair: number } {
  const shown = result.hops.filter((h) => h.update.displayBpm !== null);
  return {
    good: shown.filter((h) => h.update.level === 'good').length,
    fair: shown.filter((h) => h.update.level === 'fair').length,
  };
}

const f1 = (v: number) => v.toFixed(1);

/** The headline results, as sentences. */
export function resultLines(result: SimResult): string[] {
  const { hops, shown, wrong, scenario } = result;
  const lines = [
    `A value was shown for ${String(shown)} of ${String(hops.length)} seconds (${((shown / (hops.length || 1)) * 100).toFixed(0)}%).`,
  ];
  if (shown > 0) {
    const quality = shownQuality(result);
    lines.push(
      `Quality of those values: Good ${String(quality.good)}, Fair ${String(quality.fair)}.`,
    );
  }
  if (scenario.pulsePercent === 0) {
    lines.push(
      shown === 0
        ? 'This signal has no pulse, and the app showed no value.'
        : `This signal has no pulse, so all ${String(shown)} of those values are wrong.`,
    );
    return lines;
  }
  if (result.medianAbsError !== null && result.maxAbsError !== null) {
    lines.push(
      `Error of the shown values: ${f1(result.medianAbsError)} BPM typically (median), ${f1(result.maxAbsError)} BPM at worst.`,
      `Off by more than ${String(SIM_OFF_BY_BPM)} BPM: ${String(wrong)} of ${String(shown)}.`,
    );
  }
  return lines;
}

const SECOND_TICKS = [0, 10, 20, 30, 40, 50, 60];
const BPM_TICKS = [60, 90, 120, 150, 180];

/** True rate (dashed), shown values (points), and shaded seconds with no value. */
export function resultChart(result: SimResult): ChartSpec {
  const { hops, scenario } = result;
  const xs = [0, SIM_DURATION_MS / 1000];
  const seconds = (ms: number) => ms / 1000;
  const bands: ChartSpec['bands'] = [{ x0: 0, x1: seconds(WINDOW_MS) }];
  for (const h of hops) {
    if (h.update.displayBpm === null) {
      bands.push({ x0: seconds(h.tMs - HOP_MS), x1: seconds(h.tMs) });
    }
  }
  return {
    x: { min: 0, max: 60, ticks: SECOND_TICKS, format: (v) => `${String(v)} s` },
    y: { min: 40, max: 190, ticks: BPM_TICKS, format: (v) => String(v) },
    lines:
      scenario.pulsePercent > 0 ? [{ xs, ys: [scenario.bpm, scenario.bpm], style: 'dashed' }] : [],
    markers: hops.flatMap((h) =>
      h.update.displayBpm === null
        ? []
        : [{ x: seconds(h.tMs), y: h.update.displayBpm, shape: 'circle' as const }],
    ),
    bands,
    vlines: [],
  };
}

/** The chart's text alternative. */
export function describeResult(result: SimResult): string {
  const truth =
    result.scenario.pulsePercent > 0
      ? `The true rate is ${String(result.scenario.bpm)} BPM.`
      : 'The signal has no pulse.';
  return `Simulated run of 60 seconds. ${truth} ${resultLines(result).join(' ')}`;
}
