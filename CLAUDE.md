# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A heavily animated, mobile-first wedding invitation (Sanchit & Riya). Plain HTML/CSS/JS, **zero runtime dependencies**, with a tiny Node build step. Aesthetic: Regency/Bridgerton × royal Indian palace. (Wedding dates/venues are gated behind `revealDate` — see below — so keep them out of docs too.)

> **Rule: research best practice before implementing.** For any non-trivial change — layout/UX conventions, wedding-card etiquette (ordering, wording, placement), a library/API choice, an animation or accessibility pattern — **spawn a subagent to research current best practice first** (`Agent` → `general-purpose`, a handful of web searches), then implement to the findings rather than guessing. These are rarely free choices. Cite what the research concluded in the commit/PR or a code comment when it drives a decision.
>
> **This applies even when the user asks for a specific change.** A direct request ("remove X", "make it two columns") is not a licence to skip research — first **discuss the change with the researcher subagent** (does it fit convention? what does it break? better alternatives?), then implement informed by that. The user's intent is the goal; the researcher pass is how you reach it well, not a veto.
>
> **Rule: snapshot and verify visuals before calling a UI change done.** After any change that alters how the page *looks*, **render a screenshot and have a subagent judge whether it looks good** — don't trust the diff. Build (`node build.js`), then drive headless Chromium (Playwright is installed; reuse the launch pattern in `gen-share-cards.mjs` — `chromium` is on `pw.default`, `CHROME_PATH`/`PLAYWRIGHT_PATH` overridable) to open `dist/index.html` with `reducedMotion: 'reduce'`, strip the entry gate + unlock scroll + force `.fade-up` visible via `page.evaluate`, then element-screenshot the target section. Read the PNG yourself, then hand it to a review subagent (give it the file path; it Reads the image). **The review subagent's job is adversarial: research the relevant convention/best practice, then criticize — point out mistakes, gaps, and what's missing. It must not praise or pad; only surface problems and concrete fixes.** Score + ranked fixes. Iterate until it reads as luxury, not template. Keep before/after PNGs for comparison.

## Commands

```sh
node build.js                        # build → dist/ (groom-first, default Regency skin)
FROM_GROOM_SIDE=false node build.js  # bride-first build (or: npm run build:bride)
WEDDING_THEME=techno node build.js   # friends-facing techno skin (see docs/techno-variant.md)
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
      └─ writes js/app/couple.mjs  (NAMES + SONGS + gated date/venue exports)
```

`js/app/couple.mjs` is **generated and gitignored** — do not edit it. It is written to *both* `dist/js/app/` and the repo-root `js/app/` (so serving from repo root without a build still resolves the import). `config.js` re-exports `NAMES`/`SONGS` from it. Anything name-related that flips per side must flow through `composeNames` → tokens; don't hardcode "Sanchit & Riya".

`FROM_GROOM_SIDE` fans out to: hero names, wax-seal + footer monograms, primary hashtag, meta/OG titles, ICS filenames, family blessings grid, per-side share card image, and the deploy `siteUrl` (each side deploys to its own Netlify domain). Set it in Netlify → Site settings → Environment.

**Family blessings quotation (`families`).** The "With the blessings of our elders" section weaves the **family surnames into one declarative union line** (not a list): _"The Dang, Bhalla, Arora & Batra families and the Verma family, united in love."_ (No numeral and no "houses" — the FROM side can name many surnames, so a "two houses become one" count would contradict the visible list; "united in love" is count-safe for 1..n.) Each side (`groom`/`bride` in `site.config.mjs`) has a `families` array; each entry is a plain surname string **or** `{ name, relation }` (relation unused in prose) **or** `{ tbd: true }` (a not-yet-confirmed placeholder — **skipped** in the prose). `composeNames` maps them to `sideA`/`sideB`; `buildFamilyBlessing(sideA, sideB)` emits the `FAMILY_BLESSING_NAMES` token via `joinFamilies`:

