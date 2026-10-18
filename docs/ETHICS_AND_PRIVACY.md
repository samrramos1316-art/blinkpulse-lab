# Ethics and privacy

_Skeleton created in Phase 0. Completed in Phase 5._

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

## CSP notes

`'wasm-unsafe-eval'` is the only MediaPipe exception so far, added after a real test showed it is
required. No worker or `blob:` script exception was needed.

Known gaps:

- The dev server's CSP also allows inline scripts and styles (hot reload needs them). Its
  connection rules are the same as production's. Use `npm run build && npm run preview` to test the
  real policy.
- `frame-ancestors` cannot be set via `<meta>`; it must be sent as an HTTP header by the static
  host. To be configured at deploy time.
