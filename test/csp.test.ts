import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, buildCsp } from '../csp.ts';

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

  it('serialises as "name sources; name sources"', () => {
    expect(buildCsp({ a: ["'self'"], b: ["'none'"] })).toBe("a 'self'; b 'none'");
  });
});
