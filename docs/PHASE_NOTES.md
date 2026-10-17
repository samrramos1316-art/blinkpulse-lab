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
