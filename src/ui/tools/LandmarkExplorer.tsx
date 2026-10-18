import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { earBothEyes } from '../../blink/ear.ts';
import { useCapture } from '../../app/useCapture.ts';
import { PUBLISH_INTERVAL_MS } from '../../app/captureController.ts';
import { createLandmarker, type Landmarker } from '../../vision/faceLandmarker.ts';
import { headPoseFromMatrix, type HeadPose } from '../../vision/headPose.ts';
import {
  EYE_A,
  EYE_B,
  LANDMARK_COUNT,
  toPixels,
  type NormalizedPoint,
} from '../../vision/landmarks.ts';
import { captureStatusText } from '../captureStatus.ts';
import { Footer } from '../components/Footer.tsx';
import { PlayIcon, StopIcon } from '../icons/Icons.tsx';
import { REGION_IDS, regionPolygons } from '../../rppg/roi.ts';
import { REGION_LABEL } from '../copy.ts';
import { PRESETS, nearestLandmark, parseIndexList, type PresetId } from './explorerModel.ts';

interface DrawOptions {
  highlight: readonly number[] | null;
  pointLabels: readonly string[] | undefined;
  showNumbers: boolean;
  mirrored: boolean;
  selected: number;
  /** Draw the pulse region polygons. */
  regions: boolean;
}

/** Per-frame state for the Explorer. Lives outside React state (CLAUDE.md). */
class ExplorerRuntime {
  landmarker: Landmarker | null = null;
  loading = false;
  points: NormalizedPoint[] | null = null;
  pose: HeadPose | null = null;
  ear: { eyeA: number; eyeB: number } | null = null;
  frameSize = { w: 0, h: 0 };
  /** In-memory copy of one frame while frozen. Never stored or uploaded; dropped on unfreeze. */
  frozen: HTMLCanvasElement | null = null;
  options: DrawOptions = {
    highlight: null,
    pointLabels: undefined,
    showNumbers: false,
    mirrored: false,
    selected: -1,
    regions: false,
  };

  setLandmarker(lm: Landmarker | null, loading: boolean): void {
    this.landmarker = lm;
    this.loading = loading;
  }

  update(points: NormalizedPoint[] | null, pose: HeadPose | null, w: number, h: number): void {
    this.points = points;
    this.pose = pose;
    this.frameSize = { w, h };
    if (points) {
      const r = earBothEyes(toPixels(points, w, h), EYE_A, EYE_B);
      this.ear = { eyeA: r.eyeA, eyeB: r.eyeB };
    } else {
      this.ear = null;
    }
  }

  setOptions(options: DrawOptions): void {
    this.options = options;
  }

  freeze(video: HTMLVideoElement | null): void {
    if (!video || video.videoWidth === 0) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')?.drawImage(video, 0, 0);
    this.frozen = c;
  }

  unfreeze(): void {
    this.frozen = null;
  }

  close(): void {
    this.landmarker?.close();
    this.setLandmarker(null, false);
    this.unfreeze();
  }
}

