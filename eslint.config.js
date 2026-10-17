import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Pure logic folders: no DOM, no React, no app/ui imports (PROJECT_SPEC Section 3).
const PURE_DIRS = ['src/dsp/**', 'src/blink/**', 'src/rppg/**'];

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'public/wasm', 'public/models']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  {
    files: PURE_DIRS,
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'Pure logic must not import React.',
            },
            {
              group: ['**/ui/**', '**/app/**', '**/capture/**', '**/vision/**'],
              message: 'Pure logic must not import from ui/app/capture/vision.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.{js,ts}', 'tools/**', 'test/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
]);
