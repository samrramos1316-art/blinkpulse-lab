# SPEC_AMENDMENT_04: Phase 6 extras and long-term tracking

**Status:** requested by the author on 2026-10-24 ("do phase 6, then optimize it for longer term
tracking and analysis, so that you don't have to stare into it to get a result"). The author
decided three questions the same day (quoted below); Claude designed the rest. Like the earlier
amendments, it never overrides a product, privacy, wording, or accessibility rule in
`CLAUDE.md`, and it never lowers the "Fair or better" rule for showing a pulse rate.

Patch E details Phase 6 (PROJECT_SPEC Section 2). Patch F adds a new **Phase 7: long-term
tracking**.

## Patch E: Phase 6 extras

**E1. Eye-comfort reminder** (PROJECT_SPEC 5.6, `src/blink/comfortReminder.ts`). Off by default.

- _Baseline ("the user's own calibrated baseline"):_ the blink rate pooled over the first 3 usable,
  complete minutes of the session timeline after calibration; with history on (F2) and at least 60
  usable minutes in the last 14 days, the pooled rate of those stored minutes instead. The UI says
  which one is used and its value.
- _Due when:_ over the last N complete minutes (user-set: 3, 5, or 10), every minute is usable
  (>= 70% valid time, Patch B) and not low-FPS ("blink-detection quality has been good for that
  period"), the period does not include the baseline minutes, and the pooled blink rate of the
  period is below a user-set fraction of the baseline (30%, 50%, or 70%).
- _Cooldown:_ user-set 20, 30, or 60 minutes, never below 20, measured on the wall clock so it
  spans Stop and Start.
- _Delivery (author's decision, 2026-10-24: "Banner + optional notification"):_ a dismissible
  banner in the app (and in the mini window, F1); optionally also a **silent** system
  notification, off by default, which asks for the browser's notification permission when turned
  on. Never a sound. The notification is created by the page itself (no push service, no network).
- _Wording:_ the PROJECT_SPEC 5.6 sentence, unchanged.
- _Storage:_ the reminder settings are stored in `localStorage` (no measurements). This extends
  SPEC_AMENDMENT_02 Part 3, which allowed only the setup flag and the theme there.

**E2. Background illumination reference** (PROJECT_SPEC 5.4 "Flicker").

- Two rectangles beside the face: with the landmark bounding box of width W and height H, each
  starts 0.25 W outside the box, is 0.3 W wide, and spans 20% to 60% of H. A rectangle less than
  half inside the frame is dropped. These are starting values, to be checked live in the Landmark
  Explorer like the skin regions (preset "Pulse regions").
- Their pixels (every second row and column) are merged into one trace, which goes through the
  same resampling and band-pass as a region (green channel, relative to its mean).
- **Flicker flag:** a region's estimate is flagged when the background's SQI at that estimate's
  peak frequency is at least `FLICKER_SQI` (= `SQI_FAIR`, 0.5). The flag lowers the region's
  quality one step, like the motion flag. The pooled estimate (Patch D) is checked the same way.
- Recorded traces gain six `background_*` columns, and estimate rows gain a `flicker` column.
  Older trace files still load (they have no background).
- Measured on synthetic data (`src/rppg/flicker.test.ts`): with a steady background, 3 of 1600
  hops were falsely flagged (0.19%). A background varying at the pulse rate flagged every region in
  every hop, and lowered each by one step.

**E3. Web Worker:** not needed. The spec moves the rPPG pipeline to a worker only if the main-thread
budget (4 ms median per frame, excluding face tracking) is exceeded. With E2 added, the median was
2.70 to 3.45 ms over 3 runs, against 2.45 to 2.70 ms without E2 in alternating runs on the same
machine (headless Chrome, synthetic face, 30 s each). This is re-checked if F1 makes long sessions
the main use.

**E4. Offline HRV limits** (PROJECT_SPEC 7.4): `npm run hrv:limits` (`tools/hrv_limits.ts`). It
uses the app's own filtered waveform and peak detection to time beats on synthetic traces with a
known, variable heart rate, and reports beat errors and RMSSD error. It can also compare a recorded
trace against a reference RR log. HRV stays out of the UI.

## Patch F: Phase 7, long-term tracking

The goal is that measurements are collected while the user works normally, and the results are
read later as summaries, not watched live.

**F1. Mini window (keep measuring while working).** Where the browser supports it (Document
Picture-in-Picture: Chrome and Edge on desktop), a button opens a small always-on-top window with
a compact status (measuring or paused and why, blink rate, pulse with quality, minutes saved today,
the reminder banner, and Stop).

- PROJECT_SPEC 5.1 "Hidden tabs" is amended: **analysis pauses when the page is hidden and no mini
  window is open.** While the mini window is open, the main page may be hidden (another tab in
  front, or the window covered or minimised) and analysis continues.
- _Evidence (2026-10-24, Chrome on Windows, fake camera at 20 fps, raw DevTools protocol):_ with
  the main window covered and the page hidden, video-frame callbacks stopped (0 per second) and
  timers were throttled to 1 per second. With a mini window open, the hidden main page received
  video-frame callbacks at 20 per second (all frames) and timers at the normal rate. The video does
  not need to move into the mini window.
- _Also seen:_ in that test, the mini window closed itself 4 to 5 seconds after opening in 3 of 3
  attempts, for a reason not yet known (possibly the test setup). The app therefore treats the mini
  window closing at any time as normal: analysis pauses again if the page is hidden, and the main
  view says why. Whether the mini window stays open on a real desktop is to be checked by the
  author on the live site.
- Without mini-window support (Firefox, Safari, phones), the existing rule and message apply: keep
  the app's window visible. On Windows a fully covered window counts as hidden.

**F2. History on this device** (author's decision, 2026-10-24: "Opt-in, device only. Off until you
turn it on. Saves per-minute numbers only (no video/images/landmarks) in this browser. One-tap
'Delete all', CSV export, auto-delete after 90 days.")

- Off by default. When on, each finished minute of the session timeline is saved in this browser's
  IndexedDB. Each row holds: start time (wall clock), a random session id, valid time and coverage,
  usable, frame interval, the blink measures of Patch B (count, rate, median and mean duration,
  long and extended closures, eye-closed fraction), the pulse measures (F3), and the indicator
  value (F3). It never holds video, images, landmarks, or EAR traces.
- A partly measured minute at Stop is saved with its coverage (it is not usable).
- Rows older than 90 days are deleted at start-up and once an hour while the app is open.
- "Delete all history" deletes every row (with an in-app confirmation). Turning history off asks
  whether to delete what is stored.
- "Export CSV" saves every row as numbers.
- Nothing is uploaded. The privacy badge stays true. The About dialog and
  `docs/ETHICS_AND_PRIVACY.md` describe the store.
- Study mode (`#study`) never writes to history.

**F3. What is stored and shown** (author's decision, 2026-10-24: history shows blink measures,
pulse at Fair or better only, and the eye-closure indicator).

- _Blink measures:_ per minute as in Patch B. Day values pool the usable minutes (rate = blinks /
  valid minutes, eye-closed fraction = closed time / valid time, long closures per hour, median of
  the minute medians for duration).
- _Pulse:_ per minute, the median of the values the app **showed** in that minute (Fair or better),
  the number of hops shown, and the number of hops estimated. A minute with no shown value has no
  pulse value. Day values: the median over minutes with a value, with that number of minutes.
  Labelled "Estimated; accuracy not yet validated (V2)".
- _Eye-closure indicator:_ per minute, the 5-minute result at the end of the minute (value and
  band) when it is available (alert baseline done, gates passed), otherwise "not enough data".
  Day values: minutes in each band and minutes with not enough data. Approved wording only
  (Appendix B, Patch C1), labelled experimental and not validated. It is never summarised as a
  statement about the person ("you were sleepy").
- _Display gates:_ a day shows blink values only with at least 10 usable minutes; otherwise "Not
  enough data". Every value is shown with its number of minutes. This is a display rule, not a
  claim.
- _No interpretation:_ the history describes measurements. It does not state trends as findings,
  compare with population norms, or suggest health meanings.

**F4. History view.** A "History" view (header button, next to Signal Lab), with:

- totals (days, measured hours, usable minutes);
- per-day values for the last 7, 30, or 90 days, as a table and as plots;
- the blink rate by hour of day (usable minutes pooled per hour, with n);
- one day's minutes as plots;
- Export CSV and Delete all.

Tracking continues while the history view is open.

**F5. Long sessions.** Memory must stay bounded over a working day. Finished minutes of the
session timeline keep their summary, not their per-frame intervals or event lists. The indicator
trend and the ring buffers are already bounded or small.

**F6. This week and last week (added 2026-10-25 at the author's request).** The history view
shows the last 7 local days including today next to the 7 days before them. These are rolling
weeks, so no week-start convention is needed. Each week is pooled like a day:
- blink values need at least 10 usable minutes;
- pulse is the median of the minutes with a shown value;
- the indicator is shown as minutes per band.

Every value shows the minutes it comes from. "Change" is this week minus last week, shown only when
both weeks have a value. It is a signed number with no colour, arrow, or wording that calls it
better or worse. A note says that a change describes the measured minutes only and can come from
when and how long the app ran, the lighting, or the work done.

## Not changed

No cloud, no accounts, no sync. Pulse and HRV are never sleepiness signals. HRV stays out of the
UI. The indicator formula, weights, and bands are unchanged. No alarms or sounds.

## Acceptance (Phase 6 and 7)

- `npm run check` passes. The pure logic (reminder, flicker, history rows and summaries, retention,
  CSV) is unit-tested.
- In a browser with the synthetic face:
  - pulse is unchanged, with no false flicker flags;
  - the reminder settings persist;
  - history on: minutes are saved and appear in the history view; Delete all empties it; the CSV
    downloads;
  - no CSP violations or network requests after load.
- Documented in `docs/PHASE_NOTES.md`, `docs/METHODS.md`, `docs/LIMITATIONS.md`, and
  `docs/ETHICS_AND_PRIVACY.md`, including what could not be verified (a real desktop's mini window,
  real lamps for flicker).
