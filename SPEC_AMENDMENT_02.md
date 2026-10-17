# SPEC_AMENDMENT_02: Visual design and ease of use

Applies to: `PROJECT_SPEC.md` (Sections 2, 5.5, 11), `CLAUDE.md`. Where this file conflicts with them, this file wins, **except** that it never overrides a product, privacy, wording, or accessibility rule in `PROJECT_SPEC.md`, `SPEC_AMENDMENT_01.md`, or `CLAUDE.md`. If a design choice conflicts with one of those rules, the rule wins and the design changes.

Author goal: **the app should be visually attractive and easy to use.**

Chosen direction: **Calm minimal.** Soft neutral surfaces, one accent colour, generous whitespace, rounded cards, clear type. Calm by default, which also fits the rule that the fatigue/drowsiness indicator must never look like an alarm.

---

## Part 1. Constraints this design must respect (from existing rules)

- **No network after load:** fonts and icons are bundled. No Google Fonts, icon CDNs, or third-party CSS.
- **No charting libraries:** all plots are hand-drawn on `<canvas>`, so plot styling is part of this design.
- **WCAG AA contrast, visible focus, keyboard operable, never colour alone, respect `prefers-reduced-motion`.**
- **React state <= 4 Hz:** animations run on canvas/CSS, not by re-rendering React per frame.
- **Indicator must look calm:** no red/alarm styling, flashing, shaking, sounds, or pop-ups for the fatigue/drowsiness indicator. Bands are distinguished by text and position, not colour.
- **Mirror the preview only (CSS)**, never the data.

---

## Part 2. Design system (add as Section 5.5.1)

### Tokens (`src/ui/theme/tokens.css`)
All colours, spacing, radii, shadows, font sizes, and durations are CSS custom properties defined once on `:root`, with a dark set under `@media (prefers-color-scheme: dark)` and a manual override via `data-theme="light|dark"`. Components never use raw hex values. Canvas plots read the same tokens via `getComputedStyle` (re-read on theme change).

- **Palette:** neutral surface scale (background, surface, raised surface, border, muted text, text), one accent colour, and semantic colours for quality only (Good / Fair / Poor). Every text/background pair used is checked for AA contrast in a unit test (`tokens.test.ts` computes contrast ratios from the token values).
- **Quality colours are never the only signal:** chips always include the word ("Quality: Good") and an icon shape.
- **Indicator band colours:** a single neutral-to-accent scale, no red. Band text is always shown.
- **Spacing:** 4 px base scale. **Radii:** small (inputs, chips) and large (cards). **Shadows:** one or two soft elevations.
- **Type:** system UI font stack by default. Optionally one self-hosted variable font (open licence, file in `public/fonts/`, licence recorded in `docs/`). Tabular figures (`font-variant-numeric: tabular-nums`) for all live numbers so they do not jitter.
- **Icons:** small hand-written inline SVG set in `src/ui/icons/`, no icon library.

### Motion
- Durations and easing are tokens. Number changes ease over ~300 ms; card and panel transitions ~200 ms.
- Under `prefers-reduced-motion: reduce`: no transitions, numbers update instantly, plots still update (they are data, not decoration).
- No motion is used to draw attention to the fatigue/drowsiness indicator.

### Plot styling (canvas)
- Device-pixel-ratio aware (crisp on high-DPI screens), antialiased lines, rounded line joins.
- Light grid in border colour, axis labels in muted text, the main trace in accent colour, optional soft gradient fill under the pulse waveform.
- Thresholds and detected peaks are marked with both colour and a distinct shape/dash.
- Each plot has a text alternative (already required by 5.5).

---

## Part 3. Ease of use (add as Section 5.5.2)

### First-run flow
A short guided setup, skippable and re-openable from Settings:
1. What the app does + the privacy statement ("Processing on this device. Nothing is uploaded.").
2. Allow camera (with a plain explanation before the browser prompt).
3. Positioning guide: a face-outline overlay on the preview with live hints ("Move a little closer", "Face the light", "Hold still").
4. Calibration with a clear progress ring and countdown.
5. Done → main view.

Nothing from the first-run flow is stored except a "setup completed" flag and theme preference in `localStorage` (no biometric data).

### Main view layout (desktop)
- **Header:** app name, privacy badge, one primary Start/Stop button, Calibrate, theme toggle, About.
- **Left:** camera preview (mirrored via CSS) with subtle overlays (eye contours, ROI regions), and a status line under it.
- **Right:** metric cards: Blink rate, Pulse rate + quality chip, Eye-closed fraction, Eye-closure fatigue/drowsiness indicator (experimental). Large number, small label, one-line explanation on hover/focus.
- **Below:** one main plot area with tabs (Blinks / Pulse / Session timeline).
- **Signal Lab** and **Settings** are separate views, so the main view stays simple.

### Mobile / narrow screens
Single column: preview, then cards in a 2-column grid, then plots. No horizontal scrolling at 360 px width.

### Plain-language status
Quality flags are shown as short, friendly sentences with a suggested fix, never internal flag names. Examples: "Face not found. Centre your face in the frame.", "Too dark for a pulse reading. Try facing a window or lamp.", "Too much movement. Hold still for a few seconds."

### Empty and loading states
Every card and plot has a designed "Measuring..." and "Not enough data" state (neutral styling, reason shown), never a blank box or a zero.

---

## Part 4. Phase changes

- **Phase 0:** add the token file, light/dark theme switching, base layout shell, icon folder, and the contrast unit test.
- **Phase 2:** camera permission and positioning steps of the first-run flow.
- **Phase 3:** calibration step of the first-run flow; blink cards and EAR plot use the design system.
- **Phase 4 / 4B:** pulse and indicator cards and plots use the design system; indicator styling reviewed against Part 1.
- **Phase 5:** full visual polish pass, responsive check, and screenshots for the README.

## Part 5. Additions to the Definition of Done (Section 11)

- [ ] All colours come from tokens; grep finds no raw hex colours outside `tokens.css`.
- [ ] Contrast test passes for every text/background token pair, in both themes.
- [ ] App works and looks correct in light and dark mode, and at 360 px, 768 px, and 1280+ px widths (screenshots in `docs/`).
- [ ] Full first-run flow and main controls are usable with keyboard only.
- [ ] With reduced motion on, no transitions run.
- [ ] Every card and plot has designed "Measuring..." and "Not enough data" states.
- [ ] Fatigue/drowsiness indicator uses no red, no flashing, no motion emphasis, and always shows band text.
- [ ] Network tab shows no font, icon, or style requests to external hosts.
- [ ] A short usability check: at least 2 people who have not seen the app complete first-run setup without help. Record what they struggled with (not a numeric claim, just notes) in `docs/`.
