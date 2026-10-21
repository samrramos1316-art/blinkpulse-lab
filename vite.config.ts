/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { CSP_DIRECTIVES, DEV_CSP_DIRECTIVES, buildCsp } from './csp.ts';

/**
 * Injects the CSP <meta> tag into the production build only. The dev server sends
 * a slightly relaxed policy as a header instead (see DEV_CSP_DIRECTIVES): hot
 * reload needs inline scripts, but connections still go to the app's origin only.
 */
function cspMetaTag(): Plugin {
  return {
    name: 'blinkpulse-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(CSP_DIRECTIVES) },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

/**
 * `npm run dev:phone` (mode "phone"): listen on the LAN over https with the
 * self-signed certificate from tools/make-dev-cert.mjs, so a phone on the same
 * Wi-Fi can use its camera (camera access needs a secure context).
 */
function phoneHttps(mode: string) {
  if (mode !== 'phone') return {};
  const key = '.cert/dev-key.pem';
  const cert = '.cert/dev-cert.pem';
  if (!existsSync(key) || !existsSync(cert)) {
    throw new Error('Missing .cert/: run `node tools/make-dev-cert.mjs` (dev:phone does this).');
  }
  // Fixed port: the address printed by make-dev-cert.mjs must match.
  return {
    host: true,
    port: 5173,
    strictPort: true,
    https: { key: readFileSync(key), cert: readFileSync(cert) },
  };
}

/** Commit the app is built from, for study exports; "unknown" outside a git checkout. */
function gitCommit(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== '';
    return dirty ? `${hash}-modified` : hash;
  } catch {
    return 'unknown';
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), cspMetaTag()],
  define: { __APP_COMMIT__: JSON.stringify(gitCommit()) },
  server: {
    headers: { 'Content-Security-Policy': buildCsp(DEV_CSP_DIRECTIVES) },
    ...phoneHttps(mode),
  },
  build: {
    // Inline assets would become data: URLs, which the CSP does not allow.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
  },
}));
