# SPEC_AMENDMENT_01: Full coverage of the four project goals + implementation plan

Applies to: `PROJECT_SPEC.md`, `CLAUDE.md`. Where this file conflicts with them, this file wins once merged.
Author goals being covered:

1. Track blinking mechanics
2. Track pulse mechanics across the face
3. Analyse blinks as time goes on
4. Analyse a fatigue / drowsiness factor as time goes on

"Covered" here means: specified, has acceptance tests, and has a validation step. It does **not** mean the results will be accurate. Results are whatever V1/V2/V3 find.

---

## Part 1. Coverage after this amendment

| Goal | Covered? | Where | What changed |
|---|---|---|---|
| 1. Blinking mechanics | YES | Phase 3, Sec 5.3 | No change. Closing/reopening speed stays experimental (>= 60 fps only). |
| 2. Pulse across the face | YES | Phase 4, new Sec 5.4.1 | Multi-region pulse (forehead + both cheeks), per-region quality, agreement across regions, fused estimate. Moved up from Phase 6. |
| 3. Blink analysis over time | YES | Phase 3b, new Sec 5.3.1 | Per-minute session timeline, session summary view, numeric export. |
| 4. Fatigue/drowsiness factor over time | YES | Phase 4B, amended Sec 5.7 + 5.9 | Indicator label may use "fatigue/drowsiness" (approved form only). Factor breakdown and trend over the session. Study mode hides it from participants. |

### What this amendment deliberately does NOT change
- **No diagnosis, monitoring, or treatment claims.** Section 1.2 and the disclaimer stay.
- **Pulse and HRV are not inputs to the fatigue/drowsiness indicator.** There is no validation for that, and the spec forbids it. The pulse feature (goal 2) and the fatigue feature (goal 4) stay separate.
- **No "detects", no alarms, no sounds, no driving/safety suggestions.**
- **No ML, and no tuning on study participants.**
- The ECI formula, weights, floors, and bands are still frozen in `STUDY_PROTOCOL.md` before data collection.

---

## Part 2. Spec patches

### Patch A: Goal 2, multi-region pulse (add as Section 5.4.1)

**Meaning of "across the face":** several skin regions are measured independently, compared, and combined. The app reports per-region signal quality and agreement. It does **not** claim anything about blood flow, circulation, or health from regional differences.

**Regions (initial):** forehead, left cheek, right cheek.
- Forehead indices are the candidates already in 5.4.
- **Cheek polygons: choose in the Landmark Explorer. Do not use any index from memory.** Record the chosen indices and a verification screenshot in `docs/METHODS.md`. Avoid eyes, nostrils, mouth, hairline, facial hair, and glasses frames.
- Each region uses a polygon mask, saturation/darkness rejection, and its own RGB trace.

**Per-region processing:** each region runs the same resample -> POS -> band-pass -> spectrum -> SQI chain from 5.4 independently.

**Fusion (fixed before validation, not tuned afterwards):**
1. Keep regions whose SQI is Fair or better and which have no region-specific flag (saturation, low luminance, mask coverage < 60%).
2. Fused BPM = SQI-weighted median of the kept regions' BPM.
3. Region agreement = max minus min BPM across kept regions.
4. Confidence rules:
   - Fewer than 1 kept region: show "-" with the reason.
   - Exactly 1 kept region: show BPM, cap quality at Fair, note "single region".
   - Agreement > 8 BPM: lower the quality level by one step and show "Regions disagree".
5. The 5-estimate median smoothing and the 12 BPM jump rule from 5.4 apply to the fused value.

**UI additions:**
- Face overlay draws each region polygon with a text label ("Forehead: Good", "Left cheek: Fair", "Right cheek: Poor"). Colour is never the only cue (use label plus pattern/icon).
- A "Pulse by region" card: a small table of region, BPM or "-", quality, and reason; plus the fused value and the agreement in BPM.
- Signal Lab shows each region's filtered waveform and spectrum, selectable.
- Plot text descriptions cover the per-region view.

