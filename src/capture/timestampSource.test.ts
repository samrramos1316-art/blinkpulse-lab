import { describe, expect, it } from 'vitest';
import {
  CAPTURE_TIME_MAX_SKEW_MS,
  chooseTimestampSource,
  readTimestamp,
} from './timestampSource.ts';

const NOW = 50_000;

describe('chooseTimestampSource', () => {
  it('prefers captureTime when present and on the same clock', () => {
    const meta = { captureTime: NOW - 40, presentationTime: NOW - 5, mediaTime: 1.2 };
    expect(chooseTimestampSource(NOW, meta)).toBe('captureTime');
  });

  it('skips captureTime that is far from now (different clock)', () => {
    const meta = { captureTime: NOW - CAPTURE_TIME_MAX_SKEW_MS - 1, presentationTime: NOW - 5 };
    expect(chooseTimestampSource(NOW, meta)).toBe('presentationTime');
  });

  it('falls back to presentationTime, then a positive mediaTime', () => {
    expect(chooseTimestampSource(NOW, { presentationTime: NOW - 5 })).toBe('presentationTime');
    expect(chooseTimestampSource(NOW, { mediaTime: 3.5 })).toBe('mediaTime');
    expect(chooseTimestampSource(NOW, { mediaTime: 0 })).toBe('performanceNow');
  });

  it('uses performance.now() without metadata (requestAnimationFrame fallback)', () => {
    expect(chooseTimestampSource(NOW, null)).toBe('performanceNow');
  });
});

describe('readTimestamp', () => {
  it('returns milliseconds from the chosen source', () => {
    const meta = { captureTime: NOW - 40, presentationTime: NOW - 5, mediaTime: 1.25 };
    expect(readTimestamp('captureTime', NOW, meta)).toBe(NOW - 40);
    expect(readTimestamp('presentationTime', NOW, meta)).toBe(NOW - 5);
    expect(readTimestamp('mediaTime', NOW, meta)).toBe(1250);
    expect(readTimestamp('performanceNow', NOW, null)).toBe(NOW);
  });

  it('returns null when the chosen source is missing for this frame', () => {
    expect(readTimestamp('captureTime', NOW, { presentationTime: NOW })).toBeNull();
    expect(readTimestamp('presentationTime', NOW, null)).toBeNull();
  });
});