- **FROM side lists ALL its surnames; the other side lists only its primary (first) surname** — groom-first ⇒ all groom families + bride's surname only; bride-first reverses.
- **1..n join, en-GB ampersand grammar (no Oxford comma):** 1 → "the Dang family" (singular); n → "the Dang, Bhalla, Arora & Batra families" (plural). Surnames wrapped in `<span class="fq-fam">` so they render **upright inside the italic quote**.
- **Deliberate punctuation mix:** `&` WITHIN a side, spelled "and" BETWEEN the two sides — disambiguates which names belong to which house. Do not "fix" it to match.
- **Side-agnostic prose** (no "groom's/bride's" role words) so it flips for free and never foregrounds the 4-vs-1 count asymmetry.
- **Fallback** when a side resolves to zero names: _"Two families, united in love."_
- Surnames are lifted by real **600 weight** (added to the Cormorant font load), not italics; each article is nbsp-bound to its surname group so "the" never strands at a line end. The closing line is _"Your presence is the only gift we seek"_ (deliberately not "blessings", to avoid duplicating the kicker).

Order within a side still follows convention: **own/host family first, then extended families by elder seniority** (maternal grandparents' side before aunts'; elder Bua before younger). One gold `❖` crowns the quote; the section deliberately has **no frame/labels** (they reintroduced the count asymmetry the prose hides). `joinFamilies`/`buildFamilyBlessing` are pure and unit-tested. _(History: this replaced an earlier labelled 2-column cartouche after client feedback that the ALL-CAPS surname list read "heavy"; the quotation direction was the client's call, validated via the researcher pass.)_

> **Research step — do this before changing family placement.** Wedding-card family/elder placement is convention-bound (ordering by seniority, patriline-first, list vs. woven prose, placeholder-vs-omit, blessing phrasing). These are *not* free design choices. **Before editing the blessings quotation — surname order, the join grammar, the copy, or which side lists all vs. one — spawn a subagent to research current Indian/Hindu wedding-invitation convention** (`Agent` → `general-purpose`, 4–6 web searches on wording/etiquette guides), then implement to the findings. The current design (order Dang→Bhalla→Arora→Batra, woven union line, FROM-side lists all + other side one surname, count-safe "united in love" register with no numeral) was chosen this way; re-confirm convention rather than guessing when revising.

**Date/venue reveal gate (`revealDate`).** `site.config.mjs` exports `revealDate` (boolean, default `false`), the real `wedding` data (dates, times, venues, map links, hero/scratch strings), and `weddingHidden` placeholders. It is **leak-proof by construction**: real dates/venues live *only* in `site.config.mjs` and are injected at build time — while `false`, nothing date- or venue-identifying appears anywhere in `dist/` (HTML, JS, manifest). This matters because `config.js` is copied **verbatim**, so runtime `? :` gating there would still ship the string literals; instead the date/venue values flow through the generated `couple.mjs`. build.js emits `REVEAL_DATE`, `WEDDING_TS` (`null` when hidden), `EVENT_DATES` and `EVENT_VENUES` into `couple.mjs`; `config.js` composes `EVENTS` from those (only non-identifying `BLURB`/dress-code copy is inline). buildHtmlTokens gates the HTML tokens (`HERO_LINE`, `TITLE_DATE`, `MONTH_YEAR`, `META_LOCATION`, `DATE_RANGE`, `SCRATCH_DATE/SUB`, `EVENT_*_WHEN/DT/VENUE/MAP`, plus `REVEAL_ONLY`/`SECRET_ONLY` attribute switches). When hidden: the hero shows a suspense quote (no date, no cities), the countdown **shimmers non-alphanumeric glyphs once a second** (suspense, never a real target → no leak), the scratch card reveals "Coming soon", event venues read "Venue to be announced", and directions/calendar buttons are hidden. Flip to `true` to publish. Keep README + `docs/banner.svg` date-free too.

**Couple-photo reveal gate (`COUPLE_REVEAL_TS`, runtime, no redeploy).** The couple's gallery photos stay veiled until `coupleRevealOffsetHours` (default 5) **after** `wedding.weddingTsUTC`, then unlock **in the browser** — no rebuild/redeploy needed. build.js `computeCoupleRevealTs(wedding.weddingTsUTC)` emits `COUPLE_REVEAL_TS` (epoch-ms `= Date.UTC(...weddingTsUTC) + 5h`; `0` = reveal now, `null` = stay hidden) into `couple.mjs`; `config.js` re-exports it alongside the full `GALLERY` (`gallery` source-of-truth lives in `site.config.mjs`). At runtime `gallery.js` shows a veiled "unveiled after the celebration" panel, then `js/app/time.js` `fetchTrustedNowMs()` reads **authoritative server time — the same-origin CDN `Date` response header, NOT the visitor's device clock** (so the reveal can't be forced early by changing local time; CORS time APIs are a fallback, `null`/unreachable → stays veiled). When `now >= COUPLE_REVEAL_TS` it swaps in the masonry (revealed directly, since it runs after the `ScrollTrigger.batch('.fade-up')` snapshot). **Trade-off (chosen for no-redeploy):** unlike `revealDate`, this is *not* leak-proof — the photos ship in `dist` (reachable by direct URL) and `COUPLE_REVEAL_TS` (≈ the wedding date) is in the page source. The painted portrait `art-couple.jpg` is not gated. Force with `REVEAL_COUPLE=true|false node build.js`. Pure helper `computeCoupleRevealTs` is unit-tested.

**Pure helpers vs. pipeline.** Everything in `build.js` above `runBuild()` is a pure exported function (tested in `test/build.test.mjs`); the filesystem pipeline runs only when invoked directly (`isMain` guard), so importing the module has no side effects. Note `applyTokens` uses a *function* replacer so literal `$` in values isn't treated as a `$&`/`$1` regex replacement pattern — there's a regression test for this.

**Frontend module wiring.** `js/main.js` is the entry; it imports and calls `js/app/*` init functions in a deliberate order (preserved from the original single-file script — don't reorder casually). Module roles:

- `config.js` — composes `EVENTS` (ICS/calendar) from the generated `couple.mjs` gated exports (`WEDDING_TS`/`EVENT_DATES`/`EVENT_VENUES`) plus inline non-identifying `BLURB`; holds `GALLERY`; re-exports `NAMES`/`SONGS`/`WEDDING_TS`/`REVEAL_DATE`. **Dates/venues are edited in `site.config.mjs` (`wedding`), not here** — only blurb/dress-code copy is local.
- `dom.js` — `$`/`$$` helpers + `REDUCED` (prefers-reduced-motion flag, gates all animation).
- `net.js` — connection-aware video tier: `hd`=1440p (`''`), `md`=1080p (`-md`), `sd`=720p (`-sd`), chosen via Network Information API with a viewport fallback for Safari/Firefox. `boot-loader.js` is a **classic (non-module) script that duplicates this logic** — keep the two in sync.
- `gate.js` → `hero.js` — the entry gate + drape-reveal video, then the hero. **The hero video plays muted in the background behind the still-opaque gate from page load** so the reveal uncovers a warm clip with no decode handoff. Do NOT prefetch/decode the hero during the gate reveal — it starves the reveal decode and lags. Leave that transition as committed. **Scroll is locked (`body overflow:hidden`) from page load until the gate is fully faded out and removed** (unblocked in `finish()`'s completion, not at its start), so the reveal can't be scrolled past mid-play.
- `animations.js` (GSAP, loaded from HTML), `celebration.js` (confetti petal-rain), `scratch.js` (scratch-to-reveal card), `ui.js` (countdown, calendar/ICS, petals, theme day/night, tilt, music toggle + crossfade automix, fullscreen), `gallery.js`, `state.js` (shared `appState`). `initCountdown` runs the true live countdown when `WEDDING_TS` is set, else a per-second non-alphanumeric shimmer for suspense.

Every `.band` section and the footer are `min-height: 100svh` (flex-centred) at **all** viewports (`css/styles.css`) — each act fills the window; hero is already full-height.

Reduced-motion is a first-class path: static poster, no autoplay/particles, all content visible; CSS-keyframe ambience runs even with JS disabled.

## Asset generation (offline, not part of the site build)

These regenerate binary assets and require external tools/keys — run manually, they are not wired into `node build.js`:

- `gen-wide-assets.js` — `GEMINI_API_KEY=<key> node gen-wide-assets.js`; landscape gate images + video via `gemini-3-pro-image` / veo. Prompts live in `PROMPT.md`.
- `gen-share-cards.mjs` — `node gen-share-cards.mjs`; renders the two 1200×630 OG share cards with headless Playwright chromium (fonts match the live site), downscaled via ffmpeg to ~280KB. Needs Playwright + ffmpeg installed; paths are overridable via `PLAYWRIGHT_PATH`/`CHROME_PATH` env vars.

Raw generations live in `assets/images/gen/` (gitignored); web crops are the committed `assets/images/art-*.jpg`. The build excludes any `gen/` path and the gitignored `couple_images/`/`inspiration/` source drops, keeping `dist/` lean (~44 MB).

## Deploy

Netlify: `command = "node build.js"`, `publish = "dist"` (see `netlify.toml`, which also sets immutable caching on `/assets/*` and no-cache on HTML). Domain is delegated to Netlify DNS via Route53 nameservers. See README for the step-by-step.
