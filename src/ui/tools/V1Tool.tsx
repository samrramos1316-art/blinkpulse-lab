import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BlinkPipeline } from '../../app/blinkPipeline.ts';
import type { BlinkEvent } from '../../blink/blinkDetector.ts';
import type { TimedEvent } from '../../blink/eventMatching.ts';
import {
  detectionsToCsv,
  formatV1Score,
  frameIndexAt,
  framesToCsv,
  labelsToCsv,
  parseLabelsCsv,
  scoreV1,
  seekTimeForFrame,
  type FrameRow,
  type V1Detections,
} from '../../blink/v1.ts';
import { FrameClock } from '../../capture/frameClock.ts';
import { hasVideoFrameCallback } from '../../capture/frameLoop.ts';
import { createLandmarker, type Landmarker } from '../../vision/faceLandmarker.ts';
import { headPoseFromMatrix } from '../../vision/headPose.ts';
import { EYE_A, EYE_B, toPixels } from '../../vision/landmarks.ts';
import { Footer } from '../components/Footer.tsx';

const CONDITIONS = ['baseline', 'glasses', 'lower-light', 'head-turned'] as const;
type Condition = (typeof CONDITIONS)[number];
const RATES = [0.25, 0.5, 1] as const;

type Phase = 'idle' | 'loading' | 'analysing' | 'done' | 'error';

interface Summary {
  frames: number;
  durationS: number;
  medianFps: number;
  dropped: number;
  calibrationEndMs: number | null;
  events: number;
  faceFound: number;
}

/** Analysis state that changes every frame; kept out of React state (CLAUDE.md). */
class V1Runtime {
  landmarker: Landmarker | null = null;
  rows: FrameRow[] = [];
  events: BlinkEvent[] = [];
  frameTimes: number[] = [];
  calibrationEndMs: number | null = null;
  dropped = 0;
  calibrationFailed = false;
  private pipeline = new BlinkPipeline(EYE_A, EYE_B);
  private clock = new FrameClock();
  private firstMediaMs = NaN;
  private lastPresented: number | null = null;
  private handle = 0;
  private video: HTMLVideoElement | null = null;

  setLandmarker(lm: Landmarker): void {
    this.landmarker = lm;
  }

  reset(): void {
    this.cancel();
    this.rows = [];
    this.events = [];
    this.frameTimes = [];
    this.calibrationEndMs = null;
    this.dropped = 0;
    this.calibrationFailed = false;
    this.pipeline = new BlinkPipeline(EYE_A, EYE_B);
    this.pipeline.startCalibration();
    this.clock = new FrameClock();
    this.firstMediaMs = NaN;
    this.lastPresented = null;
  }

