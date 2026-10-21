# Study protocol: V3, eye-closure indicator and sleepiness

> **Status: DRAFT (2026-10-17), committed so it is not lost, NOT frozen.** The study is postponed.
> No participant data may be collected until this file and the forms in `docs/forms/` are reviewed,
> the open decisions in Section 13 are settled, and a frozen version is committed with its hash in
> Section 14 (SPEC_AMENDMENT_01 gates G-B to G-E). Until then the author may test the app
> informally on themselves only.

This protocol pre-registers validation V3 (PROJECT_SPEC 7.5, SPEC_AMENDMENT_01 Patch C). Once it is
committed, every formula, constant, window, exclusion rule, and statistic below is fixed. Any later
change is written as a dated amendment at the end of this file, with the reason, and results are
reported both ways if the change came after any data was seen.

## 1. Question and hypotheses

The app computes an Eye-Closure Index (ECI): how a person's eyelid behaviour compares with their
own alert baseline. The study tests whether that index goes up when the same person rates
themselves as sleepier. It does not assume that it does.

- **H1 (primary):** within participants, the ECI over the 5 minutes before each Karolinska
  Sleepiness Scale (KSS) rating is positively correlated with that rating (Spearman).
- **H2 (secondary):** the ECI and each of its three factors are higher in the PVT-B at the end of
  a session than in the PVT-B at the start, and are related to PVT-B lapses, median reaction time
  (RT), and mean reciprocal RT (1/RT).
- **Controls (required):** the ECI is compared against two simple predictors of KSS, each analysed
  in exactly the same way: **time on task** (minutes since the start of the work block) and
  **blink rate** (blinks per valid minute over the same 5 minutes).

**What counts as a null result:** H1 is not supported if the one-sided test in Section 9.1 is not
significant at alpha = 0.05. **The ECI is said to add nothing beyond the controls** if the median
per-participant difference rho(ECI) - rho(control) has a 95% bootstrap interval that includes 0,
for either control. Both outcomes are reported as found, in `docs/VALIDATION.md`.

Expectation (not a claim): a positive within-person association for at least some participants.
Ordinary work at naturally different times of day may produce little sleepiness, so a null result
is a likely and reportable outcome (SPEC_AMENDMENT_01, Risks).

## 2. Design decisions

1. **Pulse and HRV are not inputs.** The ECI uses eyelid measures only (PROJECT_SPEC 1.2).
2. **Participants do not see the indicator during a session (SPEC_AMENDMENT_01 C3).** Seeing a
   fatigue/drowsiness gauge could change how people rate their own sleepiness and how they behave.
   In study mode the indicator, the factor plots, and the bands are computed and exported but not
   shown. They are visible only in a review screen after the session has been exported.
   - _Proposed in addition (decision D5):_ study mode also hides the blink cards, the EAR plot,
     and the camera preview, and shows only a text status ("Face found" / "Face not found: ...")
     so the participant can stay in view. Watching one's own face or blink count can change blinking.
3. **No machine learning and no tuning on participants.** The formula, weights, floors, and cap
   are fixed here. Band cut-offs are chosen once on a development subset (Section 7) by a rule
   fixed here, and are never changed after held-out data has been looked at.
4. **No manipulation.** No sleep deprivation, no caffeine or stimulant instructions, no request to
   stay awake. Sessions differ only by the time of day the participant chooses.
5. **Numbers only.** No video, images, or landmarks are stored or uploaded. Section 10 lists the
   export.

## 3. Measures computed by the app

All timing is in milliseconds from frame timestamps. Definitions reuse the existing blink pipeline
(`src/blink/`), so values match what the app already measures.

### 3.1 Valid time

A frame interval counts as **valid time** when both of its frames are valid (face found, both eyes
measured, head pose within |yaw| <= 25 degrees and |pitch| <= 20 degrees relative to calibration)
and the interval is not a frame gap (dt > 2.5x median dt, frames reported dropped, hidden tab, or a
timestamp source change; PROJECT_SPEC 5.1 as amended 2026-10-17). These are the same rules as the
blink cards and the per-minute timeline (`src/blink/sessionSummary.ts`).

### 3.2 Factors (features 1-3 of PROJECT_SPEC 5.7)

For a window W, with `b` the session's open-eye EAR baseline from blink calibration
(`src/blink/calibration.ts`) and `V` the valid time in W:

1. **Eye-closed fraction** `C = (sum of valid dt where EAR <= 0.20 b) / V`. A dt counts as closed
   when the EAR of the frame ending the interval is at or below the level. EAR is not linear in
   eyelid coverage, so this only approximates the classic "eyes at least 80% closed" PERCLOS
   definition (Dinges & Grace, 1998).
