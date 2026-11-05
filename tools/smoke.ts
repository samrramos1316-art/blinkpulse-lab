/**
 * Browser smoke test (PROJECT_SPEC 6.4), run on the production build:
 *
 *   npm run smoke [-- --watch-seconds 70]
 *
 * Uses the installed Google Chrome and its fake camera, whose test pattern has no
 * face. So it checks that the app starts, measures frames, runs face tracking without
 * throwing, makes no network requests after loading, and releases the camera on Stop.
 * It says nothing about blink or pulse accuracy.
 *
 * Not part of `npm run check`, because it needs a browser and takes over a minute. The
 * default watch covers the MediaPipe usage logger's 60 s timer (docs/ETHICS_AND_PRIVACY.md).
 */

import { chromium, type Page, type Request } from 'playwright';
import { preview } from 'vite';

const WARM_UP_TIMEOUT_MS = 60_000;
const POLL_MS = 250;
const ROUTES = ['#explorer', '#v1', '#v2', '#study'];

const args = process.argv.slice(2);
const watchIdx = args.indexOf('--watch-seconds');
const watchSeconds = watchIdx >= 0 ? Number(args[watchIdx + 1]) : 70;
if (!(watchSeconds >= 0)) {
  console.error('Usage: npm run smoke [-- --watch-seconds 70]');
  process.exit(2);
}

/** Records each camera stream, so the test can see that Stop really releases it. */
const TRACK_STREAMS = `
  (() => {
    const streams = [];
    globalThis.__smokeStreams = streams;
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    media.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  })();
`;
const STREAMS_OPENED = 'globalThis.__smokeStreams.length';
const LIVE_TRACKS = `globalThis.__smokeStreams
  .flatMap((s) => s.getTracks())
  .filter((t) => t.readyState === 'live').length`;

const failures: string[] = [];

