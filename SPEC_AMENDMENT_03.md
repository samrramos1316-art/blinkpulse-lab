# SPEC_AMENDMENT_03: Pulse rate at lower signal quality

**Status:** requested by the author on 2026-10-23 ("refine the heartbeat under lower quality"),
designed and implemented by Claude the same day. **The author reviews this patch before V2b
starts**; until then it can be switched off for comparison (`BEFORE_PATCH_D` in
`src/rppg/evaluate.ts`). Like Patch A, it is fixed before validation and not tuned on V2b results.

It changes PROJECT_SPEC 5.4 step 5 (smoothing) and adds a fallback after the Patch A fusion. It
does **not** change the chain (resampling, POS, band-pass, spectrum, SQI), the quality levels and
flags, the Patch A fusion rules, or the rule that a value is shown only at Fair or better.

## Problem

On synthetic three-region traces with independent noise per region (`npm run bench:pulse`, 40
streams of 60 s per scenario, 1985 hops each):

- With weaker signals, single regions rarely reach Fair, so the app shows "-" most of the time
  (noise sd 1.0: a value in 1.7% of hops).
- The values that do get shown at low signal are often wrong: at noise sd 1.3, 23.5% of shown
  values were off by more than 5 BPM, and with no pulse at all, 0.8% of hops still showed a value.
  The cause is the smoother: after a pause it shows the first estimate at once, so one window of
  noise that happens to look clean is enough.

## Patch D

**D1. Pooled-region fallback** (`src/rppg/pooled.ts`). Only when the Patch A fusion has no
Fair-or-better value:

1. Pool the regions whose window is usable (no gap, at least 15 fps) and that have no region flag
   (saturated, dark, low coverage), if there are at least 2.
2. At each frame time present in every pooled region, average each colour channel divided by
   that region's window mean, with equal weights (no tuned weights).
3. Run the unchanged chain (`estimateWindow`) on the pooled trace. Its quality follows the same
   rules as a region (SQI level, minus one step for each of motion, lighting change, low frame
   rate, and cross-check disagreement), using the most cautious window statistics of the pooled
   regions, and is **capped at Fair**.
4. Use it only at Fair. The UI says the value came from pooled regions.

Why it helps: the pulse is in step across the face, while much of the noise (sensor noise, few
pixels, low light) is independent between regions, so averaging raises the signal-to-noise ratio.
It does not help with noise the regions share (head motion, lighting changes).

**D2. Confirm the first value** (`BpmSmoother`). When the smoother has no history (start, or after
5 hops without a shown value), an estimate is shown only when the next one agrees with it within
6 BPM, the same rule that step 5 already uses for jumps. "Next" means consecutive: a hop without a
usable estimate drops the held one (for jumps too; before, a held estimate could be confirmed
several seconds later). Meanwhile the card shows "-" with
"Checking the reading... hold still." This adds one second before the first value.

## Evidence (synthetic only)

`npm run bench:pulse`, pulse 0.4% in green, rates 55/72/95/130/165 BPM, 8 seeds, n = 1985 hops per
row:

| Noise sd per region | Before: shown / off > 5 BPM | D2 only: shown / off > 5 BPM | D1 + D2: shown / off > 5 BPM |
| ------------------- | --------------------------- | ---------------------------- | ---------------------------- |
| 0.3                 | 78.3% / 0.0%                | 74.7% / 0.0%                 | 96.6% / 0.0%                 |
| 0.6                 | 10.8% / 0.0%                | 7.8% / 0.0%                  | 30.1% / 0.0%                 |
| 0.8                 | 3.6% / 4.2%                 | 2.0% / 2.5%                  | 10.2% / 0.0%                 |
| 1.0                 | 1.7% / 9.1%                 | 0.9% / 5.6%                  | 4.3% / 1.2%                  |
| 1.3                 | 0.9% / 23.5%                | 0.4% / 12.5%                 | 1.3% / 3.8%                  |
| 0.5 / 1 / 1         | 12.4% / 0.4%                | 8.6% / 0.0%                  | 13.1% / 0.0%                 |
| no pulse (sd 1)     | 0.8% shown (all wrong)      | 0.0%                         | 0.0%                         |

"Off > 5 BPM" is a share of the shown values. Mean absolute error of shown values at sd 1.0: 4.92
BPM before, 1.17 BPM after.

Limits: identical pulse and independent Gaussian noise in every region is the most favourable case
for pooling. Real faces add motion, lighting changes, and noise shared between regions; this is
measured only by V2b.

## Validation addition (V2b)

Report the fused result both as the app runs it and before Patch D (`npm run eval` prints both),
with the share of hops shown and the agreement of the shown values. If Patch D does not improve on
the pipeline before it, report that.
