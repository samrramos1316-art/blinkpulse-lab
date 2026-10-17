import { describe, expect, it } from 'vitest';
import { EYE_A } from '../../vision/landmarks.ts';
import { PRESETS, nearestLandmark, parseIndexList } from './explorerModel.ts';

describe('parseIndexList', () => {
  it('accepts single indices and ranges, deduplicated and sorted', () => {
    expect(parseIndexList('160-162, 33 133;33')).toEqual({
      indices: [33, 133, 160, 161, 162],
      invalid: [],
    });
  });

  it('reports parts outside 0..477 or not understood', () => {
    expect(parseIndexList('477 478 9-3 abc 470-480')).toEqual({
      indices: [477],
      invalid: ['478', '9-3', 'abc', '470-480'],
    });
  });
});

describe('nearestLandmark', () => {
  it('finds the closest point and -1 for none', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ];
    expect(nearestLandmark(pts, { x: 9, y: 8 })).toBe(1);
    expect(nearestLandmark([], { x: 0, y: 0 })).toBe(-1);
  });
});

describe('PRESETS', () => {
  it('eye presets use the exact EAR index lists, labelled P1..P6', () => {
    const eyeA = PRESETS.find((p) => p.id === 'eyeA');
    expect(eyeA?.indices).toEqual(EYE_A);
    expect(eyeA?.pointLabels).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  });
});
