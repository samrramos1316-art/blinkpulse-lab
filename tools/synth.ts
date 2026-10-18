/**
 * Synthetic signal generators for tests (PROJECT_SPEC 6.2, 6.3). Pure TS, no Node APIs.
 *
 * synthEar: a continuous EAR signal with blinks of known shape, sampled at a
 * frame rate with optional timing jitter, noise, baseline drift, and dropped
 * frames. Ground truth for each blink is where the NOISE-FREE continuous signal
 * crosses the close threshold going down and the reopen threshold going up,
 * found by bisection. That is exactly what the detector estimates, so duration
 * errors measure the sampling/interpolation error and the effect of noise.
 */

/** Deterministic PRNG (mulberry32) returning [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples (Box-Muller) from a uniform generator. */
export function normal(uniform: () => number): () => number {
  return () => {
    const u = Math.max(uniform(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
}

export interface BlinkShape {
  /** Time the lid starts to close (ms). */
  atMs: number;
  /** Closing ramp (ms). */
  closeMs: number;
  /** Time held at the lowest point (ms). */
  holdMs: number;
  /** Opening ramp (ms). */
  openMs: number;
  /** Lowest EAR as a fraction of the baseline (0.15 = nearly shut; 0.75 = squint). */
  minRatio: number;
}

export interface SynthEarOptions {
  durationMs: number;
  fps: number;
  /** Open-eye EAR at t = 0. */
  baseline: number;
  blinks: readonly BlinkShape[];
  /** Linear baseline drift (EAR units per minute). */
  driftPerMin?: number;
  /** Gaussian noise standard deviation (EAR units). */
  noiseSd?: number;
  /** Uniform frame-time jitter +-jitterMs. */
  jitterMs?: number;
  /** Frames inside these [start, end) intervals are dropped. */
  drops?: readonly (readonly [number, number])[];
  /** Samples marked invalid (e.g. no face) inside these intervals. */
  invalid?: readonly (readonly [number, number])[];
  seed?: number;
}

export interface SynthSample {
  tMs: number;
  ear: number;
  valid: boolean;
}

export interface TruthEvent {
  startMs: number;
  endMs: number;
  durationMs: number;
}

/** Closure amount 0..1 of one blink at time t (piecewise linear). */
function closure(b: BlinkShape, t: number): number {
  const dt = t - b.atMs;
  if (dt <= 0) return 0;
  if (dt < b.closeMs) return dt / b.closeMs;
  if (dt < b.closeMs + b.holdMs) return 1;
  const o = dt - b.closeMs - b.holdMs;
  if (o < b.openMs) return 1 - o / b.openMs;
  return 0;
}

/** Noise-free continuous EAR. */
export function earAt(opts: SynthEarOptions, tMs: number): number {
  const base = opts.baseline + ((opts.driftPerMin ?? 0) * tMs) / 60_000;
  let c = 0;
  let depth = 0;
  for (const b of opts.blinks) {
    const cb = closure(b, tMs);
    if (cb > c) {
      c = cb;
      depth = 1 - b.minRatio;
    }
  }
  return base * (1 - c * depth);
}

const inAny = (t: number, spans: readonly (readonly [number, number])[] | undefined) =>
  spans?.some(([a, b]) => t >= a && t < b) ?? false;

export function synthEar(opts: SynthEarOptions): SynthSample[] {
  const uniform = rng(opts.seed ?? 1);
  const gauss = normal(rng((opts.seed ?? 1) + 1000));
  const dt = 1000 / opts.fps;
  const out: SynthSample[] = [];
  let last = -Infinity;
  for (let k = 0; k * dt < opts.durationMs; k++) {
    const jitter = opts.jitterMs ? (uniform() * 2 - 1) * opts.jitterMs : 0;
    const t = Math.max(k * dt + jitter, last + 0.5);
    last = t;
    if (inAny(t, opts.drops)) continue;
    const ear = earAt(opts, t) + (opts.noiseSd ? opts.noiseSd * gauss() : 0);
    out.push({ tMs: t, ear, valid: !inAny(t, opts.invalid) });
  }
  return out;
}

/** Time in [lo, hi] where f crosses `level`, assuming one crossing (bisection). */
function bisect(f: (t: number) => number, level: number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  const sa = f(a) - level;
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    if ((f(m) - level) * sa > 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/**
 * Ground-truth events: for each blink deep enough to cross closeEar, the
 * noise-free close crossing (down) and reopen crossing (up).
 */
export function truthEvents(
  opts: SynthEarOptions,
  closeEar: number,
  reopenEar: number,
): TruthEvent[] {
  const f = (t: number) => earAt(opts, t);
  const events: TruthEvent[] = [];
  for (const b of opts.blinks) {
    const bottomStart = b.atMs + b.closeMs;
    const bottomEnd = bottomStart + b.holdMs;
    if (f(bottomStart) >= closeEar) continue; // squint: never closes
    const startMs = bisect(f, closeEar, b.atMs, bottomStart);
    const endMs = bisect(f, reopenEar, bottomEnd, bottomEnd + b.openMs);
    events.push({ startMs, endMs, durationMs: endMs - startMs });
  }
  return events;
}

/** A typical blink: ~100 ms closing, 50 ms closed, ~150 ms opening (illustrative). */
export function typicalBlink(atMs: number, scale = 1): BlinkShape {
  return { atMs, closeMs: 100 * scale, holdMs: 50 * scale, openMs: 150 * scale, minRatio: 0.15 };
}

/**
 * Synthetic RGB trace for rPPG tests (PROJECT_SPEC 6.2).
 *
 * Each channel = mean_k * (1 + pulse_k(t) + artefact(t)) + noise. The pulse is a
 * sinusoid at `bpm` plus a second harmonic, with a relative amplitude per channel
 * along `pulseDir` (normalised skin pulse direction; the default is an
 * illustrative G-dominant direction, not a measured one). The artefact multiplies
 * ALL channels equally (intensity change from motion or illumination), which is
 * the component POS is designed to remove; raw green keeps it.
 */
export interface SynthRgbOptions {
  durationMs: number;
  fps: number;
  bpm: number;
  /** Relative pulse amplitude in green (0.005 = 0.5%). */
  amplitude: number;
  /** Second-harmonic amplitude as a fraction of the fundamental. Default 0.3. */
  harmonic?: number;
  /** Relative pulse amplitude per channel (R, G, B), scaled so G = 1. */
  pulseDir?: readonly [number, number, number];
  means?: readonly [number, number, number];
  /** Gaussian noise sd per channel, in pixel-value units (0-255 scale). */
  noiseSd?: number;
  /** Linear illumination drift (relative per minute, all channels). */
  driftPerMin?: number;
  /** Shared multiplicative artefact: relative amplitude and frequency (Hz). */
  artefact?: { amplitude: number; hz: number };
  jitterMs?: number;
  drops?: readonly (readonly [number, number])[];
  seed?: number;
}

export interface SynthRgb {
  tMs: number[];
  r: number[];
  g: number[];
  b: number[];
}

export function synthRgb(o: SynthRgbOptions): SynthRgb {
  const uniform = rng(o.seed ?? 1);
  const gauss = normal(rng((o.seed ?? 1) + 1000));
  const [mr, mg, mb] = o.means ?? [150, 110, 90];
  const [dr, dg, db] = o.pulseDir ?? [0.45, 1, 0.65];
  const h = o.harmonic ?? 0.3;
  const f = o.bpm / 60;
  const dt = 1000 / o.fps;
  const out: SynthRgb = { tMs: [], r: [], g: [], b: [] };
  let last = -Infinity;
  for (let k = 0; k * dt < o.durationMs; k++) {
    const jitter = o.jitterMs ? (uniform() * 2 - 1) * o.jitterMs : 0;
    const t = Math.max(k * dt + jitter, last + 0.5);
    last = t;
    if (inAny(t, o.drops)) continue;
    const s = t / 1000;
    const p =
      o.amplitude * (Math.sin(2 * Math.PI * f * s) + h * Math.sin(2 * Math.PI * 2 * f * s + 0.8));
    const art =
      ((o.driftPerMin ?? 0) * t) / 60_000 +
      (o.artefact ? o.artefact.amplitude * Math.sin(2 * Math.PI * o.artefact.hz * s) : 0);
    const n = o.noiseSd ?? 0;
    out.tMs.push(t);
    out.r.push(mr * (1 + dr * p + art) + n * gauss());
    out.g.push(mg * (1 + dg * p + art) + n * gauss());
    out.b.push(mb * (1 + db * p + art) + n * gauss());
  }
  return out;
}
