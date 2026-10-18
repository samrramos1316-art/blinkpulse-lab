# Phase notes

## Phase 0: Scaffold and tooling (2026-10-16)

**Verified**

- `npm run check` (typecheck, ESLint, Prettier check, Vitest) passes: 6 test files, 57 tests.
- Clean-clone simulation: the files git would track were copied to an empty folder, then
  `npm ci && npm run check` passed. (Not a real `git clone`: nothing is committed yet.)
- Pure-logic guard: a probe file in `src/dsp/` using `document` failed `tsc`, and importing
  `react` there failed ESLint. Probe removed.
- `npm run build` injects the CSP `<meta>` first in `<head>`; no `'unsafe-inline'`, no external
  hosts. Tested by `test/csp.test.ts` and by reading `dist/index.html`.
- In Chrome (production preview on localhost): page renders, CSP meta present, no console
  errors or CSP violations, only the app's own JS and CSS loaded, no horizontal scroll at the
  window width tested, dark theme applied from the system setting.
- Every text/background token pair meets WCAG AA in light and dark themes (`test/tokens.test.ts`).
- No raw hex colours outside `tokens.css`; fatigue/drowsiness wording only in `src/ui/strings.ts`
  (`test/designRules.test.ts`).

**Not verified**

- Visual appearance: browser screenshots timed out, so the look was not reviewed by eye.
- Light theme, manual theme toggle, keyboard-only use, and the 360 px / 768 px layouts were not
  tested in a browser.
- Reduced-motion behaviour was not tested in a browser (tokens set durations to 0 ms).
- Non-Chrome browsers.

**Deviations and decisions**

- TypeScript pinned to 6.0.3, not the latest 7.0.2: typescript-eslint 8.71.2 supports only
  TypeScript < 6.1. The official Vite template also pins TypeScript ~6.0.
- The CSP is injected only in production builds; the dev server needs inline scripts for hot
  reload. Documented in `docs/ETHICS_AND_PRIVACY.md`.
- Added `tsconfig.pure.json` (no DOM lib) for `src/dsp`, `src/blink`, `src/rppg`, plus an ESLint
  import restriction, to enforce the "pure logic" rule automatically.
- Added `src/{dsp,blink,rppg}/index.ts` placeholders because `tsc` rejects a project with no files.
- `npm run lint` also runs `prettier --check`.
- The Start button is shown disabled (with a screen-reader note) so the layout is final.
- Disclaimer: the Section 1.3 wording "has been evaluated only in small studies" was replaced by
  "has not yet been validated" until V3 is reported (approved by the author; note added to
  `PROJECT_SPEC.md` 1.3).

## Phase 1: DSP core (2026-10-16)

**Verified** (all in `npm run check`: 13 test files, 175 tests)

- FFT vs `numpy.fft` (6 cases): worst relative error 7.2e-16 (criterion < 1e-9). Also matches a
  naive DFT, linearity, Parseval's theorem, and the inverse round trip.
- Butterworth SOS coefficients vs `scipy.signal.butter` (16 low/high-pass designs at orders 2 and
  4, plus the band-pass): worst relative error 3.3e-16 (criterion < 1e-6).
- `sosfilt`, `sosfilt_zi`, `filtfilt` vs SciPy on 3 filters and a 600-sample test signal: worst
  relative error 2.0e-14 (criterion < 1e-6). Frequency response matches `sosfreqz`.
- Band-pass 0.7-3.0 Hz at fs = 30 Hz: -3.01 dB at both cutoffs, -67.7 dB at 0.1 Hz, -42.7 dB at
  8 Hz (criterion >= 40 dB). Checked from the transfer function and by filtering real sines.
- Sine recovery, 10 s at 30 Hz: all 10 test frequencies within 0.05 Hz. A wider sweep (n = 924,
  run once, not part of the test suite) had a worst error of 0.0007 Hz. Also within 0.05 Hz with
  noise at 10 dB SNR plus drift.
