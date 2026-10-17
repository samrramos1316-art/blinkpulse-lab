# Phase notes

## Phase 0: Scaffold and tooling (2026-10-16)

**Verified**

- `npm run check` (typecheck, ESLint, Prettier check, Vitest) passes: 6 test files, 57 tests.
- Clean-clone simulation: the files git would track were copied to an empty folder, then
  `npm ci && npm run check` passed. (Not a real `git clone`: nothing is committed yet.)
- Pure-logic guard: a probe file in `src/dsp/` using `document` failed `tsc`, and importing
  `react` there failed ESLint. Probe removed.
- `npm run build` injects the CSP `<meta>` first in `<head>`; no `'unsafe-inline'`, no external
  hosts. Tested by `test/csp.test.ts` and by reading `dist/index.html`.
- In Chrome (production preview on localhost): page renders, CSP meta present, no console
  errors or CSP violations, only the app's own JS and CSS loaded, no horizontal scroll at the
  window width tested, dark theme applied from the system setting.
- Every text/background token pair meets WCAG AA in light and dark themes (`test/tokens.test.ts`).
- No raw hex colours outside `tokens.css`; fatigue/drowsiness wording only in `src/ui/strings.ts`
  (`test/designRules.test.ts`).

**Not verified**

- Visual appearance: browser screenshots timed out, so the look was not reviewed by eye.
- Light theme, manual theme toggle, keyboard-only use, and the 360 px / 768 px layouts were not
  tested in a browser.
- Reduced-motion behaviour was not tested in a browser (tokens set durations to 0 ms).
- Non-Chrome browsers.

**Deviations and decisions**

- TypeScript pinned to 6.0.3, not the latest 7.0.2: typescript-eslint 8.71.2 supports only
  TypeScript < 6.1. The official Vite template also pins TypeScript ~6.0.
- The CSP is injected only in production builds; the dev server needs inline scripts for hot
  reload. Documented in `docs/ETHICS_AND_PRIVACY.md`.
- Added `tsconfig.pure.json` (no DOM lib) for `src/dsp`, `src/blink`, `src/rppg`, plus an ESLint
  import restriction, to enforce the "pure logic" rule automatically.
- Added `src/{dsp,blink,rppg}/index.ts` placeholders because `tsc` rejects a project with no files.
- `npm run lint` also runs `prettier --check`.
- The Start button is shown disabled (with a screen-reader note) so the layout is final.
- Disclaimer: the Section 1.3 wording "has been evaluated only in small studies" was replaced by
  "has not yet been validated" until V3 is reported (approved by the author; note added to
  `PROJECT_SPEC.md` 1.3).
