import { describe, expect, it } from 'vitest';
import type { PulseFrame } from '../rppg/pulseEstimator.ts';
import { MAX_RECORDING_MS, Recorder } from './traceRecorder.ts';

function frame(tMs: number): PulseFrame {
  return { tMs, gapBefore: false, faceValid: false, regions: {}, motion: null };
}

describe('Recorder', () => {
  it('keeps every frame up to the limit, then reports full and ignores later frames', () => {
    const r = new Recorder();
    const dt = 1000;
    for (let t = 0; t <= MAX_RECORDING_MS; t += dt) r.add(frame(t), null, 1e12);
    expect(r.full).toBe(false);
    r.add(frame(MAX_RECORDING_MS + dt), null, 1e12);
    expect(r.full).toBe(true);
    const out = r.finish('limit');
    expect(out.endedBy).toBe('limit');
    expect(out.durationMs).toBe(MAX_RECORDING_MS);
    // Meta line + header + one row per kept frame.
    const rows = out.frames.trimEnd().split('\n');
    expect(rows.length).toBe(2 + MAX_RECORDING_MS / dt + 1);
  });

  it('records the wall-clock offset of the first frame', () => {
    const r = new Recorder();
    r.add(frame(500), null, 10_500);
    expect(r.finish('stopped').frames.split('\n')[0]).toBe('# wall_offset_ms=10000');
  });
});
