/**
 * Content-Security-Policy for the production build (PROJECT_SPEC Section 8).
 *
 * Every exception to `'self'` must be listed and justified in docs/ETHICS_AND_PRIVACY.md.
 * MediaPipe needs (`'wasm-unsafe-eval'`, workers) are added in Phase 3 only if
 * the official docs and a real test show they are required.
 *
 * Note: `frame-ancestors` cannot be set from a <meta> tag; it needs an HTTP header
 * from the static host (documented for the deploy step).
 */
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'blob:'],
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
