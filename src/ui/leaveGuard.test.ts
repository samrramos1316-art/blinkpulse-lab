import { afterEach, describe, expect, it } from 'vitest';
import { routeFor, setStudyRunning } from './leaveGuard.ts';

describe('routeFor', () => {
  afterEach(() => {
    setStudyRunning(false);
  });

  it('follows the hash when no study session runs', () => {
    expect(routeFor('')).toBe('');
    expect(routeFor('#explorer')).toBe('#explorer');
  });

  it('stays on #study while a session runs', () => {
    setStudyRunning(true);
    expect(routeFor('')).toBe('#study');
    expect(routeFor('#v1')).toBe('#study');
    expect(routeFor('#study')).toBe('#study');
  });
});
