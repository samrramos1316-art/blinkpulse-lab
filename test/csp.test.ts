import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, DEV_CSP_DIRECTIVES, buildCsp } from '../csp.ts';

describe('Content-Security-Policy (PROJECT_SPEC Section 8)', () => {
  const policy = buildCsp(CSP_DIRECTIVES);

  it('defaults to self and blocks plugins', () => {
    expect(CSP_DIRECTIVES['default-src']).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES['object-src']).toEqual(["'none'"]);
  });

  it('only allows connections to self (no network after load)', () => {
    expect(CSP_DIRECTIVES['connect-src']).toEqual(["'self'"]);
  });

  it('has no inline/eval script allowances, wildcards, or external hosts', () => {
    expect(policy).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
    expect(policy).not.toMatch(/\*/);
    expect(policy).not.toMatch(/https?:|data:/);
  });

  it("scripts: self plus only 'wasm-unsafe-eval' (MediaPipe WebAssembly, tested in Phase 3)", () => {
    expect(CSP_DIRECTIVES['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it('media: self plus blob: only (local video files in the V1 tool)', () => {
    expect(CSP_DIRECTIVES['media-src']).toEqual(["'self'", 'blob:']);
  });

  it('serialises as "name sources; name sources"', () => {
    expect(buildCsp({ a: ["'self'"], b: ["'none'"] })).toBe("a 'self'; b 'none'");
  });
});

describe('dev server CSP (blocks the MediaPipe usage logger during development too)', () => {
  it('keeps connections to self only', () => {
    expect(DEV_CSP_DIRECTIVES['connect-src']).toEqual(["'self'"]);
    expect(DEV_CSP_DIRECTIVES['default-src']).toEqual(["'self'"]);
  });

  it('relaxes only scripts and styles, and never allows eval or other hosts', () => {
    const changed = Object.keys(DEV_CSP_DIRECTIVES).filter(
      (k) => JSON.stringify(DEV_CSP_DIRECTIVES[k]) !== JSON.stringify(CSP_DIRECTIVES[k]),
    );
    expect(changed.sort()).toEqual(['script-src', 'style-src']);
    const policy = buildCsp(DEV_CSP_DIRECTIVES);
    expect(policy).not.toMatch(/'unsafe-eval'|\*|https?:/);
  });
});
