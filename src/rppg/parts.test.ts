import { describe, expect, it } from 'vitest';
import { BpmSmoother, fuseRegions, weightedMedian, type RegionResult } from './fusion.ts';
import { levelFromSqi, lowerLevel, motionFlag, regionFlags, regionQuality } from './quality.ts';
import { RgbTrace, type TraceSample } from './rgbTrace.ts';
import {
  boundingBox,
  pointInPolygon,
  regionPolygons,
  roiStats,
  LEFT_CHEEK,
  RIGHT_CHEEK,
} from './roi.ts';
import type { WindowEstimate } from './hrEstimator.ts';

describe('roi', () => {
  it('forehead is a parallelogram 25%-65% up the 9 -> 10 vector from the brow points', () => {
    const pts = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
    pts[105] = { x: 100, y: 200 };
    pts[334] = { x: 200, y: 200 };
    pts[9] = { x: 150, y: 200 };
    pts[10] = { x: 150, y: 100 };
    const f = regionPolygons(pts).forehead;
    expect(f).toEqual([
      { x: 100, y: 175 },
      { x: 200, y: 175 },
      { x: 200, y: 135 },
      { x: 100, y: 135 },
    ]);
  });

  it('cheek polygons are the mirror-symmetric index lists; missing points give null', () => {
    expect(RIGHT_CHEEK).toEqual([118, 205, 36, 119]);
    expect(LEFT_CHEEK).toEqual([347, 425, 266, 348]);
    expect(regionPolygons([]).leftCheek).toBeNull();
  });

  it('bounding box is clipped to the frame', () => {
    expect(
      boundingBox(
        [
          { x: -5, y: 10.2 },
          { x: 20.5, y: 30 },
        ],
        16,
        100,
      ),
    ).toEqual({ x: 0, y: 10, w: 16, h: 20 });
    expect(boundingBox([{ x: 50, y: 50 }], 10, 10)).toBeNull();
  });

  it('point in polygon (even-odd)', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });

  it('roiStats masks to the polygon and rejects saturated and dark pixels', () => {
    // 4 x 2 box; triangle covers the left half only.
    const box = { x: 0, y: 0, w: 4, h: 2 };
    const poly = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const px = (r: number, g: number, b: number) => [r, g, b, 255];
    const rgba = [
      ...px(100, 50, 20),
      ...px(255, 255, 255), // saturated
      ...px(0, 0, 0), // outside
      ...px(0, 0, 0),
      ...px(110, 60, 30),
      ...px(5, 5, 5), // dark
      ...px(0, 0, 0),
      ...px(0, 0, 0),
    ];
    const s = roiStats(rgba, box, poly);
    expect(s.polygonPixels).toBe(4);
    expect(s.coverage).toBe(0.5);
    expect(s.saturatedFraction).toBe(0.25);
    expect(s.r).toBe(105);
    expect(s.g).toBe(55);
    expect(s.b).toBe(25);
  });
});

describe('rgbTrace windows', () => {
  const sample = (tMs: number, valid = true, meanLuma = 100): TraceSample => ({
    tMs,
    r: 1,
    g: 1,
    b: 1,
    valid,
    coverage: 0.9,
    saturatedFraction: 0.01,
    meanLuma,
  });

  it('needs data from the start of the window', () => {
    const t = new RgbTrace();
    for (let ms = 0; ms <= 9_000; ms += 33) t.push(sample(ms));
    expect(t.window(9_000)).toEqual({ ok: false, reason: 'tooShort' });
  });

  it('invalid frames are absent; a hole > 250 ms or a gap flag invalidates', () => {
    const t = new RgbTrace();
    for (let ms = 0; ms <= 12_000; ms += 33) t.push(sample(ms, ms < 5_000 || ms > 5_200));
    const w = t.window(12_000);
    expect(w.ok).toBe(true);
    const t2 = new RgbTrace();
    for (let ms = 0; ms <= 12_000; ms += 33) t2.push(sample(ms, ms < 5_000 || ms > 5_300));
    expect(t2.window(12_000)).toEqual({ ok: false, reason: 'gap' });
    const t3 = new RgbTrace();
    for (let ms = 0; ms <= 12_000; ms += 33) t3.push(sample(ms), ms === 6_006);
    expect(t3.window(12_000)).toEqual({ ok: false, reason: 'gap' });
  });

  it('reports coverage, saturation, luma, largest luma jump, and frame rate', () => {
    const t = new RgbTrace();
    for (let ms = 0; ms <= 11_000; ms += 40) t.push(sample(ms, true, ms === 8_000 ? 110 : 100));
    const w = t.window(11_000);
    if (!w.ok) throw new Error(w.reason);
    expect(w.stats.coverage).toBeCloseTo(0.9, 9);
    expect(w.stats.saturatedFraction).toBeCloseTo(0.01, 9);
    expect(w.stats.maxLumaJump).toBeCloseTo(0.1, 9);
    expect(w.stats.fps).toBeCloseTo(25, 9);
  });
});

