/**
 * What the Privacy check shows (SPEC_AMENDMENT_05 Patch H), from what the browser recorded
 * for this page. Pure.
 */

export interface NetworkRequest {
  url: string;
  /** How the browser says it was started: "fetch", "script", "beacon", ... */
  kind: string;
  /** Milliseconds since the page opened. */
  atMs: number;
  /** Size of the body as sent over the network, or 0 when the browser doesn't say. */
  bytes: number;
}

export interface RefusedRequest {
  url: string;
  /** The security policy rule that refused it, such as "connect-src". */
  rule: string;
}

export interface OwnRequest {
  /** The path, without this site's address. */
  path: string;
  kind: string;
  atMs: number;
  bytes: number;
}

export interface RefusedSummary extends RefusedRequest {
  count: number;
}

export interface NetworkSummary {
  otherSites: NetworkRequest[];
  own: OwnRequest[];
  lastOwnMs: number | null;
  ownInLastMinute: number;
  refused: RefusedSummary[];
}

/** http(s) only: blob: and data: addresses are local to this device. */
function isNetwork(url: string): boolean {
  return /^(https?|wss?):/i.test(url);
}

export function summarizeNetwork(
  requests: readonly NetworkRequest[],
  refused: readonly RefusedRequest[],
  origin: string,
  nowMs: number,
): NetworkSummary {
  const otherSites: NetworkRequest[] = [];
  const own: OwnRequest[] = [];
  for (const r of requests) {
    if (!isNetwork(r.url)) continue;
    const url = new URL(r.url);
    if (url.origin === origin) {
      own.push({ path: url.pathname, kind: r.kind, atMs: r.atMs, bytes: r.bytes });
    } else {
      otherSites.push(r);
    }
  }
  const groups = new Map<string, RefusedSummary>();
  for (const r of refused) {
    const key = `${r.rule} ${r.url}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { ...r, count: 1 });
  }
  return {
    otherSites,
    own,
    lastOwnMs: own.reduce<number | null>((last, r) => Math.max(last ?? r.atMs, r.atMs), null),
    ownInLastMinute: own.filter((r) => r.atMs > nowMs - 60_000).length,
    refused: [...groups.values()].sort((a, b) => b.count - a.count),
  };
}

/** One rule of a Content-Security-Policy, such as "connect-src 'self'", or null. */
export function cspRule(policy: string, rule: string): string | null {
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === rule || part.startsWith(`${rule} `));
  return found ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
