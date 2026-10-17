# Limitations

_Skeleton created in Phase 0. This file is filled in as the relevant phases and validation runs are completed. It must not contain numbers that do not come from a test or validation run._

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
