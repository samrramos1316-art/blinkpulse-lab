# Ethics and privacy

_Skeleton created in Phase 0. Completed in Phase 5._

## Content-Security-Policy

The production build injects a CSP `<meta>` tag (`csp.ts`, `vite.config.ts`). Current policy:

| Directive     | Sources        | Why                                                                         |
| ------------- | -------------- | --------------------------------------------------------------------------- |
| `default-src` | `'self'`       | Everything is self-hosted.                                                  |
| `script-src`  | `'self'`       | No inline or third-party scripts.                                           |
| `style-src`   | `'self'`       | Bundled CSS only.                                                           |
| `img-src`     | `'self' blob:` | `blob:` reserved for canvas snapshots in the UI (never stored or uploaded). |
| `font-src`    | `'self'`       | Fonts must be self-hosted.                                                  |
| `connect-src` | `'self'`       | No network requests to other hosts.                                         |
| `worker-src`  | `'self'`       | Reserved for a possible same-origin Web Worker (Phase 6).                   |
| `object-src`  | `'none'`       | No plugins.                                                                 |
| `base-uri`    | `'self'`       | Prevents `<base>` injection.                                                |
| `form-action` | `'none'`       | The app submits no forms.                                                   |

Exceptions required by MediaPipe (for example `'wasm-unsafe-eval'`) will be added in Phase 3 only
if the official documentation and a real test show they are needed, and recorded in this table.

Known gaps:

- The dev server (`npm run dev`) runs without the CSP, because hot reload needs inline scripts.
  Use `npm run build && npm run preview` to test the real policy.
- `frame-ancestors` cannot be set via `<meta>`; it must be sent as an HTTP header by the static
  host. To be configured at deploy time.
