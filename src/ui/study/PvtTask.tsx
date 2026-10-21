import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { PvtRun, type PvtTrial, type PvtView } from '../../study/pvt.ts';
import { STUDY_COPY } from './studyCopy.ts';

export interface PvtResult {
  startMs: number;
  endMs: number;
  trials: readonly PvtTrial[];
}

function viewText(v: PvtView): string {
  switch (v.kind) {
    case 'stimulus':
      return String(Math.floor(v.elapsedMs));
    case 'feedback':
      return `${String(Math.round(v.rtMs))} ms`;
    case 'falseStart':
      return 'Too soon';
    case 'timeout':
      return 'No response';
    case 'waiting':
    case 'done':
      return '';
  }
}

/**
 * The running task. The counter is written straight to the DOM from animation
 * frames (no React render per frame), so the stimulus onset is the frame time
 * and the response time is the input event's own timestamp, on the same clock.
 */
function PvtBox({ onDone }: { onDone: (r: PvtResult) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const finish = useEffectEvent(onDone);

  useEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const run = new PvtRun();
    let raf = 0;
    let shown = '';
    const frame = (ts: number) => {
      if (Number.isNaN(run.startMs)) run.start(ts);
      const v = run.frame(ts);
      const next = viewText(v);
      if (next !== shown) {
        text.textContent = next;
        box.dataset.state = v.kind;
        shown = next;
      }
      if (v.kind === 'done') {
        finish({ startMs: run.startMs, endMs: run.endMs, trials: run.trials.slice() });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault();
      if (!e.repeat) run.respond(e.timeStamp);
    };
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      run.respond(e.timeStamp);
    };
    box.focus();
    window.addEventListener('keydown', onKey);
    box.addEventListener('pointerdown', onPointer);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      box.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <div
      ref={boxRef}
      className="pvt-box"
      data-state="waiting"
      tabIndex={0}
      role="application"
      aria-label="Reaction-time box. Press Space or tap when numbers appear."
    >
      <span ref={textRef} className="pvt-box__text tabular" />
    </div>
  );
}

/** Instructions, then the 3-minute PVT-B once the participant presses Start. */
export function PvtTask({ run, onDone }: { run: 1 | 2; onDone: (r: PvtResult) => void }) {
  const [started, setStarted] = useState(false);
  return (
    <section className="card study__panel" aria-labelledby="pvt-title">
      <h2 id="pvt-title" className="section-title">
        {`Reaction-time task ${String(run)} of 2`}
      </h2>
      {started ? (
        <PvtBox onDone={onDone} />
      ) : (
        <>
          <p>{STUDY_COPY.pvtIntro}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStarted(true);
            }}
          >
            Start the task
          </button>
        </>
      )}
    </section>
  );
}
