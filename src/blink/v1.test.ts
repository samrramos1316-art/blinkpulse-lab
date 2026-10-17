import { describe, expect, it } from 'vitest';
import {
  detectionsToCsv,
  formatV1Score,
  frameIndexAt,
  framesToCsv,
  labelsToCsv,
  parseDetectionsCsv,
  parseLabelsCsv,
  scoreV1,
  seekTimeForFrame,
  type V1Detections,
} from './v1.ts';

const detections: V1Detections = {
  calibrationEndMs: 10_016.667,
  events: [
    { startMs: 12_000, endMs: 12_150, kind: 'blink', lowConfidence: false, minEar: 0.05 },
    { startMs: 15_000, endMs: 15_700, kind: 'long_closure', lowConfidence: true, minEar: 0.1 },
    { startMs: 20_000, endMs: 20_100, kind: 'blink', lowConfidence: false, minEar: 0.12 },
  ],
};

describe('V1 CSV round trips', () => {
  it('detections keep the calibration end and every field', () => {
    const csv = detectionsToCsv(detections);
    expect(csv.split('\n')[0]).toBe('# calibration_end_ms=10016.667');
    expect(parseDetectionsCsv(csv)).toEqual(detections);
  });

  it('labels are sorted by start and survive CRLF line endings', () => {
    const csv = labelsToCsv([
      { startMs: 5, endMs: 9 },
      { startMs: 1, endMs: 2 },
    ]).replaceAll('\n', '\r\n');
    expect(parseLabelsCsv(csv)).toEqual([
      { startMs: 1, endMs: 2 },
      { startMs: 5, endMs: 9 },
    ]);
  });

  it('frames export numbers only, with empty cells for invalid values', () => {
    const csv = framesToCsv([
      { tMs: 33.3333, ear: NaN, earA: 0.3, earB: NaN, valid: false, face: true },
    ]);
    expect(csv).toBe('t_ms,ear,ear_a,ear_b,valid,face\n33.333,,0.3,,0,1\n');
  });
});

describe('V1 CSV errors name the line', () => {
  it('rejects a label that ends before it starts', () => {
    expect(() => parseLabelsCsv('start_ms,end_ms\n100,50\n')).toThrow(/Line 2/);
  });

  it('rejects a non-number and a missing column', () => {
    expect(() => parseLabelsCsv('start_ms,end_ms\n1,2\nx,5\n')).toThrow(/Line 3: "start_ms"/);
    expect(() => parseLabelsCsv('start,end\n1,2\n')).toThrow(/Missing column "start_ms"/);
  });

  it('requires the calibration line in detections', () => {
    expect(() =>
      parseDetectionsCsv('start_ms,end_ms,duration_ms,kind,low_confidence,min_ear\n'),
    ).toThrow(/calibration_end_ms/);
  });
});

describe('scoreV1', () => {
  it('excludes labels inside the calibration window and matches within +-100 ms', () => {
    const labels = [
      { startMs: 3_000, endMs: 3_200 }, // calibration window: excluded
      { startMs: 12_050, endMs: 12_250 }, // matches the first detection (50 ms)
      { startMs: 15_150, endMs: 15_600 }, // 150 ms off: no match
      { startMs: 30_000, endMs: 30_200 }, // missed
    ];
    const s = scoreV1(labels, detections);
    expect(s.labelsExcluded).toBe(1);
    expect(s.labelsScored).toBe(3);
    expect(s.truePositives).toBe(1);
    expect(s.falsePositives).toBe(2);
    expect(s.falseNegatives).toBe(2);
    expect(s.precision).toBeCloseTo(1 / 3, 12);
    expect(s.recall).toBeCloseTo(1 / 3, 12);
    expect(s.durationErrorsMs).toEqual([50]);
    expect(formatV1Score(s)).toContain('Precision 0.333, recall 0.333, F1 0.333');
  });

  it('reports n/a instead of a number when there is nothing to score', () => {
    const s = scoreV1([], { calibrationEndMs: 0, events: [] });
    expect(formatV1Score(s)).toContain('Precision n/a, recall n/a');
    expect(formatV1Score(s)).toContain('n/a (n = 0)');
  });
});

describe('frame lookup for labelling', () => {
  const times = [0, 33.3, 66.7, 100];

  it('finds the frame shown at a media time', () => {
    expect(frameIndexAt(times, -1)).toBe(-1);
    expect(frameIndexAt(times, 0)).toBe(0);
    expect(frameIndexAt(times, 50)).toBe(1);
    expect(frameIndexAt(times, 66.7)).toBe(2);
    expect(frameIndexAt(times, 1e9)).toBe(3);
  });

  it('seeks to the middle of a frame, clamped to the video', () => {
    expect(seekTimeForFrame(times, 1)).toBeCloseTo(50, 9);
    expect(seekTimeForFrame(times, 3)).toBeCloseTo(116.65, 9);
    expect(seekTimeForFrame(times, -5)).toBeCloseTo(16.65, 9);
    expect(frameIndexAt(times, seekTimeForFrame(times, 2))).toBe(2);
  });
});
