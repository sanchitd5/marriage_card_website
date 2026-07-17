<div align="center">

<img src="docs/banner.svg" alt="Sanchit & Riya — Shubh Vivah · 11 & 12 December 2026" width="840">

<p><em>A heavily animated, mobile-first wedding invitation —<br>
Regency romance (Bridgerton) fused with royal Indian palace splendour.</em></p>

<p>
  <img alt="Node ≥ 18" src="https://img.shields.io/badge/node-%E2%89%A518-c9a24b?style=flat-square&logo=node.js&logoColor=white">
  <img alt="Dependencies: zero" src="https://img.shields.io/badge/dependencies-zero-b9a7d6?style=flat-square">
  <img alt="Tests: 18 passing" src="https://img.shields.io/badge/tests-18%20passing-8a6a3a?style=flat-square">
  <img alt="Deploy: Netlify" src="https://img.shields.io/badge/deploy-Netlify-e8912e?style=flat-square&logo=netlify&logoColor=white">
</p>

<img src="docs/divider.svg" alt="" width="520">

</div>

Plain HTML/CSS/JS with a tiny zero-dependency Node build step that flips name
orientation (`FROM_GROOM_SIDE`). The published site is regenerated into `dist/`
from tokenised templates in `src/`.

## The Celebrations

| Affair | When (IST) | Where | Dress code |
|---|---|---|---|
| Haldi | Fri 11 Dec 2026, 11:00 | Radisson Hotel Chandigarh Zirakpur | Shades of yellow |
| Cocktail & Engagement | Fri 11 Dec 2026, 20:00 | Radisson Hotel Chandigarh Zirakpur | Dazzling as you dare |
| The Wedding | Sat 12 Dec 2026, 19:00 | De'vansh Resort, Ambala Cantt | — |

## Build

Requires Node ≥ 18 (for `fs.cpSync`); pinned to Node 24 via `.nvmrc` (Netlify
reads it). No `npm install` needed — the build has **zero dependencies**.

```sh
node build.js                       # groom-first (default) → dist/
FROM_GROOM_SIDE=false node build.js # bride-first → dist/
# or: npm run build  /  npm run build:bride
```

`FROM_GROOM_SIDE` (default `true`) flips which side of the couple appears first
everywhere on the page: hero names, the wax-seal and footer monograms, primary
hashtag, meta titles, ICS filenames, and the family blessings grid. Set the env
var in Netlify (Site settings → Environment) to override on deploy.

The build copies only `css/`, `js/`, `assets/` into `dist/` and skips the
gitignored source drops (`couple_images/`, `inspiration/`, `assets/images/gen/`),
so the published bundle stays lean (~44 MB).

## Test

Unit tests for the build helpers — name/flag composition, HTML escaping, token
substitution (incl. the literal-`$` regression), and template integrity
(monograms tokenised, no leftover `{{TOKENS}}`, no placeholder grand-parents).
Zero deps — Node's built-in runner.

```sh
npm test   # node --test "test/**/*.test.mjs"
```

## Run locally

```sh
node build.js
python3 -m http.server -d dist 8642
# open http://127.0.0.1:8642
```

Any static server pointed at `dist/` works.

## Structure

- `site.config.mjs` — single source of truth for couple names, hashtags,
  parents, grand-parents
- `build.js` — pure helpers (exported for tests) + a filesystem pipeline that
  renders `src/` templates → `dist/`, copies static trees, and emits
  `js/app/couple.mjs`
- `src/index.template.html` — tokenised HTML (`{{FIRST_A}}`, `{{PAIR_TITLE}}`,
  `{{INITIAL_A}}`, `{{FAMILY_SIDE_A}}` …)
- `src/manifest.template.webmanifest` — tokenised PWA manifest
- `test/build.test.mjs` — unit tests (`node --test`)
- `css/styles.css` — design tokens, layout, CSS-keyframe ambience fallback
- `js/main.js` — entry; loads `js/app/*` modules
- `js/app/config.js` — `WEDDING_TS`, `SONGS`, `MAPS`, `EVENTS`; re-exports
  `NAMES` from generated `couple.mjs`
- `js/app/couple.mjs` — **generated** by `build.js`; gitignored
- `assets/images/art-*.jpg` — AI-generated artwork (web crops)
- `assets/images/gen/` — raw generations (kept out of git; regenerate with
  Gemini `gemini-3-pro-image`, see `PROMPT.md`)
- `assets/videos/` — veo-3.1 hero loop and gate drape-reveal
- `assets/photos/` — couple photo gallery
- `assets/audio/theme-1..5.mp3` — background music pool ("Inaam",
  "Sunehra (Acoustic)", "Dori", "Taaj", "A Thousand Years" violin cover);
  one is picked at random each visit. Note: the couple handles music licensing.
- `docs/` — animated SVGs for this README (not shipped to `dist/`)
- `.nvmrc`, `package.json`, `netlify.toml` — toolchain & deploy config

## Editing key values

- Names, hashtags, parents, grand-parents: `site.config.mjs`
- Countdown target: `WEDDING_TS` at the top of `js/app/config.js`
- Music pool: `SONGS` in `js/app/config.js`
- Event times, links and ICS text: `EVENTS` in `js/app/config.js` (UTC
  timestamps; titles are composed from `NAMES.pairTitle`)

<div align="center"><img src="docs/divider.svg" alt="" width="420"></div>

## Deploy: Netlify + Route53 domain

1. Push this repo to GitHub and "Import from Git" in Netlify (or
   `netlify deploy --prod --dir dist`). `netlify.toml` sets
   `command = "node build.js"` and `publish = "dist"`.
2. Set `FROM_GROOM_SIDE` in Netlify → Site settings → Environment (default
   is `true` if unset).
3. In Netlify: Domain settings → Add custom domain → enter the
   Route53-purchased domain (placeholder: `riyaandsanchit.example`).
4. Netlify shows 4 nameservers. In AWS Route53 → Registered domains →
   your domain → Actions → Edit name servers → paste Netlify's 4 NS hosts.
   (Delegating the whole domain to Netlify DNS; no Route53 hosted-zone
   records needed.)
5. Wait for propagation (minutes to a few hours). Netlify provisions
   HTTPS via Let's Encrypt automatically.

## Accessibility & performance

- `prefers-reduced-motion`: static poster, no autoplay video, no particles,
  all content visible without animation. (The README SVGs honour it too.)
- CSS-keyframe petals/fireflies run even with JavaScript disabled.
- Gallery photos lazy-load; hero video loads only after the gate opens.