function drawOverlay(canvas: HTMLCanvasElement, rt: ExplorerRuntime): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const o = rt.options;
  if (rt.frozen) {
    ctx.save();
    if (o.mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(rt.frozen, 0, 0, w, h);
    ctx.restore();
  }
  const pts = rt.points;
  if (!pts) return;

  const style = getComputedStyle(canvas);
  const fg = style.getPropertyValue('--color-on-video').trim();
  const shadow = style.getPropertyValue('--color-on-video-shadow').trim();
  const xOf = (p: NormalizedPoint) => (o.mirrored ? (1 - p.x) * w : p.x * w);
  const highlighted = o.highlight === null ? null : new Set(o.highlight);

  // Every point as a small dot; highlighted points as larger rings (shape, not colour alone).
  ctx.fillStyle = fg;
  ctx.globalAlpha = highlighted ? 0.35 : 0.8;
  for (const p of pts) ctx.fillRect(xOf(p) - 1, p.y * h - 1, 2, 2);
  ctx.globalAlpha = 1;

  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  const label = (text: string, x: number, y: number) => {
    ctx.strokeStyle = shadow;
    ctx.strokeText(text, x + 4, y - 3);
    ctx.fillStyle = fg;
    ctx.fillText(text, x + 4, y - 3);
  };

  const indices = o.highlight ?? (o.showNumbers ? [...Array(LANDMARK_COUNT).keys()] : []);
  indices.forEach((idx, k) => {
    const p = pts[idx];
    if (!p) return;
    const x = xOf(p);
    const y = p.y * h;
    if (highlighted) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
      ctx.lineWidth = 3;
      ctx.strokeStyle = shadow;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = fg;
      ctx.stroke();
      ctx.lineWidth = 3;
    }
    if (highlighted || o.showNumbers) {
      const name = o.pointLabels?.[k];
      label(name ? `${name} ${idx.toFixed(0)}` : idx.toFixed(0), x, y);
    }
  });

  if (o.regions) {
    const polys = regionPolygons(pts.map((p) => ({ x: xOf(p), y: p.y * h })));
    ctx.setLineDash([5, 3]);
    for (const id of REGION_IDS) {
      const poly = polys[id];
      if (!poly) continue;
      ctx.beginPath();
      poly.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = shadow;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = fg;
      ctx.stroke();
      const c = poly.reduce(
        (a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }),
        {
          x: 0,
          y: 0,
        },
      );
      label(REGION_LABEL[id], c.x - 20, c.y + 4);
    }
    ctx.setLineDash([]);
  }

  const sel = pts[o.selected];
  if (sel) {
    const x = xOf(sel);
    const y = sel.y * h;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = shadow;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = fg;
    ctx.stroke();
    label(`#${o.selected.toFixed(0)}`, x + 6, y - 6);
  }
}

const fmt = (v: number | undefined, d: number) =>
  v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(d);
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`;

interface Readout {
  face: boolean;
  pose: HeadPose | null;
  ear: { eyeA: number; eyeB: number } | null;
  selected: { idx: number; x: number; y: number } | null;
}

/**
 * Landmark Explorer dev page (`#explorer`). Shows the live landmarks with index
 * numbers so every index list can be checked by eye before it is trusted.
 */
