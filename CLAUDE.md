# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A heavily animated, mobile-first wedding invitation (Sanchit & Riya, 11–12 Dec 2026). Plain HTML/CSS/JS, **zero runtime dependencies**, with a tiny Node build step. Aesthetic: Regency/Bridgerton × royal Indian palace.

## Commands

```sh
node build.js                        # build → dist/ (groom-first, default)
FROM_GROOM_SIDE=false node build.js  # bride-first build (or: npm run build:bride)
npm test                             # node --test "test/**/*.test.mjs" (build-helper unit tests)
node --test test/build.test.mjs      # run a single test file
python3 -m http.server -d dist 8642  # serve locally after a build → http://127.0.0.1:8642
```

Node ≥ 18 required (`fs.cpSync`); pinned to Node 24 via `.nvmrc` (Netlify reads it). Never run `npm install` — there are no deps.

## Architecture

**Build is a name-orientation flipper, not a bundler.** `build.js` reads the `FROM_GROOM_SIDE` env var (default `true`), composes name tokens from `site.config.mjs`, renders tokenised templates in `src/` → `dist/`, and copies `css/ js/ assets/` verbatim. There is no transpilation or minification — the browser loads the ES modules as-is.

Data flow for names/couple identity:

```
site.config.mjs (groom/bride/siteUrls)
      │  FROM_GROOM_SIDE picks A=first side, B=second
      ▼
build.js composeNames() → {firstA, firstB, initialA, sideA, siteUrl, ...}
      ├─ buildHtmlTokens()   → {{TOKENS}} in src/index.template.html → dist/index.html
      ├─ buildManifestTokens → src/manifest.template.webmanifest → dist/manifest.webmanifest
      └─ writes js/app/couple.mjs  (NAMES + auto-discovered SONGS)
```

`js/app/couple.mjs` is **generated and gitignored** — do not edit it. It is written to *both* `dist/js/app/` and the repo-root `js/app/` (so serving from repo root without a build still resolves the import). `config.js` re-exports `NAMES`/`SONGS` from it. Anything name-related that flips per side must flow through `composeNames` → tokens; don't hardcode "Sanchit & Riya".

`FROM_GROOM_SIDE` fans out to: hero names, wax-seal + footer monograms, primary hashtag, meta/OG titles, ICS filenames, family blessings grid, per-side share card image, and the deploy `siteUrl` (each side deploys to its own Netlify domain). Set it in Netlify → Site settings → Environment.

**Pure helpers vs. pipeline.** Everything in `build.js` above `runBuild()` is a pure exported function (tested in `test/build.test.mjs`); the filesystem pipeline runs only when invoked directly (`isMain` guard), so importing the module has no side effects. Note `applyTokens` uses a *function* replacer so literal `$` in values isn't treated as a `$&`/`$1` regex replacement pattern — there's a regression test for this.

**Frontend module wiring.** `js/main.js` is the entry; it imports and calls `js/app/*` init functions in a deliberate order (preserved from the original single-file script — don't reorder casually). Module roles:

- `config.js` — `WEDDING_TS` (countdown target), `MAPS`, `EVENTS` (ICS/calendar), `GALLERY`; re-exports `NAMES`/`SONGS`. **Edit event times/links here.**
- `dom.js` — `$`/`$$` helpers + `REDUCED` (prefers-reduced-motion flag, gates all animation).
- `net.js` — connection-aware video tier: `hd`=1440p (`''`), `md`=1080p (`-md`), `sd`=720p (`-sd`), chosen via Network Information API with a viewport fallback for Safari/Firefox. `boot-loader.js` is a **classic (non-module) script that duplicates this logic** — keep the two in sync.
- `gate.js` → `hero.js` — the entry gate + drape-reveal video, then the hero. **The hero video plays muted in the background behind the still-opaque gate from page load** so the reveal uncovers a warm clip with no decode handoff. Do NOT prefetch/decode the hero during the gate reveal — it starves the reveal decode and lags. Leave that transition as committed.
- `animations.js` (GSAP, loaded from HTML), `celebration.js` (confetti petal-rain), `scratch.js` (scratch-to-reveal card), `ui.js` (countdown, calendar/ICS, petals, theme day/night, tilt, music toggle + crossfade automix, fullscreen), `gallery.js`, `state.js` (shared `appState`).

Reduced-motion is a first-class path: static poster, no autoplay/particles, all content visible; CSS-keyframe ambience runs even with JS disabled.

## Asset generation (offline, not part of the site build)

These regenerate binary assets and require external tools/keys — run manually, they are not wired into `node build.js`:

- `gen-wide-assets.js` — `GEMINI_API_KEY=<key> node gen-wide-assets.js`; landscape gate images + video via `gemini-3-pro-image` / veo. Prompts live in `PROMPT.md`.
- `gen-share-cards.mjs` — `node gen-share-cards.mjs`; renders the two 1200×630 OG share cards with headless Playwright chromium (fonts match the live site), downscaled via ffmpeg to ~280KB. Needs Playwright + ffmpeg installed; paths are overridable via `PLAYWRIGHT_PATH`/`CHROME_PATH` env vars.

Raw generations live in `assets/images/gen/` (gitignored); web crops are the committed `assets/images/art-*.jpg`. The build excludes any `gen/` path and the gitignored `couple_images/`/`inspiration/` source drops, keeping `dist/` lean (~44 MB).

## Deploy

Netlify: `command = "node build.js"`, `publish = "dist"` (see `netlify.toml`, which also sets immutable caching on `/assets/*` and no-cache on HTML). Domain is delegated to Netlify DNS via Route53 nameservers. See README for the step-by-step.