2. **Long-closure rate** `L = (closures of 500 ms or longer starting in W) / (V in minutes)`. This
   counts detector events of kind `long_closure` and `extended_closure`. Events invalidated by a
   gap are never counted (detector rule).
3. **Mean blink duration** `D = mean duration of events of kind blink (shorter than 500 ms)
starting in W`. Durations carry the +-1 frame caveat (about +-33 ms at 30 fps). Closures of
   500 ms or longer are left out so that `D` and `L` do not count the same events twice
   (decision D3).

Reported but **not** part of the ECI:

4. **Blink-rate ratio** `R = (blink rate in W) / (blink rate in the baseline)`. Concentrating hard
   lowers blink rate, while sleepiness can change it in either direction (PROJECT_SPEC 5.7). Blink
   rate is also a control (Section 1).
5. Closing-phase speed (experimental) is **not used** in this study. Most webcams run at 30 fps,
   and the spec enables it only at 60 fps or more.

### 3.3 Windows

- Trailing windows of **60 s** and **5 min**, evaluated every **10 s** for the trend display.
- **Analysis windows:** the 5 minutes ending at the moment each KSS prompt appears (not when it is
  answered, so a slow answer does not move the window, and the prompt itself is outside it); and
  each full PVT-B run.

## 4. Alert baseline

- At the start of each session, after the KSS rating and the blink calibration, the participant
  does their ordinary work while the app collects **3 minutes of valid time** (at most 6 minutes of
  clock time; if 3 valid minutes are not reached, the session stops with the reason shown and the
  attempt is logged).
- Baseline factors `C0`, `L0`, `D0` and the blink rate are computed over the whole baseline period
  with the same definitions as Section 3.2. `D0` needs at least 10 blinks; otherwise the baseline
  fails the same way.
- The baseline is held in memory for the session. In study mode, the baseline values are also
  written to the session export (numbers only) so the analysis can recompute ratios offline.
- A baseline KSS of 6 or more is recorded as "baseline not alert". Those sessions stay in the data
  and are handled as stated in Section 8.

## 5. Eye-Closure Index

```
ratio_C = min(max(C, 0.01)   / max(C0, 0.01),   5)
ratio_L = min(max(L, 0.2)    / max(L0, 0.2),    5)
ratio_D = min(max(D, 100 ms) / max(D0, 100 ms), 5)

ECI = (ratio_C + ratio_L + ratio_D) / 3        equal weights
```

ECI = 1 means "the same as the baseline"; higher means more eye closure than the baseline. The
floor applies to both the window value and the baseline value: values below the measurement
resolution are treated as the floor. (Changed 2026-10-18 before any data: with the floor on the
baseline only, a window identical to a baseline with no long closures gave ratio_L = 0, so ECI was
0.67 instead of 1.)

**Fixed constants, chosen before any data from the measurement resolution, not from data:**

| Constant               | Value          | Reason                                                                                                                                                                                              |
| ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closed level           | 0.20 b         | PROJECT_SPEC 5.7 default (`perclosFrac`).                                                                                                                                                           |
| Floor for `C0`         | 0.01           | Below 1% of valid time (0.6 s per minute), the +-1 frame error on about 15 blinks per minute (15 x 33 ms = 0.5 s at 30 fps) is the same size as the value, so smaller baselines are not resolvable. |
| Floor for `L0`         | 0.2 per minute | One closure in 5 minutes: the smallest non-zero rate a 5-minute window can show.                                                                                                                    |
| Floor for `D0`         | 100 ms         | About three frames at 30 fps; shorter mean durations are below the timing resolution.                                                                                                               |
| Cap per ratio          | 5              | Keeps one factor from dominating the mean when its baseline is near the floor (decision D4).                                                                                                        |
| Minimum blinks for `D` | 3 per window   | Fewer blinks make the mean duration meaningless; the window then shows "Not enough data: too few blinks".                                                                                           |

## 6. Gating ("Not enough data")

A window gets a number only if **all** of these hold. Otherwise it shows "Not enough data" with the
first failing reason, and it is a gap in plots and exports, never a zero or an interpolated value.

1. A valid blink calibration and a valid alert baseline exist for the session.
2. Valid time is at least **70%** of the window (PROJECT_SPEC 5.7).
3. The median frame rate in the window is at least **24 fps** (`LOW_FPS`, as in the timeline).
4. At least 3 blinks start in the window (Section 5).

