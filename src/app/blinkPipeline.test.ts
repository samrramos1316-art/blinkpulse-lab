import { describe, expect, it } from 'vitest';
import type { Point } from '../blink/ear.ts';
import type { FrameTick } from '../capture/frameClock.ts';
import { EYE_A, EYE_B } from '../vision/landmarks.ts';
import { BlinkPipeline, CALIBRATION_MS, type FaceInput } from './blinkPipeline.ts';

/** 478 points with both eyes shaped to the given EAR (pixels). */
function face(ear: number, yawDeg = 0, pitchDeg = 0): FaceInput {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  const place = (idx: readonly number[], cx: number) => {
    const w = 40;
    const h = ear * w; // EAR = h / w for this shape
    const pts: Point[] = [
      { x: cx - w / 2, y: 200 },
      { x: cx - w / 6, y: 200 - h / 2 },
      { x: cx + w / 6, y: 200 - h / 2 },
      { x: cx + w / 2, y: 200 },
      { x: cx + w / 6, y: 200 + h / 2 },
      { x: cx - w / 6, y: 200 + h / 2 },
    ];
    idx.forEach((i, k) => (points[i] = pts[k] as Point));
  };
  place(EYE_A, 280);
  place(EYE_B, 360);
  return { points, pose: { yawDeg, pitchDeg, rollDeg: 0 } };
}

const tick = (i: number, fps = 30, gap = false): FrameTick => ({
  tMs: (i * 1000) / fps,
  dtMs: i === 0 ? NaN : 1000 / fps,
  irregular: false,
  gap,
  gapReason: gap ? 'hidden' : null,
  index: i,
});

/** EAR 0.3 with a 6-frame blink (0.05) every `every` frames starting at `first`. */
const earAt = (i: number, first = 45, every = 90) =>
  i >= first && (i - first) % every < 6 ? 0.05 : 0.3;

function calibrated(pitchDeg = 0): { p: BlinkPipeline; next: number } {
  const p = new BlinkPipeline(EYE_A, EYE_B);
  p.startCalibration();
  let i = 0;
  for (; i <= (CALIBRATION_MS * 30) / 1000; i++) p.process(tick(i), face(earAt(i), 0, pitchDeg));
  return { p, next: i };
}