  /** Process frames from `video` until it ends; `onDone` is called once at the end. */
  run(video: HTMLVideoElement, onProgress: () => void, onDone: () => void): void {
    this.video = video;
    const lm = this.landmarker;
    if (!lm) return;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onDone();
    };
    const step = (_now: number, meta: VideoFrameCallbackMetadata) => {
      const mediaMs = meta.mediaTime * 1000;
      if (this.lastPresented !== null && meta.presentedFrames > this.lastPresented + 1) {
        this.dropped += meta.presentedFrames - this.lastPresented - 1;
        this.clock.markGap('dropped');
      }
      this.lastPresented = meta.presentedFrames;
      const tick = this.clock.push(mediaMs);
      if (tick) {
        if (Number.isNaN(this.firstMediaMs)) this.firstMediaMs = mediaMs;
        const frame = lm.detect(video, mediaMs);
        const w = meta.width;
        const h = meta.height;
        const event = this.pipeline.process(
          tick,
          frame.landmarks
            ? {
                points: toPixels(frame.landmarks, w, h),
                pose: frame.matrix ? headPoseFromMatrix(frame.matrix) : null,
                frameWidth: w,
              }
            : null,
        );
        const toMedia = (t: number) => t + this.firstMediaMs;
        if (event) {
          this.events.push({
            ...event,
            startMs: toMedia(event.startMs),
            endMs: toMedia(event.endMs),
          });
        }
        const cal = this.pipeline.calibrationState;
        if (this.calibrationEndMs === null && cal.phase === 'done') this.calibrationEndMs = mediaMs;
        if (cal.phase === 'failed') this.calibrationFailed = true;
        const f = this.pipeline.lastFrame;
        this.rows.push({
          tMs: mediaMs,
          ear: f.ear,
          earA: f.eyeA,
          earB: f.eyeB,
          valid: f.status === 'ok' && Number.isFinite(f.ear),
          face: f.status !== 'noFace',
        });
        this.frameTimes.push(mediaMs);
        onProgress();
      }
      if (video.ended || this.calibrationFailed) {
        finish();
        return;
      }
      this.handle = video.requestVideoFrameCallback(step);
    };
    this.handle = video.requestVideoFrameCallback(step);
    video.addEventListener('ended', finish, { once: true });
  }

  cancel(): void {
    if (this.video) this.video.cancelVideoFrameCallback(this.handle);
    this.video = null;
  }

  detections(): V1Detections {
    return {
      calibrationEndMs: this.calibrationEndMs ?? Infinity,
      events: this.events.map((e) => ({
        startMs: e.startMs,
        endMs: e.endMs,
        kind: e.kind,
        lowConfidence: e.lowConfidence,
        minEar: e.minEar,
      })),
    };
  }

  summary(): Summary {
    const n = this.frameTimes.length;
    const dts = this.frameTimes.slice(1).map((t, i) => t - (this.frameTimes[i] as number));
    dts.sort((a, b) => a - b);
    const med = dts.length ? (dts[dts.length >> 1] as number) : NaN;
    return {
      frames: n,
      durationS:
        n > 1 ? ((this.frameTimes[n - 1] as number) - (this.frameTimes[0] as number)) / 1000 : 0,
      medianFps: 1000 / med,
      dropped: this.dropped,
      calibrationEndMs: this.calibrationEndMs,
      events: this.events.length,
      faceFound: n ? this.rows.filter((r) => r.face).length / n : 0,
    };
  }

  close(): void {
    this.cancel();
    this.landmarker?.close();
    this.landmarker = null;
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const secs = (ms: number) => (ms / 1000).toFixed(3);

/**
 * Validation V1 tool (`#v1`, PROJECT_SPEC 7.2): run the blink detector on a local
 * video file, hand-label blinks frame by frame, and score. The video is played
 * from a local object URL; nothing is uploaded, and exports hold numbers only.
 */
export function V1Tool() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rt] = useState(() => new V1Runtime());
  const [src, setSrc] = useState<string | null>(null);
  const [condition, setCondition] = useState<Condition>('baseline');
  const [rate, setRate] = useState<number>(0.5);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [labels, setLabels] = useState<TimedEvent[]>([]);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [frame, setFrame] = useState(-1);
  const [showScore, setShowScore] = useState(false);
  const [message, setMessage] = useState('');

  // Release the object URL and the model when they are replaced or the page closes.
  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src);
    },
    [src],
  );
  useEffect(
    () => () => {
      rt.close();
    },
    [rt],
  );

  const ready = phase === 'done' && rt.frameTimes.length > 0;
  const frameTime = (i: number) => rt.frameTimes[i] ?? NaN;
  const syncFrame = () => {
    const v = videoRef.current;
    if (v && ready) setFrame(frameIndexAt(rt.frameTimes, v.currentTime * 1000));
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    rt.reset();
    setSrc(URL.createObjectURL(file));
    setPhase('idle');
    setSummary(null);
    setLabels([]);
    setPendingStart(null);
    setShowScore(false);
    setError(null);
    setFrame(-1);
  };

  const analyse = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!hasVideoFrameCallback(video)) {
      setPhase('error');
      setError(
        'This browser has no requestVideoFrameCallback, so exact frame times are not available. Use Chrome or Edge.',
      );
      return;
    }
    setError(null);
    setShowScore(false);
    try {
      if (!rt.landmarker) {
        setPhase('loading');
        rt.setLandmarker(await createLandmarker());
      }
      rt.reset();
      video.pause();
      video.currentTime = 0;
      await new Promise((resolve) => {
        video.addEventListener('seeked', resolve, { once: true });
      });
      video.muted = true;
      video.playbackRate = rate;
      setPhase('analysing');
      let last = 0;
      rt.run(
        video,
        () => {
          const now = performance.now();
          if (now - last > 250) {
            last = now;
            setProgress(video.duration ? video.currentTime / video.duration : 0);
          }
        },
        () => {
          rt.cancel();
          video.pause();
          setSummary(rt.summary());
          if (rt.calibrationFailed) {
            setPhase('error');
            setError(
              'Calibration failed: the face was not in view for most of the first 10 seconds. Use a recording that starts with the face in view.',
            );
          } else {
            setPhase('done');
          }
          setProgress(1);
        },
      );
      await video.play();
    } catch (err) {
      console.error(err);
      setPhase('error');
      setError('The video could not be analysed. Try another file (H.264 MP4 or WebM).');
    }
  };

  const goToFrame = (i: number) => {
    const v = videoRef.current;
    if (!v || !ready) return;
    v.pause();
    const k = Math.min(Math.max(i, 0), rt.frameTimes.length - 1);
    v.currentTime = seekTimeForFrame(rt.frameTimes, k) / 1000;
    setFrame(k);
  };
  const stepSeconds = (s: number) => {
    const t = frameTime(frame) + s * 1000;
    goToFrame(frameIndexAt(rt.frameTimes, t));
  };
  const markStart = () => {
    if (frame < 0) return;
    setPendingStart(frameTime(frame));
    setMessage(`Start marked at ${secs(frameTime(frame))} s.`);
  };
  const markEnd = () => {
    if (frame < 0 || pendingStart === null) return;
    const end = frameTime(frame);
    if (!(end > pendingStart)) {
      setMessage('The end must be after the start. Step forward, then mark the end.');
      return;
    }
    setLabels((ls) =>
      [...ls, { startMs: pendingStart, endMs: end }].sort((a, b) => a.startMs - b.startMs),
    );
    setPendingStart(null);
    setMessage(`Blink labelled: ${secs(pendingStart)} to ${secs(end)} s.`);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const handled = (() => {
      switch (e.key) {
        case 'ArrowRight':
          if (e.shiftKey) stepSeconds(1);
          else goToFrame(frame + 1);
          return true;
        case 'ArrowLeft':
          if (e.shiftKey) stepSeconds(-1);
          else goToFrame(frame - 1);
          return true;
        case 's':
        case 'S':
          markStart();
          return true;
        case 'e':
        case 'E':
          markEnd();
          return true;
        default:
          return false;
      }
    })();
    if (handled) e.preventDefault();
  };

  const importLabels = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLabels(parseLabelsCsv(await file.text()));
      setMessage('Labels imported.');
    } catch (err) {
      setMessage(`Could not read the labels: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const score = ready && showScore ? scoreV1(labels, rt.detections()) : null;
  const prefix = `v1-${condition}`;

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <a className="btn-link" href="#">
              Back to the app
            </a>
            <h1 className="brand__name">Validation V1: blink detection</h1>
          </div>
        </div>
      </header>
      <main id="main" className="app-main tool">
        <section className="card tool__view" aria-labelledby="v1-video">
          <h2 id="v1-video" className="section-title">
            1. Video
          </h2>
          <p className="tool__note">
            Record about 2 minutes of reading or typing at the screen, frontal, at 30 fps or more,
            and keep the file on this device. The first 10 seconds are used for calibration, so
            start with your face in view. The file is played locally and never uploaded.
          </p>
          <div className="tool__row">
            <label className="tool__field">
              Video file
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                }}
              />
            </label>
            <label className="tool__field">
              Condition
              <select
                value={condition}
                onChange={(e) => {
                  setCondition(e.target.value as Condition);
                }}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="tool__field">
              Analysis speed
              <select
                value={rate}
                onChange={(e) => {
                  setRate(Number(e.target.value));
                }}
              >
                {RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}x
                  </option>
                ))}
              </select>
            </label>
          </div>
          {src ? (
            <video
              ref={videoRef}
              className="tool__video tool__video--file"
              src={src}
              controls={phase !== 'analysing'}
              muted
              playsInline
              onSeeked={syncFrame}
              onPause={syncFrame}
            />
          ) : null}
          <div className="tool__row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!src || phase === 'analysing' || phase === 'loading'}
              onClick={() => {
                void analyse();
              }}
            >
              {phase === 'done' ? 'Analyse again' : 'Analyse'}
            </button>
            <p className="tool__note" role="status">
              {phase === 'loading'
                ? 'Loading face tracking...'
                : phase === 'analysing'
                  ? `Analysing: ${(progress * 100).toFixed(0)}%`
                  : (error ?? '')}
            </p>
          </div>
          {summary ? (
            <dl className="timing__list">
              <div className="timing__row">
                <dt>Frames analysed</dt>
                <dd className="tabular">
                  {summary.frames.toFixed(0)} over {summary.durationS.toFixed(1)} s (median{' '}
                  {summary.medianFps.toFixed(1)} fps)
                </dd>
              </div>
              <div className="timing__row">
                <dt>Frames skipped by the player</dt>
                <dd className="tabular">
                  {summary.dropped.toFixed(0)}
                  {summary.dropped > 0 ? ' (analyse again at a lower speed)' : ''}
                </dd>
              </div>
              <div className="timing__row">
                <dt>Face found</dt>
                <dd className="tabular">{(summary.faceFound * 100).toFixed(1)}%</dd>
              </div>
              <div className="timing__row">
                <dt>Calibration ended at</dt>
                <dd className="tabular">
                  {summary.calibrationEndMs === null ? '-' : `${secs(summary.calibrationEndMs)} s`}
                </dd>
              </div>
              <div className="timing__row">
                <dt>Events detected</dt>
                <dd className="tabular">{summary.events.toFixed(0)} (hidden until you score)</dd>
              </div>
            </dl>
          ) : null}
          {ready ? (
            <div className="tool__row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  download(`${prefix}-detections.csv`, detectionsToCsv(rt.detections()));
                }}
              >
                Export detections CSV
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  download(`${prefix}-frames.csv`, framesToCsv(rt.rows));
                }}
              >
                Export per-frame EAR CSV
              </button>
            </div>
          ) : null}
        </section>

        <section className="card tool__panel" aria-labelledby="v1-label">
          <h2 id="v1-label" className="section-title">
            2. Label blinks
          </h2>
          <p className="tool__note">
            Label without looking at the detections. Start: the first frame where the upper lid is
            clearly lower than when open. End: the first frame where the eye is fully open again.
            Use the video controls to find a blink, then step frame by frame.
          </p>
          {/* Keyboard shortcuts work while this group has focus; every action also has a button. */}
          <div
            className="tool__labeler"
            tabIndex={0}
            role="group"
            aria-label="Labelling controls. Left and Right arrows step one frame, with Shift one second. S marks the start, E marks the end."
            onKeyDown={onKey}
          >
            <p className="tabular" aria-live="polite">
              {ready && frame >= 0
                ? `Frame ${(frame + 1).toFixed(0)} of ${rt.frameTimes.length.toFixed(0)}, ${secs(frameTime(frame))} s`
                : ready
                  ? 'Pause the video or step to a frame.'
                  : 'Analyse a video first: it provides the exact frame times.'}
              {pendingStart !== null ? ` (start marked at ${secs(pendingStart)} s)` : ''}
            </p>
            <div className="tool__row">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={!ready}
                onClick={() => {
                  stepSeconds(-1);
                }}
              >
                -1 s
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={!ready}
                onClick={() => {
                  goToFrame(frame - 1);
                }}
              >
                Previous frame
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={!ready}
                onClick={() => {
                  goToFrame(frame + 1);
                }}
              >
                Next frame
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={!ready}
                onClick={() => {
                  stepSeconds(1);
                }}
              >
                +1 s
              </button>
            </div>
            <div className="tool__row">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!ready || frame < 0}
                onClick={markStart}
              >
                Mark start (S)
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!ready || pendingStart === null}
                onClick={markEnd}
              >
                Mark end (E)
              </button>
            </div>
            <p className="tool__note" role="status">
              {message}
            </p>
          </div>

          <h3 className="section-title">Labels ({labels.length.toFixed(0)})</h3>
          {labels.length ? (
            <table className="tool__table">
              <thead>
                <tr>
                  <th scope="col">Start (s)</th>
                  <th scope="col">End (s)</th>
                  <th scope="col">Duration (ms)</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={`${l.startMs.toString()}-${l.endMs.toString()}`}>
                    <td className="tabular">{secs(l.startMs)}</td>
                    <td className="tabular">{secs(l.endMs)}</td>
                    <td className="tabular">{(l.endMs - l.startMs).toFixed(0)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => {
                          setLabels((ls) => ls.filter((_, j) => j !== i));
                        }}
                      >
                        Delete<span className="visually-hidden"> label {(i + 1).toFixed(0)}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div className="tool__row">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!labels.length}
              onClick={() => {
                download(`${prefix}-labels.csv`, labelsToCsv(labels));
              }}
            >
              Export labels CSV
            </button>
            <label className="tool__field">
              Import labels CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  void importLabels(e.target.files?.[0]);
                }}
              />
            </label>
          </div>

          <h2 className="section-title">3. Score</h2>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || !labels.length}
            onClick={() => {
              setShowScore(true);
            }}
          >
            Score against the detections
          </button>
          {score ? <pre className="tool__score">{formatV1Score(score)}</pre> : null}
          <p className="tool__note">
            The same scoring runs offline: npm run score:v1 -- labels.csv detections.csv
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
