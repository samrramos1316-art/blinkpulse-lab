import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CaptureSnapshot } from '../../app/captureController.ts';
import { captureStatusText, type StatusText } from '../captureStatus.ts';
import { AlertIcon, InfoIcon } from '../icons/Icons.tsx';
import { TimingPanel, type TrackingInfo } from './TimingPanel.tsx';

interface PreviewPanelProps {
  videoRef: (el: HTMLVideoElement | null) => void;
  snapshot: CaptureSnapshot;
  showTiming: boolean;
  onToggleTiming: () => void;
  /** Status line override (face tracking, calibration); defaults to the camera status. */
  status?: StatusText;
  tracking?: TrackingInfo;
  /** Drawn over the video (face overlay). */
  overlay?: ReactNode;
}

/**
 * Wraps the capture's video ref and tracks the video's width/height ratio, which
 * changes when a phone sends portrait video or rotates.
 */
function useVideoAspect(onVideo: (el: HTMLVideoElement | null) => void) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const ref = useCallback(
    (node: HTMLVideoElement | null) => {
      onVideo(node);
      setEl(node);
    },
    [onVideo],
  );
  useEffect(() => {
    if (!el) return;
    const update = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) setRatio(el.videoWidth / el.videoHeight);
    };
    update();
    el.addEventListener('loadedmetadata', update);
    el.addEventListener('resize', update);
    return () => {
      el.removeEventListener('loadedmetadata', update);
      el.removeEventListener('resize', update);
    };
  }, [el]);
  return { attach: ref, ratio };
}

export function PreviewPanel({
  videoRef,
  snapshot,
  showTiming,
  onToggleTiming,
  status: statusOverride,
  tracking,
  overlay,
}: PreviewPanelProps) {
  const live = snapshot.status === 'running';
  const hasTiming = snapshot.timing !== null || live;
  const status = statusOverride ?? captureStatusText(snapshot);
  const StatusIcon = status.tone === 'neutral' ? InfoIcon : AlertIcon;
  const { attach, ratio } = useVideoAspect(videoRef);

  return (
    <section className="card preview" aria-labelledby="preview-title">
      <h2 id="preview-title" className="visually-hidden">
        Camera preview
      </h2>
      <div
        className="preview__frame"
        data-live={live}
        // The frame follows the video's shape (phones often send portrait video).
        style={live && ratio ? { aspectRatio: String(ratio) } : undefined}
      >
        {/* Mirrored by CSS only; the data is never flipped (CLAUDE.md). */}
        <video
          ref={attach}
          className="preview__video"
          muted
          playsInline
          aria-label="Live camera preview, mirrored"
          hidden={!live}
        />
        {live ? overlay : null}
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
          {showTiming ? (
            <TimingPanel snapshot={snapshot} {...(tracking ? { tracking } : {})} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