Reason order, as shown to the user: no calibration, no baseline, face lost, head turned, frame
gaps, low frame rate, too few blinks. "Face lost", "head turned", and "frame gaps" are chosen by
whichever accounts for the most lost time in the window.

## 7. Bands

The bands only label the gauge ("Near your baseline", "Somewhat above your baseline", "Well above
your baseline"). **They play no part in H1, H2, or the controls.**

- **Provisional bands, normal use only, not validated:** Near when ECI < 1.5, Somewhat above when
  1.5 <= ECI < 2.5, Well above when ECI >= 2.5. The app labels them as provisional until the final
  bands replace them (decision D6).
- **Final bands, by a rule fixed now:** the development subset is the author's own sessions run
  under this protocol after it is committed (pilot), which are never part of the held-out results.
  With `P` = the 95th percentile of the 5-minute ECI over the development windows whose KSS is 4 or
  less, the cut-offs are `c1 = P` and `c2 = 1 + 2 (P - 1)` (twice as far from the baseline). If
  fewer than 20 such windows exist, or `P <= 1`, the provisional bands stay. The final bands are
  committed before any held-out participant is analysed.

## 8. Participants, sessions, and exclusions

**Participants:** about 6-10 people (goal, not a guarantee; recruit 10 or more to get 6-8 usable,
SPEC_AMENDMENT_01 Risks). Adults give consent; anyone under 18 needs a signed parent/guardian
permission form and their own signed assent (gate G-C). Glasses and contact lenses are allowed and
recorded by self-report.

**Sessions:** at least 2 per participant, on different days, at naturally different times of day:
one before 10:00 and one between 19:00 and 21:30 (not later, so nobody is kept up). Session order
is whatever suits the participant, recorded.

**Session steps (study mode):**

1. Consent check: the app asks the researcher to confirm that the signed forms are on file for this
   participant ID. The app itself stores no names.
2. Camera setup and blink calibration (existing first-run flow).
3. KSS rating, then the 3-minute alert baseline (Section 4).
4. PVT-B (about 3 minutes, Section 9.3).
5. **25 minutes** of the participant's own ordinary computer work (reading, coding, homework),
   with a KSS prompt at 5, 10, 15, 20, and 25 minutes.
6. PVT-B again.
7. Numeric CSV export, then the post-session review screen (indicator visible).

**KSS prompt:** one tap, non-blocking, in a corner of the screen, keyboard operable. If it is not
answered within 60 s, the rating is recorded as missing and the prompt closes.

**Exclusion rules (applied by script, logged with counts, never decided by looking at outcomes):**

- A KSS rating is unusable if missing, or if its 5-minute analysis window fails gating (Section 6).
- A session is excluded if blink calibration or the alert baseline failed, or if the work block
  ended before 15 minutes.
- A participant enters the per-participant analysis only with **at least 5 usable ratings** and at
  least 2 distinct KSS values (Spearman is undefined for a constant). Others are listed with the
  reason.
- Sessions with "baseline not alert" (Section 4) are kept in the primary analysis and dropped in a
  sensitivity analysis that is reported alongside it.
- A participant may withdraw at any time; their data is deleted and they are reported only as a
  count of withdrawals.

## 9. Analysis plan

All analysis runs in `tools/` (Python allowed there) from the exported CSVs, with fixed random seeds
recorded in the script. Exclusions are applied first, by the rules in Section 8.

### 9.1 Primary (H1)

- For each participant, Spearman rho between the ECI and KSS over all their usable ratings,
  pooled across sessions. Ties get average ranks.
- A 95% bootstrap interval per participant: 10,000 resamples of the (ECI, KSS) pairs, percentile
  method. Resamples with a constant KSS are redrawn.
- Report each participant's rho and interval, then the median and range across participants.
- **Test:** a one-sided Wilcoxon signed-rank test that the per-participant rho values are above 0,
  alpha = 0.05. With n of about 6-10 this test has little power; that is stated with the result.

### 9.2 Controls

- The same per-participant Spearman for time on task vs KSS and for blink rate vs KSS.
- For each control, the per-participant difference rho(ECI) - rho(control), and a 95% bootstrap
  interval for its median (10,000 resamples of participants).
- Reported as the question "does the ECI add anything?", answered by the rule in Section 1.

### 9.3 Secondary (H2) and the PVT-B

PVT-B follows Basner, Mollicone & Dinges (2011, _Acta Astronautica_ 69, 949-959):

- 3 minutes. After each response, the RT is shown for 1 s; the next stimulus appears 1-4 s after
  the response (so 0-3 s after the feedback ends), uniformly random.
- **Lapse:** RT >= 355 ms. **False start:** a response with no stimulus, or RT < 100 ms. No
  response within 30 s ends the trial as a lapse (decision D7).
- Outcomes: lapses, false starts, median RT, and mean 1/RT (in 1/s) over responses of 100 ms or
  more.
- Stimulus time is taken from the animation frame that shows it, and the response time from the
  input event's own timestamp. Display and input latency in a browser add tens of milliseconds, so
  **only within-person, relative comparisons are meaningful**.

Analyses:

- End vs start PVT-B, per session: ECI and each factor over the PVT-B window, compared with a
  two-sided Wilcoxon signed-rank test across sessions. Report each session's change.
- Spearman between ECI (PVT-B window) and lapses, median RT, and mean 1/RT, across all PVT-B runs,
  with bootstrap intervals. Several comparisons are made here, so these results are descriptive.

### 9.4 Sensitivity and exploratory analyses

- **Participant-level baseline (decision D1):** the same H1 analysis, with the ratios recomputed
  offline against the alert baseline from the participant's session with the lowest baseline KSS
  (first session on a tie), instead of each session's own baseline.
- H1 without the "baseline not alert" sessions.
- H1 using the 60 s window before each prompt.
- Exploratory only, flagged as such because of the small sample: AUC for KSS >= 7 vs < 7.

### 9.5 Reporting

- n participants recruited, consented, excluded (with reasons), withdrawn, and analysed; n sessions
  and n usable ratings.
- Every number with its n. Null and negative results reported in the same detail as positive ones.
- Limits stated plainly: small sample, ordinary work (little sleepiness expected), KSS is a
  self-rating affected by being asked, EAR depends on head pose, gaze, glasses, and lighting,
  browser timing for the PVT-B, and the results may not generalise across people, ages, cameras,
  or lighting.
- Data is never published raw. Only aggregated results and the analysis code go into the repo.

## 10. Export (study mode, numbers only)

One CSV per session, written only when the researcher presses Export. It contains:

- Header comments: app version (git commit), participant ID (pseudonymous, e.g. `P03`), session
  ID, session start in local clock time, time-of-day slot, self-reported glasses/contacts, and
  whether the study-mode display rules were on.
- Blink calibration (`b`, thresholds) and the alert baseline values (`C0`, `L0`, `D0`, blink rate,
  valid time, baseline KSS).
- Every 10 s: both windows' factors, ratios, ECI or the gating reason, coverage, lost time by
  reason, median frame rate.
- Every blink event: start, duration, kind, low-confidence flag.
- Every KSS prompt: time shown, time answered, rating or missing.
- Every PVT-B trial: stimulus time, response time, RT, lapse and false-start flags.

No video, images, landmark coordinates, names, or contact details. The key linking participant IDs
to names is kept on paper or in a separate file that is never in the repository, and is destroyed
when the study ends.

## 11. Ethics and safety

- Voluntary participation, informed consent (and assent plus guardian permission for anyone under
  18), and the right to stop at any time without giving a reason (PROJECT_SPEC 8).
- Minimal risk: about 45 minutes of ordinary computer work in front of a webcam that is used only
  on the device. No sleep deprivation, no caffeine or stimulant instructions.
- At the end of every session the participant is reminded not to drive or do anything risky if
  they feel very sleepy.
- The app never tells participants they are tired, never shows alarms, and is not a medical
  device. Wording outside study mode follows `src/ui/strings.ts` (Patch C1).
- **Before recruiting:** a teacher or mentor sponsor is informed, and the author asks the school
  (and any science fair the project will enter) whether a review board must approve the study
  first (gate G-C). If one is required, its approval is obtained before the first session and
  noted in Section 14.

## 12. Recruitment plan

- Who: friends, classmates, and family members who use a computer for schoolwork or work, with a
  webcam. No incentives beyond thanks.
- How: a short verbal or written invitation that describes the study plainly, with no pressure.
  Nobody the author supervises or grades is recruited.
- Forms: `docs/forms/CONSENT_ADULT.md`, `docs/forms/PARENT_PERMISSION.md`,
  `docs/forms/ASSENT_MINOR.md`, signed before the first session and kept on paper.

## 13. Open decisions for the author (settle before committing)

| ID  | Question                                                                                                                                                                                                                       | Draft choice                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| D1  | Each session has its own alert baseline, so differences between morning and evening sessions largely cancel out of the in-session ECI. Primary analysis: in-session baseline (as the spec says) or participant-level baseline? | In-session primary (spec); participant-level as a pre-registered sensitivity analysis (9.4).   |
| D2  | **KSS copyright.** The scale is copyright Torbjörn Åkerstedt (1990); the published copy forbids reproduction or adaptation without his written consent.                                                                        | Ask for written permission before the KSS text goes into the app or forms. See the note below. |
| D3  | Mean blink duration from blinks shorter than 500 ms only?                                                                                                                                                                      | Yes, so it does not overlap the long-closure rate.                                             |
| D4  | Cap each ratio at 5?                                                                                                                                                                                                           | Yes.                                                                                           |
| D5  | Also hide the blink cards, EAR plot, and camera preview in study mode?                                                                                                                                                         | Yes; text face status only.                                                                    |
| D6  | Show provisional bands in normal use before the final ones exist?                                                                                                                                                              | Yes, labelled provisional.                                                                     |
| D7  | PVT-B: 30 s timeout counted as a lapse.                                                                                                                                                                                        | Yes.                                                                                           |
| D8  | Work block length: 25 minutes (spec allows 15-30).                                                                                                                                                                             | 25 minutes, 5 KSS prompts.                                                                     |
| D9  | PVT-B: after a false start with no stimulus showing, does the 1-4 s interval restart from that response? (Section 9.3 is silent.)                                                                                              | Yes, as after any response. Built this way (2026-10-19).                                       |
| D10 | PVT-B: a stimulus still showing when the 3 minutes end.                                                                                                                                                                        | Not scored (neither a response nor a lapse). Built this way.                                   |
| D11 | Analysis windows are evaluated 5 s after they end, because a blink is reported when the eye reopens. A closure still open 5 s after the end is not counted.                                                                    | Keep 5 s. Built this way.                                                                      |
| D12 | The app pauses measuring while its window is hidden (minimised, another tab, fully covered). The participant works in another window placed side by side with the app.                                                         | Add this instruction to Section 8 step 5 and to the forms' description.                        |
| D13 | Section 11 says the app reminds participants not to drive; the project rules allow driving to be mentioned only in the disclaimer.                                                                                             | The app asks the researcher to remind the participant of the safety note on their signed form. |

**KSS note (D2):** sources do not agree on the wording. A published reproduction of the scale with
permission (Shahid et al., eds., _STOP, THAT and One Hundred Other Sleep Scales_, Springer 2012,
ch. 47) labels every step and words step 8 as "Sleepy, but some effort to keep awake", slightly
different from PROJECT_SPEC 5.8. The same chapter describes the rating as covering the last 10
minutes, while other study protocols use the last 5 minutes. That chapter names the author as the
contact for copies and permission. This protocol therefore does not reproduce the anchor text.
Once permission and the authorised wording are in hand, the exact wording and the time frame
instruction ("during the last 5 minutes", to match the analysis window) are added here before
committing.

**Spec corrections proposed:**

- PROJECT_SPEC 5.8 says a lapse is "RT > 355 ms"; the source defines it as RT >= 355 ms. This
  protocol uses >= 355 ms.
- PROJECT_SPEC 5.8 says "a random inter-stimulus interval (uniform 1-4 s)"; in the source that
  1-4 s includes the 1 s RT feedback. This protocol follows the source.
- PROJECT_SPEC 5.8 cites Basner & Dinges (2011, _Sleep_) for the brief-PVT lapse threshold; the
  355 ms threshold and the 3-minute version come from Basner, Mollicone & Dinges (2011, _Acta
  Astronautica_). Appendix A should list both.

## 14. Approvals and amendments

- Protocol frozen: _not yet_ (commit hash and date go here).
- Final bands frozen: _not yet_.
- Review board (if required): _not yet asked_.
- KSS permission: _not yet asked_.

## References

- Åkerstedt, T., Gillberg, M. (1990). Subjective and objective sleepiness in the active individual.
  _International Journal of Neuroscience_, 52, 29-37.
- Basner, M., Mollicone, D., Dinges, D. F. (2011). Validity and sensitivity of a brief psychomotor
  vigilance test (PVT-B) to total and partial sleep deprivation. _Acta Astronautica_, 69, 949-959.
- Basner, M., Dinges, D. F. (2011). Maximizing sensitivity of the psychomotor vigilance test (PVT)
  to sleep loss. _Sleep_, 34(5), 581-591. (Not yet checked against the original.)
- Dinges, D. F., Grace, R. (1998). PERCLOS: A valid psychophysiological measure of alertness as
  assessed by psychomotor vigilance. FHWA technical brief. (Not yet checked against the original.)
- Shahid, A., Wilkinson, K., Marcu, S., Shapiro, C. M. (eds.) (2012). _STOP, THAT and One Hundred
  Other Sleep Scales_, ch. 47, Karolinska Sleepiness Scale. Springer.
