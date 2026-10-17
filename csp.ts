/**
 * Content-Security-Policy for the production build (PROJECT_SPEC Section 8).
 *
 * Every exception to `'self'` must be listed and justified in docs/ETHICS_AND_PRIVACY.md.
 *
 * `'wasm-unsafe-eval'` (Phase 3): MediaPipe FaceLandmarker runs as WebAssembly.
 * Tested 2026-10-17 in Chrome on the production build: without it,
 * WebAssembly.instantiate() is blocked by the CSP and face tracking cannot start.
 * It allows compiling WebAssembly only; JavaScript eval() stays blocked (no
 * 'unsafe-eval').
 *
 * `media-src blob:` (Phase 3): the V1 validation tool plays a video file the user
 * picks, through a local object URL. The file is read on the device and never sent.
 *
 * Note: `frame-ancestors` cannot be set from a <meta> tag; it needs an HTTP header
 * from the static host (documented for the deploy step).
 */
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'blob:'],
  'media-src': ["'self'", 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

export function buildCsp(directives: Readonly<Record<string, readonly string[]>>): string {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Policy sent as an HTTP header by the DEV server (`npm run dev`). It differs from
 * production only where Vite's hot reload needs it: an inline React-refresh
 * preamble and injected <style> tags. `connect-src` stays `'self'`, which is the
 * point: @mediapipe/tasks-vision 1.1.1 contains a usage logger that POSTs to a
 * Google endpoint every 60 s, with no public option to turn it off. Found
 * 2026-10-17 in a browser test; the CSP blocks it in dev and production alike.
 */
export const DEV_CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  ...CSP_DIRECTIVES,
  'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
};
