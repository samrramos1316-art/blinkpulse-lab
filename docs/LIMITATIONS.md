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
