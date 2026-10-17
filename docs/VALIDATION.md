# Validation

_Skeleton created in Phase 0. No content yet: this file is filled in as the relevant phases and validation runs are completed. It must not contain numbers that do not come from a test or validation run._

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
