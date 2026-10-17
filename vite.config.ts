/// <reference types="vitest/config" />
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspMetaTag()],
  server: {
    headers: { 'Content-Security-Policy': buildCsp(DEV_CSP_DIRECTIVES) },
  },
  build: {
    // Inline assets would become data: URLs, which the CSP does not allow.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
  },
});