function check(ok: boolean, label: string, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The value in a row of the Timing details, which must be open. */
async function timingValue(page: Page, label: string): Promise<string> {
  const row = page.locator('.timing__row', { hasText: label }).first();
  if ((await row.count()) === 0) return '';
  return (await row.locator('dd').textContent()) ?? '';
}

/** The leading number of a row's value, or NaN (the row shows "-" before it has one). */
async function timingNumber(page: Page, label: string): Promise<number> {
  return Number.parseFloat(await timingValue(page, label));
}

async function waitForPositive(page: Page, label: string): Promise<number> {
  const deadline = Date.now() + WARM_UP_TIMEOUT_MS;
  for (;;) {
    const value = await timingNumber(page, label);
    if (value > 0 || Date.now() > deadline) return value;
    await sleep(POLL_MS);
  }
}

const server = await preview({ preview: { port: 4174, strictPort: true } });
const baseUrl = server.resolvedUrls?.local[0];
if (!baseUrl) throw new Error('The preview server has no address');
const origin = new URL(baseUrl).origin;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

try {
  const context = await browser.newContext();
  await context.addInitScript({
    // Skips the first-run setup; the only other thing it does is record streams.
    content: `localStorage.setItem('blinkpulse.setupDone', '1');${TRACK_STREAMS}`,
  });
  const page = await context.newPage();

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests = new Map<Request, string>();
  const requests: { request: Request; afterLoad: boolean }[] = [];
  let loaded = false;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => requests.push({ request, afterLoad: loaded }));
  page.on('requestfailed', (request) => {
    failedRequests.set(request, request.failure()?.errorText ?? 'failed');
  });

  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();

  await page.getByRole('button', { name: 'Timing details' }).click();

  const fps = await waitForPositive(page, 'Measured rate');
  check(fps > 0, 'Shows a measured frame rate', `${String(fps)} fps`);
  const inference = await waitForPositive(page, 'Face tracking');
  check(inference > 0, 'Face tracking runs', await timingValue(page, 'Face tracking'));

  // The page and the model are in by now; from here on nothing may be requested.
  loaded = true;
  console.log(`      Watching the network for ${String(watchSeconds)} s...`);
  await sleep(watchSeconds * 1000);

  const fpsLater = await timingNumber(page, 'Measured rate');
  check(fpsLater > 0, 'Still measuring after the watch', `${String(fpsLater)} fps`);

  const isHttp = (r: Request) => /^https?:/.test(r.url());
  const http = requests.filter((r) => isHttp(r.request));
  const external = http.filter((r) => new URL(r.request.url()).origin !== origin);
  const sent = external.filter((r) => !failedRequests.has(r.request));
  const blocked = external.filter((r) => failedRequests.has(r.request));
  const ownAfterLoad = http.filter(
    (r) => r.afterLoad && new URL(r.request.url()).origin === origin,
  );
  check(
    sent.length === 0,
    'No request left for another site',
    sent.map((r) => r.request.url()).join(', '),
  );
  check(
    ownAfterLoad.length === 0,
    'No requests to its own site after loading',
    ownAfterLoad.map((r) => r.request.url()).join(', '),
  );
  for (const { request } of blocked) {
    console.log(
      `      Blocked before sending (${failedRequests.get(request) ?? ''}): ${request.url()}`,
    );
  }

  // The in-page Privacy check must agree with what Playwright saw, and it can also see
  // the logger's refused attempt, which Playwright can't.
  await page.getByRole('button', { name: /Check$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Check the privacy claim' });
  await dialog.waitFor();
  const otherSites = await timingNumber(page, 'Requests to other sites');
  check(otherSites === sent.length, 'Privacy check agrees on other sites', String(otherSites));
  const refused = await timingNumber(page, 'Requests refused by the browser');
  if (watchSeconds >= 65) {
    check(refused >= 1, 'Privacy check shows the refused logger request', String(refused));
  }
  const rule = await timingValue(page, 'Connection rule of this page');
  check(rule === "connect-src 'self'", 'Privacy check reads the connection rule', rule);
  await dialog.getByRole('button', { name: 'Close' }).click();

  const opened = await page.evaluate<number>(STREAMS_OPENED);
  const liveBefore = await page.evaluate<number>(LIVE_TRACKS);
  check(opened > 0 && liveBefore > 0, 'Camera is on while running', `${String(liveBefore)} track`);
  await page.getByRole('button', { name: 'Stop', exact: true }).first().click();
  await page.getByRole('button', { name: 'Start', exact: true }).first().waitFor();
  check((await page.evaluate<number>(LIVE_TRACKS)) === 0, 'Stop releases the camera');

  for (const route of ROUTES) {
    await page.goto(`${baseUrl}${route}`);
    // Any heading level: #study opens with a card, not a page title.
    const heading = page.getByRole('heading').first();
    await heading.waitFor();
    check(true, `${route} renders`, (await heading.textContent()) ?? '');
  }

  // Break-it Lab: runs with no camera, and responds to its controls.
  const streamsBefore = await page.evaluate<number>(STREAMS_OPENED);
  await page.goto(`${baseUrl}#break`);
  await page.getByText(/^A value was shown for \d+ of 50 seconds/).waitFor();
  await page.getByRole('button', { name: 'No pulse at all' }).click();
  await page.getByText(/^This signal has no pulse/).waitFor();
  check(true, 'Break-it Lab reports a run with no pulse');
  const streamsAfter = await page.evaluate<number>(STREAMS_OPENED);
  check(streamsAfter === streamsBefore, 'Break-it Lab asks for no camera');

  check(pageErrors.length === 0, 'No uncaught page errors', pageErrors.join(' | '));
  // Reported, not failed: MediaPipe logs ordinary start-up information as console errors.
  console.log(`      Console errors: ${String(consoleErrors.length)}`);
  for (const message of new Set(consoleErrors)) console.log(`        ${message.slice(0, 160)}`);
} catch (error) {
  check(false, 'Smoke test ran to the end', error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
  server.httpServer.close();
}

console.log('');
console.log(failures.length === 0 ? 'Smoke test passed.' : `FAILED: ${failures.join('; ')}`);
process.exit(failures.length === 0 ? 0 : 1);