- `findPeaks` returns exactly SciPy's peak indices in 5 cases, including a plateau.
- No DOM or React in `src/dsp/`: a probe using `document` still fails the typecheck after adding
  tests there; ESLint blocks React imports.

**Not verified**

- Performance against the 4 ms per-frame budget: needs the live pipeline (Phase 4).
- `tools/gen_fixtures.py` was run once, on Windows with Python 3.11.0.

**Deviations and decisions**

- "4th-order band-pass" is read as a 4th-order high-pass plus a 4th-order low-pass (8 poles). A
  2nd + 2nd cascade reaches only about 21 dB at 8 Hz and would fail the 40 dB criterion. SciPy's
  `butter(4, band)` also has 8 poles.
- High-pass sections come before low-pass sections, to remove the large DC level of camera colour
  traces first. The transfer function is the same either way.
- Only even Butterworth orders are supported (the spec needs 2 and 4).
- The bin-averaging resampler keeps each bin's mean at its samples' mean time, then interpolates.
  The first version (mean placed at the bin centre) failed its own test with about 6% error at
  60 fps with jitter. Details in `docs/METHODS.md`.
- "Relative error" in the criteria is computed as max |error| / max |reference|.
- "Robust baseline helpers" were not specified: implemented MAD and `robustBaseline` (median and
  MAD-scaled sigma).
- Python dependencies are in a git-ignored `.venv`, with versions pinned in
  `tools/requirements.txt`.

## Phase 2: Capture and timing (2026-10-17)

**Verified**

- `npm run check` passes: 18 test files, 247 tests.
- `FrameClock` unit tests: monotonic ms, rejection of repeated/decreasing/non-finite timestamps,
  rolling median, jitter (checked against an exact std), rate from mean interval, irregular at
  1.49x vs 1.51x median, gap at 2.49x vs 2.51x, dropped / hidden / source-change gaps, `spansGap`
  overlap rules.
- Timestamp source choice (captureTime, presentationTime, mediaTime, performance.now) unit-tested,
  including rejecting a `captureTime` on a different clock.
- Failure handling unit-tested with fake browser APIs (`captureController.test.ts`): permission
  denied, no camera, camera in use, insecure context, no getUserMedia, track ended, tab hidden,
  Stop during the permission prompt, retry after an error, restart after Stop.
- In headless Chrome with a fake camera (production build, scripts kept outside the repo):
  - Setup flow, Start, Stop, restart, all keyboard-only.
  - Permission denied (no auto-grant) shows the plain-language message.
  - Simulated track end (`ended` event) shows "The camera stopped..." and stops the track.
  - Stop and `pagehide` both leave every track `ended`; Stop clears `srcObject`.
  - Hidden tab (via an overridden `visibilityState` + `visibilitychange`): analysis pauses, the
    spec message shows, the pause is recorded as one gap.
  - The 24 fps minimum is rejected by the 20 fps default fake camera and the relaxed retry works;
    at 30 fps the full constraint set is accepted.
  - Timing cross-checked against an independent recorder (table in `docs/METHODS.md`).
  - 0 requests to other hosts; no console errors or warnings.
  - Screenshots reviewed: light and dark at 1280 px, light at 360 px (no horizontal scroll).

**Not verified**

- Any real webcam. Everything above used Chrome's synthetic camera. In particular, real "camera
  in use" (`NotReadableError`) and a real unplug were not produced; they are covered by unit tests
  and a dispatched `ended` event only.
- A real hidden/minimised window: headless Chrome keeps background tabs `visible`, so the event
  was simulated.
- The `requestAnimationFrame` fallback in a browser without `requestVideoFrameCallback` (only
  unit-tested via the controller).
- Firefox and Safari. 768 px width. Reduced-motion behaviour.
- The performance budget (still Phase 4).

**Deviations and decisions**