describe('quality', () => {
  it('SQI levels and stepping down', () => {
    expect([0.75, 0.7, 0.6, 0.5, 0.49].map(levelFromSqi)).toEqual([
      'good',
      'good',
      'fair',
      'fair',
      'poor',
    ]);
    expect(lowerLevel('good', 2)).toBe('poor');
    expect(lowerLevel('poor')).toBe('poor');
  });

  it('region flags: saturation > 5%, mean luma < 40, coverage < 60%', () => {
    const base = { coverage: 0.9, saturatedFraction: 0, meanLuma: 100, maxLumaJump: 0, fps: 30 };
    expect(regionFlags(base)).toEqual([]);
    expect(regionFlags({ ...base, saturatedFraction: 0.06, meanLuma: 30, coverage: 0.5 })).toEqual([
      'saturated',
      'dark',
      'lowCoverage',
    ]);
  });

  it('motion flag when more than 10% of frames exceed 0.5 IOD/s', () => {
    const speeds = (slow: number, fast: number) => [
      ...new Array<number>(slow).fill(0.1),
      ...new Array<number>(fast).fill(1),
    ];
    expect(motionFlag(speeds(90, 10))).toBe(false);
    expect(motionFlag(speeds(89, 11))).toBe(true);
  });

  it('cross-check disagreement lowers one step', () => {
    const est = { sqi: 0.8, crossCheckAgrees: false } as WindowEstimate;
    const stats = { coverage: 1, saturatedFraction: 0, meanLuma: 100, maxLumaJump: 0, fps: 30 };
    expect(regionQuality(est, stats, [])).toEqual({ level: 'fair', flags: ['crossCheck'] });
  });
});

describe('fusion (Patch A rules)', () => {
  const r = (
    id: RegionResult['id'],
    bpm: number | null,
    sqi: number,
    level: RegionResult['level'],
    flags: RegionResult['regionFlags'] = [],
  ): RegionResult => ({
    id,
    bpm,
    sqi,
    level,
    regionFlags: flags,
  });

  it('weighted median', () => {
    expect(weightedMedian([60, 70, 80], [1, 1, 1])).toBe(70);
    expect(weightedMedian([60, 70, 80], [0.1, 0.1, 0.9])).toBe(80);
  });

  it('excludes poor and flagged regions', () => {
    const f = fuseRegions([
      r('forehead', 70, 0.8, 'good'),
      r('leftCheek', 72, 0.9, 'good', ['saturated']),
      r('rightCheek', 99, 0.3, 'poor'),
    ]);
    expect(f.kept).toEqual(['forehead']);
    expect(f.bpm).toBe(70);
  });

  it('one kept region: shown, capped at Fair, marked single region', () => {
    const f = fuseRegions([r('forehead', 70, 0.9, 'good')]);
    expect(f.level).toBe('fair');
    expect(f.singleRegion).toBe(true);
  });

  it('no kept region: no number, with a reason', () => {
    expect(fuseRegions([r('forehead', 70, 0.2, 'poor')])).toMatchObject({
      bpm: null,
      reason: 'noRegion',
    });
  });

  it('agreement > 8 BPM lowers the level one step', () => {
    const f = fuseRegions([r('forehead', 70, 0.9, 'good'), r('leftCheek', 79, 0.9, 'good')]);
    expect(f.agreementBpm).toBe(9);
    expect(f.regionsDisagree).toBe(true);
    expect(f.level).toBe('fair');
  });
});

describe('BpmSmoother', () => {
  it('median of the last 5 accepted', () => {
    const s = new BpmSmoother();
    for (const v of [70, 72, 71, 90 - 10, 69, 73]) s.push(v);
    expect(s.value).toBe(72);
  });

  it('a jump > 12 BPM needs a second consistent estimate', () => {
    const s = new BpmSmoother();
    [70, 70, 70].forEach((v) => s.push(v));
    expect(s.push(100)).toBe(70); // held
    expect(s.push(70)).toBe(70); // not consistent with 100: the 100 is dropped
    expect(s.push(100)).toBe(70); // held again
    expect(s.push(103)).toBe(70); // accepted: 70,70,70,70,100,103 -> last 5: 70,70,70,100,103
    expect(s.value).toBe(70);
    // Still 70: the next jump is held again until a consistent pair arrives.
    expect(s.push(101)).toBe(70);
    expect(s.push(102)).toBe(101); // 70, 100, 103, 101, 102
  });
});
