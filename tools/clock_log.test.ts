import { describe, expect, it } from 'vitest';
import { parseReferenceCsv } from '../src/rppg/traceCsv.ts';
import { clockLogToReference } from './clock_log.ts';

const local = (d: number, h: number, mi: number, s: number) =>
  new Date(2026, 10, d, h, mi, s).getTime();

describe('clockLogToReference', () => {
  it('writes a file the evaluation tool reads, in this computer’s local time', () => {
    const { csv, readings, longGaps } = clockLogToReference(
      'time,bpm\n16:05:10,72\n16:05:20,74.5\n',
      '2026-11-03',
    );
    expect(readings).toBe(2);
    expect(longGaps).toEqual([]);
    expect(parseReferenceCsv(csv)).toEqual({
      clock: 'wall_time_ms',
      readings: [
        { tMs: local(3, 16, 5, 10), bpm: 72 },
        { tMs: local(3, 16, 5, 20), bpm: 74.5 },
      ],
    });
  });

  it('accepts Windows line endings, a byte order mark, blank lines, and spaces', () => {
    const { readings } = clockLogToReference(
      `${String.fromCharCode(0xfeff)}time, bpm\r\n16:05:10, 72\r\n\r\n16:05:20, 74\r\n`,
      '2026-11-03',
    );
    expect(readings).toBe(2);
  });

  it('moves to the next day when the log crosses midnight', () => {
    const { csv } = clockLogToReference('time,bpm\n23:59:55,70\n00:00:05,71\n', '2026-11-03');
    expect(parseReferenceCsv(csv).readings.map((r) => r.tMs)).toEqual([
      local(3, 23, 59, 55),
      local(4, 0, 0, 5),
    ]);
  });

  it('reports gaps too long to compare, and allows exactly 15 s', () => {
    const { longGaps } = clockLogToReference(
      'time,bpm\n16:05:00,70\n16:05:15,71\n16:05:31,72\n',
      '2026-11-03',
    );
    expect(longGaps).toEqual(['16:05:15-16:05:31']);
  });

  it.each([
    ['a missing column', 'time,rate\n16:05:10,72\n', '2026-11-03', /time,bpm/],
    ['no readings', 'time,bpm\n', '2026-11-03', /no readings/],
    ['a time without seconds', 'time,bpm\n16:05,72\n', '2026-11-03', /16:05:10/],
    ['an impossible time', 'time,bpm\n16:75:10,72\n', '2026-11-03', /16:05:10/],
    ['a missing bpm', 'time,bpm\n16:05:10,\n', '2026-11-03', /positive/],
    ['a time out of order', 'time,bpm\n16:05:20,72\n16:05:10,73\n', '2026-11-03', /not after/],
    ['a badly written date', 'time,bpm\n16:05:10,72\n', '11/03/2026', /2026-11-03/],
    ['an impossible date', 'time,bpm\n16:05:10,72\n', '2026-02-31', /real date/],
  ])('rejects %s', (_name, text, date, message) => {
    expect(() => clockLogToReference(text, date)).toThrow(message);
  });
});
