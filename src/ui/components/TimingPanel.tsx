import type { BlinkSnapshot } from '../../app/blinkPipeline.ts';
import type { CaptureSnapshot } from '../../app/captureController.ts';
import type { CameraLockResult, LockState } from '../../capture/cameraLock.ts';
import type { TimestampSource } from '../../capture/timestampSource.ts';

const LOCK_TEXT: Record<LockState, string> = {
  locked: 'locked',
  unsupported: 'automatic (camera has no control)',
  failed: 'automatic (lock failed)',
};

const SOURCE_LABEL: Record<TimestampSource, string> = {
  captureTime: 'capture time',
  presentationTime: 'presentation time',
  mediaTime: 'media time',
  performanceNow: 'performance.now()',
};

const fmt = (v: number | null | undefined, digits: number) =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(digits);

/** Developer timing readout (PROJECT_SPEC Phase 2 "dev overlay"). Updates at <= 4 Hz. */
export interface TrackingInfo {
  blink: BlinkSnapshot;
  inferenceMs: number | null;
  delegate: string | null;
  /** Per-frame processing excluding face tracking (ms). */
  processingMs?: { median: number; p95: number } | null;
  cameraLock?: CameraLockResult | null;
}

export function TimingPanel({
  snapshot,
  tracking,
}: {
  snapshot: CaptureSnapshot;
  tracking?: TrackingInfo;
}) {
  const { timing, settings } = snapshot;
  const rows: [string, string][] = [
    ['Measured rate', `${fmt(timing?.fps, 1)} fps`],
    ['Frame interval', `${fmt(timing?.medianDtMs, 1)} ms median`],
    ['Jitter (std)', `${fmt(timing?.jitterMs, 2)} ms`],
    [
      'Dropped frames',
      snapshot.loop === 'videoFrameCallback' ? fmt(snapshot.skippedCallbacks, 0) : 'not measurable',
    ],
    ['Irregular (> 1.5x median)', fmt(timing?.irregularIntervals, 0)],
    ['Gaps (data breaks)', fmt(timing?.gaps, 0)],
    [
      'Resolution',
      settings?.width && settings.height ? `${settings.width} x ${settings.height}` : '-',
    ],
    ['Camera reports', `${fmt(settings?.frameRate, 1)} fps`],
    [
      'Timestamps',
      snapshot.timestampSource
        ? `${SOURCE_LABEL[snapshot.timestampSource]} (${
            snapshot.loop === 'videoFrameCallback' ? 'video frame callback' : 'animation frame'
          })`
        : '-',
    ],
  ];
  if (tracking) {
    const { blink } = tracking;
    const pose = blink.pose;
    rows.push(
      [
        'Face tracking',
        `${fmt(tracking.inferenceMs, 1)} ms/frame${tracking.delegate ? ` (${tracking.delegate})` : ''}`,
      ],
      [
        'Face found',
        blink.faceFoundFraction === null ? '-' : `${fmt(blink.faceFoundFraction * 100, 0)}%`,
      ],
      [
        'Head yaw / pitch / roll',
        pose
          ? `${fmt(pose.yawDeg, 0)} / ${fmt(pose.pitchDeg, 0)} / ${fmt(pose.rollDeg, 0)} deg`
          : '-',
      ],
      ['EAR (A / B)', `${fmt(blink.eyeA, 3)} / ${fmt(blink.eyeB, 3)}`],
      [
        'Processing (excl. face tracking)',
        `${fmt(tracking.processingMs?.median, 2)} median, ${fmt(tracking.processingMs?.p95, 2)} p95 ms/frame`,
      ],
      [
        'Exposure / white balance',
        tracking.cameraLock
          ? `${LOCK_TEXT[tracking.cameraLock.exposure]} / ${LOCK_TEXT[tracking.cameraLock.whiteBalance]}`
          : 'automatic (locks after 3 s)',
      ],
    );
  }

  return (
    <div className="timing" aria-label="Frame timing">
      <dl className="timing__list">
        {rows.map(([label, value]) => (
          <div className="timing__row" key={label}>
            <dt>{label}</dt>
            <dd className="tabular">{value}</dd>
          </div>
        ))}
      </dl>
      {snapshot.relaxedConstraints ? (
        <p className="timing__note">
          The camera could not guarantee 24 fps, so that minimum was dropped.
        </p>
      ) : null}
    </div>
  );
}
