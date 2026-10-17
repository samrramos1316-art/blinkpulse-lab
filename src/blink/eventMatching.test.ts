import { describe, expect, it } from 'vitest';
import { matchEvents } from './eventMatching.ts';

const e = (startMs: number, durationMs = 150) => ({ startMs, endMs: startMs + durationMs });

describe('matchEvents (V1 scoring, +-100 ms)', () => {
  it('perfect match', () => {
    const r = matchEvents([e(1000), e(3000)], [e(1020), e(2950)]);
    expect(r).toMatchObject({ truePositives: 2, falsePositives: 0, falseNegatives: 0, f1: 1 });
  });

  it('tolerance is inclusive at 100 ms and excludes 101 ms', () => {
    expect(matchEvents([e(1000)], [e(1100)]).truePositives).toBe(1);
    expect(matchEvents([e(1000)], [e(1101)]).truePositives).toBe(0);
  });

  it('one-to-one: two detections near one label give 1 TP + 1 FP', () => {
    const r = matchEvents([e(1000)], [e(990), e(1050)]);
    expect(r).toMatchObject({ truePositives: 1, falsePositives: 1, falseNegatives: 0 });
    expect(r.pairs).toEqual([{ label: 0, detection: 0 }]); // closest wins
  });

  it('precision, recall, F1 and duration error', () => {
    const labels = [e(1000, 150), e(3000, 200), e(5000, 100), e(7000, 120)];
    const dets = [e(1010, 160), e(3020, 170), e(9000)];
    const r = matchEvents(labels, dets);
    expect(r.precision).toBeCloseTo(2 / 3, 12);
    expect(r.recall).toBeCloseTo(2 / 4, 12);
    expect(r.f1).toBeCloseTo((2 * (2 / 3) * 0.5) / (2 / 3 + 0.5), 12);
    expect(r.durationErrorsMs).toEqual([10, 30]);
    expect(r.medianAbsDurationErrorMs).toBe(20);
  });

  it('empty inputs', () => {
    expect(matchEvents([], []).f1).toBe(0);
    expect(matchEvents([e(1)], []).recall).toBe(0);
  });
});