- **Gap rule changed (option A, approved by the author 2026-10-17):** the spec's "dt > 1.5x median"
  flagged 3-6% of intervals on the fake camera with no frames lost, which would reject nearly every
  10 s pulse window. Now 1.5x marks an _irregular interval_ (warning only); gaps that invalidate
  data are dt > 2.5x median, `presentedFrames` drops, hidden tab, and source change. Note added to
  PROJECT_SPEC 5.1. The 2.5x factor is provisional: re-check with real webcams in Phase 4.
- Measured rate is 1000 / mean interval, not 1000 / median: the median overstated the fake
  camera's 30.0 fps as 31.9 fps.
- "Dropped-frame count" comes from `presentedFrames` jumps (requestVideoFrameCallback only); the
  rAF fallback shows "not measurable". An interval-based estimate was tried and removed (see
  `docs/METHODS.md`).
- If the 24 fps minimum cannot be met, the camera is opened again without it, rather than failing.
  The UI says so.
- `captureTime` is used only within 1000 ms of the callback time, because its time base is not
  stated in the spec. `mediaTime` is used only when positive.
- Exposure / white-balance locking (5.1) is deferred to Phase 4, where it matters for pulse; locking
  before auto-exposure settles could leave a bad exposure.
- First-run setup has 4 steps now (welcome, camera, position, done); calibration joins in Phase 3.
  The positioning step's live hint covers lighting only (an untuned brightness threshold); distance
  and stillness hints need face landmarks (Phase 3).
- Pure parts of `src/capture/` (`frameClock`, `timestampSource`, `cameraErrors`, `brightness`) are
  added to the no-DOM typecheck and ESLint rules.
- Header is sticky only at >= 720 px; on phones it took a quarter of the screen.
- Metric cards are one column at 360 px; Amendment 02 asks for two. Left for the Phase 5 polish pass.
- Timing details are shown by default in development builds and hidden by default in production.

## Phase 3: Landmarks, EAR, blink detection (2026-10-17)

**Status: committed without its acceptance run, at the author's request ("commit and move on").**
The Phase 3 acceptance criterion, validation V1 run and reported, is **not met yet**; it stays an
open item to be done before the results are cited anywhere. The author checked the landmarks live
in the Explorer.

**Verified**

- `npm run check` passes: 30 test files, 341 tests.
- Synthetic detector tests per PROJECT_SPEC 6.3 (fast blink, slow blink, single-frame dip, long
  closure, noisy baseline, dropped frames, plus drift, hysteresis, invalid samples, gap flags);
  results with n in `docs/METHODS.md`.
- Calibration, metrics, EAR (pixel vs normalised), head pose from both matrix layouts, relative
  pose gating, the whole pipeline (`blinkPipeline.test.ts`), plot geometry and text alternative,
  setup hint priority, Explorer index parsing, V1 CSV round trips, scoring, and frame lookup.
- `npm run score:v1` run on hand-made CSVs: correct counts, the calibration-window exclusion, and
  the tolerance option.
- Headless Chrome, fake camera, production build: landmarker loads (GPU); setup goes through all 5
  steps; with no face the calibration step shows the countdown ring and then the retry message;
  EAR plot draws and describes itself; Explorer runs and reports bad indices; the V1 tool analysed
  a 12 s synthetic test-pattern video (296 frames, 5 skipped by the player at 1x) and ended with
  the calibration-failure message; no horizontal scroll at 360 px; light and dark screenshots
  reviewed.
- Live, one person, one laptop webcam (dev server): face found, blink measurement working after
  the relative-pose fix (confirmed by the author).
- The MediaPipe usage logger is blocked by the CSP in dev and production (see
  `docs/ETHICS_AND_PRIVACY.md`).

**Not verified**

- Validation V1 (no recordings or labels yet).
- Head-pose sign directions (the author checked the Explorer but the directions were not written
  down).
- The V1 tool on a real recording with a face (only the failure path ran end to end in a browser).
- Firefox and Safari; the V1 tool needs `requestVideoFrameCallback` (Chrome and Edge).
- Reduced-motion behaviour of the plot and ring was not checked in a browser.

