import { describe, expect, it, vi } from 'vitest';
import type { CameraHandle } from '../capture/camera.ts';
import { CameraError } from '../capture/cameraErrors.ts';
import {
  CaptureController,
  PUBLISH_INTERVAL_MS,
  type CaptureDeps,
  type LoopFrameInput,
} from './captureController.ts';

const domError = (name: string) => Object.assign(new Error(name), { name });

/** Fake browser: a controllable camera, frame loop, visibility, and timer. */
function setup(open: () => Promise<CameraHandle> = () => Promise.resolve(fakeCamera())) {
  let onFrame: ((f: LoopFrameInput) => void) | null = null;
  let onVisibility: (() => void) | null = null;
  let timer: (() => void) | null = null;
  const state = { hidden: false, loopStopped: 0, timerCleared: 0, visibilityUnsubscribed: 0 };
  const openCamera = vi.fn(open);

  const deps: CaptureDeps = {
    openCamera,
    startFrameLoop: (cb) => {
      onFrame = cb;
      return {
        kind: 'videoFrameCallback',
        stop: () => {
          state.loopStopped++;
          onFrame = null;
        },
      };
    },
    isHidden: () => state.hidden,
    onVisibilityChange: (cb) => {
      onVisibility = cb;
      return () => {
        state.visibilityUnsubscribed++;
        onVisibility = null;
      };
    },
    setInterval: (cb, ms) => {
      expect(ms).toBe(PUBLISH_INTERVAL_MS);
      timer = cb;
      return 1;
    },
    clearInterval: () => {
      state.timerCleared++;
      timer = null;
    },
  };

  const controller = new CaptureController(deps);
  return {
    controller,
    openCamera,
    state,
    /** Deliver frames with captureTime + presentedFrames at the given times (ms). */
    frames(times: number[], startPresented = 1) {
      times.forEach((t, i) => {
        onFrame?.({
          nowMs: t + 5,
          meta: { captureTime: t, presentationTime: t + 3, presentedFrames: startPresented + i },
        });
      });
    },
    frame(input: LoopFrameInput) {
      onFrame?.(input);
    },
    setHidden(hidden: boolean) {
      state.hidden = hidden;
      onVisibility?.();
    },
    tickTimer() {
      timer?.();
    },
    hasLoop: () => onFrame !== null,
  };
}

function fakeCamera(overrides: Partial<CameraHandle> = {}) {
  let ended: (() => void) | null = null;
  const camera = {
    settings: { width: 640, height: 480, frameRate: 30 },
    relaxed: false,
    stopCalls: 0,
    onEnded(cb: () => void) {
      ended = cb;
    },
    stop() {
      camera.stopCalls++;
    },
    end() {
      ended?.();
    },
    ...overrides,
  };
  return camera;
}

const regularTimes = (n: number, dt = 1000 / 30, start = 10_000) =>
  Array.from({ length: n }, (_, i) => start + i * dt);

