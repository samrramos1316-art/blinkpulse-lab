import { describe, expect, it } from 'vitest';
import { cspRule, formatBytes, formatSeconds, summarizeNetwork } from './networkSummary.ts';

const origin = 'https://app.example';
const req = (url: string, atMs = 100, kind = 'fetch', bytes = 10) => ({ url, atMs, kind, bytes });

describe('summarizeNetwork', () => {
  it('reports an empty record as empty, not as a pass', () => {
    expect(summarizeNetwork([], [], origin, 1000)).toEqual({
      otherSites: [],
      own: [],
      lastOwnMs: null,
      ownInLastMinute: 0,
      refused: [],
    });
  });

  it('separates this site from other sites, comparing the whole origin', () => {
    const s = summarizeNetwork(
      [
        req(`${origin}/assets/a.js`),
        req('https://other.example/x'),
        req('http://app.example/insecure'),
        req('https://app.example.evil.example/lookalike'),
        req('https://app.example:8443/other-port'),
      ],
      [],
      origin,
      1000,
    );
    expect(s.own.map((r) => r.path)).toEqual(['/assets/a.js']);
    expect(s.otherSites).toHaveLength(4);
  });

  it('counts sends that leave by beacon or websocket address like any other', () => {
    const s = summarizeNetwork(
      [req('https://other.example/b', 1, 'beacon'), req('wss://other.example/w')],
      [],
      origin,
      1000,
    );
    expect(s.otherSites).toHaveLength(2);
  });

  it('ignores blob: and data: addresses, which stay on this device', () => {
    const s = summarizeNetwork(
      [req('blob:https://app.example/1234'), req('data:text/plain,hello')],
      [],
      origin,
      1000,
    );
    expect(s.own).toEqual([]);
    expect(s.otherSites).toEqual([]);
  });

  it('keeps only the path of this site’s addresses', () => {
    const s = summarizeNetwork([req(`${origin}/models/m.task?v=1`)], [], origin, 1000);
    expect(s.own[0]?.path).toBe('/models/m.task');
  });

  it('finds the last request and those in the last minute', () => {
    const s = summarizeNetwork(
      [req(`${origin}/a`, 500), req(`${origin}/b`, 70_000), req(`${origin}/c`, 2_000)],
      [],
      origin,
      100_000,
    );
    expect(s.lastOwnMs).toBe(70_000);
    expect(s.ownInLastMinute).toBe(1);
  });

  it('groups refused requests by address and rule, most frequent first', () => {
    const s = summarizeNetwork(
      [],
      [
        { url: 'https://a.example/x', rule: 'connect-src' },
        { url: 'https://b.example/y', rule: 'img-src' },
        { url: 'https://b.example/y', rule: 'img-src' },
        { url: 'https://b.example/y', rule: 'connect-src' },
      ],
      origin,
      1000,
    );
    expect(s.refused).toEqual([
      { url: 'https://b.example/y', rule: 'img-src', count: 2 },
      { url: 'https://a.example/x', rule: 'connect-src', count: 1 },
      { url: 'https://b.example/y', rule: 'connect-src', count: 1 },
    ]);
  });
});

describe('cspRule', () => {
  const policy = "default-src 'self'; connect-src 'self'; connect-src-elem x; img-src blob:";

  it('finds a rule by its exact name', () => {
    expect(cspRule(policy, 'connect-src')).toBe("connect-src 'self'");
  });

  it('returns null when the rule or the policy is missing', () => {
    expect(cspRule(policy, 'font-src')).toBeNull();
    expect(cspRule('', 'connect-src')).toBeNull();
  });
});

describe('formats', () => {
  it('sizes, with "-" when the browser gave none', () => {
    expect(formatBytes(0)).toBe('-');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('seconds', () => {
    expect(formatSeconds(1250)).toBe('1.3 s');
  });
});
