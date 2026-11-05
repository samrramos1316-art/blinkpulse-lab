/**
 * The browser's own record of this page's requests, for the Privacy check
 * (SPEC_AMENDMENT_05 Patch H). Held in memory only; never stored or sent.
 *
 * Started before the rest of the app, because a refused request is reported only to
 * listeners that are already attached. Resource Timing also replays earlier entries.
 */

import type { NetworkRequest, RefusedRequest } from '../ui/networkSummary.ts';

/** More than this page makes in a normal session; the cap only bounds memory. */
const MAX_RECORDS = 2000;
const RESOURCE_BUFFER = 1000;

const requests: NetworkRequest[] = [];
const refused: RefusedRequest[] = [];
let started = false;

function addRequests(entries: readonly PerformanceEntry[]): void {
  for (const entry of entries) {
    if (requests.length >= MAX_RECORDS) return;
    const resource = entry as PerformanceResourceTiming;
    requests.push({
      url: resource.name,
      kind: resource.initiatorType,
      atMs: resource.startTime,
      bytes: resource.encodedBodySize,
    });
  }
}

export function startNetworkLog(): void {
  if (started) return;
  started = true;
  document.addEventListener('securitypolicyviolation', (event) => {
    if (refused.length < MAX_RECORDS) {
      refused.push({ url: event.blockedURI, rule: event.effectiveDirective });
    }
  });
  performance.setResourceTimingBufferSize(RESOURCE_BUFFER);
  new PerformanceObserver((list) => {
    addRequests(list.getEntries());
  }).observe({ type: 'resource', buffered: true });
}

export function networkRecords(): {
  requests: readonly NetworkRequest[];
  refused: readonly RefusedRequest[];
} {
  return { requests, refused };
}

/** The page's security policy, when it comes from a meta tag (the production build). */
export function pagePolicy(): string | null {
  return (
    document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ??
    null
  );
}