describe('CaptureController: start and stop', () => {
  it('starts, reports actual settings, and measures timing', async () => {
    const t = setup();
    await t.controller.start();
    const s = t.controller.getSnapshot();
    expect(s.status).toBe('running');
    expect(s.settings).toEqual({ width: 640, height: 480, frameRate: 30 });
    expect(s.loop).toBe('videoFrameCallback');

    t.frames(regularTimes(40));
    t.tickTimer();
    const after = t.controller.getSnapshot();
    expect(after.timestampSource).toBe('captureTime');
    expect(after.timing?.fps).toBeCloseTo(30, 6);
    expect(after.timing?.frames).toBe(40);
    expect(after.skippedCallbacks).toBe(0);
  });

  it('Stop releases the camera, the loop, the timer, and the visibility listener', async () => {
    const camera = fakeCamera();
    const t = setup(() => Promise.resolve(camera));
    await t.controller.start();
    t.controller.stop();
    expect(camera.stopCalls).toBe(1);
    expect(t.state.loopStopped).toBe(1);
    expect(t.state.timerCleared).toBe(1);
    expect(t.state.visibilityUnsubscribed).toBe(1);
    expect(t.controller.getSnapshot().status).toBe('idle');
    expect(t.hasLoop()).toBe(false);
  });

  it('Stop while the permission prompt is open releases the camera when it arrives', async () => {
    const camera = fakeCamera();
    let resolve: (c: CameraHandle) => void = () => undefined;
    const t = setup(() => new Promise((r) => (resolve = r)));
    const starting = t.controller.start();
    expect(t.controller.getSnapshot().status).toBe('starting');
    t.controller.stop();
    resolve(camera);
    await starting;
    expect(camera.stopCalls).toBe(1);
    expect(t.controller.getSnapshot().status).toBe('idle');
    expect(t.hasLoop()).toBe(false);
  });

  it('ignores a second start while running', async () => {
    const t = setup();
    await t.controller.start();
    await t.controller.start();
    expect(t.openCamera).toHaveBeenCalledTimes(1);
  });

  it('can start again after Stop, with fresh timing', async () => {
    const t = setup();
    await t.controller.start();
    t.frames(regularTimes(20));
    t.controller.stop();
    await t.controller.start();
    t.tickTimer();
    expect(t.controller.getSnapshot().timing?.frames).toBe(0);
  });

  it('publishes to subscribers only on status changes and timer ticks, not per frame', async () => {
    const t = setup();
    const listener = vi.fn();
    t.controller.subscribe(listener);
    await t.controller.start(); // starting + running
    expect(listener).toHaveBeenCalledTimes(2);
    t.frames(regularTimes(100));
    expect(listener).toHaveBeenCalledTimes(2);
    t.tickTimer();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('CaptureController: failures (PROJECT_SPEC Phase 2)', () => {
  it.each([
    ['permission denied', domError('NotAllowedError'), 'denied'],
    ['no camera', domError('NotFoundError'), 'notFound'],
    ['camera in use', domError('NotReadableError'), 'inUse'],
    ['insecure context', new CameraError('insecure', 'x'), 'insecure'],
    ['no getUserMedia', new CameraError('unsupported', 'x'), 'unsupported'],
  ] as const)('%s -> error state "%s"', async (_label, err, kind) => {
    const t = setup(() => Promise.reject(err));
    await t.controller.start();
    const s = t.controller.getSnapshot();
    expect(s.status).toBe('error');
    expect(s.errorKind).toBe(kind);
    expect(t.hasLoop()).toBe(false);
  });

  it('can retry after an error', async () => {
    let fail = true;
    const t = setup(() =>
      fail ? Promise.reject(domError('NotAllowedError')) : Promise.resolve(fakeCamera()),
    );
    await t.controller.start();
    fail = false;
    await t.controller.start();
    expect(t.controller.getSnapshot().status).toBe('running');
    expect(t.controller.getSnapshot().errorKind).toBeNull();
  });

  it('track ended: stops everything and reports "ended", keeping the last timing', async () => {
    const camera = fakeCamera();
    const t = setup(() => Promise.resolve(camera));
    await t.controller.start();
    t.frames(regularTimes(30));
    t.tickTimer();
    camera.end();
    const s = t.controller.getSnapshot();
    expect(s.status).toBe('ended');
    expect(s.timing?.frames).toBe(30);
    expect(camera.stopCalls).toBe(1);
    expect(t.state.loopStopped).toBe(1);
    expect(t.state.timerCleared).toBe(1);
  });
});

describe('CaptureController: hidden tab', () => {
  it('pauses analysis while hidden and marks the pause as a gap', async () => {
    const t = setup();
    await t.controller.start();
    t.frames(regularTimes(30));

    t.setHidden(true);
    expect(t.controller.getSnapshot().hidden).toBe(true);
    t.frames(regularTimes(10, 1000 / 30, 20_000), 31); // ignored while hidden

    t.setHidden(false);
    t.frames(regularTimes(10, 1000 / 30, 40_000), 500);
    t.tickTimer();

    const s = t.controller.getSnapshot();
    expect(s.hidden).toBe(false);
    expect(s.wasHidden).toBe(true);
    expect(s.timing?.frames).toBe(40);
    expect(s.timing?.gaps).toBe(1);
    expect(s.skippedCallbacks).toBe(0);
    expect(t.controller.gapIntervals()[0]?.reason).toBe('hidden');
  });

  it('starts in the hidden state if the page is already hidden', async () => {
    const t = setup();
    t.state.hidden = true;
    await t.controller.start();
    expect(t.controller.getSnapshot().hidden).toBe(true);
    t.frames(regularTimes(5));
    t.tickTimer();
    expect(t.controller.getSnapshot().timing?.frames).toBe(0);
  });
});

describe('CaptureController: timestamps', () => {
  it('counts skipped callbacks from presentedFrames', async () => {
    const t = setup();
    await t.controller.start();
    t.frame({ nowMs: 1005, meta: { captureTime: 1000, presentedFrames: 1 } });
    t.frame({ nowMs: 1038, meta: { captureTime: 1033, presentedFrames: 2 } });
    t.frame({ nowMs: 1138, meta: { captureTime: 1133, presentedFrames: 5 } });
    t.tickTimer();
    expect(t.controller.getSnapshot().skippedCallbacks).toBe(2);
    expect(t.controller.gapIntervals()).toEqual([{ startMs: 33, endMs: 133, reason: 'dropped' }]);
  });

  it('switches source when captureTime disappears, marking a gap', async () => {
    const t = setup();
    await t.controller.start();
    for (const time of regularTimes(10)) {
      t.frame({ nowMs: time + 5, meta: { captureTime: time, presentationTime: time + 3 } });
    }
    t.frame({ nowMs: 20_000, meta: { presentationTime: 19_990 } });
    t.tickTimer();
    const s = t.controller.getSnapshot();
    expect(s.timestampSource).toBe('presentationTime');
    expect(s.timing?.frames).toBe(11);
    expect(t.controller.gapIntervals().map((g) => g.reason)).toEqual(['sourceChange']);
  });

  it('uses performance.now() timestamps in the requestAnimationFrame fallback', async () => {
    const t = setup();
    await t.controller.start();
    for (const time of regularTimes(10)) t.frame({ nowMs: time, meta: null });
    t.tickTimer();
    expect(t.controller.getSnapshot().timestampSource).toBe('performanceNow');
  });

  it('passes each accepted frame tick to frame listeners', async () => {
    const t = setup();
    const ticks: number[] = [];
    t.controller.addFrameListener((tick) => ticks.push(tick.tMs));
    await t.controller.start();
    t.frames([1000, 1033, 1033, 1066]);
    expect(ticks).toEqual([0, 33, 66]);
  });
  it('reports the offset from frame time to performance.now(), per camera session', async () => {
    const t = setup();
    await t.controller.start();
    expect(t.controller.perfOffsetMs).toBeNaN();
    t.frames([5000, 5033, 5066]);
    // captureTime is on the performance.now() clock: tMs 0 is performance.now() 5000.
    expect(t.controller.perfOffsetMs).toBe(5000);
    t.controller.stop();
    expect(t.controller.perfOffsetMs).toBe(5000); // kept for exports after Stop
    await t.controller.start();
    expect(t.controller.perfOffsetMs).toBeNaN();
    t.frames([90_000, 90_033]);
    expect(t.controller.perfOffsetMs).toBe(90_000);
  });

  it('takes the offset from the callback time when only mediaTime is available', async () => {
    const t = setup();
    await t.controller.start();
    t.frame({ nowMs: 7010, meta: { mediaTime: 2 } });
    t.frame({ nowMs: 7043, meta: { mediaTime: 2.033 } });
    expect(t.controller.perfOffsetMs).toBeCloseTo(7010, 6);
  });
});
