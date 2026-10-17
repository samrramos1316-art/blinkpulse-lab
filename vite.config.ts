/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { CSP_DIRECTIVES, buildCsp } from './csp.ts';

/**
 * Injects the CSP <meta> tag into the production build only.
 * The dev server needs inline scripts and a websocket for hot reload, which a strict
 * policy would block; `npm run build && npm run preview` serves the real policy.
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
  build: {
    // Inline assets would become data: URLs, which the CSP does not allow.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
  },
});
