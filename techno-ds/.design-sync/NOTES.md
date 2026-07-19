# techno-ds — design-sync notes

- **Origin.** This package was authored FROM the vanilla techno skin of the wedding
  invite (`../css/techno.css`, `../src/index.techno.template.html`, `../js/app/*`).
  It is a fresh React reimplementation of that design language, not a pre-existing
  library. The wedding site itself is NOT a component library.
- **Build.** `npm run build` = `tsup` (ESM `dist/index.js` + CJS `dist/index.cjs` +
  `dist/index.d.ts`) then `copy-assets.mjs` copies `src/styles.css` -> `dist/styles.css`
  and `src/fonts/` -> `dist/fonts/`. ESM entry for design-sync is `dist/index.js`.
- **CSS.** All component styles live in one stylesheet (`dist/styles.css`), classes
  prefixed `tds-`, tokens on `:root` as `--tds-*`. Self-contained (no full-viewport
  `min-height:100svh` assumptions) so cards render well in grid cells. cssEntry =
  `dist/styles.css`; `@font-face` url()s resolve to `dist/fonts/*.woff2`.
- **Fonts.** Space Grotesk (400-700), Space Mono (400/700/italic), Noto Serif
  Devanagari 500 — vendored woff2 copied from `../assets/fonts/`. OFL 1.1.
- **globalName** `TechnoDS` — components resolve at `window.TechnoDS.*`.

## Re-sync risks
- If the source techno skin changes (`../css/techno.css`), this library does NOT
  auto-update — it is a hand-authored mirror. Re-port intentionally.
- Fonts are copies; if the vendored woff2 in `../assets/fonts/` are re-subset,
  re-copy into `src/fonts/`.
