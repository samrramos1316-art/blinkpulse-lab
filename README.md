# BlinkPulse Lab

An experimental, fully on-device signal-processing project that estimates **blink metrics** and
**pulse rate** from webcam video, with every key algorithm (FFT, filters, resampling, peak
detection, plots) written by hand and validated against reference data.

> **Status: Phase 1 (DSP core) complete.** The app still shows a placeholder page. The
> hand-written signal-processing core is in `src/dsp/`, tested against SciPy/NumPy references.
> See `PROJECT_SPEC.md` Section 2 for the phase plan.

## Disclaimer

> BlinkPulse Lab is an experimental educational signal-processing and research project. It is not
> a medical device and does not diagnose, monitor, or treat any condition. Its eye-closure
> fatigue/drowsiness indicator compares your eyelid behaviour with your own baseline and has not
> yet been validated (see docs/VALIDATION.md); it must not be used for driving or any
> safety-critical decision. Estimates can be wrong, especially with motion, poor lighting, or
> camera processing. All processing happens on your device; no video or images are uploaded or
> stored.

## Running locally

Requires Node.js 22.12+ or 24+.

```sh
npm install
npm run dev        # development server (no CSP; hot reload needs inline scripts)
npm run build      # typecheck + production build into dist/ (CSP meta tag injected)
npm run preview    # serve dist/ to test the production build with its CSP
npm run check      # typecheck + lint + format check + tests
```

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

## License

MIT. See `LICENSE`.
