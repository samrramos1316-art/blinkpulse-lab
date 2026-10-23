import { describe, expect, it } from 'vitest';
import { synthRgb } from '../../tools/synth.ts';
import { FrameClock, type FrameTick } from '../capture/frameClock.ts';
import { PulseEstimator, type PulseUpdate } from '../rppg/pulseEstimator.ts';
import type { RoiStats } from '../rppg/roi.ts';
import { pulseGapBefore } from './pulseFrame.ts';

const tick = (gap: boolean, gapReason: FrameTick['gapReason'], dtMs: number) => ({
  gap,
  gapReason,
  dtMs,
});

describe('pulseGapBefore (PROJECT_SPEC 5.4: only breaks > 250 ms invalidate)', () => {
  it('ignores short skipped-frame and long-interval breaks', () => {
    expect(pulseGapBefore(tick(true, 'dropped', 100))).toBe(false);
    expect(pulseGapBefore(tick(true, 'interval', 250))).toBe(false);
    expect(pulseGapBefore(tick(false, null, 33))).toBe(false);
  });

  it('keeps breaks over 250 ms and every time-base break', () => {
    expect(pulseGapBefore(tick(true, 'dropped', 251))).toBe(true);
    expect(pulseGapBefore(tick(true, 'interval', 400))).toBe(true);
    expect(pulseGapBefore(tick(true, 'hidden', 50))).toBe(true);
    expect(pulseGapBefore(tick(true, 'sourceChange', 33))).toBe(true);
  });

  it('a camera that skips a few frames every 2 s still gives a pulse rate', () => {
    // 72 BPM at 30 fps; every 2 s, 5 frames (167 ms) are skipped and flagged as dropped.
    const s = synthRgb({
      durationMs: 30_000,
      fps: 30,
      bpm: 72,
      amplitude: 0.005,
      noiseSd: 0.2,
      seed: 3,
    });
    const run = (gapOf: (t: FrameTick) => boolean): PulseUpdate[] => {
      const clock = new FrameClock();
      const est = new PulseEstimator();
      const out: PulseUpdate[] = [];
      s.tMs.forEach((t, i) => {
        const k = i % 60;
        if (k >= 55) return; // skipped by the camera
        if (k === 0 && i > 0) clock.markGap('dropped');
        const tk = clock.push(t);
        if (!tk) return;
        const st = (): RoiStats => ({
          r: s.r[i] as number,
          g: s.g[i] as number,
          b: s.b[i] as number,
          polygonPixels: 500,
          coverage: 1,
          saturatedFraction: 0,
          meanLuma: 110,
        });
        const u = est.push({
          tMs: tk.tMs,
          gapBefore: gapOf(tk),
          faceValid: true,
          regions: { forehead: st(), leftCheek: st(), rightCheek: st() },
          motion: { noseTip: { x: 320, y: 240 }, iodPx: 100 },
        });
        if (u && u.status !== 'warmingUp') out.push(u);
      });
      return out;
    };
    const spec = run(pulseGapBefore);
    const strict = run((t) => t.gap);
    const shown = spec.filter((u) => u.displayBpm !== null);
    expect(shown.length).toBeGreaterThan(spec.length / 2);
    for (const u of shown) expect(Math.abs((u.displayBpm as number) - 72)).toBeLessThan(2);
    // Treating every flagged break as a gap (before this fix) blanks the reading.
    expect(strict.every((u) => u.displayBpm === null)).toBe(true);
  });
});
