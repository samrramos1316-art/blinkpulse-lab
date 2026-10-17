/**
 * Blink detection with hysteresis and sub-frame timing (PROJECT_SPEC 5.3). Pure.
 *
 * States:
 *   UNARMED   - no trustworthy open-eye sample yet (start, or after invalid
 *               data / a gap). Arms on a valid sample with EAR >= reopen threshold.
 *   OPEN      - eye open. A valid sample below the close threshold starts an event.
 *   CLOSED    - EAR below the close threshold.
 *   REOPENING - EAR back above the close threshold but still below the reopen
 *               threshold. Dropping below close again returns to CLOSED; reaching
 *               the reopen threshold completes the event.
 *
 * Event times are the moments EAR crosses each threshold, found by linear
 * interpolation between the two samples around the crossing:
 *   start = close-threshold crossing (going down)
 *   end   = reopen-threshold crossing (going up)
 *
 * Gating: an invalid sample (no face, head pose out of range) or a gap between
 * samples longer than maxGapMs aborts any event in progress and disarms the
 * detector, so invalid data can never create or complete an event.
 */

export type BlinkKind = 'blink' | 'long_closure' | 'extended_closure';
export type DetectorState = 'UNARMED' | 'OPEN' | 'CLOSED' | 'REOPENING';

/** Descriptive duration classes (PROJECT_SPEC 5.3). */
export const BLINK_MAX_MS = 500;
export const LONG_CLOSURE_MAX_MS = 2000;
/** "Frame gap larger than 100 ms around the event" invalidates it (PROJECT_SPEC 5.3). */
export const DEFAULT_MAX_GAP_MS = 100;

export interface EarSample {
  /** Monotonic time (ms). */
  tMs: number;
  /** Per-frame EAR (mean of both eyes). Ignored when `valid` is false. */
  ear: number;
  /** False for no face, lost landmarks, or head pose out of range. */
  valid: boolean;
  /** The interval before this sample is a gap (FrameClock: hidden tab, drops, ...). */
  gapBefore?: boolean;
}

export interface BlinkEvent {
  /** Close-threshold crossing (ms). */
  startMs: number;
  /** Reopen-threshold crossing (ms). */
  endMs: number;
  durationMs: number;
  kind: BlinkKind;
  /** Only one sample fell below the close threshold. */
  lowConfidence: boolean;
  /** Samples below the close threshold. */
  samplesBelow: number;
  /** Lowest EAR during the event. */
  minEar: number;
}

export interface DetectorThresholds {
  closeEar: number;
  reopenEar: number;
}

export function classifyDuration(durationMs: number): BlinkKind {
  if (durationMs < BLINK_MAX_MS) return 'blink';
  if (durationMs <= LONG_CLOSURE_MAX_MS) return 'long_closure';
  return 'extended_closure';
}

/** Time at which the line from (t0, v0) to (t1, v1) reaches `level`. */
export function crossingTime(
  t0: number,
  v0: number,
  t1: number,
  v1: number,
  level: number,
): number {
  if (v1 === v0) return t1;
  const f = (level - v0) / (v1 - v0);
  return t0 + Math.min(1, Math.max(0, f)) * (t1 - t0);
}

export class BlinkDetector {
  private readonly closeEar: number;
  private readonly reopenEar: number;
  private readonly maxGapMs: number;

  private stateValue: DetectorState = 'UNARMED';
  private prev: EarSample | null = null; // last valid sample
  private startMs = NaN;
  private samplesBelow = 0;
  private minEar = Infinity;
  private abortedCount = 0;

  constructor(thresholds: DetectorThresholds, maxGapMs = DEFAULT_MAX_GAP_MS) {
    if (!(thresholds.closeEar > 0 && thresholds.reopenEar > thresholds.closeEar)) {
      throw new RangeError('BlinkDetector: need 0 < closeEar < reopenEar');
    }
    this.closeEar = thresholds.closeEar;
    this.reopenEar = thresholds.reopenEar;
    this.maxGapMs = maxGapMs;
  }

  get state(): DetectorState {
    return this.stateValue;
  }

  /** Events abandoned because of invalid samples or gaps. */
  get aborted(): number {
    return this.abortedCount;
  }

  /** True while an event is in progress (eye counted as closed). */
  get inEvent(): boolean {
    return this.stateValue === 'CLOSED' || this.stateValue === 'REOPENING';
  }

  /** Process one sample. Returns a completed event, or null. */
  push(sample: EarSample): BlinkEvent | null {
    const prev = this.prev;
    const broken =
      !sample.valid ||
      !Number.isFinite(sample.ear) ||
      sample.gapBefore === true ||
      (prev !== null && sample.tMs - prev.tMs > this.maxGapMs);

    if (broken) {
      this.disarm();
      // A valid sample after a gap can still re-arm the detector.
      if (sample.valid && Number.isFinite(sample.ear)) this.arm(sample);
      return null;
    }

    const ear = sample.ear;
    let event: BlinkEvent | null = null;

    switch (this.stateValue) {
      case 'UNARMED':
        this.arm(sample);
        break;

      case 'OPEN':
        if (ear < this.closeEar && prev) {
          this.stateValue = 'CLOSED';
          this.startMs = crossingTime(prev.tMs, prev.ear, sample.tMs, ear, this.closeEar);
          this.samplesBelow = 1;
          this.minEar = ear;
        }
        break;

      case 'CLOSED':
      case 'REOPENING':
        this.minEar = Math.min(this.minEar, ear);
        if (ear < this.closeEar) {
          this.samplesBelow++;
          this.stateValue = 'CLOSED';
        } else if (ear < this.reopenEar) {
          this.stateValue = 'REOPENING';
        } else if (prev) {
          const endMs = crossingTime(prev.tMs, prev.ear, sample.tMs, ear, this.reopenEar);
          const durationMs = endMs - this.startMs;
          event = {
            startMs: this.startMs,
            endMs,
            durationMs,
            kind: classifyDuration(durationMs),
            lowConfidence: this.samplesBelow === 1,
            samplesBelow: this.samplesBelow,
            minEar: this.minEar,
          };
          this.stateValue = 'OPEN';
        }
        break;
    }

    this.prev = sample;
    return event;
  }

  /** Forget everything (e.g. new calibration or a camera restart). */
  reset(): void {
    this.stateValue = 'UNARMED';
    this.prev = null;
    this.startMs = NaN;
    this.samplesBelow = 0;
    this.minEar = Infinity;
  }

  private arm(sample: EarSample): void {
    // Only a clearly open eye arms the detector, so an event can never begin mid-closure.
    this.stateValue = sample.ear >= this.reopenEar ? 'OPEN' : 'UNARMED';
    this.prev = sample;
  }

  private disarm(): void {
    if (this.inEvent) this.abortedCount++;
    this.stateValue = 'UNARMED';
    this.prev = null;
    this.startMs = NaN;
    this.samplesBelow = 0;
    this.minEar = Infinity;
  }
}
