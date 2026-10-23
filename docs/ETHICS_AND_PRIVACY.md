# Ethics and privacy

How the app handles data, the consent process for testing, and fairness. Updated in Phase 5
(2026-10-20).

## Content-Security-Policy

The production build injects a CSP `<meta>` tag (`csp.ts`, `vite.config.ts`). Current policy:

| Directive     | Sources                     | Why                                                                                                                                                                                                                                |
| ------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-src` | `'self'`                    | Everything is self-hosted.                                                                                                                                                                                                         |
| `script-src`  | `'self' 'wasm-unsafe-eval'` | No inline or third-party scripts. `'wasm-unsafe-eval'` lets MediaPipe compile its WebAssembly; without it Chrome blocked `WebAssembly.instantiate()` on the production build (tested 2026-10-17). JavaScript `eval` stays blocked. |
| `style-src`   | `'self'`                    | Bundled CSS only.                                                                                                                                                                                                                  |
| `img-src`     | `'self' blob:`              | `blob:` reserved for canvas snapshots in the UI (never stored or uploaded).                                                                                                                                                        |
| `media-src`   | `'self' blob:`              | `blob:` lets the validation tools (`#v1`, `#v2`) play a video file the user picks, from a local object URL. The file is read on the device only; it is never uploaded or stored by the app.                                        |
| `font-src`    | `'self'`                    | Fonts must be self-hosted.                                                                                                                                                                                                         |
| `connect-src` | `'self'`                    | No network requests to other hosts.                                                                                                                                                                                                |
| `worker-src`  | `'self'`                    | Reserved for a possible same-origin Web Worker (Phase 6).                                                                                                                                                                          |
| `object-src`  | `'none'`                    | No plugins.                                                                                                                                                                                                                        |
| `base-uri`    | `'self'`                    | Prevents `<base>` injection.                                                                                                                                                                                                       |
| `form-action` | `'none'`                    | The app submits no forms.                                                                                                                                                                                                          |

## Camera (Phase 2)

- The camera starts only after the user presses Start or "Allow camera" in setup, after a plain
  explanation shown before the browser prompt.
- Frames go only to a `<video>` element; nothing is recorded, stored, or uploaded. The preview is
  mirrored with CSS only.
- The camera is released (all tracks stopped, `srcObject` cleared) on Stop, on `pagehide` (page
  unload or back/forward cache), when the app unmounts, and when Stop is pressed while the
  permission prompt is still open (the stream is stopped as soon as it arrives). Verified in
  headless Chrome with a fake camera: track `readyState` is `ended` after Stop and after
  `pagehide`.
- Setup's lighting hint draws the current frame into a 32x24 canvas twice a second, computes the
  mean brightness, and clears the canvas. No pixels are kept.
- `localStorage` holds only the theme preference and a "setup completed" flag.
- No network requests: a browser run of setup, Start, Stop, and restart made 0 requests to any
  host other than the app's own origin.
- Face landmarks are computed per frame in memory and are never stored. The Landmark Explorer's
  "Freeze frame" keeps one frame in memory only while frozen.
- The V1 and V2a tools (`#v1`, `#v2`) read a video file the user picks, from a local object URL;
  nothing is uploaded, and their exports hold numbers only.
  Its exports (after a button press) hold numbers only: event times, EAR values, flags.
- Pulse: skin pixels of three small regions are read from each frame into a canvas, averaged,
  and discarded within the same frame. Only the averages enter the pulse calculation.
- "Record numeric trace" (Pulse tab) records only after the user confirms a description of the
  contents: per-frame time, region colour averages and quality numbers, nose position and eye
  distance in pixels, and one estimate per second with clock time. No video, images, or landmark
  sets. Kept in memory (30 min cap) and saved by the browser as CSV when the user stops.
- The session timeline is kept in memory only and cleared on the next Start. Its CSV export
  needs two clicks; the confirmation lists what the file contains (per-minute numbers only).
- Study mode (`#study`, 2026-10-19): the participant is identified only by a code that must match
  `P` plus 2-3 digits, so a name cannot be typed in. The session is kept in memory and saved only
  when the researcher presses Export: one CSV of numbers and short codes (calibration and baseline
  values, eye-closure windows, blink event times and durations, ratings, reaction-time trials). A
  test checks that every cell is a number or a short code. "New session" reloads the page, which
  clears everything. The researcher confirms that signed forms are on file; the app stores no
  names, forms, or contact details.

## MediaPipe usage logger (found 2026-10-17)

