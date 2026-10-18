import { useEffect, useRef, useState } from 'react';
import { BlinkPipeline } from '../../app/blinkPipeline.ts';
import { buildPulseFrame } from '../../app/pulseFrame.ts';
import { RoiSampler } from '../../app/roiSampler.ts';
import { FrameClock } from '../../capture/frameClock.ts';
import { hasVideoFrameCallback } from '../../capture/frameLoop.ts';
import { PulseEstimator } from '../../rppg/pulseEstimator.ts';
import { ESTIMATE_HEADER, FRAME_HEADER, estimateRow, frameRow } from '../../rppg/traceCsv.ts';
import { createLandmarker, type Landmarker } from '../../vision/faceLandmarker.ts';
import { headPoseFromMatrix } from '../../vision/headPose.ts';
import { EYE_A, EYE_B, toPixels } from '../../vision/landmarks.ts';
import { Footer } from '../components/Footer.tsx';
import { downloadText as download } from '../download.ts';

const RATES = [0.5, 1] as const;

type Phase = 'idle' | 'loading' | 'analysing' | 'done' | 'error';

interface Summary {
  frames: number;
  durationS: number;
  medianFps: number;
  dropped: number;
  faceValid: number;
  estimates: number;
  shown: number;
}

/** Per-frame analysis state, kept out of React state (CLAUDE.md). */
class V2Runtime {
  landmarker: Landmarker | null = null;
  frames: string[] = [];
  estimates: string[] = [];
  frameTimes: number[] = [];
  dropped = 0;
  faceValid = 0;
  shown = 0;
  private pipeline = new BlinkPipeline(EYE_A, EYE_B);
  private pulse = new PulseEstimator();
  private sampler = new RoiSampler();
  private clock = new FrameClock();
  private lastPresented: number | null = null;
  private handle = 0;
  private video: HTMLVideoElement | null = null;

  setLandmarker(lm: Landmarker): void {
    this.landmarker = lm;
  }

  reset(): void {
    this.cancel();
    this.frames = [];
    this.estimates = [];
    this.frameTimes = [];
    this.dropped = 0;
    this.faceValid = 0;
    this.shown = 0;
    // Same gating as the live app: calibration sets the reference head pose.
    this.pipeline = new BlinkPipeline(EYE_A, EYE_B);
    this.pipeline.startCalibration();
    this.pulse = new PulseEstimator();
    this.clock = new FrameClock();
    this.lastPresented = null;
  }

  /** Process frames from `video` until it ends; `onDone` is called once. */
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
        const face = lm.detect(video, mediaMs);
        const points = face.landmarks ? toPixels(face.landmarks, meta.width, meta.height) : null;
        this.pipeline.process(
          tick,
          points
            ? {
                points,
                pose: face.matrix ? headPoseFromMatrix(face.matrix) : null,
                frameSize: Math.max(meta.width, meta.height),
              }
            : null,
        );
        const valid = points !== null && this.pipeline.lastFrame.status === 'ok';
        const { frame } = buildPulseFrame(tick, points, valid, video, this.sampler);
        // t_ms = the video's own media time, so a dataset's ground truth aligns directly.
        const timed = { ...frame, tMs: mediaMs };
        const update = this.pulse.push(timed);
        this.frames.push(frameRow(timed));
        if (update && update.status !== 'warmingUp') {
          this.estimates.push(estimateRow(update, NaN));
          if (update.displayBpm !== null) this.shown++;
        }
        if (valid) this.faceValid++;
        this.frameTimes.push(mediaMs);
        onProgress();
      }
      if (video.ended) {
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

  framesCsv(source: string): string {
    return `${[`# source=${source}`, FRAME_HEADER.join(','), ...this.frames].join('\n')}\n`;
  }

  estimatesCsv(): string {
    return `${[ESTIMATE_HEADER.join(','), ...this.estimates].join('\n')}\n`;
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
      faceValid: n ? this.faceValid / n : 0,
      estimates: this.estimates.length,
      shown: this.shown,
    };
  }

  close(): void {
    this.cancel();
    this.sampler.close();
    this.landmarker?.close();
    this.landmarker = null;
  }
}

/** File name without extension, reduced to safe characters, for the CSV names. */
const stem = (name: string) => name.replace(/\.[^.]*$/, '').replace(/[^\w.-]+/g, '_') || 'video';

/**
 * Validation V2a tool (`#v2`, PROJECT_SPEC 7.3): runs the app's own face tracking,
 * pulse regions, and pulse estimator on a local video file and exports the numeric
 * trace for `npm run eval`. The video is played from a local object URL; nothing is
 * uploaded, and the exports hold numbers only.
 */
export function V2Tool() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rt] = useState(() => new V2Runtime());
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState('video');
  const [rate, setRate] = useState<number>(0.5);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

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

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    rt.reset();
    setSrc(URL.createObjectURL(file));
    setName(stem(file.name));
    setPhase('idle');
    setSummary(null);
    setError(null);
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
          setPhase('done');
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

  const ready = phase === 'done' && rt.frames.length > 0;

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <a className="btn-link" href="#">
              Back to the app
            </a>
            <h1 className="brand__name">Validation V2a: pulse rate from a video file</h1>
          </div>
        </div>
      </header>
      <main id="main" className="app-main tool">
        <section className="card tool__view" aria-labelledby="v2-video">
          <h2 id="v2-video" className="section-title">
            1. Video
          </h2>
          <p className="tool__note">
            Pick a recording kept on this device, for example from a public rPPG dataset whose
            licence allows this use. The browser must be able to play it (H.264 MP4 or WebM);
            converting a dataset video to these formats compresses it, which weakens the pulse
            signal. The first 10 seconds set the reference head pose, as in the app. The file is
            played locally and never uploaded.
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
                <dt>Face found, head pose in range</dt>
                <dd className="tabular">{(summary.faceValid * 100).toFixed(1)}%</dd>
              </div>
              <div className="timing__row">
                <dt>Pulse estimates shown</dt>
                <dd className="tabular">
                  {summary.shown.toFixed(0)} of {summary.estimates.toFixed(0)}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        <section className="card tool__view" aria-labelledby="v2-export">
          <h2 id="v2-export" className="section-title">
            2. Export and evaluate
          </h2>
          <p className="tool__note">
            The frames CSV holds numbers only: per-frame time (the video&apos;s own time in ms),
            region colour averages and quality numbers, nose position, and eye distance. Write the
            dataset&apos;s ground-truth pulse signal as t_ms,ppg in the same time base, then run
            offline: npm run ppg:ref -- ppg.csv reference.csv, and npm run eval -- frames.csv
            reference.csv
          </p>
          <div className="tool__row">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!ready}
              onClick={() => {
                download(`${name}-frames.csv`, rt.framesCsv(name));
              }}
            >
              Export frames CSV
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!ready}
              onClick={() => {
                download(`${name}-estimates.csv`, rt.estimatesCsv());
              }}
            >
              Export estimates CSV
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
