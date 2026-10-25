# Limitations

PROJECT_SPEC Section 9, expanded per feature. No numbers here except from tests or validation
runs, with their sample sizes.

## Capture and timing (Phase 2)

- Measurements pause while the window is hidden or minimised; browsers throttle hidden pages.
  Keep the window visible (side-by-side is fine).
- Without `requestVideoFrameCallback` the app falls back to `requestAnimationFrame` timing. Frames
  can then repeat or be skipped, and dropped frames cannot be counted.
- Timing has so far only been measured with Chrome's synthetic camera (see `docs/METHODS.md`).
- The lighting hint in setup uses an untuned brightness threshold. It is a usability hint, not a
  measurement.

## Blink detection (Phase 3)

- Accuracy on real video is unknown until validation V1 is run (`docs/VALIDATION.md`). The
  synthetic tests only check the logic on idealised signals.
- The eye landmark indices are checked against MediaPipe's constants and canonical face model,
  and on live video by the author for one face and one webcam only.
- At low frame rates short blinks span one or two frames: durations are accurate to about +-1
  frame interval, and a blink between frames can be missed. In the first live test, a dim room
  limited a laptop webcam to about 16 fps.
- Thresholds come from a 10 s calibration. If the user squints, looks down, or keeps blinking a lot
  during it, the baseline and thresholds are off; recalibrate.
- Head-pose gating is relative to the calibration pose; a large pose change after calibration
  rejects data until the user recalibrates or returns.
- Glasses, glare, heavy makeup, and partial occlusion can disturb the eyelid landmarks (to be
  measured in V1 "with glasses").
- The distance hint uses untested limits on face size in the frame.

## Session timeline (Phase 3b)

- Per-minute values inherit every limitation of the blink detector above; they have not been
  validated on real recordings.
- The 70% usable-time rule comes from the amendment and is not tuned. A minute just above it
  rests on about 42 s of data.
- The timeline lives only in memory: it is cleared when the camera is started again and lost when
  the page closes, unless exported.

## Pulse rate (Phase 4)

- Accuracy on real people is unknown until validations V2a and V2b are run. All numbers so far
  come from synthetic signals and a rendered synthetic face.
- The forehead and cheek regions are derived from MediaPipe's canonical face model but not yet
  checked on live video. Hair, glasses frames, beards, or makeup inside a region change its signal.
- The quality levels and flag thresholds are starting values (the SQI levels from synthetic data
  only).
- Known confounds, not corrected: camera auto-exposure and auto-white-balance (locking is tried but
  often unavailable), video compression, glasses glare, makeup, facial hair, head coverings, screen
  light reflecting off the face, talking, and skin-tone-dependent signal strength.
- Movement and lighting changes lower the quality or remove the value; a value can still be wrong
  when quality reads Fair.
- A 10 s window resolves about 6 BPM; finer values come from interpolation and depend on signal
  quality. The shown value is a median of recent estimates and lags real changes by several
  seconds.
- Below 20 fps the quality is lowered; below 15 fps there is no estimate.

## Eye-closure indicator (Phase 4B)

- It has not been validated: whether it follows sleepiness at all is what study V3 tests, and a
  null result is a likely outcome (`docs/STUDY_PROTOCOL.md` Section 1).
- Eye closure changes with much more than sleepiness: concentration (fewer blinks), the kind of
  task (reading versus a video call), looking down at a keyboard or phone, dry eyes, contact
  lenses, glare on glasses, screen brightness, and a person's usual habits at that time of day.
- It compares a person only with their own baseline from the same session. A baseline recorded
  while already sleepy makes later values look normal.
- EAR is not a direct measure of how far the eyelid covers the eye, so the "eye-closed fraction"
  only approximates the classic PERCLOS definition.
- The bands are provisional and not validated; final bands, if any, will come from a small
  development subset of one person's sessions.
- Even if the study finds an association, it will come from a small study (about 6-10 people) and
  may not hold for other people, ages, cameras, or lighting.

## Study mode and the analysis (Phase 4B)

- The reaction-time task runs in a browser: display latency, keyboard or touch latency, and
  frame timing add tens of milliseconds that differ between devices. Only changes within the same
  person on the same device mean anything.
- The sleepiness rating is a self-rating, and being asked every 5 minutes can itself change how
  sleepy people feel and how they behave. The rating wording is a placeholder until permission
  to use the KSS wording is granted.
- Measuring pauses while the app's window is hidden, so participants must work in a window beside
  it rather than over it.
- With so few participants, the statistical tests have little power: a non-significant result does
  not show that there is no association.

## Pulse and heart-rate variability

- Webcam heart-rate variability (HRV) is not reliable: at 30 fps a frame is about 33 ms long,
  which is the same size as the beat-to-beat changes HRV measures, and noise moves the detected
  beats further. HRV is therefore not shown in the app (PROJECT_SPEC 7.4). On synthetic
  traces at the lightest noise level tested, peak detection added 22.8% extra beats and
  overstated RMSSD about 8-fold (`npm run hrv:limits`, n = 20 windows; `docs/METHODS.md`).
- The pulse colour signal is weaker for darker skin tones and in poor lighting, so the pulse rate
  may work worse for some people. How much worse is unknown until V2 reports results per
  condition and per participant.

## Face tracking

- The MediaPipe face landmark model is pre-trained by Google; only what happens after the
  landmarks (geometry, signal processing, statistics) was written for this project. Its accuracy
  may differ across faces, ages, and conditions, and that has not been measured here.
- Differences in facial anatomy, eye conditions (for example a drooping eyelid), and glasses can
  make the blink measurements unreliable for some people. The app shows "not available" rather
  than guessing and never judges anyone's blinking as normal or abnormal.

## Signal Lab

- The plots show the last 10 s window as the app computed it; they are explanations, not separate
  measurements. With live data they have so far only been seen on a synthetic face (Phase 4).

## Phase 6 extras and long-term tracking (SPEC_AMENDMENT_04)

- **Flicker check:**
  - It only notices light that varies at the same rate as a region's pulse estimate, and only
    when the background rectangles beside the face are in the frame.
  - Moving people, a scrolling screen, or hair in those rectangles also count as "background".
  - Its position has not been checked live, and it has been tested on synthetic data only. On a
    steady synthetic background, 0.19% of hops were wrongly flagged.
- **Eye-comfort reminder:**
  - It compares your blink rate only with your own earlier rate.
  - Reading, concentrating, and screen work all lower blinking, so a reminder says nothing about
    your eyes' health.
  - Its thresholds are user settings, not tested values.
- **Mini window:**
  - It exists only in Chrome and Edge on computers.
  - In automated tests Chrome closed it after a few seconds, for an unknown reason. Whether it
    stays open on a real desktop has not been checked yet.
  - When it closes and the page is hidden, measuring pauses.
- **History:**
  - Day values describe the minutes that were measured. They depend on when, where, and how long
    the app ran, so they are not comparable with other people or with clinical values.
  - The stored pulse values have the same unvalidated accuracy as the live ones.
  - The indicator minutes are compared with each session's own alert baseline, so different days
    use different baselines.
  - Closing the tab can lose the minute in progress.
  - Clearing the browser's site data deletes the history.
