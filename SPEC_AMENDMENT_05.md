# SPEC_AMENDMENT_05: Break-it Lab and Privacy check

**Status:** requested by the author on 2026-11-03 ("what are some features that could make this
unique", then "ok make those differences", after Claude recommended these two). Claude designed
both, and **the author reviews this patch**. Like the earlier amendments, it never overrides a
product, privacy, wording, or accessibility rule in `CLAUDE.md`, and it never lowers the "Fair or
better" rule for showing a pulse rate.

Both features make the project's two main claims checkable by a visitor: that the app refuses to
give a number it can't support, and that nothing leaves the device. Neither needs a camera to try,
and neither changes the pipeline or any frozen parameter. V1 and V2 remain to be run.

## Patch G: Break-it Lab (`#break`)

**G1. What it is.** A page that needs no camera. The visitor changes the conditions of a simulated
signal and sees what the app would report. Simulated frames go through the same `PulseEstimator`
the app uses, with no separate logic, so what the page shows is the real pipeline's behaviour.

**G2. Controls.** True pulse rate; pulse strength, down to no pulse at all; camera noise; light
level; flickering light and its rate; head movement; frame rate; a 3 s loss of the face. Presets
show common cases, and "New noise" repeats the run with another random seed.

**G3. Results.** Each run covers 60 s, and the first 10 s only collect data. The page shows:

- the true rate against the values the app would show, with the seconds it withheld a value shaded;
- how many seconds showed a value, and the median and largest error of those values;
- how many shown values were off by more than 5 BPM;
- with no pulse in the signal, how many seconds showed a value at all, since each of those is wrong;
- the quality of the shown values;
- every reason the app gave for showing "-", in the app's own wording, with its number of seconds;
- every warning the checks raised, including while a value was shown.

Plots have text alternatives, and the results are also given as text. Controls work by keyboard.

**G4. Honesty rules.**

- The page always says that the signal is simulated and that the results describe the checks, not
  accuracy on real people. A simulation can't show V2's result, and it never stands in for it.
- A wrong value that gets through is shown as plainly as a correct one. No seed or preset is chosen
  to hide one.
- The simulated scene is illustrative: its strengths and noise levels are not measured from faces.
  Its flicker and head movement are simple, and the page says the app copes with them better here
  than it may with real ones.

**G5. Reaching it.** A link in the Signal Lab and on the first setup screen.

## Patch H: Privacy check (privacy badge)

**H1. What it is.** The privacy badge becomes a button that opens a dialog. The dialog lists what the
browser itself recorded for this page since it opened:

- requests to other sites (expected: none);
- requests the browser refused under the page's security policy, with their address and count;
- requests to this site, when the last one was, and how many came in the last 60 s;
- the page's connection rule (`connect-src`), read from the page.

**H2. Sources.** The browser's Resource Timing records (`PerformanceObserver`, with buffered entries)
and `securitypolicyviolation` events. The list is kept in memory, is never stored or sent, and is
gone when the page closes.

**H3. Honesty rules.** The dialog says what it can't prove, in these terms:

- the page is reporting on itself, so the independent check is the browser's own developer tools;
- browser records don't list every kind of connection, such as WebSockets (the connection rule
  covers those);
- the site's host can see which of its files were requested, as with any website.

It reports records, and it never says "nothing can leave". The MediaPipe usage logger, already
described in `docs/ETHICS_AND_PRIVACY.md`, is named as the expected refused request.

## Not changed

The pipeline, the parameters, the indicator, and the study. Neither feature stores anything: no
`localStorage`, no IndexedDB. No new network requests, and no third-party scripts.

## Acceptance

- `npm run check` passes. The simulator and both summaries are pure and unit-tested, including
  that the simulator runs the real estimator and that the same seed gives the same result.
- `npm run smoke` opens both features in a browser: the dialog agrees that no request went to another
  site and shows the refused logger request; the Break-it Lab runs with no camera.
- Layout checked at 360 and 1280 px, in light and dark, with no horizontal page scrolling.
