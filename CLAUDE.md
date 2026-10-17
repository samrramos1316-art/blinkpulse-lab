# CLAUDE.md: Working rules for BlinkPulse Lab

> **AMENDED:** `SPEC_AMENDMENT_01.md` takes precedence over this file where they conflict. In particular, the indicator wording rule in 'Product rules' is replaced by Patch C1 of the amendment. Everything else here still applies.

> **AMENDED:** `SPEC_AMENDMENT_02.md` adds the visual design and ease-of-use requirements (Calm minimal style, design tokens, first-run flow). It never overrides a product, privacy, wording, or accessibility rule.

Read `PROJECT_SPEC.md` first. It is the source of truth. These rules apply to every session.

## Workflow
- Work on **one phase at a time**. Do not start the next phase until the current phase's acceptance criteria pass.
- Before finishing any task, run `npm run check` (typecheck + lint + tests) and report the results honestly.
- At the end of each phase, write a short note: what was verified, what could not be verified, and any deviations from the spec.
- If a spec requirement is ambiguous or seems wrong, say so and propose a fix instead of silently choosing.

## Code rules
- TypeScript strict mode. No `any` without a comment explaining why.
- `src/dsp/`, `src/blink/` logic, and `src/rppg/` logic are **pure**: no DOM, no React, no `window`/`document`. They must run in Node for tests and the offline CLI.
- **No DSP or charting libraries.** FFT, filters, resampling, peak detection, and plots are hand-written. Python/SciPy is allowed only in `tools/` for fixtures.
- All timing uses **milliseconds from frame timestamps**, never frame counts. Use sub-frame interpolation for threshold crossings.
- Landmarks are normalised: **convert to pixel coordinates before computing distances**.
- Do not mirror data, only the preview (CSS).
- Keep per-frame data in refs/typed arrays; update React state at <= 4 Hz.
- Prefer small, well-named functions with unit tests over large ones.

## Verification rules (important)
- **Never trust a landmark index from memory.** Verify every index list and ROI polygon in the Landmark Explorer and record the result in `docs/METHODS.md`.
- **Read official docs** for MediaPipe tasks-vision, `requestVideoFrameCallback`, Vite, Vitest, and Playwright before using their APIs.
- Do not invent dataset details, citations, or numeric results. If you cannot verify something, say so.
- Every numeric claim in docs must come from a test or a validation run, with the sample size.
- Report validation results as found, including null or negative findings, and compare the indicator against the time-on-task and blink-rate controls.

## Product rules (non-negotiable)
- Not a medical device. No diagnosis or health claims.
- **Sleepiness/fatigue wording is allowed only for the Phase 4B eye-closure indicator, in the approved wording from Appendix B.** Never say the app "detects" fatigue or drowsiness, never show alarms or sounds for it, never mention driving or safety except in the disclaimer.
- **Never infer or mention stress, emotion, attention, or cognitive/autonomic state.** Never use pulse or HRV as a sleepiness signal.
- The Eye-Closure Index formula, weights, floors, and bands are fixed in `docs/STUDY_PROTOCOL.md` before data collection. Do not tune them on study participants' data, and do not add machine learning to the indicator.
- The indicator must show "Not enough data" whenever coverage or quality gating fails.
- **No HRV in the UI.** HRV exists only in the offline analysis script.
- No network requests after initial load. No telemetry. No third-party scripts. Self-host the model and wasm files.
- Never store or upload video, images, or landmarks. "Record trace" saves numbers only, after explicit user action.
- Always release the camera on Stop and page unload.
- Show pulse rate only when signal quality is at least Fair; otherwise show "-" with the reason.
- Keep the disclaimer from Section 1.3 of the spec in the footer, README, and About dialog.

## Accessibility
- Keyboard operable, visible focus, WCAG AA contrast, never colour alone, respect `prefers-reduced-motion`.
