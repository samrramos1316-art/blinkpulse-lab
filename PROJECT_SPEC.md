# BlinkPulse Lab: Project Specification

> **AMENDED:** Read `SPEC_AMENDMENT_01.md` together with this file. Where they conflict (multi-region pulse, blink timeline, fatigue/drowsiness indicator wording, study-mode blinding, schedule), the amendment wins.

> **AMENDED:** Also read `SPEC_AMENDMENT_02.md` (visual design and ease of use). It extends Section 5.5 and never overrides product, privacy, wording, or accessibility rules.

> Working name. Rename freely.
> An educational, fully on-device signal-processing project: estimating blink metrics and pulse rate from webcam video, with every key algorithm written by hand and validated against reference data.

---

## 0. How to use this document (for Claude Code)

1. Put this file and `CLAUDE.md` in the repo root.
2. Work **one phase at a time** (Section 2). Do not start a phase until the previous phase's acceptance criteria pass.
3. At the end of each phase: tests green, `docs/` updated, and a short note listing **what was verified and what could not be verified**.
4. When unsure about a library's current API (MediaPipe tasks-vision, Vite, Vitest, Playwright), **read the official docs first**. Do not rely on memory.
5. Never invent landmark indices, dataset details, citations, or numeric results. If something cannot be verified, say so in the phase note.

---

## 1. Product definition

### 1.1 What it is
A single-page browser app that uses the webcam, entirely on-device, to estimate:

1. **Blink metrics** (blink rate, blink durations, long-closure events, eye-closed fraction) from eyelid geometry using the Eye Aspect Ratio (EAR).
2. **Pulse rate** (heart rate in BPM) from subtle skin-colour changes using remote photoplethysmography (rPPG) with the POS algorithm, always shown with a signal-quality indicator.

It also includes a **Signal Lab view** that shows each intermediate signal (EAR trace, raw RGB trace, POS output, filtered pulse waveform, spectrum, filter frequency response) so a reader can see how the numbers are produced.

### 1.2 What it is NOT (hard rules)
- Not a medical device. No diagnosis, monitoring, or treatment claims.
- **Sleepiness/fatigue language is allowed only for the Phase 4B eye-closure indicator, and only in the approved wording (Appendix B).** The app must not claim to detect, diagnose, or predict fatigue, drowsiness, impairment, or fitness to drive. It must not infer stress, emotion, attention, or cognitive/"autonomic" state, and must not use pulse or HRV as a sleepiness signal.
- **No HRV in the UI.** HRV is analysed only in an offline evaluation script, to document why webcam HRV is unreliable (Section 7.4).
- No face recognition, identification, or demographic inference.
- No network requests after initial load. No telemetry. No video, images, or landmarks are stored or uploaded.
- No biometric alerts by default. The sleepiness indicator is a passive display (no sounds, no pop-ups). The only reminder feature (Phase 6) is optional and off by default.

### 1.3 Claims policy
- Use "estimated" and "measured on this device". Always show confidence/quality next to pulse rate.
- For the sleepiness indicator, say "indicator" and "compared with your own baseline". Put the validation result (with `n`) next to any statement about what it means. If the result is weak or inconsistent, say so plainly.
- Every accuracy statement in docs must cite a number from `docs/VALIDATION.md`, including the sample size.
- Required disclaimer (footer + README + About dialog):
  > BlinkPulse Lab is an experimental educational signal-processing and research project. It is not a medical device and does not diagnose, monitor, or treat any condition. Its eye-closure sleepiness indicator compares your eyelid behaviour with your own baseline and has been evaluated only in small studies (see docs/VALIDATION.md); it must not be used for driving or any safety-critical decision. Estimates can be wrong, especially with motion, poor lighting, or camera processing. All processing happens on your device; no video or images are uploaded or stored.

  > **Interim wording (approved by the author, 2026-10-16):** until V3 results are reported in `docs/VALIDATION.md`, replace "has been evaluated only in small studies" with "has not yet been validated". Switch to the evaluated wording (with the real study size) only after V3 is reported.

---

## 2. Phases and acceptance criteria

