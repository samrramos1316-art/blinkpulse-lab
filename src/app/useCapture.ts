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
}

export function useCapture(): Capture {
  // The element lives in a closure: the controller reads it from event handlers and frame
  // callbacks, never during render.
  const [{ controller, videoRef, getVideo }] = useState(() => {
    let video: HTMLVideoElement | null = null;
    const get = () => video;
    return {
      controller: new CaptureController(browserDeps(get)),
      videoRef: (el: HTMLVideoElement | null) => {
        video = el;
      },
      getVideo: get,
    };
  });
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
    videoRef,
    getVideo,
    snapshot,
    start: () => {
      void controller.start();
    },
    stop: () => {
      controller.stop();
    },
  };
}
