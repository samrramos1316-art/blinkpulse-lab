# BlinkPulse Lab

An experimental, fully on-device signal-processing project that estimates **blink metrics** and
**pulse rate** from webcam video, with every key algorithm (FFT, filters, resampling, peak
detection, plots) written by hand and validated against reference data.

> **Status: Phase 3b (blink timeline) built; Phase 3 validation V1 pending.** The app tracks face landmarks
> on the device, calibrates to your open-eye level, and shows blink rate, eye-closed fraction, and
> a live EAR plot, plus a per-minute session timeline with numeric export. Its accuracy on real
> video has not been measured yet (validation V1). Pulse measurement is not built yet. See `PROJECT_SPEC.md` Section 2 for the phase plan.

## Disclaimer

> BlinkPulse Lab is an experimental educational signal-processing and research project. It is not
> a medical device and does not diagnose, monitor, or treat any condition. Its eye-closure
> fatigue/drowsiness indicator compares your eyelid behaviour with your own baseline and has not
> yet been validated (see docs/VALIDATION.md); it must not be used for driving or any
> safety-critical decision. Estimates can be wrong, especially with motion, poor lighting, or
> camera processing. All processing happens on your device; no video or images are uploaded or
> stored.

## Running locally

Requires Node.js 22.12+ or 24+. The camera needs a secure context: `localhost` or https.

```sh
npm install
npm run dev        # development server (CSP header with connections to self only)
npm run build      # typecheck + production build into dist/ (CSP meta tag injected)
npm run preview    # serve dist/ to test the production build with its CSP
npm run check      # typecheck + lint + format check + tests
npm run score:v1 -- labels.csv detections.csv   # score validation V1 from exported CSVs
```

Developer pages: `#explorer` (Landmark Explorer, to check landmark indices on live video) and
`#v1` (validation V1: analyse a local recording, hand-label blinks, score).

Third-party runtime: MediaPipe tasks-vision 1.1.1 and its face landmarker model, both self-hosted.
The library has a built-in usage logger that the CSP blocks (see `docs/ETHICS_AND_PRIVACY.md`).

## Regenerating test fixtures (optional)

The SciPy/NumPy reference fixtures in `test/fixtures/` are committed. To regenerate them
(Python 3.11+):

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r tools/requirements.txt   # Windows (.venv/bin/python elsewhere)
.venv/Scripts/python tools/gen_fixtures.py
```

## Results

None yet. Accuracy numbers will be reported in `docs/VALIDATION.md` with sample sizes once the
validation runs (V1, V2, V3) have been done.

## Project documents

- `PROJECT_SPEC.md`: source of truth, amended by `SPEC_AMENDMENT_01.md` and `SPEC_AMENDMENT_02.md`
- `CLAUDE.md`: working rules for AI-assisted development
- `docs/`: methods, validation, limitations, ethics and privacy (filled in as phases complete)

## AI assistance

Parts of this project are developed with AI assistance (Claude Code). A per-phase breakdown of
what was AI-assisted will be kept here. The author is responsible for, and must be able to
explain, every algorithm.

- Phase 0 (scaffold, tooling, design tokens, layout shell): AI-assisted.
- Phase 1 (DSP core, reference fixtures, tests): AI-assisted.
- Phase 2 (camera capture, frame timing, first-run setup, tests): AI-assisted.
- Phase 3 (landmarks, EAR, calibration, blink detector, plot, Explorer, V1 tool, tests):
  AI-assisted.
- Phase 3b (per-minute session timeline, plots, export, tests): AI-assisted.

## License

MIT. See `LICENSE`.
