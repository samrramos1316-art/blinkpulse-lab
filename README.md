# BlinkPulse Lab

An experimental, fully on-device signal-processing project that estimates **blink metrics** and
**pulse rate** from webcam video, with every key algorithm (FFT, filters, resampling, peak
detection, plots) written by hand and validated against reference data.

> **Status: Phase 4 (pulse rate) built; validations V1 and V2 pending.** The app tracks face
> landmarks on the device and shows blink rate, eye-closed fraction, a per-minute blink timeline,
> and an estimated pulse rate from three skin regions with a quality level. None of these has been
> validated on real people yet; the numbers so far come from synthetic signals (see
> `docs/METHODS.md`). See `PROJECT_SPEC.md` Section 2 for the phase plan.

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
- Phase 4 (rPPG pulse pipeline, fusion, quality, plots, trace recording, eval CLI, tests):
  AI-assisted.

## License

MIT. See `LICENSE`.