describe('BlinkPipeline', () => {
  it('reports EAR per eye and face status', () => {
    const p = new BlinkPipeline(EYE_A, EYE_B);
    p.process(tick(0), face(0.28));
    const s = p.snapshot();
    expect(s.faceStatus).toBe('ok');
    expect(s.ear).toBeCloseTo(0.28, 9);
    expect(s.eyeA).toBeCloseTo(0.28, 9);
    p.process(tick(1), null);
    expect(p.snapshot().faceStatus).toBe('noFace');
    expect(p.snapshot().ear).toBeNull();
  });

  it('does not detect blinks before calibration', () => {
    const p = new BlinkPipeline(EYE_A, EYE_B);
    let events = 0;
    for (let i = 0; i < 600; i++) if (p.process(tick(i), face(earAt(i)))) events++;
    expect(events).toBe(0);
    expect(p.isCalibrated).toBe(false);
  });

  it('calibrates over 10 s, ignoring blinks, then detects blinks', () => {
    const { p, next } = calibrated();
    const s = p.snapshot();
    expect(s.calibration.phase).toBe('done');
    expect(s.thresholds?.baseline).toBeCloseTo(0.3, 9);
    expect(s.thresholds?.closeEar).toBeCloseTo(0.21, 9);

    let events = 0;
    for (let i = next; i < next + 30 * 30; i++) if (p.process(tick(i), face(earAt(i)))) events++;
    expect(events).toBe(10); // one per 90 frames over 900 frames
  });

  it('calibration fails (retry) when the face is missing most of the time', () => {
    const p = new BlinkPipeline(EYE_A, EYE_B);
    p.startCalibration();
    for (let i = 0; i <= 301; i++) p.process(tick(i), i % 5 === 0 ? face(0.3) : null);
    const c = p.snapshot().calibration;
    expect(c.phase).toBe('failed');
    expect(c.phase === 'failed' && c.result.reason).toBe('tooFewSamples');
    expect(p.isCalibrated).toBe(false);
  });

  it('head turned beyond the limit gates samples: no events while turned', () => {
    const { p, next } = calibrated();
    let events = 0;
    for (let i = next; i < next + 900; i++) if (p.process(tick(i), face(earAt(i), 40))) events++;
    expect(events).toBe(0);
    expect(p.snapshot().faceStatus).toBe('headTurned');
    expect(p.snapshot().metrics.validMs).toBe(0);
  });

  it('head pose is gated relative to the calibration pose (camera below eye level)', () => {
    // Calibrated while looking at the screen with the camera below: pitch reads 19 deg.
    const { p, next } = calibrated(19);
    expect(p.snapshot().referencePose?.pitchDeg).toBeCloseTo(19, 9);
    let events = 0;
    for (let i = next; i < next + 900; i++) if (p.process(tick(i), face(earAt(i), 0, 19))) events++;
    expect(p.snapshot().faceStatus).toBe('ok');
    expect(events).toBe(10);
    // 19 + 25 = 44 deg: more than 20 deg from the reference, gated.
    p.process(tick(next + 900), face(0.3, 0, 44));
    expect(p.snapshot().faceStatus).toBe('headTurned');
  });

  it('restarting a running calibration forgets the poses seen before the restart', () => {
    const p = new BlinkPipeline(EYE_A, EYE_B);
    p.startCalibration();
    for (let i = 0; i < 290; i++) p.process(tick(i), face(0.3, 0, 40)); // looking down
    p.startCalibration();
    // After the restart: 100 frames without a face, then 201 with pitch 0. Without the
    // reset, the 290 earlier poses would be the majority and the reference would be 40.
    for (let i = 290; i <= 290 + (CALIBRATION_MS * 30) / 1000; i++) {
      p.process(tick(i), i < 390 ? null : face(0.3));
    }
    expect(p.snapshot().calibration.phase).toBe('done');
    expect(p.snapshot().referencePose?.pitchDeg).toBe(0);
  });

  it('no pose gating before calibration or during it', () => {
    const p = new BlinkPipeline(EYE_A, EYE_B);
    p.process(tick(0), face(0.3, 60, 40));
    expect(p.snapshot().faceStatus).toBe('ok');
    p.startCalibration();
    p.process(tick(1), face(0.3, 60, 40));
    expect(p.snapshot().faceStatus).toBe('ok');
  });

  it('a gap flag aborts a blink in progress', () => {
    const { p, next } = calibrated();
    // Start at an open frame, close for 3 frames, gap, reopen.
    const seq = [0.3, 0.3, 0.05, 0.05, 0.05, 0.3, 0.3];
    let events = 0;
    seq.forEach((ear, k) => {
      if (p.process(tick(next + 1000 + k, 30, k === 5), face(ear))) events++;
    });
    expect(events).toBe(0);
  });

  it('a new calibration can be cancelled, keeping the previous thresholds', () => {
    const { p } = calibrated();
    const before = p.snapshot().thresholds;
    p.startCalibration();
    expect(p.snapshot().calibration.phase).toBe('running');
    p.cancelCalibration();
    expect(p.snapshot().calibration.phase).toBe('done');
    expect(p.snapshot().thresholds).toEqual(before);
  });

  it('history keeps about 20 s and marks invalid samples as NaN', () => {
    const p = new BlinkPipeline(EYE_A, EYE_B);
    for (let i = 0; i < 30 * 30; i++) p.process(tick(i), i === 899 ? null : face(0.3));
    const h = p.history();
    expect((h.t[h.t.length - 1] as number) - (h.t[0] as number)).toBeLessThanOrEqual(20_000);
    expect(h.t.length).toBeGreaterThan(590);
    expect(h.ear[h.ear.length - 1]).toBeNaN();
    expect(p.snapshot().frameMs).toBeCloseTo(1000 / 30, 6);
  });

  it('resetSession keeps the calibration but clears metrics and history', () => {
    const { p, next } = calibrated();
    for (let i = next; i < next + 900; i++) p.process(tick(i), face(earAt(i)));
    p.resetSession();
    expect(p.isCalibrated).toBe(true);
    expect(p.history().t.length).toBe(0);
    expect(p.snapshot().metrics.blinkCount).toBe(0);
  });

  it('session timeline starts after the first calibration; recalibration is lost time', () => {
    const p = new BlinkPipeline(EYE_A, EYE_B);
    expect(p.snapshot().session).toEqual([]);
    const { p: q, next } = calibrated();
    let i = next;
    for (; i < next + 30 * 65; i++) q.process(tick(i), face(earAt(i)));
    q.startCalibration();
    for (const end = i + 30 * 12; i < end; i++) q.process(tick(i), face(earAt(i)));
    const [m1, m2] = q.snapshot().session;
    expect(m1?.usable).toBe(true);
    expect(m1?.blinkCount).toBeGreaterThan(0);
    expect((m2?.lostMs.calibrating ?? 0) / 1000).toBeCloseTo(10, 0);
    q.resetSession();
    expect(q.snapshot().session).toEqual([]);
  });

  it('runs the eye-closure indicator end to end: baseline, then 10 s trend points', () => {
    const { p, next } = calibrated();
    expect(p.snapshot().indicator.latest.long).toMatchObject({ ok: false, reason: 'noBaseline' });
    p.startBaseline();
    // 3 min of baseline plus 5 min of the same behaviour (one 200 ms blink every 3 s).
    const end = next + 30 * 60 * 8 + 60;
    for (let i = next; i < end; i++) p.process(tick(i), face(earAt(i)));
    const ind = p.snapshot().indicator;
    expect(ind.baseline.phase).toBe('done');
    expect(ind.trend.length).toBeGreaterThan(25);
    const last = ind.latest.long;
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.eci).toBeCloseTo(1, 1);
      expect(last.band).toBe('near');
    }
  });

  it('recalibrating clears the eye-closure baseline', () => {
    const { p, next } = calibrated();
    p.startBaseline();
    for (let i = next; i < next + 30 * 200; i++) p.process(tick(i), face(earAt(i)));
    expect(p.snapshot().indicator.baseline.phase).toBe('done');
    p.startCalibration();
    const from = next + 30 * 200;
    for (let i = from; i <= from + (CALIBRATION_MS * 30) / 1000; i++)
      p.process(tick(i), face(earAt(i)));
    expect(p.snapshot().indicator.baseline.phase).toBe('none');
  });

  it('face size uses the longer frame side, so portrait and landscape video agree', () => {
    const landscape = new BlinkPipeline(EYE_A, EYE_B);
    landscape.process(tick(0), { ...face(0.3), frameSize: Math.max(640, 480) });
    const portrait = new BlinkPipeline(EYE_A, EYE_B);
    portrait.process(tick(0), { ...face(0.3), frameSize: Math.max(480, 640) });
    const a = landscape.snapshot().eyeSpanFraction;
    expect(a).not.toBeNull();
    expect(portrait.snapshot().eyeSpanFraction).toBe(a);
  });
});
