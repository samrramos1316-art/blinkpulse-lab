# BlinkPulse Lab

An experimental, fully on-device signal-processing project that estimates **blink metrics** and
**pulse rate** from webcam video, with every key algorithm (FFT, filters, resampling, peak
detection, plots) written by hand and validated against reference data.

> **Status: all features built (Phases 0-5); no validation run yet.** The app tracks face
> landmarks on the device and shows blink rate, eye-closed fraction, a per-minute blink timeline,
> an estimated pulse rate from three skin regions with a quality level, an experimental eye-closure
> indicator, a Signal Lab, and a study mode with its analysis script. None of these has been
> validated on real people yet: validations V1 (blinks), V2 (pulse), and V3 (the indicator study)
> need recordings, a reference device, and participants. The numbers so far come from synthetic
> signals (see `docs/METHODS.md`).

![Main view, light theme, with a synthetic face as the camera](docs/screenshots/main-1280-light.png)

_Screenshots use a synthetic face rendered from MediaPipe's canonical face model, never a real
person. More in `docs/screenshots/` (360, 768, and 1280 px; light and dark; Signal Lab; About)._

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
npm run eval -- frames.csv reference.csv       # offline pulse evaluation (V2)
npm run ppg:ref -- ppg.csv reference.csv       # reference BPM from a ground-truth PPG (V2a)
```

### On a phone

`npm run dev:phone` serves the app over https on your local network, so a phone on the same Wi-Fi
can use its front camera (phone browsers allow the camera only on secure pages):

1. Stop `npm run dev` if it is running (both use port 5173).
2. Run `npm run dev:phone`. The first time, it makes a self-signed certificate in `.cert/` (needs
   `openssl`, included with Git for Windows; the folder is git-ignored) and prints the address,
   e.g. `https://10.0.1.28:5173/`. If Windows asks whether Node.js may use the network, allow it
   on private networks only.
3. Open that address on the phone and accept the certificate warning once.

Everything still runs on the phone: the computer only serves the page files. While measuring, the
app asks the phone to keep the screen on (Screen Wake Lock), because a locked screen pauses the
camera. Phone cameras and processors vary; check the measured frame rate under "Timing details"
(the indicator and blink timing need at least 24 fps).

**Signal Lab** (header button): the five steps of the pulse estimate for one skin region, live:
the raw colour channels, the POS output, the band-pass filter, the filtered waveform with beats,
and the spectrum, each with a short caption. **About** (header button): the disclaimer, a methods
summary, limitations, and the fixed processing parameters.

Developer pages: `#explorer` (Landmark Explorer, to check landmark indices on live video),
`#v1` (validation V1: analyse a local recording, hand-label blinks, score), and `#v2` (validation
V2a: pulse trace from a local video file).

Study mode: `#study` runs one session of the sleepiness study (`docs/STUDY_PROTOCOL.md`):
researcher setup with a participant code, blink calibration, a 1-9 rating, the 3-minute alert
baseline, a 3-minute reaction-time task, 25 minutes of the participant's own work with a rating
every 5 minutes, the reaction-time task again, then a numbers-only CSV export. The indicator and
the live measurements stay hidden until after the export. **The protocol is a draft and the rating
wording is a placeholder: use study mode only to test it on yourself.** Keep the app's window
visible during a session; the app pauses measuring while it is hidden.

Third-party runtime: MediaPipe tasks-vision 1.1.1 and its face landmarker model, both self-hosted.
The library has a built-in usage logger that the CSP blocks (see `docs/ETHICS_AND_PRIVACY.md`).

## Study analysis (Python, optional)

`tools/analyze_v3.py` runs the pre-registered analysis (`docs/STUDY_PROTOCOL.md` Sections 7-9) on
the study-mode CSV files. Set up the Python environment as below, then:

```sh
.venv/Scripts/python tools/analyze_v3.py data/ --dev P01 --out v3-report.md
.venv/Scripts/python -m unittest tools/test_analyze_v3.py
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

None yet. Accuracy numbers will be reported in `docs/VALIDATION.md` with sample sizes, including
null and negative results, once the validation runs (V1, V2, V3) have been done. Until then, read
`docs/LIMITATIONS.md` before trusting any number the app shows.

## Project documents

- `PROJECT_SPEC.md`: source of truth, amended by `SPEC_AMENDMENT_01.md` and `SPEC_AMENDMENT_02.md`
- `CLAUDE.md`: working rules for AI-assisted development
- `docs/METHODS.md`: equations, pipeline diagram, parameters, tests and browser checks
- `docs/VALIDATION.md`: validation procedures (V1, V2, V3) and, later, their results
- `docs/LIMITATIONS.md`, `docs/ETHICS_AND_PRIVACY.md`
- `docs/STUDY_PROTOCOL.md` (draft, not frozen) and `docs/forms/` (consent and assent drafts)
- `docs/DEMO_SCRIPT.md`: script for a 60-90 second demo video
- `docs/PHASE_NOTES.md`: what was verified, what was not, and deviations, per phase

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
- Phase 4 (rPPG pulse pipeline, fusion, quality, plots, trace recording, eval CLI, tests):
  AI-assisted.
- Phase 4B (study protocol draft and forms, eye-closure indicator, study mode, reaction-time task,
  analysis script, tests): AI-assisted. The protocol's decisions are the author's to make.
- Phase 5 (Signal Lab, About dialog, accessibility and privacy checks, docs, demo script):
  AI-assisted.

## License

MIT. See `LICENSE`.