**Tests (extend Section 6.2):**
- Synthetic traces with three regions at the same true BPM but different noise levels: the fused estimate has error <= the median single-region error, and a region with only noise is excluded.
- Two regions at the true BPM plus one at an unrelated frequency (motion artefact): the fused estimate stays within 2 BPM and agreement is flagged.
- All three regions poor: output is "-" with a reason, never a number.
- Frame gaps invalidate the spanned windows in every region.

**Performance:** three ROIs triple the pixel reads and POS work. Re-check the 4 ms DSP+draw budget. If exceeded, move the rPPG pipeline into a Web Worker (the spec's Phase 6 item becomes conditional Phase 4 work).

**Validation additions (V2b):** report MAE/RMSE/within +-5 BPM for (a) forehead only, (b) each cheek only, (c) fused. If fusion does not beat the best single region, report that.

### Patch B: Goal 3, blink analysis over time (add as Section 5.3.1)

New pure module `src/blink/sessionSummary.ts` (no DOM/React), consuming blink events and valid-time samples.

**Per-minute bins** over the session, each with: blink count, blink rate normalised by valid time, median and mean blink duration, long-closure count, eye-closed fraction, valid-time coverage (%), and a "usable" flag (coverage >= 70%).
Bins that are not usable show as gaps, never as zeros.

**Session summary view (UI):**
- Time-series plots: blink rate, median blink duration, eye-closed fraction, long-closure count, each against minutes since start.
- Each plot has a text alternative (e.g. "Blink rate over 24 minutes: range X to Y, 3 minutes unusable").
- A coverage bar showing which minutes had enough valid data, and why not (face lost, head pose, gaps, low FPS).
- Duration values carry the +-1 frame caveat.
- Numeric export of the per-minute table (no images or landmarks), same consent flow as "Record trace".
- Descriptive only: the app never says a blink pattern is abnormal or healthy.

**Tests:** synthetic EAR sequences with known per-minute blink counts, durations and closed fractions, including a dropout minute, a head-turn minute, and a frame-gap minute. Assert bin values within stated tolerances and that unusable minutes are flagged.

### Patch C: Goal 4, fatigue/drowsiness factor over time

#### C1. Wording (edit `PROJECT_SPEC.md` 1.2, 5.7, 8, Appendix B and `CLAUDE.md` Product rules)

Replace the current "sleepiness wording only in the approved form" rule with:

> **Fatigue/drowsiness wording is allowed only for the eye-closure indicator and its factor breakdown, only in the approved wording below, and always with "(experimental)" and "compared with your own baseline".** The app must not say it "detects", "diagnoses", "predicts", or "warns of" fatigue or drowsiness, must not say "you are tired/drowsy", must not show alarms, sounds, or pop-ups for it, and must not mention driving or safety except in the disclaimer.

Approved wording (replaces the sleepiness list in Appendix B):
- Card title: **"Eye-closure fatigue/drowsiness indicator (experimental)"**
- Subtitle: "Compared with your own alert baseline"
- Bands (unchanged): "Near your baseline", "Somewhat above your baseline", "Well above your baseline"
- Gated state: "Not enough data"
- Factor labels: "Eye-closed fraction vs baseline", "Long closures vs baseline", "Blink duration vs baseline"
- Tooltip: "Compares your eyelid behaviour with your own alert baseline. Experimental. It does not detect or diagnose fatigue or drowsiness, and may be affected by concentration, glasses, lighting, and head position."

Still banned anywhere in the UI: "fatigue detected", "drowsiness detected", "you are tired", "stress", "emotion", "attention", "cognitive", "autonomic", "diagnose", alarm/warning language, any driving or safety suggestion.

Update the Definition-of-Done grep check: allow `fatigue`/`drowsiness` only inside the approved strings above (keep the approved strings in one file, `src/ui/strings.ts`, and grep that every other occurrence fails).

Update the disclaimer's first sentence about the indicator to: "Its eye-closure fatigue/drowsiness indicator compares your eyelid behaviour with your own baseline..." (rest unchanged, including "must not be used for driving or any safety-critical decision").

> **Because the wording is part of what participants and readers see, settle it now and freeze it with the study protocol.**

#### C2. Factor breakdown and trend (add as Section 5.9)

- Over the session, plot **the ECI and each of its three factors separately** (closed fraction, long-closure rate, mean blink duration, each as a ratio to the personal baseline), on a shared time axis, 60 s and 5 min windows selectable.
- Blink rate ratio stays displayed separately and is never part of the ECI (as in 5.7).
- Gaps where gating failed are shown as gaps with the reason ("Not enough data: face lost"), never interpolated.
- Session-end summary: minutes in each band, minutes "Not enough data", and the first and last usable 5-minute values. Descriptive only.
- Text alternative for every plot.

#### C3. Participants must not see the indicator during study sessions

Seeing a "fatigue/drowsiness" gauge changes how people rate their own sleepiness (KSS) and how they behave. In **study mode the indicator, factor plots and bands are hidden**. They are computed and exported, and visible only in a post-session review. Add this to `STUDY_PROTOCOL.md` as a design decision. Outside study mode (normal use) the indicator is visible as in 5.7.

#### C4. Tests

- Synthetic sequences with known closed fractions and long-closure rates produce the expected factor ratios and ECI.
- A rising-closure sequence produces a monotonically rising trend after smoothing.
- Gaps, low coverage, and low-quality segments produce "Not enough data", never a number.
- A UI-string test fails if banned phrases appear, and if "fatigue"/"drowsiness" appear outside `strings.ts`.
- In study mode, a component test asserts the indicator is not rendered.

#### C5. What counts as "real result" for goal 4

The result is the V3 write-up: per-participant Spearman between the ECI and KSS (5-minute windows), with bootstrap CIs, n participants and sessions, compared against time-on-task and blink rate alone, null results included. It is **not** the existence of the gauge.

---

## Part 3. Implementation plan

Timeline assumes a junior (Oct 2026) finishing results by summer 2027 for a fall 2027 application. Estimates are rough; the gates matter more than the dates.

### Gates (hard stops)
| Gate | Rule |
|---|---|
| G-A | Phase N+1 does not start until Phase N acceptance passes and `npm run check` is green. |
| G-B | `docs/STUDY_PROTOCOL.md` and the consent/assent forms are committed **before any participant session**. Informal tests on yourself only until then. |
| G-C | Under-18 participants need a parent/guardian signature plus their own assent. A teacher/mentor sponsor is informed before recruiting; ask your school about human-subjects rules. |
| G-D | UI wording from Patch C1 is frozen before the protocol is committed. |
| G-E | ECI formula, weights, floors, bands frozen in the protocol; bands chosen on a development subset only. |

### Schedule

| When (approx.) | Phase | Concrete tasks | Done when |
|---|---|---|---|
| Late Oct 2026 | **0 Scaffold** | Vite + React + TS strict, ESLint, Prettier, Vitest, folder layout, CSP, `npm run check`, LICENSE, README skeleton, `src/ui/strings.ts` skeleton | `npm run check` passes on a clean clone |
| Nov-Dec 2026 | **1 DSP core** | `fft`, `window`, `biquad`, `butterworth` (bilinear + pre-warp), `resample`, `stats`, `peaks`, `spectrum`; `tools/gen_fixtures.py`; tests | FFT rel. error < 1e-9; filters < 1e-6 vs SciPy; band-pass -3 dB at cutoffs and >= 40 dB at 0.1/8 Hz; sine recovered within 0.05 Hz |
| Jan 2027 | **2 Capture + timing** | `camera.ts`, `frameClock.ts` (+tests), dev overlay (FPS, jitter, gaps), error handling, hidden-tab handling | FrameClock tests pass; all failure cases handled |
| Feb 2027 | **3 Blinks + landmarks** | FaceLandmarker, Landmark Explorer, `ear`, `calibration`, `blinkDetector`, synthetic tests (6.3), blink cards, EAR plot | Eye indices verified + logged; detector tests pass |
| Feb-Mar 2027 | **3b Blink timeline (goal 3)** | `blink/sessionSummary.ts`, per-minute bins, summary view, export, tests (Patch B) | Bin tests pass; unusable minutes shown as gaps |
| Mar 2027 | **V1** | Record ~2 min per condition locally, hand-label, compute P/R/F1 and duration error | Results written to `docs/VALIDATION.md` as found |
| Mar-Apr 2027 | **4 Pulse + regions (goal 2)** | ROI polygons (forehead, both cheeks, verified in Explorer), RGB traces, POS, per-region pipeline, SQI, fusion, UI, synthetic tests (Patch A) | Synthetic tests pass; per-region + fused results visible; perf budget checked |
| Apr 2027 | **V2a / V2b** | Offline datasets via `eval_cli.ts` (check licence/access first); live vs a reference device; forehead-only vs cheeks vs fused | MAE/RMSE/r/%within reported with n |
| **by end of Apr 2027** | **Study prep (4B step 1)** | Draft `STUDY_PROTOCOL.md` (hypotheses, factors, ECI formula, windows, exclusions, controls, blinded-participant rule C3, analysis plan), consent + assent forms, recruitment plan. **Review, then commit.** | Protocol + forms in git history; G-B..G-E satisfied |
| May 2027 | **4B build** | `blink/sleepiness.ts` + tests, factor/trend UI (C2), KSS prompt, PVT-B, session runner, CSV export, study-mode blinding | Unit tests pass; study mode runs end to end; CSV has no media |
| May-Jun 2027 | **Pilot + study** | Pilot on yourself, then 6-10 consenting participants x >= 2 sessions at naturally different times of day. No sleep deprivation or caffeine manipulation. | Raw numeric data collected and pseudonymised |
| Jun-Jul 2027 | **V3 analysis** | Freeze bands on dev subset, evaluate on held-out; Spearman + bootstrap CIs; controls; script and seeds in `tools/` | Results with n, controls, null findings in `docs/VALIDATION.md` |
| Jul-Aug 2027 | **5 Polish** | Signal Lab, trace export, eval CLI, accessibility pass, all docs, demo script, deploy | Section 11 checklist (as amended) complete |

### Updated kickoff prompts (use instead of Section 12 where they differ)

**Phase 3b:**
> Do Phase 3b only. Implement `src/blink/sessionSummary.ts` per Patch B with unit tests, then the session summary view with text alternatives and numeric export. Unusable minutes must appear as gaps, never zeros. Run `npm run check` and report what was and was not verified.

**Phase 4 (replaces the Phase 4 prompt):**
> Do Phase 4 only, including Patch A (multi-region pulse). Verify forehead and cheek landmark indices in the Landmark Explorer and record them in `docs/METHODS.md` before using them. Implement per-region POS, SQI, the fusion rules exactly as written, the per-region UI, and the synthetic tests. Do not add libraries. Report the performance measurement against the 4 ms budget.

**Phase 4B (replaces the Phase 4B prompt):**
> Do Phase 4B step 1 only: write `docs/STUDY_PROTOCOL.md` incorporating Patch C (wording, factors, blinded study mode), and the consent and assent form drafts, then stop for my review. Do not write code until I approve. Do not tune any formula or threshold using study data.

### Additions to the Definition of Done (Section 11)
- [ ] Multi-region pulse: per-region and fused results validated and reported (V2b), including whether fusion beat the best single region.
- [ ] Blink session timeline: per-minute table, gaps for unusable minutes, text alternatives.
- [ ] Fatigue/drowsiness wording appears only in the approved strings in `src/ui/strings.ts` (grep check); no "detect/diagnose/warn" claims; no alarms; no driving/safety suggestion outside the disclaimer.
- [ ] Study mode hides the indicator from participants (tested).
- [ ] Consent/assent forms exist and were committed before the first session; guardian signatures on file for every under-18 participant.
- [ ] Pulse and HRV not used as inputs to the indicator; no HRV in the UI.

### Risks to track
| Risk | Mitigation |
|---|---|
| ECI shows no relationship with KSS (likely with ordinary-work sessions) | Pre-registered null result is reportable; vary time of day, not sleep. Controls decide whether the ECI adds anything. |
| Fusion does not beat the best single region | Report it. |
| 3-region pulse is too slow | Worker move; reduce to forehead + one cheek if needed and document. |
| Too few usable sessions (glasses glare, poor light) | Recruit 10+ for 6-8 usable; log exclusions by rule, not by outcome. |
| Scope slips | Phases 0-4 + V1/V2 are the core. 4B is the stretch: describe an in-progress study honestly if it isn't finished. |
