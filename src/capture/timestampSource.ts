/**
 * Choosing which frame timestamp to use (PROJECT_SPEC 5.1, Phase 2). Pure.
 *
 * With requestVideoFrameCallback the order of preference is captureTime, then
 * presentationTime, then mediaTime. Without it the frame loop falls back to
 * requestAnimationFrame + performance.now().
 *
 * captureTime is optional in the spec (WICG video-rvfc), and the spec does not
 * state its time base. It is used only if it lies within CAPTURE_TIME_MAX_SKEW_MS
 * of the callback's `now`, so a value on an unexpected clock is never mixed in.
 * mediaTime may be 0 for live streams, so it is used only when positive.
 */

export type TimestampSource = 'captureTime' | 'presentationTime' | 'mediaTime' | 'performanceNow';

/** The fields of VideoFrameCallbackMetadata that are used here. */
export interface FrameMetadataLike {
  captureTime?: number;
  presentationTime?: number;
  /** Seconds. */
  mediaTime?: number;
}

/** captureTime further than this from the callback time is treated as a different clock. */
export const CAPTURE_TIME_MAX_SKEW_MS = 1000;

const isFiniteNumber = (v: number | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function usable(source: TimestampSource, nowMs: number, meta: FrameMetadataLike | null): boolean {
  switch (source) {
    case 'captureTime':
      return (
        isFiniteNumber(meta?.captureTime) &&
        Math.abs(meta.captureTime - nowMs) <= CAPTURE_TIME_MAX_SKEW_MS
      );
    case 'presentationTime':
      return isFiniteNumber(meta?.presentationTime);
    case 'mediaTime':
      return isFiniteNumber(meta?.mediaTime) && meta.mediaTime > 0;
    case 'performanceNow':
      return Number.isFinite(nowMs);
  }
}

const PREFERENCE: readonly TimestampSource[] = [
  'captureTime',
  'presentationTime',
  'mediaTime',
  'performanceNow',
];

/** Best available source for this frame. `meta` is null in the requestAnimationFrame fallback. */
export function chooseTimestampSource(
  nowMs: number,
  meta: FrameMetadataLike | null,
): TimestampSource {
  return PREFERENCE.find((s) => usable(s, nowMs, meta)) ?? 'performanceNow';
}

/** Timestamp in ms from the given source, or null if that source is not usable for this frame. */
export function readTimestamp(
  source: TimestampSource,
  nowMs: number,
  meta: FrameMetadataLike | null,
): number | null {
  if (!usable(source, nowMs, meta)) return null;
  switch (source) {
    case 'captureTime':
      return meta?.captureTime ?? null;
    case 'presentationTime':
      return meta?.presentationTime ?? null;
    case 'mediaTime':
      return meta?.mediaTime === undefined ? null : meta.mediaTime * 1000;
    case 'performanceNow':
      return nowMs;
  }
}
