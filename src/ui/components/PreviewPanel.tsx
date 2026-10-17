import type { CaptureSnapshot } from '../../app/captureController.ts';
import { captureStatusText } from '../captureStatus.ts';
import { AlertIcon, InfoIcon } from '../icons/Icons.tsx';
import { TimingPanel } from './TimingPanel.tsx';

interface PreviewPanelProps {
  videoRef: (el: HTMLVideoElement | null) => void;
  snapshot: CaptureSnapshot;
  showTiming: boolean;
  onToggleTiming: () => void;
}

export function PreviewPanel({
  videoRef,
  snapshot,
  showTiming,
  onToggleTiming,
}: PreviewPanelProps) {
  const live = snapshot.status === 'running';
  const hasTiming = snapshot.timing !== null || live;
  const status = captureStatusText(snapshot);
  const StatusIcon = status.tone === 'neutral' ? InfoIcon : AlertIcon;

  return (
    <section className="card preview" aria-labelledby="preview-title">
      <h2 id="preview-title" className="visually-hidden">
        Camera preview
      </h2>
      <div className="preview__frame" data-live={live}>
        {/* Mirrored by CSS only; the data is never flipped (CLAUDE.md). */}
        <video
          ref={videoRef}
          className="preview__video"
          muted
          playsInline
          aria-label="Live camera preview, mirrored"
          hidden={!live}
        />
        <svg className="preview__guide" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
          <ellipse cx="100" cy="72" rx="38" ry="50" />
        </svg>
        {live ? null : <p className="preview__hint">Your camera preview will appear here.</p>}
      </div>

      <div className="preview__bar">
        <p className="preview__status" data-tone={status.tone} role="status">
          <StatusIcon size={18} />
          <span>{status.text}</span>
        </p>
        {hasTiming ? (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            aria-pressed={showTiming}
            aria-controls="timing-panel"
            onClick={onToggleTiming}
          >
            Timing details
          </button>
        ) : null}
      </div>

      {hasTiming ? (
        <div id="timing-panel" hidden={!showTiming}>
          {showTiming ? <TimingPanel snapshot={snapshot} /> : null}
        </div>
      ) : null}
    </section>
  );
}