`@mediapipe/tasks-vision` 1.1.1 creates a usage logger for every task. It sends a `fetch` POST to
`https://odml.pa.googleapis.com/v1/log` about once a minute while a task runs and when the task is
closed. From reading the minified bundle, the payload is protobuf usage data (task type, running
mode, and performance counters) with an API key from the wasm module; no frames or landmarks were
seen in it, but the payload was not fully decoded. There is no public option to turn it off.

- **Blocked:** `connect-src 'self'` stops it. Tested in headless Chrome with a fake camera: after
  70 s of running and after closing the task, there was 1 `securitypolicyviolation` for that URL
  and 0 requests to other hosts, on both the dev server and the production build. After one failed
  send the logger stops trying.
- **Before the fix:** until 2026-10-17 the dev server had no CSP, so live tests on `npm run dev`
  (the author's own sessions that day) may have sent these usage pings to Google.
- The dev server now sends a CSP header too (`DEV_CSP_DIRECTIVES` in `csp.ts`), with the same
  `connect-src 'self'`.
- `npm run dev:phone` serves the same dev build, with the same CSP header, over https on the
  local network so a phone can open it. The computer only serves the page files; video is still
  processed on the phone and never sent to the computer. Anyone on the same network who knows the
  address can open the page while it runs, so stop it when done and use it on trusted networks
  only. The certificate's private key stays in the git-ignored `.cert/` folder.

## CSP notes

`'wasm-unsafe-eval'` is the only MediaPipe exception so far, added after a real test showed it is
required. No worker or `blob:` script exception was needed.

Known gaps:

- The dev server's CSP also allows inline scripts and styles (hot reload needs them). Its
  connection rules are the same as production's. Use `npm run build && npm run preview` to test the
  real policy.
- `frame-ancestors` cannot be set via `<meta>`, so the host sends it as an HTTP header
  (`vercel.json`, added 2026-10-22): `frame-ancestors 'none'` and `X-Frame-Options: DENY` (no other
  site can embed the app and its camera prompt), plus `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, and a `Permissions-Policy` that allows the camera for this origin
  only and turns off the microphone and location.

## Data handling summary (Phase 5)

| Data                              | Where it lives                  | Kept?                                    |
| --------------------------------- | ------------------------------- | ---------------------------------------- |
| Video frames                      | `<video>` element, canvas reads | Never stored; discarded each frame       |
| Face landmarks                    | Memory, per frame               | Never stored or exported                 |
| Skin-region colour averages       | Memory, last few seconds        | Exported only by "Record numeric trace"  |
| Blink events, timeline, indicator | Memory, current session         | Exported only after a confirmation       |
| Study session (`#study`)          | Memory                          | Exported only when the researcher clicks |
| Theme and "setup completed" flag  | `localStorage`                  | Yes (no measurements)                    |

- **Privacy checks in Phase 5** (headless Chrome, production build, synthetic face): no request to
  any other host during first-run setup, measuring, the Signal Lab, the About dialog, theme changes,
  and screen-size changes. The CSP test (`test/csp.test.ts`) keeps the policy as listed above. The
  About dialog's links to the docs are plain text, so the app never navigates away by itself.
- **Screenshots** in `docs/screenshots/` show only a synthetic face rendered from MediaPipe's
  canonical face model, never a real person.

## Consent process for testing

- Until the study protocol is frozen, the author tests the app only on themselves (gate G-B).
- Validation recordings (V1, V2b) and study sessions need informed consent, and for anyone under 18
  a signed parent or guardian permission form plus their own assent (`docs/forms/`). The right to
  stop at any time, without a reason, is stated on every form.
- Recordings for V1 stay on the recording device, are never committed or shared, and are deleted
  when labelling is finished or when the participant asks.
- Study files hold a participant code only; the list linking codes to names is kept on paper or in
  a separate file outside the repository and destroyed when the study ends.

## Fairness

- The pulse signal comes from small colour changes in the skin. They are weaker for darker skin
  tones and in poor light, so the pulse rate can be less available or less accurate for some
  people. The app shows "-" with a reason rather than a guess, and V2 must report results per
  participant and per lighting condition, and say plainly where it works poorly.
- Blink measurements depend on the face landmark model and on eye shape, eyelid anatomy, eye
  conditions, glasses, and makeup. The app never calls anyone's blinking abnormal, and V1 reports
  results per condition (including glasses).
- The eye-closure indicator compares each person only with themselves. It is not a judgement of a
  person and is not shown to study participants during a session.
- The validation samples will be small and may not be varied; the results must say who was and
  was not represented, without identifying anyone.
