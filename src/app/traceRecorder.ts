/**
 * "Record numeric trace" (PROJECT_SPEC 5.5, 8): numbers only, kept in memory until
 * the user saves or discards them. No video, images, or landmarks.
 */

import type { PulseFrame, PulseUpdate } from '../rppg/pulseEstimator.ts';
import { ESTIMATE_HEADER, FRAME_HEADER, estimateRow, frameRow } from '../rppg/traceCsv.ts';

/** Longest numeric recording kept in memory (30 min). */
export const MAX_RECORDING_MS = 30 * 60_000;

/** Why a recording ended without the user pressing Stop. */
export type TraceEnd = 'stopped' | 'cameraStopped' | 'limit';

/** A finished numeric trace (CSV text, numbers only). */
export interface RecordedTrace {
  frames: string;
  estimates: string;
  durationMs: number;
  endedBy: TraceEnd;
}

export class Recorder {
  private readonly frames: string[] = [];
  private readonly estimates: string[] = [];
  private offset: number | null = null;
  private firstMs: number | null = null;
  private lastMs = 0;
  private reachedLimit = false;

  /** The 30-minute limit was reached; later frames are ignored. */
  get full(): boolean {
    return this.reachedLimit;
  }

  add(frame: PulseFrame, update: PulseUpdate | null, wallNowMs = Date.now()): void {
    if (this.firstMs !== null && frame.tMs - this.firstMs > MAX_RECORDING_MS) {
      this.reachedLimit = true;
      return;
    }
    this.firstMs ??= frame.tMs;
    this.offset ??= wallNowMs - frame.tMs;
    this.lastMs = frame.tMs;
    this.frames.push(frameRow(frame));
    if (update && update.status !== 'warmingUp') {
      this.estimates.push(estimateRow(update, update.tMs + this.offset));
    }
  }

  finish(endedBy: TraceEnd): RecordedTrace {
    const meta = `# wall_offset_ms=${String(Math.round(this.offset ?? 0))}`;
    return {
      frames: `${[meta, FRAME_HEADER.join(','), ...this.frames].join('\n')}\n`,
      estimates: `${[ESTIMATE_HEADER.join(','), ...this.estimates].join('\n')}\n`,
      durationMs: this.firstMs === null ? 0 : this.lastMs - this.firstMs,
      endedBy,
    };
  }
}
