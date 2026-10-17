/**
 * Camera failure kinds and how getUserMedia errors map to them. Pure.
 * Error names from MDN "MediaDevices: getUserMedia()" (Exceptions), read 2026-10-16.
 */

export type CameraErrorKind =
  | 'insecure' // not a secure context: navigator.mediaDevices is undefined
  | 'unsupported' // browser has no getUserMedia
  | 'denied' // NotAllowedError / SecurityError
  | 'notFound' // NotFoundError
  | 'inUse' // NotReadableError: hardware/OS error, often another app holds the camera
  | 'overconstrained' // OverconstrainedError, even after relaxing the frame-rate minimum
  | 'aborted' // AbortError
  | 'playback' // stream opened but the <video> element would not play
  | 'unknown';

function errorName(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = err.name;
    if (typeof name === 'string') return name;
  }
  return '';
}

export function isOverconstrained(err: unknown): boolean {
  return errorName(err) === 'OverconstrainedError';
}

export function classifyCameraError(err: unknown): CameraErrorKind {
  switch (errorName(err)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
      return 'notFound';
    case 'NotReadableError':
      return 'inUse';
    case 'OverconstrainedError':
      return 'overconstrained';
    case 'AbortError':
      return 'aborted';
    default:
      return 'unknown';
  }
}

/** Thrown by the camera layer for failures that are not getUserMedia rejections. */
export class CameraError extends Error {
  readonly kind: CameraErrorKind;

  constructor(kind: CameraErrorKind, message: string) {
    super(message);
    this.name = 'CameraError';
    this.kind = kind;
  }
}

export function toCameraErrorKind(err: unknown): CameraErrorKind {
  return err instanceof CameraError ? err.kind : classifyCameraError(err);
}