**Deviations and decisions**

- **Head-pose gating is relative to the calibration pose** (spec: absolute +-25 deg yaw / +-20 deg
  pitch). With a laptop camera below eye level, normal viewing read about 19 deg pitch, so almost
  every frame was rejected. Proposed spec note for 5.3: "limits apply to the change from the pose
  during calibration". Needs the author's approval to go into PROJECT_SPEC.
- **Dev server CSP added**: the MediaPipe library tries to send usage logs to Google; the dev
  server previously had no CSP, so earlier dev sessions may have sent them. Now blocked everywhere.
- `media-src 'self' blob:` added for the V1 tool's local video playback.
- Distance hint limits (0.12 / 0.40 of frame width) are untested heuristics. There is no "hold
  still" hint yet; motion is measured in Phase 4.
- Hand-label definitions for V1 (start: lid clearly lower; end: fully open) differ from the
  detector's threshold crossings, so duration error includes a definitional offset. Reported as
  found.
- The Explorer and V1 tool are hash routes (`#explorer`, `#v1`) in the same build, not separate
  pages.
- "Calibrate" sits in the header while the camera runs; at narrow widths the header buttons wrap.

## Phase 3b: Blink timeline (2026-10-17)

Started at the author's request ("commit and move on") with Phase 3's V1 still open.

**Verified**

- `npm run check` passes: 33 test files, 366 tests.
- `sessionSummary.ts` unit tests: exact minute splitting, usable/unusable rules, nulls (never
  zeros) for unusable minutes, lost-time attribution per reason, events assigned by start with
  closed time split across minutes, low frame rate flag, CSV export.
- Patch B synthetic test: 5-minute session with a dropout minute, a head-turn minute, and a
  frame-gap minute (results in `docs/METHODS.md`).
- Pipeline: the timeline starts after the first calibration, a recalibration counts as lost
  "calibrating" time, and a new camera session clears it.
- Plot geometry and text alternatives unit-tested; a usable minute without blinks is no longer
  described or drawn as "unusable" (bug found while testing).
- Server-rendered view test: unusable minute shows "-" and its reason, every coverage cell has a
  text label, export needs a second click.
- Browser (dev server, synthetic bins rendered through a temporary module, since removed): light
  and dark at 1280 px, 360 px without horizontal scroll, focus moves to the export confirmation,
  tabs work with arrow keys and Home/End.

**Not verified**

- Live use: the author tried the timeline with a real camera (2026-10-17) and reported it working;
  no numbers from that session were recorded.
- Saving the CSV in a real browser (download not exercised headlessly).
- Screen-reader output of the tabs, plots, and coverage bar.

**Deviations and decisions**

- "Same consent flow as Record trace": Record trace does not exist yet (Phase 5 settings). The
  export uses an inline confirmation that says what the file contains; Record trace should reuse it.
- Events are assigned to the minute where they start (Patch B does not say).
- Lost time adds a "calibrating" reason, and minutes below 24 fps are marked (Patch B lists low
  FPS as a reason, without a threshold; 24 fps is the camera minimum from PROJECT_SPEC 5.1). Low
  frame rate does not by itself make a minute unusable.
- The in-progress minute is shown as not yet usable (hatched) with "so far (in progress)" in the
  table.
- The signals area now has tabs (Blinks / Pulse / Session timeline) per SPEC_AMENDMENT_02.

## Phase 4: Pulse rate (2026-10-17)

**Status: built, not accepted.** Acceptance needs offline evaluation on recorded data (V2a) and
live V2b against a reference device (PROJECT_SPEC Phase 4). Both need the author. The pulse regions
also still need the live Explorer check.

**Verified**

