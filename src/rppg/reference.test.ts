import { describe, expect, it } from 'vitest';
import { normal, rng } from '../../tools/synth.ts';
import { parsePpgCsv, referenceFromPpg, referenceToCsv } from './reference.ts';
import { parseReferenceCsv } from './traceCsv.ts';

/** Contact-PPG-like signal: negative offset, arbitrary scale, a rate change halfway. */
function ppg(fs: number, durationMs: number, seed = 1) {
  const gauss = normal(rng(seed));
  const tMs: number[] = [];
  const v: number[] = [];
  let phase = 0;
  for (let t = 0; t < durationMs; t += 1000 / fs) {
    const bpm = t < durationMs / 2 ? 66 : 90;
    phase += (2 * Math.PI * bpm) / 60 / fs;
    tMs.push(t);
    v.push(-500 + 40 * (Math.sin(phase) + 0.4 * Math.sin(2 * phase + 1)) + 2 * gauss());
  }
  return { tMs, v };
}

describe('referenceFromPpg', () => {
  it('follows the rate at 1 s hops in the app time base', () => {
    const { tMs, v } = ppg(60, 60_000);
    const { readings, failed } = referenceFromPpg(tMs, v);
    expect(failed).toBe(0);
    expect(readings[0]?.tMs).toBe(10_000);
    expect(readings[1]?.tMs).toBe(11_000);
    for (const r of readings) {
      // Windows fully inside one rate; mixed windows lie between the two.
      if (r.tMs <= 30_000) expect(Math.abs(r.bpm - 66)).toBeLessThan(1);
      else if (r.tMs >= 40_000) expect(Math.abs(r.bpm - 90)).toBeLessThan(1);
    }
  });

  it('skips windows with a hole over 250 ms', () => {
    const { tMs, v } = ppg(30, 30_000);
    const keep = tMs.map((t) => t < 15_000 || t > 15_500);
    const r = referenceFromPpg(
      tMs.filter((_, i) => keep[i]),
      v.filter((_, i) => keep[i]),
    );
    expect(r.failed).toBeGreaterThan(0);
    expect(r.readings.every((x) => x.tMs <= 15_000 || x.tMs >= 25_500)).toBe(true);
  });

  it('round-trips through the CSV formats', () => {
    const { tMs, v } = ppg(30, 20_000);
    const text = [
      '# t_ms,ppg from a test',
      't_ms,ppg',
      ...tMs.map((t, i) => `${String(t)},${String(v[i])}`),
    ].join('\n');
    const parsed = parsePpgCsv(text);
    expect(parsed.tMs).toHaveLength(tMs.length);
    const { readings } = referenceFromPpg(parsed.tMs, parsed.ppg);
    const back = parseReferenceCsv(referenceToCsv(readings));
    expect(back.clock).toBe('t_ms');
    expect(back.readings).toHaveLength(readings.length);
    expect(() => parsePpgCsv('time,ppg\n0,1')).toThrow(/t_ms,ppg/);
    expect(() => parsePpgCsv('t_ms,ppg\n10,1\n5,1')).toThrow(/increase/);
  });
});