### Phase 0: Scaffold and tooling
**Deliverables:** Vite + React + TypeScript (strict) project, ESLint, Prettier, Vitest, folder layout from Section 3, CI-style `npm run check` (typecheck + lint + test), CSP meta tag (Section 8), README skeleton, LICENSE file (author's choice, e.g. MIT, which includes a no-warranty clause).
**Accept when:** `npm run check` passes on a clean clone; app renders a placeholder page.

### Phase 1: DSP core (pure TypeScript, no DOM, no React)
**Deliverables** in `src/dsp/`:
- `fft.ts`: iterative radix-2 Cooley-Tukey FFT (real input convenience wrapper), power-of-two zero padding helper.
- `window.ts`: Hann (and rectangular) windows with coherent-gain correction.
- `biquad.ts`: direct form II transposed biquad section, `sosfilt` (cascade), `filtfilt` (forward-backward with odd-extension edge padding, SciPy-style).
- `butterworth.ts`: design of Butterworth low-pass, high-pass and band-pass (as LP + HP cascades) from analogue prototype via **bilinear transform with frequency pre-warping**, returning second-order sections. Support order 2 and 4 at minimum.
- `resample.ts`: non-uniform timestamps to uniform rate. Linear interpolation, plus bin-averaging when the source rate is at least 1.5x the target.
- `stats.ts`: mean, std, median, percentile, detrend (linear), robust baseline helpers.
- `peaks.ts`: peak finding with minimum distance and prominence.
- `spectrum.ts`: windowed, zero-padded power spectrum, band-limited peak search with **parabolic interpolation**.

**Accept when:**
- FFT matches a naive DFT and NumPy's `fft` fixture output (relative error < 1e-9, float64).
- Butterworth SOS coefficients and `sosfilt`/`filtfilt` outputs match SciPy fixtures (relative error < 1e-6).
- Measured magnitude response of the band-pass: about -3 dB at both cutoffs and at least 40 dB attenuation at 0.1 Hz and 8 Hz for a 4th-order design at fs = 30 Hz (assert in tests).
- Synthetic sine at a known frequency is recovered by `spectrum.ts` within 0.05 Hz for 10 s windows at fs = 30 Hz.
- All modules have unit tests; no DOM or React imports anywhere in `src/dsp/`.

### Phase 2: Capture and timing
**Deliverables:** `camera.ts`, `frameClock.ts`, dev overlay showing measured FPS, frame-interval jitter, dropped-frame count, actual resolution.
**Accept when:**
- Frame timestamps come from `requestVideoFrameCallback` metadata when available (prefer `captureTime`, else `presentationTime`/`mediaTime`), falling back to `requestAnimationFrame` + `performance.now()`. Feature-detect; do not assume.
- A unit-tested `FrameClock` converts timestamps to monotonically increasing milliseconds and reports median dt, jitter (std of dt), and gaps (dt > 1.5x median).
- The app handles: permission denied, no camera, camera in use, track ended, tab hidden (see 5.1).

### Phase 3: Landmarks, EAR, blink detection (Stream A)
**Deliverables:** `vision/faceLandmarker.ts`, Landmark Explorer dev page, `blink/ear.ts`, `blink/calibration.ts`, `blink/blinkDetector.ts`, EAR plot with thresholds, blink metric cards.
**Accept when:** Validation V1 (Section 7.2) has been run and reported, even if results are poor. Detector logic is unit-tested on synthetic EAR sequences (fast blink, slow blink, single-frame dip, long closure, noisy baseline, dropped frames).

### Phase 4: rPPG pulse rate (Stream B)
**Deliverables:** `rppg/roi.ts`, `rppg/rgbTrace.ts`, `rppg/pos.ts`, `rppg/hrEstimator.ts`, `rppg/quality.ts`, pulse waveform plot, spectrum plot, filter response plot, BPM card with quality indicator.
**Accept when:**
- Synthetic tests pass (Section 6.2).
- Offline evaluation (Section 7.3) runs the **same TypeScript DSP code** on recorded RGB traces and reports MAE/RMSE.
- Live validation V2b against a reference device has been run and reported (Section 7.3).

### Phase 4B: Eye-closure sleepiness indicator and study mode
**Depends on:** Phase 3 (and Phase 4 if you want pulse shown alongside).
**Deliverables:**
- `src/blink/sleepiness.ts`: pure logic (features, baseline, Eye-Closure Index, gating).
- `src/study/`: KSS prompt, brief PVT task, session runner, numeric export (Section 5.8).
- `docs/STUDY_PROTOCOL.md`: hypotheses, feature definitions, index formula, windows, exclusions, and analysis plan. **Written and committed before any participant data is collected.**
- Analysis scripts in `tools/` (Python allowed here, see Section 4).
- Indicator card and trend plot in the UI.

**Accept when:**
- Feature extraction and the index are unit-tested on synthetic EAR/blink sequences with known closed fractions and long-closure rates, including gaps and low-quality segments. Insufficient or low-quality data must produce "Not enough data", never a number.
- Study mode runs end to end in the browser and exports a CSV with timestamps, features, KSS ratings, and PVT trials, with no media.
- `docs/STUDY_PROTOCOL.md` exists in git history before the first participant session.
- Validation V3 (Section 7.5) has been run and reported with `n`, including null or negative findings.

### Phase 5: Polish and portfolio packaging
**Deliverables:** Signal Lab view, trace recording/export (numeric only), offline evaluation CLI, privacy hardening verified, accessibility pass, `docs/METHODS.md`, `docs/VALIDATION.md`, `docs/LIMITATIONS.md`, `docs/ETHICS_AND_PRIVACY.md`, final README, demo script for a 60-90 second video.
**Accept when:** Section 11 checklist is complete.

### Phase 6 (optional): Extras
- Eye-comfort reminder (Section 5.6), off by default.
- Offline HRV analysis notebook/script documenting reliability limits.
- Move the rPPG pipeline into a Web Worker if main-thread budget is exceeded.
- Background-region illumination reference to reject lighting artefacts.

---

## 3. Repository layout

```
/
├─ CLAUDE.md
├─ PROJECT_SPEC.md
├─ README.md
├─ docs/
│  ├─ METHODS.md
│  ├─ VALIDATION.md
│  ├─ LIMITATIONS.md
│  └─ ETHICS_AND_PRIVACY.md
├─ public/
│  ├─ models/        # face_landmarker.task (self-hosted; see 5.2)
│  └─ wasm/          # MediaPipe wasm files (self-hosted)
├─ src/
│  ├─ dsp/           # pure TS: fft, window, biquad, butterworth, resample, stats, peaks, spectrum
│  ├─ blink/         # ear, calibration, blinkDetector
│  ├─ rppg/          # roi, rgbTrace, pos, hrEstimator, quality
│  ├─ capture/       # camera, frameClock
│  ├─ vision/        # faceLandmarker, landmarks (index constants), headPose
│  ├─ app/           # pipeline (orchestration), store
│  ├─ ui/            # components + canvas plots (hand-written, no chart libs)
│  └─ main.tsx
├─ tools/
│  ├─ gen_fixtures.py      # SciPy/NumPy reference fixtures (dev-only Python)
│  ├─ eval_cli.ts          # offline evaluation on recorded traces
│  └─ synth.ts             # synthetic rPPG / EAR generators
└─ test/fixtures/          # committed JSON fixtures
```

**Dependency rule:** `src/dsp`, `src/blink` (logic), and `src/rppg` (logic) must not import from `ui`, `app`, React, or any DOM API. They are shared by the app, tests, and the offline CLI.

---

## 4. Tech stack and constraints

- **Vite + React + TypeScript (strict).** No Next.js: the app is fully client-side with no SSR.
- **`@mediapipe/tasks-vision` `FaceLandmarker`.** The legacy "Face Mesh" solution is deprecated; do not use it.
- **Vitest** for unit tests. **Playwright** (optional) for a smoke test using Chromium's fake camera flags (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `--use-file-for-fake-video-capture=<file>`).
- **No DSP or charting libraries in `src/`.** FFT, filters, resampling, peak finding, and plots are hand-written. React, Vite, Vitest, TypeScript, and MediaPipe are allowed. Python (SciPy/NumPy/pandas) is allowed **only** in `tools/`, for reference fixtures and offline statistical analysis of study data.
- Pin dependency versions. Prefer current stable releases; check the registry rather than assuming.
- Rendering: draw plots on `<canvas>` using `requestAnimationFrame`. Keep per-frame data in refs/typed arrays; push only low-rate (<= 4 Hz) summaries into React state to avoid re-render churn.

**Performance budget (goals):** DSP + drawing <= 4 ms median per frame on the main thread, excluding landmark inference. End-to-end >= 28 fps on a typical 2020-era laptop at 640x480 / 30 fps input.

---

## 5. Module specifications

### 5.1 Capture and timing (`capture/`)

- Request: `getUserMedia({ video: { facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 60, min: 24} }, audio: false })`. **Report the actual settings** from `track.getSettings()`.
- Prefer 640x480 at 30-60 fps over 1080p at 30 fps. The ROI mean averages many pixels, so extra resolution adds little, while higher frame rate improves blink timing.
- Time everything in **milliseconds from frame timestamps, never in frame counts.**
- Do not mirror the data. Mirror only the preview with CSS.
- **Hidden tabs:** browsers throttle hidden/minimised pages, and video-frame callbacks may stop. Listen for `visibilitychange`; when hidden, pause analysis, mark the gap, and invalidate windows that span it. The UI should say: "Keep this window visible (e.g. side-by-side) for measurements." Do not claim the app works minimised.
- Camera processing (OS-level auto-framing, background blur, face retouching, "studio" effects) distorts pulse signals. Show a one-time tip to disable them. If `getCapabilities()` exposes exposure/white-balance controls, try to lock them, but never require it.
- Always stop all tracks on "Stop" and on page unload.

**`FrameClock` (pure, unit-tested):** input raw timestamps, output `{tMs, dtMs}`, rolling median dt, jitter, and gap flags (dt > 1.5x median dt). Gaps invalidate any blink event or pulse window that spans them.

> **Gap rule changed (option A, approved by the author, 2026-10-17):** dt > 1.5x median dt is an *irregular interval*: counted and shown as a timing warning, but it does not invalidate data. Only real breaks are gaps that invalidate spanning blink events and pulse windows: dt > 2.5x median dt, frames reported dropped by `requestVideoFrameCallback` (`presentedFrames`), a hidden tab, or a timestamp-source change. Reason: on Chrome's fake camera the 1.5x rule flagged 3-6% of intervals with no frames lost (`docs/METHODS.md`), which would reject nearly every 10 s pulse window. The 2.5x factor is provisional and is to be checked on real webcams in Phase 4.

> **Short holes bridged (approved by the author, 2026-10-24):** gaps from option A are still counted and shown, but a skipped frame or an interval over 2.5x the median breaks an analysis only when the hole is longer than that analysis's own limit: 100 ms for blink events, blink metrics, the per-minute timeline, and the eye-closure indicator (5.3), 250 ms for pulse windows (5.4). A hidden tab or a timestamp-source change always breaks it. Reason: on a camera that skips single frames (common on phones), option A discarded every blink and pulse window around each skipped frame (in a browser test with 57-130 dropped frames per 30 s, the pulse showed no value in 3 of 3 runs). Implemented in `breaksAnalysis` (`src/capture/frameClock.ts`).

### 5.2 Landmarks (`vision/`)

- Use `FaceLandmarker` with `runningMode: 'VIDEO'`, `numFaces: 1`, `outputFacialTransformationMatrixes: true`. Call `detectForVideo(video, timestampMs)`; timestamps must be strictly increasing.
- **Self-host** the model file (`face_landmarker.task`) and the wasm assets in `public/`, so no network request is needed after load. Obtain the model from the official MediaPipe Face Landmarker documentation page, and record the source and version in `docs/METHODS.md`. Try GPU delegate, fall back to CPU.
- Landmarks are **normalised** (0-1). **Convert to pixel coordinates** (`x * videoWidth`, `y * videoHeight`) before computing any distance. Computing EAR in normalised space is a classic bug because the x and y scales differ.
- Index constants live in `vision/landmarks.ts`, each with a comment.
- **Landmark Explorer (dev route):** draws all 478 indices over live video, with a filter by index range, and can highlight a chosen list of indices. **Use it to visually verify every index list and ROI polygon before relying on them.** Record verification screenshots or notes in `docs/METHODS.md`.
- Head pose: derive yaw/pitch/roll from the facial transformation matrix. **Verify the matrix layout and angle conventions empirically** (turn your head; confirm signs on screen) before using it for gating.

### 5.3 Eye Aspect Ratio and blinks (`blink/`)

**EAR (per eye), in pixel coordinates:**

```
EAR = ( ||P2 - P6|| + ||P3 - P5|| ) / ( 2 * ||P1 - P4|| )
```

Starting index sets (P1..P6 in order). **Verify with the Landmark Explorer:**
- Eye A: `[33, 160, 158, 133, 153, 144]`
- Eye B: `[362, 385, 387, 263, 373, 380]`

Per-frame value = mean of the two eyes. Also store each eye separately for diagnostics.

**Calibration (about 10 s, user looks at the screen naturally):**
1. Collect valid EAR samples.
2. Robust open-eye baseline `b`: `b0 = median(samples)`; then `b = median(samples >= 0.85 * b0)`.
3. Set thresholds relative to `b` (initial values, tunable via validation): **close threshold = 0.70 * b**, **reopen threshold = 0.80 * b** (hysteresis).
4. Report calibration quality (sample count, spread). If too few valid samples, ask the user to retry.

Do **not** use a hard-coded absolute EAR threshold such as 0.20. EAR varies by person, camera angle, and distance.

**Blink state machine (hysteresis):**
- States: `OPEN`, `CLOSING/CLOSED`, `REOPENING`.
- Record the time EAR crosses each threshold using **linear interpolation between the two surrounding frames** (sub-frame timing).
- Event duration = reopen crossing time minus close crossing time, in ms.
- Classify descriptively: `blink` (< 500 ms), `long_closure` (500-2000 ms), `extended_closure` (> 2000 ms, possibly eyes shut on purpose or looking away). **Do not label anything "microsleep" or "drowsy."**
- Mark an event `lowConfidence` if only one sample fell below the close threshold.

**Sample gating (invalid samples cannot create or complete events):**
- No face, or face confidence/landmark loss.
- Head pose beyond configurable limits (default +-25 deg yaw, +-20 deg pitch).
- Frame gap larger than 100 ms around the event.
- Note: looking down at a keyboard lowers EAR without a true closure. Pitch gating mitigates this; document the remaining confound.

**Metrics:**
- Blink rate per minute over a rolling 60 s window, **normalised by valid observation time**, not wall-clock time.
- Median and mean blink duration, last blink duration.
- Eye-closed fraction (rolling 60 s): fraction of valid time spent in the closed state.
- Always display the temporal resolution limit: durations are accurate to about +-1 frame interval (e.g. +-33 ms at 30 fps). At 30 fps, very fast blinks may be sampled by only 1-3 frames.

### 5.4 Pulse rate from skin colour (`rppg/`)

**ROI.** Build the ROI from landmarks, not a fixed rectangle, so it follows the face.
- Forehead region (starting proposal, **verify visually**): horizontal span between the two eyebrow landmarks, vertical span from roughly 25% to 65% of the distance between a hairline point and the point between the eyebrows. Candidate indices to inspect: `10` (forehead top), `9` (between brows), `107` and `336` (inner brow points), `105` and `334` (brow). Use a **polygon mask**, not the full bounding box, to avoid hair and eyebrows.
- Optional second ROI on each cheek, chosen with the Landmark Explorer. Compute a trace per ROI and let the quality metric choose or combine them.
- Read pixels from an offscreen canvas (`willReadFrequently: true`) using `getImageData` on the ROI bounding box only (not the whole frame). Apply the polygon mask in code.
- Skip pixels that are saturated (near 255) or very dark; record the **saturation fraction** and **mean luminance** per frame as quality inputs.

**Per-frame trace:** timestamp, mean R, mean G, mean B over valid ROI pixels.

**Resampling:** convert the irregular `(t, R, G, B)` series to a uniform **30 Hz** series. Use bin-averaging when the source rate is >= 45 fps (acts as an anti-alias step), otherwise linear interpolation. Frames separated by a gap > 250 ms invalidate the windows that span them.

**POS algorithm** (Wang et al., 2017). Window length `l = round(1.6 * fs)`; slide by one sample; overlap-add. Channel order: 0 = R, 1 = G, 2 = B.

```
H = zeros(N)
for n in (l-1) .. (N-1):
    m  = n - l + 1
    Cn[k] = C[k][m..n] / mean(C[k][m..n])        # temporal normalisation, k = R,G,B
    S1 = Cn[G] - Cn[B]
    S2 = Cn[G] + Cn[B] - 2 * Cn[R]
    if std(S2) == 0: continue
    alpha = std(S1) / std(S2)
    h = S1 + alpha * S2
    H[m..n] += h - mean(h)
```

**Band-pass:** 4th-order Butterworth, **0.7-3.0 Hz** (42-180 BPM), applied to the analysis window with `filtfilt` (zero phase, SciPy-style edge padding). Display its theoretical magnitude response in the Signal Lab.

**Pulse rate estimate** (window 10 s, hop 1 s; show "Warming up..." until the first full window):
1. Detrend, apply a Hann window.
2. Zero-pad to 4096 and FFT (own implementation).
3. Find the strongest peak in 0.7-3.0 Hz, refine with parabolic interpolation, `BPM = 60 * f`.
4. **Resolution note (put in docs):** the true spectral resolution is about `1/T` (about 0.1 Hz = 6 BPM for 10 s), and zero padding only interpolates. Accuracy therefore depends on SNR and interpolation, not on padding length.
5. Smooth: median of the last 5 estimates. If a new estimate jumps more than 12 BPM from the current median, require two consecutive consistent estimates before accepting.
6. **Time-domain cross-check:** peak-detect the filtered waveform (minimum peak spacing 0.33 s, adaptive prominence). `HR_time = 60 / median(IBI)`. Show both estimates; if they disagree by > 8 BPM, lower confidence.

**Signal Quality Index (SQI):** power within +-0.1 Hz of the spectral peak **plus** within +-0.1 Hz of its second harmonic, divided by total in-band power (0.7-3.0 Hz). Combine with motion and lighting flags into a three-level indicator (Good / Fair / Poor). **Show a BPM value only when quality is at least Fair**; otherwise show "-" with the reason.

**Quality flags (each visible in the UI):**
- Motion: face displacement per frame (e.g. nose tip landmark `1`) normalised by inter-ocular distance (outer eye corners, e.g. `33` and `263`); flag when above a threshold.
- Lighting: sudden mean-luminance change between frames, high saturation fraction, very low luminance.
- Face lost / head pose out of range / frame gaps / low FPS (< 20 fps: warn; < 15 fps: disable pulse estimate).
- Flicker: persistent narrow-band peak that appears in both ROI and a background reference suggests lighting artefacts (Phase 6 extension).

**Known confounds to document, not hide:** auto-exposure and auto-white-balance, video compression, glasses glare, makeup, facial hair, head coverings, screen light reflecting off the face, talking, and skin-tone-dependent signal strength.

### 5.5 UI (`ui/`)

Clean, modern, single page. Light/dark theme following the system setting.

- **Header:** app name, a persistent privacy badge ("Processing on this device. Nothing is uploaded."), Start/Stop, Calibrate.
- **Left:** live preview (mirrored via CSS) with overlays: eye contours, forehead ROI polygon, status colours.
- **Cards:** Blink rate, Last blink duration, Eye-closed fraction, Pulse rate with quality chip, Measured FPS and jitter, and (Phase 4B) the eye-closure sleepiness indicator with a "Not enough data" state.
- **Plots (canvas):** EAR trace with thresholds, filtered pulse waveform, spectrum with the detected peak marked, filter magnitude response.
- **Status strip:** active quality flags with plain-language reasons.
- **Signal Lab view:** raw RGB trace, POS output, filtered waveform, spectrum, side by side, with a short caption for each processing step.
- **Settings:** thresholds, window lengths, head-pose limits, "record numeric trace" (consent prompt; downloads CSV/JSON with timestamps, RGB means, EAR, flags only; no images).
- **About:** disclaimer, methods summary, limitations, link to docs.
- **Accessibility:** full keyboard operation, visible focus, colour contrast >= WCAG AA, never use colour alone to convey state, respect `prefers-reduced-motion`, plot descriptions available as text.

### 5.6 Optional eye-comfort reminder (Phase 6, **off by default**)
- Purely informational, user-configurable. Triggered only when the blink rate stays below a fraction of the user's own calibrated baseline for a user-set duration **and** blink-detection quality has been good for that period.
- Cooldown >= 20 minutes. Gentle, dismissible banner. Suggested text:
  > "You've been blinking less than your usual rate for a few minutes. If your eyes feel dry, consider looking at something far away for 20 seconds."
- Never mention diagnosis or a health state. Nothing is stored.

### 5.7 Eye-closure sleepiness indicator (`blink/sleepiness.ts`, Phase 4B)

**Purpose:** a transparent, personalised indicator of how the user's eyelid behaviour compares with **their own alert baseline**. Whether it tracks sleepiness is something the project **tests** (Section 7.5), not something it assumes.

**Features** (rolling windows of 60 s and 5 min; sample-weighted by `dt`; valid time only):
1. **PERCLOS-style closed fraction:** fraction of valid time with `EAR <= perclosFrac * b` (default `perclosFrac = 0.20`). Document that EAR is not linear in eyelid coverage, so this approximates the classic "eyes at least 80% closed" definition.
2. **Long-closure rate:** events per minute with duration >= 500 ms.
3. **Mean blink duration** (carry the +-1 frame caveat).
4. **Blink-rate ratio to baseline.** Reported **separately and not included in the index**, because concentrating hard lowers blink rate while sleepiness can change it in either direction.
5. *Experimental, optional:* closing-phase duration/speed. Enable only at >= 60 fps; otherwise disabled.

**Alert baseline:** a calibration step of >= 3 minutes of valid data in which the user confirms they feel alert (ideally with a KSS rating <= 3 recorded). Held in memory for the session only. Apply floors to baseline values to avoid dividing by near-zero (document the constants).

**Eye-Closure Index (ECI):** equal-weight mean of `feature / baseline_feature` for features 1-3. Rules:
- **The formula, weights, floors, and bands are fixed in `docs/STUDY_PROTOCOL.md` before any study data is collected.**
- **No machine learning, and no tuning on test participants.** Band cut-offs (e.g. "Near your baseline", "Somewhat above your baseline", "Well above your baseline") are chosen on a development subset, frozen, then evaluated on held-out participants.

**Gating:** show a value only if valid-time coverage is >= 70% of the window and no quality flag (pose, gaps, face loss) dominates it. Otherwise show "Not enough data" with the reason.

**Display:** a continuous gauge, the band label, and a trend sparkline. **No sounds, no pop-ups, no alarms.** Label: "Eye-closure sleepiness indicator (experimental)". Tooltip: "Compares your eyelid behaviour with your own alert baseline. Experimental. May be affected by concentration, glasses, lighting, and head position."

### 5.8 Study mode (`study/`, Phase 4B)

Purpose: collect the reference data needed to test the indicator.

**Karolinska Sleepiness Scale (KSS):** a one-tap, non-blocking prompt every 5 minutes (configurable). Scale anchors: 1 extremely alert, 2 very alert, 3 alert, 4 rather alert, 5 neither alert nor sleepy, 6 some signs of sleepiness, 7 sleepy but no effort to keep awake, 8 sleepy, some effort to keep awake, 9 very sleepy, great effort to keep awake, fighting sleep. **Verify wording against Akerstedt & Gillberg (1990) before publishing.**

**Brief Psychomotor Vigilance Task (PVT-B, about 3 minutes):**
- Blank field; after a random inter-stimulus interval (uniform 1-4 s), a millisecond counter starts; the user presses Space/click/tap; reaction time is recorded and shown briefly.
- Metrics: lapses (RT > 355 ms for the brief version, **verify against Basner & Dinges, 2011**), false starts (RT < 100 ms), median RT, mean of reciprocal RT (1/RT).
- Timing uses `performance.now()` with the input event's own timestamp. Browser display and input latency add tens of milliseconds, so **only within-person, relative comparisons are meaningful**. State this in the docs.
- Keyboard accessible; no rapid full-screen flashing.

**Session protocol (default; documented in `STUDY_PROTOCOL.md`):**
1. Consent screen.
2. Alert baseline (>= 3 min) plus KSS.
3. PVT-B.
4. 15-30 min of the participant's own ordinary computer work (reading, coding, homework), with a KSS prompt every 5 min.
5. PVT-B again.
6. Export a numeric CSV.

Sessions happen at naturally different times of day (for example morning and late evening). **No sleep deprivation, no caffeine manipulation, no request to stay awake.**

**Alignment:** eye-closure features are computed over the 5 minutes before each KSS rating and over each PVT-B window, all on the same timestamp clock.

**Export:** numeric only (timestamps, features, quality flags, KSS, PVT trials, pseudonymous participant ID, session ID). No images, video, or landmarks.

---

## 6. Testing

### 6.1 DSP unit tests and fixtures
- `tools/gen_fixtures.py` generates JSON fixtures with SciPy/NumPy: Butterworth SOS coefficients, `sosfilt`/`sosfiltfilt` outputs on a fixed test signal, `numpy.fft` outputs on fixed signals. Commit the fixtures; the script is for regeneration only.
- Tests assert tolerances stated in Phase 1 acceptance criteria.
- Property tests: filter gain at pass-band and stop-band frequencies; FFT linearity and Parseval's theorem; resampler preserves a known sine's frequency and amplitude.

### 6.2 Synthetic rPPG tests (`tools/synth.ts`)
Generate RGB traces with a known pulse: sinusoid plus second harmonic at a chosen BPM, small amplitude relative to the mean (on the order of 0.1-1%), with optional additive noise, slow illumination drift, motion-like low-frequency artefacts, irregular frame timing (jitter, dropped frames), and different frame rates (24, 30, 60). Tests must **assert numeric error bounds** (e.g. BPM error <= 2 at stated noise levels) and document the exact conditions. Include a test that POS reduces the error compared with using the raw green channel under a shared motion/illumination artefact.

### 6.3 Synthetic blink tests
EAR sequences with known blink times and durations at 24/30/60 fps with noise and gaps. Assert event detection precision/recall and duration error bounds. Include a single-frame dip, a slow closure, a squint (partial drop that does not reach the close threshold), and a baseline that drifts.

### 6.4 Smoke test
Playwright with a fake camera video: the app starts, shows FPS, and processing does not throw. Also assert **no network requests** after initial load.

---

## 7. Validation protocols (these produce the numbers that make the project credible)

### 7.1 General rules
- Report sample size (`n` participants, number of recordings) with every metric.
- Report failures and the conditions that caused them. Do not cherry-pick.
- Keep the detector/estimator parameters fixed once you start a validation run. If you tune parameters, tune on one subset and report on a held-out subset.
- Participants: consenting adults, or minors only with guardian consent. Never post face video publicly. Anonymise traces.

### 7.2 V1: Blink detection
- Record about 2 minutes of reading/typing at a screen per condition, frontal, from a camera at 30 fps or higher, and save the video **locally**. Hand-label blink frames by stepping through the video (or use a public blink dataset if its license allows; verify availability).
- Match detected events to labelled events with a +-100 ms tolerance.
- Report precision, recall, F1, and median absolute duration error, per condition: baseline, with glasses, lower light, head turned slightly.
- **Initial goal (not a guarantee):** F1 >= 0.85 for seated, frontal, no-glasses at >= 30 fps.

### 7.3 V2: Pulse rate
**V2a: Offline datasets.** Use public rPPG datasets (e.g. UBFC-rPPG, PURE; **check current availability, licensing, and access terms before use, and do not redistribute them**). Extract ROI RGB traces to CSV with a separate tool, then run the **same** TS DSP code through `tools/eval_cli.ts`. Report MAE, RMSE, Pearson r, and % of windows within +-5 BPM, using the dataset's ground-truth pulse signal.

**V2b: Live against a reference device.** Use a fingertip pulse oximeter, chest strap, or smartwatch as the reference. Seated, still, 3-5 minutes per condition. Log the reference reading at fixed intervals (for example every 10 s, from video of the device display or its export) and align with app estimates.
- Conditions: good front lighting; dim lighting; screen-lit only; with slow natural head movement.
- Report MAE, RMSE, Pearson r, % within +-5 BPM and +-3 BPM, and a **Bland-Altman plot** (bias and 95% limits of agreement).
- Report results per participant and, if the group is varied, discuss any differences across skin tones and lighting honestly.
- **Initial goal (not a guarantee):** MAE <= 5 BPM and >= 80% of windows within +-5 BPM for seated, still, well-lit recordings. If you miss it, report what you got and why.

### 7.4 Offline HRV analysis (documentation of limits only)
In `tools/`, compute IBI-derived HRV (e.g. RMSSD) from the filtered waveform and compare with a reference where available. Show quantitatively how the ~33 ms frame period at 30 fps and noise limit reliability. This justifies why HRV is not shown in the app.

### 7.5 V3: Does the eye-closure indicator track sleepiness?

**Pre-registration:** write the analysis plan in `docs/STUDY_PROTOCOL.md` and commit it **before collecting any data**: hypotheses, features, ECI formula, windows, exclusion rules (e.g. valid-time coverage < 70%), statistics, and what counts as a null result.

**Questions:**
- **Primary:** within each participant, is the ECI (5-minute window before each rating) correlated with KSS? Use Spearman correlation.
- **Secondary:** do ECI and the individual features differ between the start and end PVT-B sessions, and do they relate to PVT lapses, median RT, and mean 1/RT?

**Controls (required):** compare against trivial predictors, so a correlation cannot be mistaken for something else:
- **Time on task alone** (minutes since session start).
- **Blink rate alone.**
If the ECI does not beat these, report that.

**Reporting:**
- Per-participant coefficients with bootstrap confidence intervals, then the median and range across participants.
- Report `n` participants and `n` sessions; report null and negative results.
- Optional: AUC for KSS >= 7 vs < 7, flagged clearly as exploratory given the small sample.
- Keep analysis scripts, seeds, and exclusion decisions in `tools/` and the repo history.

**Sample (goal, not a guarantee):** about 6-10 participants with at least 2 sessions each, if feasible. State the limits of small samples explicitly.

**Expectation (not a claim):** a positive within-person association with KSS for at least some participants. Report whatever is found.

---

## 8. Privacy, safety, ethics, accessibility (requirements)

- **On-device only.** No uploads, analytics, or third-party scripts. Self-host the model and wasm.
- **CSP:** a restrictive Content-Security-Policy (`default-src 'self'`; `connect-src 'self'`; allow `worker-src`/`wasm-unsafe-eval` only as required by MediaPipe; document each exception). Add a test or manual checklist verifying no external requests in the browser Network tab.
- **No storage of media.** Never persist video frames or images. "Record trace" saves numbers only, only after explicit user action, with a clear description of what's included.
- **Stop means stop.** Release the camera on Stop and when the page unloads.
- **Fairness:** rPPG signal quality is known to vary with skin tone, lighting, and camera. Do not claim universal accuracy; report per-condition results and say plainly where it works poorly.
- **Differences in facial anatomy and blink patterns** (including ptosis, eye conditions, glasses) mean blink metrics may be unreliable for some people. The tool should say "not available" rather than guess, and must never judge a person's blink behaviour as abnormal.
- **Approved wording only** for the sleepiness indicator ("eye-closure indicator", "sleepiness indicator", "compared with your baseline"). Never present it as a detector of fatigue or drowsiness, never show an alarm, and never suggest it can prevent accidents. The standard disclaimer includes "must not be used for driving or any safety-critical decision."
- **Study ethics:** voluntary participation with informed consent (guardian consent for minors), the right to stop at any time, no sleep deprivation, no stimulant or caffeine manipulation, and a reminder not to drive if very sleepy. Pseudonymous IDs, numeric data only, deletion on request.
- **Scientific honesty:** report results as found, including nulls; do not tune parameters on test participants.
- **AI assistance disclosure** in the README: state which parts were developed with AI assistance, and make sure the author can explain every algorithm.

---

## 9. Known limitations to document in `docs/LIMITATIONS.md`

- Frame rate limits timing: at 30 fps blink durations are +-33 ms and very fast blinks may be missed.
- EAR depends on head pose, gaze direction (looking down lowers EAR), glasses, and camera angle.
- Pulse estimates degrade with motion, speaking, poor or flickering light, glare, camera auto-exposure/white-balance, compression, makeup/facial hair/head coverings.
- Spectral resolution of a 10 s window is about 6 BPM; estimates rely on SNR and interpolation.
- Signal strength differs across skin tones; results may be worse for some users.
- Hidden or minimised tabs may be throttled by the browser.
- Webcam HRV is unreliable (see 7.4).
- MediaPipe landmark model is pre-trained; only the downstream geometry and signal processing are written from scratch.
- Eye-closure measures are influenced by more than sleepiness: concentration (lower blink rate), task type (reading vs video call), looking down, dry eyes, contact lenses, glasses glare, screen brightness, and time-of-day habits.
- The sleepiness indicator is validated only in a small study; results may not generalise across people, ages, cameras, or lighting.
- PVT timing in a browser includes display and input latency, so only relative within-person comparisons are meaningful.
- KSS is a subjective self-rating and is affected by the act of being asked.

---

## 10. Documentation deliverables

- **README.md:** what it is, demo GIF, how to run, honest results summary with links to `VALIDATION.md`, disclaimer, AI-assistance disclosure.
- **docs/METHODS.md:** equations (EAR, POS, Butterworth design via bilinear transform with pre-warping, FFT, windowing, SQI), diagrams of the pipeline, MediaPipe model source/version, landmark index verification notes, parameter tables.
- **docs/VALIDATION.md:** protocols, participants (n, anonymised), tables, Bland-Altman and error plots, failure analysis, parameter-tuning/hold-out description.
- **docs/LIMITATIONS.md:** Section 9, expanded.
- **docs/ETHICS_AND_PRIVACY.md:** data handling, consent process for testing, fairness discussion.
- **docs/STUDY_PROTOCOL.md:** the pre-registered plan for the sleepiness-indicator study (Section 7.5). Must predate the first participant session in git history.
- Demo video script (60-90 seconds): problem, pipeline in 3 steps, live demo with Signal Lab, one validation plot, one honest limitation.

---

## 11. Definition of done (whole project)

- [ ] `npm run check` passes (types, lint, tests).
- [ ] All Phase 1 fixture tests pass against SciPy/NumPy references.
- [ ] Landmark indices and ROI verified with the Explorer; notes recorded.
- [ ] V1 and V2 validation reported with sample sizes, including failures.
- [ ] No network requests after load (verified).
- [ ] Fatigue/sleepiness wording appears only in approved form for the indicator; no stress/emotion/attention/cognitive/"autonomic" language anywhere; no "detect"/"diagnose" claims (grep check).
- [ ] `docs/STUDY_PROTOCOL.md` committed before the first participant session; V3 results reported with `n`, controls, and any null findings.
- [ ] No HRV in the UI.
- [ ] Accessibility checks completed (keyboard, contrast, reduced motion).
- [ ] README, METHODS, VALIDATION, LIMITATIONS, ETHICS docs complete.
- [ ] Live demo deployed as static hosting; demo video recorded.

---

## 12. Phase kickoff prompts (paste one at a time)

**Phase 0:**
> Read `PROJECT_SPEC.md` and `CLAUDE.md`. Do Phase 0 only: scaffold the repo per Section 3 and 4, add `npm run check`, a restrictive CSP, and a placeholder page. Run the checks and tell me what you verified.

**Phase 1:**
> Do Phase 1 only. Implement the DSP core in `src/dsp/` with unit tests and SciPy/NumPy fixtures from `tools/gen_fixtures.py`. Do not add any DSP library. Show me the test results against the acceptance criteria.

**Phase 2:**
> Do Phase 2 only. Implement camera capture and `FrameClock` with frame timestamps from `requestVideoFrameCallback` (feature-detected, with fallback). Add the dev overlay for FPS, jitter, and gaps. Read the current docs for any browser APIs you are unsure about.

**Phase 3:**
> Do Phase 3 only. Integrate MediaPipe FaceLandmarker (read the current tasks-vision docs first), build the Landmark Explorer, then EAR, calibration, and the blink detector with the synthetic tests in Section 6.3. Do not trust any landmark index until verified in the Explorer.

**Phase 4:**
> Do Phase 4 only. Implement ROI extraction, RGB trace, resampling, POS, Butterworth band-pass, spectrum-based pulse rate, SQI, and gating per Section 5.4, with the synthetic tests in Section 6.2. Reuse the DSP core; do not add libraries.

**Phase 4B:**
> Do Phase 4B only. First write `docs/STUDY_PROTOCOL.md` (hypotheses, features, ECI formula, windows, exclusions, analysis plan, controls) and stop so I can review it before any code. After I approve it, implement `src/blink/sleepiness.ts` with unit tests on synthetic sequences, the KSS prompt, the brief PVT, the session runner, and numeric CSV export, per Sections 5.7 and 5.8. Do not tune any formula or threshold using study data.

**Phase 5:**
> Do Phase 5. Build the Signal Lab, trace export, `tools/eval_cli.ts`, accessibility pass, and docs per Section 10. List anything in the Definition of Done that is not yet met.

---

## Appendix A: References (verify details before citing)

- Soukupova, T., Cech, J. (2016). *Real-Time Eye Blink Detection using Facial Landmarks.* CVWW.
- Wang, W., den Brinker, A. C., Stuijk, S., de Haan, G. (2017). *Algorithmic Principles of Remote PPG.* IEEE Transactions on Biomedical Engineering.
- de Haan, G., Jeanne, V. (2013). *Robust Pulse Rate From Chrominance-Based rPPG.* IEEE TBME.
- Poh, M.-Z., McDuff, D. J., Picard, R. W. (2010). *Non-contact, automated cardiac pulse measurements using video imaging and blind source separation.* Optics Express.
- Bobbia, S., et al. (2019). *Unsupervised skin tissue segmentation for remote photoplethysmography* (UBFC-rPPG). Pattern Recognition Letters.
- Stricker, R., Muller, S., Gross, H.-M. (2014). *Non-contact video-based pulse rate measurement on a mobile service robot* (PURE dataset). IEEE RO-MAN.
- Kartynnik, Y., et al. (2019). *Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs.* (MediaPipe face mesh)
- Bland, J. M., Altman, D. G. (1986). *Statistical methods for assessing agreement between two methods of clinical measurement.* The Lancet.
- Cooley, J. W., Tukey, J. W. (1965). *An algorithm for the machine calculation of complex Fourier series.* Mathematics of Computation.
- Butterworth, S. (1930). *On the theory of filter amplifiers.* Experimental Wireless and the Wireless Engineer.
- Dinges, D. F., Grace, R. (1998). *PERCLOS: A valid psychophysiological measure of alertness as assessed by psychomotor vigilance.* FHWA technical brief.
- Akerstedt, T., Gillberg, M. (1990). *Subjective and objective sleepiness in the active individual.* International Journal of Neuroscience. (KSS)
- Dinges, D. F., Powell, J. W. (1985). *Microcomputer analyses of performance on a portable, simple visual RT task during sustained operations.* Behavior Research Methods, Instruments, & Computers. (PVT)
- Basner, M., Dinges, D. F. (2011). *Maximizing sensitivity of the psychomotor vigilance test (PVT) to sleep loss.* Sleep. (brief PVT, lapse threshold)
- Schleicher, R., et al. (2008). *Blinks and saccades as indicators of fatigue in sleepiness warnings: looking tired?* Ergonomics.

## Appendix B: UI string guidelines

- Use: "Estimated pulse rate", "Quality: Good/Fair/Poor", "Blink rate", "Eye-closed fraction", "Measuring...", "Not enough signal".
- Sleepiness indicator (approved wording): "Eye-closure sleepiness indicator (experimental)", "Compared with your own baseline", "Near your baseline", "Somewhat above your baseline", "Well above your baseline", "Not enough data".
- Avoid: "fatigue detected", "drowsy" or "drowsiness detected", "you are tired", "stress", "emotion", "attention", "cognitive", "autonomic", "diagnose", "alert" or "warning" language for the indicator, and any suggestion about driving or safety. "Alert" is permitted only as a state word in "alert baseline" and in the optional reminder wording in 5.6.