- `npm run check` passes: 40 test files, 427 tests.
- Synthetic tests per PROJECT_SPEC 6.2 and Patch A; results with n in `docs/METHODS.md`.
- `npm run eval` replays a recorded trace through the same TypeScript pipeline (MAE 0.12 BPM,
  n = 30, on a synthetic-face recording).
- Production build in headless Chrome with a rendered synthetic face as the fake camera: 72 and
  108 BPM recovered with Good quality in all regions; overlay labels, quality chip, region table,
  waveform, spectrum, and filter plots; numeric recording with confirmation and save; no CSP
  violations, no errors.
- Performance: 1.20 ms median, 2.91 ms p95 per frame outside face tracking (goal: 4 ms median), so
  the Web Worker from Patch A is not needed now.

**Not verified**

- Any real face or real skin; exposure/white-balance locking on a real webcam.
- Live position of the forehead and cheek regions (Explorer preset added).
- The 2.5x gap factor from Phase 2 on real webcams (the synthetic-face runs showed a few gaps at
  start-up, while Chrome's fake camera stutters).
- A screen reader on the new plots and table.

**Deviations and decisions**

- SQI levels (Good >= 0.7, Fair >= 0.5) chosen from synthetic data; the other thresholds (motion,
  lighting, saturation, darkness) and the 6 BPM "consistent" rule are unvalidated starting values.
  The spec gives no numbers for them.
- The SQI counts second-harmonic power only inside 0.7-3.0 Hz, so it cannot exceed 1.
- The pulse uses the same face and head-pose gating as blinks (calibration-relative pose).
- Exposure/white-balance locking (deferred from Phase 2) is tried 3 s after start.
- "Record numeric trace" was built now (spec: Phase 5 settings) because V2b needs it. It uses an
  inline confirmation listing exactly what is recorded, keeps numbers only, and stops at 30 min. If
  the camera stops while recording, the trace is kept for the user to save or discard.
- `tools/eval_cli.ts` was built now (spec: Phase 5) because Phase 4 acceptance needs it.
- V2a extraction is the in-browser `#v2` page rather than a separate Python tool: it runs the
  app's own face tracking, regions, and pixel reading on a local video file, so offline and live
  traces come from identical code (a Python MediaPipe port would need its own landmark and ROI
  verification). `npm run ppg:ref` converts a ground-truth PPG to reference BPM. Reading each
  dataset's ground-truth file into `t_ms,ppg` is left to the user. Verified end to end on a
  synthetic face video (MAE 0.01 BPM, n = 28; `docs/METHODS.md`).
- The quality chip has a symbol per level (filled, half, empty circle) and the text "Quality: ...",
  never colour alone. No chip while the signal is interrupted.
- The region table shows each region's latest 10 s estimate; the card shows the smoothed value, so
  they can differ by about 1 BPM.

## Phase 4B step 1: Study protocol draft (2026-10-17)

**Status: draft committed (not frozen). The author postponed the study on 2026-10-18.**
Started while Phase 4 acceptance (V2a, V2b, live check of the pulse regions) and V1 are still open,
because the author asked for the next step. SPEC_AMENDMENT_01 gate G-A says 4B should wait for
Phase 4 acceptance. The draft is documentation only, and no participant data can be collected until
it is frozen.

**Written**

- `docs/STUDY_PROTOCOL.md`: hypotheses, null-result rule, factor definitions on top of the
  existing blink pipeline, ECI formula with floors and cap, gating, band rule, sessions, exclusions,
  analysis plan with controls, export contents, ethics, recruitment, open decisions D1-D8.
- `docs/forms/`: adult consent, parent/guardian permission, and minor assent drafts with
  placeholders.

**Checked against sources**

- PVT-B details (3 min, 1-4 s interval including 1 s feedback, lapse >= 355 ms, false start
  < 100 ms) against Basner, Mollicone & Dinges (2011, _Acta Astronautica_), read on PubMed Central.
- KSS: a published reproduction (Shahid et al. 2012, ch. 47) shows the scale is copyright
  Torbjörn Åkerstedt and forbids reproduction or adaptation without written consent. Its step-8
  wording differs slightly from PROJECT_SPEC 5.8. The protocol does not reproduce the anchors.

**Not checked**

- The original Åkerstedt & Gillberg (1990), Basner & Dinges (2011, _Sleep_), and Dinges & Grace
  (1998) papers.
- Whether the school or a science fair requires review-board approval (for the author to ask).

**Proposed spec fixes** (in protocol Section 13): lapse ">= 355 ms" rather than "> 355 ms"; the
1-4 s interval includes the feedback; cite Basner, Mollicone & Dinges (2011) in Appendix A.

## Phase 4B (partial): Eye-closure indicator for normal use (2026-10-18)

**Status: built, not accepted, not committed.** The author asked to refine the program before any
study, starting with the indicator. Study mode (KSS prompt, PVT-B, session runner, export, blinding)
is not built.

**Verified**

- `npm run check` passes: 43 test files, 463 tests.
- Synthetic tests for the factors, baseline, index, gating, trend, and summary (`docs/METHODS.md`).
- Browser check of the card and baseline flow on the production build (`docs/METHODS.md`).

**Not verified**

- Any real face. Whether the index tracks anything is what V3 would test.
- The trend plots, gauge, and summary with live values in a browser (synthetic face cannot blink).
- A screen reader on the new tab.

**Deviations and decisions**

- The protocol formula was changed before any data: the floor now applies to both the window and
  the baseline value. With the floor on the baseline only, behaviour identical to a baseline with no
  long closures gave ECI 0.67 instead of 1.
- The alert-baseline confirmation asks the user to start "only while you feel rested", because
  Appendix B allows "alert" only in "alert baseline".
- The card shows the 5-minute window; the tab lets the user switch the plots between 60 s and 5 min.
- Provisional bands (1.5, 2.5) are shown and labelled as unvalidated (protocol decision D6).
- Phase 4 acceptance (V2a, V2b, live pulse-region check) and V1 are still open (gate G-A).
- Layout rework (author's request, 2026-10-18): the Eye closure tab is split into sections
  (baseline stats, "Now" with factor ratio bars, a large trend plot with dashed baseline and band
  lines, three factor plots, blink rate apart, a band-minutes bar); the session timeline gained
  summary tiles and a 2 x 2 plot grid; all series plots gained a latest-value header and a pointer
  readout. Checked by screenshots of a temporary synthetic-session page (removed) in light, dark,
  and 360 px width; the readout is pointer-only, and the same numbers are in the tables.

## Phone support (2026-10-18, author's request)

**Status: built, not committed. Not tried on a real phone.**

- `npm run dev:phone`: https dev server on the LAN with a self-signed certificate made by
  `tools/make-dev-cert.mjs` (openssl; key in git-ignored `.cert/`, remade when the LAN address
  changes; fixed port 5173). Nothing is published.
- Screen Wake Lock while the camera runs (`src/app/useWakeLock.ts`), re-requested when the page
  becomes visible again; refusals and unsupported browsers are ignored.
- The preview frame follows the video's shape (portrait phone video), capped at 65% of the screen
  height. The face-distance hint now divides by the longer frame side instead of the width (same
  value for landscape webcams; tested that portrait and landscape agree).
- Phone layout: compact header (short privacy badge "On-device only", the full sentence kept for
  screen readers; icon-only Guide button), metric cards two per row, tabs scroll sideways instead
  of wrapping, region labels placed so the cheek labels cannot overlap (tested), plots read values
  on a sideways touch drag.
- Checked: `npm run check` (44 files, 467 tests); headless Chrome emulating a 390 px touch phone,
  over https on the LAN address, with a portrait synthetic face as the camera: secure context,
  face tracking at 30 fps, pulse 72 BPM with Good quality, no horizontal scrolling, no errors.
- Not checked: a real phone (camera, speed, wake lock, certificate prompt), iOS Safari.
