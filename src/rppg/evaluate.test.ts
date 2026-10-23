import { describe, expect, it } from 'vitest';
import { synthRgb } from '../../tools/synth.ts';
import { agreement, referenceAt } from './agreement.ts';
import { BEFORE_PATCH_D, evaluateTrace, formatEval } from './evaluate.ts';
import type { PulseFrame, PulseUpdate } from './pulseEstimator.ts';
import {
  ESTIMATE_HEADER,
  estimateRow,
  framesToCsv,
  parseFramesCsv,
  parseReferenceCsv,
} from './traceCsv.ts';

describe('agreement', () => {
  it('MAE, RMSE, r, within-k, Bland-Altman on a worked example', () => {
    const a = agreement([70, 72, 80, 60], [71, 70, 74, 62]);
    // differences: -1, 2, 6, -2
    expect(a.n).toBe(4);
    expect(a.mae).toBeCloseTo(11 / 4, 12);
    expect(a.rmse).toBeCloseTo(Math.sqrt((1 + 4 + 36 + 4) / 4), 12);
    expect(a.within5).toBe(0.75);
    expect(a.within3).toBe(0.75);
    expect(a.bias).toBeCloseTo(1.25, 12);
    const sd = Math.sqrt(((-2.25) ** 2 + 0.75 ** 2 + 4.75 ** 2 + (-3.25) ** 2) / 3);
    expect(a.loaHigh).toBeCloseTo(1.25 + 1.96 * sd, 12);
    expect(agreement([1, 2, 3], [2, 4, 6]).pearsonR).toBeCloseTo(1, 12);
    expect(agreement([], []).mae).toBeNaN();
  });

  it('reference interpolation, refusing long spans', () => {
    const ref = [
      { tMs: 0, bpm: 60 },
      { tMs: 10_000, bpm: 70 },
      { tMs: 40_000, bpm: 80 },
    ];
    expect(referenceAt(ref, 5_000)).toBe(65);
    expect(referenceAt(ref, 20_000)).toBeNull(); // 30 s apart
    expect(referenceAt(ref, -1)).toBeNull();
  });
});

function syntheticFrames(bpm: number, durationMs = 40_000): PulseFrame[] {
  const s = synthRgb({ durationMs, fps: 30, bpm, amplitude: 0.005, noiseSd: 0.1, seed: 5 });
  return s.tMs.map((t, i) => {
    const st = {
      r: s.r[i] as number,
      g: s.g[i] as number,
      b: s.b[i] as number,
      polygonPixels: NaN,
      coverage: 0.95,
      saturatedFraction: 0,
      meanLuma: 110,
    };
    return {
      tMs: t,
      gapBefore: false,
      faceValid: true,
      regions: { forehead: st, leftCheek: st, rightCheek: { ...st, coverage: 0.4 } },
      motion: { noseTip: { x: 320, y: 240 }, iodPx: 100 },
    };
  });
}

describe('trace CSV', () => {
  it('frames round-trip (numbers rounded) and missing regions stay missing', () => {
    const frames = syntheticFrames(70, 1_000);
    const first = frames[0] as PulseFrame;
    frames[1] = { ...first, tMs: 40, faceValid: false, regions: {}, motion: null, gapBefore: true };
    const back = parseFramesCsv(
      `# wall_offset_ms=1700000000000\n${framesToCsv(frames.slice(0, 2))}`,
    );
    expect(back[0]?.regions.forehead?.g).toBeCloseTo(first.regions.forehead?.g ?? NaN, 3);
    expect(back[0]?.motion?.iodPx).toBe(100);
    expect(back[1]).toMatchObject({ tMs: 40, faceValid: false, gapBefore: true, motion: null });
    expect(back[1]?.regions.forehead).toBeNull();
  });

  it('estimate rows match the header', () => {
    const u: PulseUpdate = {
      tMs: 1,
      status: 'ok',
      regions: [],
      fusion: null,
      pooled: null,
      globalFlags: ['motion'],
      displayBpm: 70,
      level: 'fair',
      rawBpm: 71,
      fps: 30,
    };
    expect(estimateRow(u, 5).split(',')).toHaveLength(ESTIMATE_HEADER.length);
  });

  it('reference files: t_ms or wall_time_ms', () => {
    expect(parseReferenceCsv('t_ms,bpm\n2000,71\n1000,70\n')).toEqual({
      clock: 't_ms',
      readings: [
        { tMs: 1000, bpm: 70 },
        { tMs: 2000, bpm: 71 },
      ],
    });
    expect(parseReferenceCsv('wall_time_ms,bpm\n5,60\n').clock).toBe('wall_time_ms');
    expect(() => parseReferenceCsv('time,hr\n1,2\n')).toThrow(/Reference needs/);
  });
});

describe('evaluateTrace replays the app pipeline', () => {
  const frames = syntheticFrames(68);
  const ref = [
    { tMs: 0, bpm: 68 },
    { tMs: 40_000, bpm: 68 },
  ];

  it('fused: every hop after the confirming one shown, MAE < 1 BPM on a clean synthetic trace', () => {
    const r = evaluateTrace(frames, ref, 'fused', 60_000);
    expect(r.hops).toBeGreaterThanOrEqual(29);
    expect(r.shown).toBe(r.hops - 1);
    expect(r.shownAgreement.mae).toBeLessThan(1);
    expect(formatEval(r)).toContain('Mode: fused');
  });

  it('the before-Patch-D variant shows the first estimate at once', () => {
    const before = { name: 'before Patch D', options: BEFORE_PATCH_D };
    const r = evaluateTrace(frames, ref, 'fused', 60_000, before);
    expect(r.shown).toBe(r.hops);
    expect(formatEval(r)).toContain('Mode: fused (before Patch D)');
  });

  it('single-region modes use only that region (low coverage region shows nothing)', () => {
    expect(evaluateTrace(frames, ref, 'forehead', 60_000).shown).toBeGreaterThan(0);
    expect(evaluateTrace(frames, ref, 'rightCheek', 60_000).shown).toBe(0);
  });
});
