# Validation

This file holds validation results only from real runs, with sample sizes, including null and
negative findings. **No validation has been run yet**; the procedures below are ready.

## V1: Blink detection (PROJECT_SPEC 7.2)

**Status: not run yet.** The tool is ready; the recordings and hand labels need the author.

Procedure:

1. Record about 2 minutes of reading or typing at the screen per condition (baseline, glasses,
   lower light, head turned slightly), frontal, at 30 fps or more. Keep the files on the device;
   they are not part of the repository.
2. Open the app at `#v1`, pick the file and condition, press Analyse (0.5x speed by default;
   re-run slower if frames were skipped). Export the detections.
3. Label every blink frame by frame with the detections hidden (start: first frame with the upper
   lid clearly lower than open; end: first frame fully open again). Export the labels.
4. Score in the page or with `npm run score:v1 -- labels.csv detections.csv`. Tolerance +-100 ms on
   start time; labels in the 10 s calibration window are excluded and their count is reported.
5. Report precision, recall, F1, median absolute duration error, n of labels, and frames skipped,
   per condition, as found. Initial goal (not a guarantee): F1 >= 0.85 for seated, frontal,
   no-glasses at >= 30 fps.

Results: none yet.

## V2: Pulse rate (PROJECT_SPEC 7.3)

**Status: not run yet.** The tools are ready; the datasets and live recordings need the author.

Parameters are frozen from the start of V2 (PROJECT_SPEC 7.1): the SQI levels, flag thresholds,
and fusion rules listed in `docs/METHODS.md` ("Pulse rate").

**V2a (public datasets):** check availability, licence, and access terms first (e.g. UBFC-rPPG,
PURE); do not redistribute. Per video:

1. If the browser cannot play the dataset's format, convert it to H.264 MP4 or WebM at the
   highest quality (lossless VP9 if possible) and keep the frame rate. Record the conversion; lossy
   compression weakens the pulse signal and must be reported as a condition of the result.
2. Open the app at `#v2`, pick the file, Analyse at 0.5x (analyse again slower if frames were
   skipped), and Export frames CSV. `t_ms` is the video's own time in milliseconds.
3. Write the dataset's ground-truth pulse signal as `t_ms,ppg` in the same time base (this step
   depends on the dataset's file format and is done by hand or a small script), then
   `npm run ppg:ref -- ppg.csv reference.csv`.
4. `npm run eval -- frames.csv reference.csv` reports MAE, RMSE, Pearson r, % within +-5 and +-3 BPM,
   and Bland-Altman bias and limits, fused and for each single region.

**V2b (live, reference device):** seated, still, 3-5 minutes per condition (good front light, dim
light, screen light only, slow natural head movement). In the app: Pulse tab, "Record numeric
trace...", then save. Log the reference device every 10 s as `wall_time_ms,bpm` (milliseconds since
1970, e.g. read from a video of the device next to a clock). Run `npm run eval` on the frames CSV
with that log. Report per condition and per participant, including failures, with a Bland-Altman
plot.

Results: none yet.

## V3: Does the eye-closure indicator track sleepiness? (PROJECT_SPEC 7.5)

**Status: not run.** The study protocol (`docs/STUDY_PROTOCOL.md`) is a draft and not frozen;
open decisions D1-D18, the KSS permission (D2), and any review-board answer must be settled first,
and the frozen protocol must be committed before the first participant session (gate G-B).

Procedure once the protocol is frozen:

1. Run each session in study mode (`#study`) and export its CSV. Keep the files outside the
   repository (they are participant data); only aggregated results go into this file.
2. Development subset (the author's own pilot sessions, Section 7): apply the band rule and commit
   the final bands before analysing anyone else:

   ```sh
   .venv/Scripts/python tools/analyze_v3.py data/ --dev P01 --bands
   ```

3. Held-out analysis (every other participant):

   ```sh
   .venv/Scripts/python tools/analyze_v3.py data/ --dev P01 --out v3-report.md
   ```

4. Copy the report's tables here: n recruited, consented, excluded (with reasons), withdrawn
   (counted by hand; the files of withdrawn participants are deleted), and analysed; per-participant
   rho with intervals; the Wilcoxon result; both controls; H2; the sensitivity analyses; the
   exploratory AUC. Report null and negative results in the same detail.

Results: none yet.

## Phase 5 checks (not validation)

The browser checks of the Signal Lab, About dialog, keyboard use, reduced motion, and screen
widths are described in `docs/METHODS.md` ("Signal Lab, About, and the Phase 5 checks"). They
check that the app works, not how accurate it is.
