import { describe, expect, it } from 'vitest';
import { BIN_MS, type MinuteBin } from '../blink/sessionSummary.ts';
import type { TrendPoint } from '../blink/sleepiness.ts';
import {
  byDay,
  change,
  compareWeeks,
  hourOfDay,
  HistoryRecorder,
  historyBaseline,
  historyToCsv,
  indicatorAt,
  poolBlinks,
  poolIndicator,
  poolPulse,
  PulseMinutes,
  rangeStart,
  retentionCutoff,
  summarizeDays,
  type HistoryRow,
} from './history.ts';

function bin(index: number, blinks: number | null, elapsedS = 60, lowFps = false): MinuteBin {
  const validMs = blinks === null ? 10_000 : Math.min(elapsedS, 60) * 1000;
  const count = elapsedS >= 42 ? blinks : null;
  const usable = count !== null;
  return {
    index,
    startMs: index * BIN_MS,
    endMs: (index + 1) * BIN_MS,
    elapsedMs: elapsedS * 1000,
    validMs,
    coverage: validMs / BIN_MS,
    usable,
    lostMs: { noFace: 0, headTurned: 0, gap: 0, calibrating: 0 },
    mainReason: null,
    medianFrameMs: 33.3,
    lowFps,
    blinkCount: count,
    ratePerMin: count === null ? null : (count * 60_000) / validMs,
    medianDurationMs: usable ? 150 : null,
    meanDurationMs: usable ? 160 : null,
    longClosures: usable ? 1 : null,
    extendedClosures: usable ? 0 : null,
    closedFraction: usable ? 0.03 : null,
  };
}

/** A stored row at a local time, with sensible defaults. */
function row(start: Date, over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: `s:${String(start.getTime())}`,
    sessionId: 's',
    minute: 0,
    startMs: start.getTime(),
    elapsedMs: 60_000,
    validMs: 60_000,
    coverage: 1,
    usable: true,
    medianFrameMs: 33.3,
    lowFps: false,
    blinkCount: 15,
    ratePerMin: 15,
    medianDurationMs: 150,
    meanDurationMs: 160,
    longClosures: 0,
    extendedClosures: 0,
    closedFraction: 0.02,
    pulseBpm: null,
    pulseShownHops: 0,
    pulseHops: 60,
    eci: null,
    eciBand: null,
    ...over,
  };
}

/** n consecutive minutes from a local start time. */
const minutes = (from: Date, n: number, over: Partial<HistoryRow> = {}) =>
  Array.from({ length: n }, (_, i) => row(new Date(from.getTime() + i * 60_000), over));

const trendPoint = (tMs: number, eci: number | null): TrendPoint =>
  ({
    tMs,
    short: { ok: false, tMs, reason: 'notEnoughValid' },
    long:
      eci === null
        ? { ok: false, tMs, reason: 'notEnoughValid' }
        : {
            ok: true,
            tMs,
            eci,
            band: eci >= 2.5 ? 'wellAbove' : eci >= 1.5 ? 'somewhatAbove' : 'near',
          },
  }) as unknown as TrendPoint;

describe('history: collection', () => {
  it('PulseMinutes: median of the shown values, hops counted, older minutes forgotten', () => {
    const p = new PulseMinutes();
    p.add(0, 70);
    p.add(0, null);
    p.add(0, 74);
    p.add(0, 90);
    p.add(1, 71);
    expect(p.take(0)).toEqual({ bpm: 74, shownHops: 3, hops: 4 });
    expect(p.take(0)).toEqual({ bpm: null, shownHops: 0, hops: 0 });
    expect(p.take(1)).toEqual({ bpm: 71, shownHops: 1, hops: 1 });
  });

  it('indicatorAt: the latest result at or before the minute end, if fresh and ok', () => {
    const trend = [trendPoint(50_000, 1.2), trendPoint(60_000, 1.8), trendPoint(70_000, 3)];
    expect(indicatorAt(trend, 65_000)).toEqual({ eci: 1.8, band: 'somewhatAbove' });
    expect(indicatorAt(trend, 60_000)).toEqual({ eci: 1.8, band: 'somewhatAbove' });
    expect(indicatorAt(trend, 95_000)).toBeNull(); // last point 25 s old
    expect(indicatorAt([trendPoint(60_000, null)], 60_000)).toBeNull();
    expect(indicatorAt([], 60_000)).toBeNull();
  });

  it('HistoryRecorder: each ended minute once; Stop adds the cut-short minute', () => {
    const rec = new HistoryRecorder('abc');
    const pulse = new PulseMinutes();
    pulse.add(0, 72);
    pulse.add(1, null);
    const timing = { originMs: 5_000, wallOriginMs: 1_700_000_000_000 };
    const trend = [trendPoint(5_000 + 60_000, 1.1)];
    // Minute 1 is still running: only minute 0 is returned.
    const first = rec.collect([bin(0, 14), bin(1, 3, 20)], timing, trend, pulse);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: 'abc:0',
      minute: 0,
      startMs: 1_700_000_000_000,
      blinkCount: 14,
      pulseBpm: 72,
      pulseShownHops: 1,
      pulseHops: 1,
      eci: 1.1,
      eciBand: 'near',
    });
    expect(rec.collect([bin(0, 14), bin(1, 3, 20)], timing, trend, pulse)).toHaveLength(0);
    // Stop: the 20 s minute is saved (not usable), with its own start time.
    const last = rec.collect([bin(0, 14), bin(1, 3, 20)], timing, trend, pulse, true);
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({
      minute: 1,
      startMs: 1_700_000_060_000,
      elapsedMs: 20_000,
      usable: false,
      blinkCount: null,
      pulseBpm: null,
      pulseHops: 1,
    });
  });

  it('a minute cut after less than a second is not saved', () => {
    const rec = new HistoryRecorder('x');
    const rows = rec.collect(
      [bin(0, 15), bin(1, null, 0.5)],
      { originMs: 0, wallOriginMs: 0 },
      [],
      new PulseMinutes(),
      true,
    );
    expect(rows.map((r) => r.minute)).toEqual([0]);
  });
});

