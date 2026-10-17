/**
 * Camera access (PROJECT_SPEC 5.1). Browser-only.
 * Never records, stores, or uploads frames; the stream only feeds a <video> element.
 */

import { CameraError, isOverconstrained } from './cameraErrors.ts';

/** Exactly the request in PROJECT_SPEC 5.1. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 60, min: 24 },
  },
  audio: false,
};

/**
 * Fallback when no camera can satisfy `frameRate.min` (OverconstrainedError):
 * same request without the minimum. The UI reports the actual frame rate.
 */
export const RELAXED_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 60 },
  },
  audio: false,
};

/** Actual settings reported by the track (`getSettings()`), not the request. */
export interface CameraSettings {
  width: number | null;
  height: number | null;
  frameRate: number | null;
}

export interface CameraHandle {
  settings: CameraSettings;
  /** True if the frame-rate minimum had to be dropped. */
  relaxed: boolean;
  /** Called once if the camera stops by itself (unplugged, permission revoked, ...). */
  onEnded(callback: () => void): void;
  /** Stop every track and detach the stream. Safe to call more than once. */
  stop(): void;
}

function readSettings(track: MediaStreamTrack | undefined): CameraSettings {
  const s = track?.getSettings() ?? {};
  return { width: s.width ?? null, height: s.height ?? null, frameRate: s.frameRate ?? null };
}

async function request(): Promise<{ stream: MediaStream; relaxed: boolean }> {
  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS),
      relaxed: false,
    };
  } catch (err) {
    if (!isOverconstrained(err)) throw err;
    return {
      stream: await navigator.mediaDevices.getUserMedia(RELAXED_CAMERA_CONSTRAINTS),
      relaxed: true,
    };
  }
}

/** Open the front camera and play it in `video`. Rejects with a getUserMedia error or CameraError. */
export async function openCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  if (!window.isSecureContext) {
    throw new CameraError('insecure', 'Camera access needs a secure context (https or localhost).');
  }
  // `mediaDevices` is missing in insecure contexts and very old browsers; the DOM typings say
  // it always exists, so read it through a looser type.
  const devices = (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
  if (typeof devices?.getUserMedia !== 'function') {
    throw new CameraError('unsupported', 'getUserMedia is not available.');
  }

  const { stream, relaxed } = await request();
  const tracks = stream.getTracks();
  const videoTrack = stream.getVideoTracks()[0];

  let stopped = false;
  let endedCallback: (() => void) | null = null;
  const handleEnded = () => {
    if (!stopped) endedCallback?.();
  };
  videoTrack?.addEventListener('ended', handleEnded);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    videoTrack?.removeEventListener('ended', handleEnded);
    for (const track of tracks) track.stop();
    video.pause();
    video.srcObject = null;
  };

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    stop();
    throw new CameraError('playback', 'The video element could not play the camera stream.');
  }

  return {
    settings: readSettings(videoTrack),
    relaxed,
    onEnded(callback) {
      endedCallback = callback;
    },
    stop,
  };
}