export function LandmarkExplorer() {
  const capture = useCapture();
  const { snapshot, videoRef } = capture;
  const [rt] = useState(() => new ExplorerRuntime());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trackingStatus, setTrackingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [preset, setPreset] = useState<PresetId>('eyeA');
  const [custom, setCustom] = useState('159, 145, 386, 374');
  const [showNumbers, setShowNumbers] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [readout, setReadout] = useState<Readout>({
    face: false,
    pose: null,
    ear: null,
    selected: null,
  });

  const presetDef = PRESETS.find((p) => p.id === preset) ?? PRESETS[0];
  const parsed = parseIndexList(custom);
  const highlight = preset === 'custom' ? parsed.indices : (presetDef?.indices ?? null);
  const pointLabels = preset === 'custom' ? undefined : presetDef?.pointLabels;
  const running = snapshot.status === 'running';

  // Push draw options to the runtime and redraw (also while frozen).
  useEffect(() => {
    rt.setOptions({
      highlight,
      pointLabels,
      showNumbers,
      mirrored,
      selected,
      regions: preset === 'regions',
    });
    if (canvasRef.current) drawOverlay(canvasRef.current, rt);
  }, [rt, highlight, pointLabels, showNumbers, mirrored, selected, preset]);

  const { addFrameListener, getVideo } = capture;
  useEffect(
    () =>
      addFrameListener((tick) => {
        const video = getVideo();
        const lm = rt.landmarker;
        if (!lm || !video || video.videoWidth === 0 || rt.frozen) return;
        const frame = lm.detect(video, tick.tMs);
        rt.update(
          frame.landmarks,
          frame.matrix ? headPoseFromMatrix(frame.matrix) : null,
          video.videoWidth,
          video.videoHeight,
        );
        if (canvasRef.current) drawOverlay(canvasRef.current, rt);
      }),
    [addFrameListener, getVideo, rt],
  );

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const p = rt.points?.[rt.options.selected];
      setReadout({
        face: rt.points !== null,
        pose: rt.pose,
        ear: rt.ear,
        selected: p ? { idx: rt.options.selected, x: p.x, y: p.y } : null,
      });
    }, PUBLISH_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [running, rt]);

  useEffect(
    () => () => {
      rt.close();
    },
    [rt],
  );

  const start = () => {
    if (!rt.landmarker && !rt.loading) {
      rt.setLandmarker(null, true);
      setTrackingStatus('loading');
      createLandmarker().then(
        (lm) => {
          rt.setLandmarker(lm, false);
          setTrackingStatus('ready');
        },
        (err: unknown) => {
          rt.setLandmarker(null, false);
          console.error('Face landmarker failed to load', err);
          setTrackingStatus('error');
        },
      );
    }
    capture.start();
  };
  const stop = () => {
    rt.unfreeze();
    setFrozen(false);
    capture.stop();
  };
  const toggleFreeze = () => {
    if (frozen) rt.unfreeze();
    else rt.freeze(getVideo());
    setFrozen(!frozen);
    if (canvasRef.current) drawOverlay(canvasRef.current, rt);
  };
  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    const pts = rt.points;
    const canvas = canvasRef.current;
    if (!pts || !canvas) return;
    const box = canvas.getBoundingClientRect();
    const fx = (e.clientX - box.left) / box.width;
    const fy = (e.clientY - box.top) / box.height;
    const idx = nearestLandmark(
      pts.map((p) => ({ x: p.x * rt.frameSize.w, y: p.y * rt.frameSize.h })),
      { x: (mirrored ? 1 - fx : fx) * rt.frameSize.w, y: fy * rt.frameSize.h },
    );
    setSelected(idx);
  };

  const pose = readout.pose;
  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <a className="btn-link" href="#">
              Back to the app
            </a>
            <h1 className="brand__name">Landmark Explorer</h1>
          </div>
          <div className="app-header__actions">
            {running ? (
              <button type="button" className="btn btn-ghost" onClick={toggleFreeze}>
                {frozen ? 'Resume' : 'Freeze frame'}
              </button>
            ) : null}
            {running || snapshot.status === 'starting' ? (
              <button type="button" className="btn btn-primary" onClick={stop}>
                <StopIcon size={18} />
                <span>Stop</span>
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={start}>
                <PlayIcon size={18} />
                <span>Start</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="app-main tool">
        <section className="card tool__view" aria-labelledby="explorer-view">
          <h2 id="explorer-view" className="visually-hidden">
            Camera with landmarks
          </h2>
          <div className="tool__frame">
            <video
              ref={videoRef}
              className="tool__video"
              data-mirrored={mirrored}
              muted
              playsInline
              aria-label={mirrored ? 'Camera, mirrored' : 'Camera, not mirrored'}
              hidden={!running}
            />
            {/* Clicking picks the nearest landmark; the index list below is the keyboard route. */}
            <canvas ref={canvasRef} className="tool__overlay" aria-hidden="true" onClick={pick} />
            {running ? null : <p className="preview__hint">Press Start to see the landmarks.</p>}
          </div>
          <p className="preview__status" role="status">
            {trackingStatus === 'loading'
              ? 'Loading face tracking...'
              : trackingStatus === 'error'
                ? 'Face tracking could not start. Reload the page to try again.'
                : running
                  ? readout.face
                    ? 'Face found.'
                    : 'Face not found.'
                  : captureStatusText(snapshot).text}
          </p>
        </section>

        <section className="card tool__panel" aria-labelledby="explorer-controls">
          <h2 id="explorer-controls" className="section-title">
            Highlight
          </h2>
          <fieldset className="tool__presets">
            <legend className="visually-hidden">Highlight preset</legend>
            {PRESETS.map((p) => (
              <label key={p.id} className="tool__radio">
                <input
                  type="radio"
                  name="preset"
                  value={p.id}
                  checked={preset === p.id}
                  onChange={() => {
                    setPreset(p.id);
                  }}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
          {preset === 'custom' ? (
            <label className="tool__field">
              Indices (e.g. 33, 133, 160-163)
              <input
                type="text"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                }}
              />
              {parsed.invalid.length ? (
                <span className="tool__error" role="alert">
                  Ignored: {parsed.invalid.join(', ')} (valid indices are 0 to{' '}
                  {(LANDMARK_COUNT - 1).toFixed(0)})
                </span>
              ) : null}
            </label>
          ) : null}
          <label className="tool__check">
            <input
              type="checkbox"
              checked={showNumbers}
              onChange={(e) => {
                setShowNumbers(e.target.checked);
              }}
            />
            Show every index number (with All points)
          </label>
          <label className="tool__check">
            <input
              type="checkbox"
              checked={mirrored}
              onChange={(e) => {
                setMirrored(e.target.checked);
              }}
            />
            Mirror the view (the app preview is mirrored; the data never is)
          </label>
          <label className="tool__field">
            Select index
            <input
              type="number"
              min={0}
              max={LANDMARK_COUNT - 1}
              value={selected < 0 ? '' : selected}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSelected(e.target.value === '' || !Number.isInteger(v) ? -1 : v);
              }}
            />
          </label>

          <h2 className="section-title">Readout</h2>
          <dl className="tool__readout">
            <div className="tool__readout-row">
              <dt>Selected</dt>
              <dd className="tabular">
                {readout.selected
                  ? `#${readout.selected.idx.toFixed(0)} at x ${readout.selected.x.toFixed(3)}, y ${readout.selected.y.toFixed(3)}`
                  : 'Click a point or type an index'}
              </dd>
            </div>
            <div className="tool__readout-row">
              <dt>EAR (A / B)</dt>
              <dd className="tabular">
                {fmt(readout.ear?.eyeA, 3)} / {fmt(readout.ear?.eyeB, 3)}
              </dd>
            </div>
            <div className="tool__readout-row">
              <dt>Yaw / pitch / roll</dt>
              <dd className="tabular">
                {pose
                  ? `${signed(pose.yawDeg)} / ${signed(pose.pitchDeg)} / ${signed(pose.rollDeg)} deg`
                  : '-'}
              </dd>
            </div>
          </dl>

          <h2 className="section-title">What to check</h2>
          <ol className="tool__checklist">
            <li>
              Eye A, unmirrored: P1 to P6 sit on the eye on the LEFT of the image (your right eye).
              P1 is the outer corner, P4 the inner corner, P2/P3 on the upper lid above P6/P5 on the
              lower lid.
            </li>
            <li>Eye B: the same on your left eye, with P1 at the inner corner.</li>
            <li>Close both eyes: EAR A and B both drop clearly; open: they recover.</li>
            <li>
              Turn your head to your left, then right; tilt your chin up, then down; tilt your head
              towards each shoulder. Note the sign of yaw, pitch, and roll each time.
            </li>
            <li>
              Pulse regions: the forehead box sits on bare forehead skin above the eyebrows and
              below the hairline; each cheek box sits on cheek skin, clear of the eye, nose, mouth,
              beard, and glasses frames. Check with the head turned slightly too.
            </li>
            <li>Write what you saw in docs/METHODS.md (Landmark verification).</li>
          </ol>
        </section>
      </main>
      <Footer />
    </>
  );
}