describe('history: summaries', () => {
  it('pools blinks over usable minutes with good timing, by valid time', () => {
    const t = new Date(2026, 9, 20, 9, 0);
    const rs = [
      row(t, { blinkCount: 10, validMs: 60_000, closedFraction: 0.01, longClosures: 1 }),
      row(t, { blinkCount: 20, validMs: 30_000, closedFraction: 0.04, longClosures: 0 }),
      row(t, { usable: false, blinkCount: null, validMs: 5_000 }),
      row(t, { lowFps: true, blinkCount: 99 }),
    ];
    const p = poolBlinks(rs, 2);
    expect(p.minutes).toBe(2);
    expect(p.ratePerMin).toBeCloseTo((30 * 60_000) / 90_000, 10);
    expect(p.closedFraction).toBeCloseTo((0.01 * 60_000 + 0.04 * 30_000) / 90_000, 10);
    expect(p.longPerHour).toBeCloseTo(3_600_000 / 90_000, 10);
    expect(poolBlinks(rs, 3).ratePerMin).toBeNull();
  });

  it('days: local calendar days, blink values only with at least 10 usable minutes', () => {
    const rs = [
      ...minutes(new Date(2026, 9, 20, 23, 55), 10, { pulseBpm: 70 }),
      ...minutes(new Date(2026, 9, 21, 10, 0), 9),
    ];
    const days = summarizeDays(rs);
    expect(days.map((d) => d.day)).toEqual(['2026-10-20', '2026-10-21']);
    // 23:55-00:04: five minutes start on the 20th, five on the 21st.
    expect(days[0]?.measuredMinutes).toBe(5);
    expect(days[1]?.measuredMinutes).toBe(14);
    expect(days[0]?.blinks.ratePerMin).toBeNull();
    expect(days[1]?.blinks.ratePerMin).toBe(15);
    expect(days[1]?.pulse).toEqual({ minutes: 5, bpm: 70 });
    expect([...byDay(rs).keys()]).toEqual(['2026-10-20', '2026-10-21']);
  });

  it('pulse: median over minutes with a shown value; indicator: minutes per band', () => {
    const t = new Date(2026, 9, 20, 9, 0);
    expect(
      poolPulse([row(t, { pulseBpm: 60 }), row(t, { pulseBpm: 80 }), row(t, { pulseBpm: 66 })]),
    ).toEqual({ minutes: 3, bpm: 66 });
    expect(poolPulse([row(t)])).toEqual({ minutes: 0, bpm: null });
    expect(
      poolIndicator([
        row(t, { eci: 1, eciBand: 'near' }),
        row(t, { eci: 2, eciBand: 'somewhatAbove' }),
        row(t, { eci: 1.2, eciBand: 'near' }),
        row(t),
      ]),
    ).toEqual({
      bands: { near: 2, somewhatAbove: 1, wellAbove: 0 },
      notEnoughData: 1,
      medianEci: 1.2,
    });
  });

  it('hour of day pools minutes per local hour', () => {
    const h = hourOfDay([
      ...minutes(new Date(2026, 9, 20, 9, 0), 12, { blinkCount: 12, ratePerMin: 12 }),
      ...minutes(new Date(2026, 9, 21, 9, 30), 12, { blinkCount: 18, ratePerMin: 18 }),
      ...minutes(new Date(2026, 9, 21, 14, 0), 3),
    ]);
    expect(h).toHaveLength(24);
    expect(h[9]?.blinks.minutes).toBe(24);
    expect(h[9]?.blinks.ratePerMin).toBe(15);
    expect(h[14]?.blinks.ratePerMin).toBeNull();
  });

  it('stored baseline: last 14 days, at least 60 good minutes', () => {
    const now = new Date(2026, 9, 30, 12, 0).getTime();
    const old = minutes(new Date(2026, 9, 1, 9, 0), 100, { blinkCount: 30 });
    const recent = minutes(new Date(2026, 9, 25, 9, 0), 59, { blinkCount: 12 });
    expect(historyBaseline([...old, ...recent], now)).toBeNull();
    const more = [...recent, ...minutes(new Date(2026, 9, 26, 9, 0), 1, { blinkCount: 12 })];
    expect(historyBaseline([...old, ...more], now)).toEqual({
      ratePerMin: 12,
      source: 'history',
      minutes: 60,
    });
  });

  it('weeks: the last 7 local days against the 7 before them, gated like a day', () => {
    const now = new Date(2026, 9, 30, 15, 0).getTime();
    const rs = [
      // This week: Oct 24 (00:00) to Oct 30.
      ...minutes(new Date(2026, 9, 24, 0, 0), 10, { blinkCount: 12, pulseBpm: 70 }),
      ...minutes(new Date(2026, 9, 30, 9, 0), 10, { blinkCount: 18, eci: 1, eciBand: 'near' }),
      // Last week: Oct 17 to Oct 23 (23:59), too few usable minutes for blink values.
      ...minutes(new Date(2026, 9, 23, 23, 50), 10, { usable: false, pulseBpm: 64 }),
      ...minutes(new Date(2026, 9, 17, 0, 0), 9),
      // Before both weeks, and later than now's day: ignored.
      ...minutes(new Date(2026, 9, 16, 23, 0), 30),
      ...minutes(new Date(2026, 9, 31, 0, 0), 30),
    ];
    const { thisWeek, lastWeek } = compareWeeks(rs, now);
    expect([thisWeek.from, thisWeek.to]).toEqual(['2026-10-24', '2026-10-30']);
    expect([lastWeek.from, lastWeek.to]).toEqual(['2026-10-17', '2026-10-23']);
    expect(thisWeek.measuredMinutes).toBe(20);
    expect(thisWeek.daysWithData).toBe(2);
    expect(thisWeek.blinks.ratePerMin).toBe(15);
    expect(thisWeek.pulse).toEqual({ minutes: 10, bpm: 70 });
    expect(thisWeek.indicator.bands.near).toBe(10);
    expect(lastWeek.measuredMinutes).toBe(19);
    expect(lastWeek.blinks.minutes).toBe(9);
    expect(lastWeek.blinks.ratePerMin).toBeNull();
    expect(lastWeek.pulse).toEqual({ minutes: 10, bpm: 64 });
    expect(change(thisWeek.pulse.bpm, lastWeek.pulse.bpm)).toBe(6);
    expect(change(thisWeek.blinks.ratePerMin, lastWeek.blinks.ratePerMin)).toBeNull();
  });

  it('retention is 90 days; ranges start at local midnight', () => {
    const now = new Date(2026, 9, 30, 15, 45).getTime();
    expect(now - retentionCutoff(now)).toBe(90 * 86_400_000);
    expect(rangeStart(now, 1)).toBe(new Date(2026, 9, 30, 0, 0).getTime());
    expect(rangeStart(now, 7)).toBe(new Date(2026, 9, 24, 0, 0).getTime());
  });

  it('CSV: one line per row, oldest first, empty cells for missing values', () => {
    const t = new Date(Date.UTC(2026, 9, 20, 9, 0));
    const csv = historyToCsv([
      row(new Date(t.getTime() + 60_000), { usable: false, blinkCount: null, ratePerMin: null }),
      row(t, { pulseBpm: 71.26, eci: 1.5, eciBand: 'somewhatAbove' }),
    ]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]?.split(',')).toHaveLength(22);
    expect(lines[1]).toContain('2026-10-20T09:00:00.000Z');
    expect(lines[1]).toContain(',71.3,');
    expect(lines[1]?.endsWith(',1.500,somewhatAbove')).toBe(true);
    expect(lines[2]).toContain(',1.000,0,33.30,0,,,150.0,'); // not usable: count and rate empty
  });
});
