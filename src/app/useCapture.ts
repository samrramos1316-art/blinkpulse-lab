/**
 * React binding for CaptureController with real browser dependencies.
 * The camera is released on Stop, on unmount, and on `pagehide` (page unload or
 * entering the back/forward cache).
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { openCamera } from '../capture/camera.ts';
import { CameraError } from '../capture/cameraErrors.ts';
import { startFrameLoop } from '../capture/frameLoop.ts';
import { CaptureController, type CaptureDeps, type CaptureSnapshot } from './captureController.ts';

function browserDeps(getVideo: () => HTMLVideoElement | null): CaptureDeps {
  const video = () => {
    const el = getVideo();
    if (!el) throw new CameraError('unknown', 'The video element is not mounted.');
    return el;
  };
  return {
    openCamera: () => openCamera(video()),
    startFrameLoop: (onFrame) => startFrameLoop(video(), onFrame),
    isHidden: () => document.visibilityState === 'hidden',
    onVisibilityChange: (callback) => {
      document.addEventListener('visibilitychange', callback);
      return () => {
        document.removeEventListener('visibilitychange', callback);
      };
    },
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (id) => {
      window.clearInterval(id as number);
    },
  };
}

export interface Capture {
  /** Callback ref for the preview <video> element. */
  videoRef: (el: HTMLVideoElement | null) => void;
  /** The mounted video element, for effects and event handlers (not for render). */
  getVideo: () => HTMLVideoElement | null;
  snapshot: CaptureSnapshot;
  start: () => void;
  stop: () => void;
  /** Per-frame callback (not throttled). Returns an unsubscribe function. */
  addFrameListener: CaptureController['addFrameListener'];
  /** performance.now() minus frame time for the current camera session, or NaN. */
  perfOffsetMs: () => number;
}

export function useCapture(): Capture {
  // Created once, so every function below is stable across renders. The element lives
  // in a closure: the controller reads it from event handlers and frame callbacks,
  // never during render.
  const [api] = useState(() => {
    let video: HTMLVideoElement | null = null;
    const getVideo = () => video;
    const controller = new CaptureController(browserDeps(getVideo));
    return {
      controller,
      getVideo,
      videoRef: (el: HTMLVideoElement | null) => {
        video = el;
      },
      start: () => {
        void controller.start();
      },
      stop: () => {
        controller.stop();
      },
      addFrameListener: controller.addFrameListener.bind(controller),
      perfOffsetMs: () => controller.perfOffsetMs,
    };
  });
  const { controller } = api;
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    const release = () => {
      controller.stop();
    };
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [controller]);

  return {
    videoRef: api.videoRef,
    getVideo: api.getVideo,
    snapshot,
    start: api.start,
    stop: api.stop,
    addFrameListener: api.addFrameListener,
    perfOffsetMs: api.perfOffsetMs,
  };
}
