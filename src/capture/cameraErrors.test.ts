import { describe, expect, it } from 'vitest';
import { CameraError, classifyCameraError, toCameraErrorKind } from './cameraErrors.ts';

const domError = (name: string) => Object.assign(new Error(name), { name });

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'notFound'],
    ['NotReadableError', 'inUse'],
    ['OverconstrainedError', 'overconstrained'],
    ['AbortError', 'aborted'],
    ['TypeError', 'unknown'],
  ] as const)('%s -> %s', (name, kind) => {
    expect(classifyCameraError(domError(name))).toBe(kind);
  });

  it('handles values that are not errors', () => {
    expect(classifyCameraError(undefined)).toBe('unknown');
    expect(classifyCameraError('NotAllowedError')).toBe('unknown');
    expect(classifyCameraError({ name: 42 })).toBe('unknown');
  });

  it('keeps the kind of a CameraError', () => {
    expect(toCameraErrorKind(new CameraError('insecure', 'x'))).toBe('insecure');
    expect(toCameraErrorKind(domError('NotFoundError'))).toBe('notFound');
  });
});
