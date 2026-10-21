/**
 * Brief Psychomotor Vigilance Task, PVT-B (PROJECT_SPEC 5.8, docs/STUDY_PROTOCOL.md 9.3,
 * after Basner, Mollicone & Dinges 2011, Acta Astronautica 69). Pure: the caller
 * passes times in ms on one clock (animation-frame and input-event timestamps).
 *
 * - 3 minutes. After each response the RT is shown for 1 s; the next stimulus
 *   appears 1-4 s after the response (uniform), so the 1-4 s includes the feedback.
 * - Lapse: RT >= 355 ms, or no response within 30 s (decision D7).
 * - False start: a response with no stimulus showing, or RT < 100 ms.
 * - The stimulus onset is the time of the animation frame that first shows it.
 *
 * Browser display and input latency add tens of milliseconds, so RTs are only
 * comparable within one person on one device.
 */

import { median } from '../dsp/stats.ts';

export const PVT_DURATION_MS = 180_000;
export const ISI_MIN_MS = 1000;
export const ISI_MAX_MS = 4000;
export const FEEDBACK_MS = 1000;
export const LAPSE_MS = 355;
export const FALSE_START_MS = 100;
export const TIMEOUT_MS = 30_000;

export interface PvtTrial {
  /** Stimulus onset, or null for a response with no stimulus showing. */
  stimulusMs: number | null;
  /** Response time, or null when the stimulus timed out. */
  responseMs: number | null;
  /** responseMs - stimulusMs; null for a timeout or a response with no stimulus. */
  rtMs: number | null;
  lapse: boolean;
  falseStart: boolean;
  timeout: boolean;
}

export interface PvtSummary {
  /** Stimuli shown and finished (responded or timed out). */
  stimuli: number;
  lapses: number;
  falseStarts: number;
  /** Over responses with RT >= 100 ms; null if there are none. */
  medianRtMs: number | null;
  /** Mean of 1000 / RT (1/s) over responses with RT >= 100 ms; null if none. */
  meanReciprocalRt: number | null;
}

export type PvtView =
  | { kind: 'waiting' }
  | { kind: 'stimulus'; elapsedMs: number }
  | { kind: 'feedback'; rtMs: number }
  | { kind: 'falseStart' }
  | { kind: 'timeout' }
  | { kind: 'done' };

type State =
  | { kind: 'idle' }
  | { kind: 'waiting'; onsetDueMs: number }
  | { kind: 'stimulus'; onsetMs: number }
  | { kind: 'feedback'; untilMs: number; onsetDueMs: number; view: PvtView }
  | { kind: 'done' };

export class PvtRun {
  private readonly durationMs: number;
  private readonly random: () => number;
  private state: State = { kind: 'idle' };
  private startedMs = NaN;
  private endedMs = NaN;
  private readonly log: PvtTrial[] = [];

  constructor(opts: { durationMs?: number; random?: () => number } = {}) {
    this.durationMs = opts.durationMs ?? PVT_DURATION_MS;
    this.random = opts.random ?? Math.random;
  }

  start(nowMs: number): void {
    this.startedMs = nowMs;
    this.state = { kind: 'waiting', onsetDueMs: nowMs + this.isi() };
  }

  get startMs(): number {
    return this.startedMs;
  }

  /** End of the run (start + duration), or NaN while running. */
  get endMs(): number {
    return this.endedMs;
  }

  get finished(): boolean {
    return this.state.kind === 'done';
  }

  get trials(): readonly PvtTrial[] {
    return this.log;
  }

  /**
   * Advance to `nowMs` (call once per animation frame). A due stimulus becomes
   * visible in this frame, so its onset is `nowMs`.
   */
  frame(nowMs: number): PvtView {
    const s = this.state;
    if (s.kind === 'idle') return { kind: 'waiting' };
    if (s.kind === 'done') return { kind: 'done' };
    const endMs = this.startedMs + this.durationMs;

    if (s.kind === 'stimulus') {
      if (nowMs - s.onsetMs >= TIMEOUT_MS) {
        this.log.push({
          stimulusMs: s.onsetMs,
          responseMs: null,
          rtMs: null,
          lapse: true,
          falseStart: false,
          timeout: true,
        });
        return this.afterTrial(s.onsetMs + TIMEOUT_MS, nowMs, { kind: 'timeout' });
      }
      // A stimulus still showing at the end is unfinished and not scored.
      if (nowMs >= endMs) return this.finish(endMs);
      return { kind: 'stimulus', elapsedMs: nowMs - s.onsetMs };
    }
    if (nowMs >= endMs) return this.finish(endMs);
    if (s.kind === 'feedback') {
      if (nowMs < s.untilMs) return s.view;
      this.state = { kind: 'waiting', onsetDueMs: s.onsetDueMs };
      return this.frame(nowMs);
    }
    if (nowMs >= s.onsetDueMs) {
      this.state = { kind: 'stimulus', onsetMs: nowMs };
      return { kind: 'stimulus', elapsedMs: 0 };
    }
    return { kind: 'waiting' };
  }

  /** A response (key or tap) at `tMs`, the input event's own timestamp. */
  respond(tMs: number): void {
    const s = this.state;
    if (s.kind === 'idle' || s.kind === 'done') return;
    if (s.kind === 'stimulus') {
      const rtMs = tMs - s.onsetMs;
      const falseStart = rtMs < FALSE_START_MS;
      this.log.push({
        stimulusMs: s.onsetMs,
        responseMs: tMs,
        rtMs,
        lapse: !falseStart && rtMs >= LAPSE_MS,
        falseStart,
        timeout: false,
      });
      this.afterTrial(tMs, tMs, falseStart ? { kind: 'falseStart' } : { kind: 'feedback', rtMs });
      return;
    }
    // No stimulus showing (waiting or feedback): a false start; the interval restarts.
    this.log.push({
      stimulusMs: null,
      responseMs: tMs,
      rtMs: null,
      lapse: false,
      falseStart: true,
      timeout: false,
    });
    this.afterTrial(tMs, tMs, { kind: 'falseStart' });
  }

  private afterTrial(fromMs: number, nowMs: number, view: PvtView): PvtView {
    this.state = {
      kind: 'feedback',
      untilMs: fromMs + FEEDBACK_MS,
      onsetDueMs: fromMs + this.isi(),
      view,
    };
    return nowMs < fromMs + FEEDBACK_MS ? view : this.frame(nowMs);
  }

  private finish(endMs: number): PvtView {
    this.state = { kind: 'done' };
    this.endedMs = endMs;
    return { kind: 'done' };
  }

  private isi(): number {
    return ISI_MIN_MS + this.random() * (ISI_MAX_MS - ISI_MIN_MS);
  }
}

export function summarizePvt(trials: readonly PvtTrial[]): PvtSummary {
  const rts = trials
    .filter((t) => t.rtMs !== null && t.rtMs >= FALSE_START_MS)
    .map((t) => t.rtMs as number);
  return {
    stimuli: trials.filter((t) => t.stimulusMs !== null).length,
    lapses: trials.filter((t) => t.lapse).length,
    falseStarts: trials.filter((t) => t.falseStart).length,
    medianRtMs: rts.length ? median(rts) : null,
    meanReciprocalRt: rts.length ? rts.reduce((a, rt) => a + 1000 / rt, 0) / rts.length : null,
  };
}
