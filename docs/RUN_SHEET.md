# Run sheet: live checks, V1, and V2b

The steps to do by hand, in order. `docs/VALIDATION.md` holds the procedures and the results; this
sheet adds the practical details and the mistakes to avoid. Time estimates are rough guesses, not
measurements.

**Who to record:** yourself only for now (n = 1). Gate G-B allows informal tests on yourself until
the protocol and forms are committed. Whether V1 and V2b on other people also need those forms is
not settled, so this sheet assumes they do.

## Before you start

- [ ] Run everything from one build, so the numbers belong to one version of the code:

  ```powershell
  git status                  # should be clean
  git rev-parse --short HEAD  # write this in the run log
  npm run build
  npm run preview             # open the address it prints
  ```

- [ ] Do not pull, edit, or rebuild during V1 or V2. If the code changes, write it in the run log.
- [ ] Create `recordings/v1/` and `recordings/v2b/` in the project. Git ignores `recordings/`, so
      videos and CSV files put there stay out of the repository. Exports go to your Downloads
      folder; move them in straight away.
- [ ] **Never tune to fix a result.** Thresholds stay as they are once V1 or V2 starts
      (PROJECT_SPEC 7.1). Report a bad number as found. Any tuning needs a separate tuning subset
      and held-out recordings.
- [ ] **Redo a recording only for a technical failure** (see "Redo only if" below), and log it,
      including the failed attempt. A disappointing score is not a reason to redo one.

## Part 1: Live checks (under an hour)

**Landmark Explorer** (`#explorer`, preset "Pulse regions (forehead, cheeks, background)"):

- [ ] Forehead box on bare skin, above the eyebrows and below the hairline.
- [ ] Each cheek box on cheek skin, clear of the eye, nose, mouth, beard, and glasses frames.
- [ ] Both still true with your head turned slightly.
- [ ] Background rectangles beside the face, not on skin or hair.
- [ ] Turn left and right, tilt chin up and down, tilt to each shoulder: note the sign of yaw,
      pitch, and roll. These were never written down.
- [ ] Record what you saw in `docs/METHODS.md`: the "Pulse regions" table, the "Landmark
      verification" table, and the note on the background rectangles.

**If a box lands in the wrong place, stop.** It needs a fix before any pulse recording, and the fix
has to come before V2 starts.

**Mini window** (Chrome or Edge on the live site or the preview build):

- [ ] Start, Calibrate, Open mini window, then work in another window for at least 5 minutes.
- [ ] Note whether it stayed open and kept updating. Automated runs saw it close after 4-15 s, on a
      plain test page too, so the cause is still unknown.

**Eye-comfort reminder:**

- [ ] Turn it on and leave the app running during normal work. Don't force your blinking down to
      trigger it. Note whether it fires, whenever it does. If it hasn't fired, write that instead.

Put the mini window and reminder results in `docs/PHASE_NOTES.md`.

## Part 2: V1, blink detection (a few hours; the labelling is the slow part)

**Do first:** one 30-second practice recording, through the steps below as far as the frame count.
It shows whether your camera reaches 30 fps and whether the browser plays the file.

**Record** about 2 minutes per condition, reading or typing at the screen with the camera in front
of you. Use the Windows Camera app or similar, then save to `recordings/v1/`.

| File              | Condition (in the tool) | Setup                                              |
| ----------------- | ----------------------- | -------------------------------------------------- |
| `baseline.mp4`    | `baseline`              | Seated, frontal, no glasses, good light            |
| `glasses.mp4`     | `glasses`               | Same, with glasses (skip and log if you have none) |
| `lower-light.mp4` | `lower-light`           | Same, room lights lowered                          |
| `head-turned.mp4` | `head-turned`           | Same, head turned slightly                         |

- Keep your face in view from the very first frame. The first 10 s of valid frames are the
  calibration, so look at the screen and blink normally.
- Blink naturally. Don't perform blinks and don't try to hold them back.
- Lower light often lowers a webcam's frame rate. That's part of the result, so report the fps.

**Analyse and label** at `#v1`, one file at a time:

1. Pick the file and its condition. Check the condition every time, because it sets the export's
   file names (`v1-<condition>-...`).
2. Press Analyse at 0.5x and keep the tab visible and on screen until it finishes.
3. If "Frames skipped by the player" is above 0, Analyse again at 0.25x.
4. Note the frames, the median fps, and the skipped frames for the run log.
5. Export the detections and frames CSV.
6. **Label with the results out of sight.** The tool has to analyse first, because that gives it the
   exact frame times, so the summary is on screen while you label. Don't read "Events detected";
   scroll it out of view or cover it. Decide each blink from the video alone.
7. Step through the whole video, including the first 10 s (the scorer excludes those itself and
   reports how many). Shortcuts, with the labelling box focused: Left and Right step one frame,
   Shift steps one second, S marks a start, E marks an end.
   - Start: the first frame where the upper lid is clearly lower than when open.
   - End: the first frame where the eye is fully open again.
8. Export the labels **before** scoring. Once you've seen a score, don't change any labels.

**Score** each condition:

