import type { CaptureSnapshot } from '../../app/captureController.ts';
import type { TimestampSource } from '../../capture/timestampSource.ts';

const SOURCE_LABEL: Record<TimestampSource, string> = {
  captureTime: 'capture time',
  presentationTime: 'presentation time',
  mediaTime: 'media time',
  performanceNow: 'performance.now()',
};

const fmt = (v: number | null | undefined, digits: number) =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(digits);

/** Developer timing readout (PROJECT_SPEC Phase 2 "dev overlay"). Updates at <= 4 Hz. */
export function TimingPanel({ snapshot }: { snapshot: CaptureSnapshot }) {
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