```powershell
npm run score:v1 -- recordings/v1/v1-baseline-labels.csv recordings/v1/v1-baseline-detections.csv
```

The goal, which isn't guaranteed, is F1 >= 0.85 for seated, frontal, no-glasses at >= 30 fps.

**Redo only if:** the camera or file failed, your face left the frame for a long stretch, or the
file won't analyse. Keep the failed attempt in the log. **A baseline below 30 fps** doesn't meet the
goal's condition: try another camera or browser, or report it as found with its fps.

## Part 3: V2b, live pulse (an hour or two, plus the reference device)

**You need:** a fingertip pulse oximeter, chest strap, or smartwatch, and a phone to film its display.

**Do first:**

- [ ] **Review `SPEC_AMENDMENT_03.md` (Patch D).** The phase notes ask for this before V2b. Keep it
      or drop it now, because parameters freeze once V2 starts. Write your decision and the date in
      `docs/PHASE_NOTES.md`.
- [ ] Turn on seconds in the Windows clock: Settings > Personalization > Taskbar > Taskbar
      behaviors > "Show seconds in system tray clock". The trace is stamped from this computer's
      clock, so use this clock and not a website or your phone's.
- [ ] Do a 1-minute practice run through to `npm run eval`, to find problems before the real runs.

**Record** 3-5 minutes per condition, seated. Rest between conditions so your pulse settles.

| Name            | Setup                                  |
| --------------- | -------------------------------------- |
| `good-light`    | Good light from the front, still       |
| `dim-light`     | Room lights lowered, still             |
| `screen-only`   | Lit only by the screen, still          |
| `slow-movement` | Good light, slow natural head movement |

For each condition:

1. Press Start, and wait for your face to be found. Keep the app window visible, because measuring
   pauses while it's hidden.
2. Put on the reference device. Rest your hand so it stays out of the camera's view of your face.
3. Start filming, with the device's display and the taskbar clock both in the shot.
4. Pulse tab, "Record numeric trace...", and confirm.
5. Stay seated for the full time, then stop the recording and stop filming. The browser saves two
   files, `blinkpulse-<date>-<time>-frames.csv` and `-estimates.csv`. Move both to
   `recordings/v2b/` and put the condition in their names.
6. Note the lighting, what the app showed (values, or "-" and the reason), and anything that went
   wrong.

**Write the reference log.** Play the phone video and note the reading every 10 s, as
`recordings/v2b/good-light-clock.csv`. Don't skip any: a gap over 15 s between readings means the
app's values in that gap aren't compared at all.

```text
time,bpm
16:05:10,72
16:05:20,74
```

**Convert it** to the format the tool reads. Set the date and the two file names:

```powershell
$date = '2026-11-03'
$rows = Import-Csv recordings/v2b/good-light-clock.csv | ForEach-Object {
  '{0},{1}' -f ([DateTimeOffset](Get-Date "$date $($_.time)")).ToUnixTimeMilliseconds(), $_.bpm
}
@('wall_time_ms,bpm') + $rows | Set-Content recordings/v2b/good-light-reference.csv -Encoding ascii
```

Don't use `Export-Csv` here. It adds quotes that the tool can't read.

**Evaluate:**

```powershell
npm run eval -- recordings/v2b/good-light-frames.csv recordings/v2b/good-light-reference.csv
```

This prints the fused result, the fused result before Patch D, and each region alone. Keep all of
them. Check that the shown and paired counts look sensible: if almost nothing is paired, the clock
or date is probably wrong, which is a mistake to fix and log, not a result.

The goal, which isn't guaranteed, is MAE <= 5 BPM and >= 80% within +-5 BPM for seated, still,
well-lit recordings.

**Keep in mind when reporting:**

- How often the app showed a value is part of the result. Accuracy based on only a few shown values
  has to say so.
- The reference device is not perfect and averages over time, so name the model.
- `npm run eval` prints the Bland-Altman bias and limits, but the plot required by PROJECT_SPEC 7.3
  still has to be made.
- One person's results say nothing about other faces, skin tones, or cameras. Say so.

## V2a (later)

Public datasets, run from `#v2`. Check the access terms for UBFC-rPPG and PURE now, in case approval
takes time. The steps are in `docs/VALIDATION.md`.

## Run log

Copy this into your notes for each sitting. Results go into `docs/VALIDATION.md`, as found.

```text
Date:              Commit:              Browser and version:
Camera:            Reference device (model):
Glasses, facial hair, or anything else that may affect the face regions:

V1  condition | file | duration | median fps | frames skipped | labels scored | excluded in calibration
    precision | recall | F1 | median abs duration error | notes

V2b condition | duration | lighting | hops | shown | paired
    MAE | RMSE | Pearson r | % within 5 | % within 3 | BA bias and limits | notes

Failed or redone recordings, and why:
Anything changed during the run:
```

## When you've finished

- [ ] `docs/VALIDATION.md`: fill in the V1 and V2b results with n, including failures.
- [ ] Update the README status line and `docs/LIMITATIONS.md` to match.
- [ ] Before committing, confirm no recording or CSV is staged, and check `git diff --cached --stat`.
