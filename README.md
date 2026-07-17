# Riya & Sanchit — Wedding Invitation

A heavily animated, mobile-first, static wedding invitation. Regency romance
(Bridgerton) fused with royal Indian palace aesthetics. Plain HTML/CSS/JS with
a tiny Node build step that flips name orientation.

## Events

| Affair | When (IST) | Where | Dress code |
|---|---|---|---|
| Haldi | Thu 11 Dec 2026, 11:00 | Radisson Hotel Chandigarh Zirakpur | Yellow |
| Cocktail & Engagement | Thu 11 Dec 2026, 20:00 | Radisson Hotel Chandigarh Zirakpur | Smart formals |
| Wedding | Fri 12 Dec 2026, 19:00 | De'vansh Resort, Ambala Cantt | Traditional Indian |

## Build

Requires Node ≥ 18 (for `fs.cpSync`). No npm install needed — the build has
zero dependencies.

```sh
node build.js                       # groom-first (default) → dist/
FROM_GROOM_SIDE=false node build.js # bride-first → dist/
```

`FROM_GROOM_SIDE` (default `true`) flips which side of the couple appears first
everywhere on the page: hero names, footer monogram, primary hashtag, meta
titles, ICS filenames, and the family blessings grid. Set the env var in
Netlify (Site settings → Environment) to override on deploy.

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
- `build.js` — renders templates in `src/` → `dist/`, copies static trees,
  emits `js/app/couple.mjs`
- `src/index.template.html` — tokenised HTML (`{{FIRST_A}}`, `{{PAIR_TITLE}}`,
  `{{FAMILY_SIDE_A}}` …)
- `src/manifest.template.webmanifest` — tokenised PWA manifest
- `css/styles.css` — design tokens, layout, CSS-keyframe ambience fallback
- `js/main.js` — entry; loads `js/app/*` modules
- `js/app/config.js` — `WEDDING_TS`, `SONGS`, `MAPS`, `EVENTS`; re-exports
  `NAMES` from generated `couple.mjs`
- `js/app/couple.mjs` — **generated** by `build.js`; gitignored
- `assets/images/art-*.jpg` — AI-generated artwork (web crops)
- `assets/images/gen/` — raw generations (kept out of git; regenerate with
  Gemini `gemini-3-pro-image`, see PROMPT.md)
- `assets/videos/` — veo-3.1 hero loop and gate drape-reveal
- `assets/photos/` — couple photo gallery
- `assets/audio/theme-1..5.mp3` — background music pool ("Inaam",
  "Sunehra (Acoustic)", "Dori", "Taaj", "A Thousand Years" violin cover);
  one is picked at random each visit. Note: the couple handles music
  licensing.

## Editing key values

- Names, hashtags, parents, grand-parents: `site.config.mjs`
- Countdown target: `WEDDING_TS` at the top of `js/app/config.js`
- Music pool: `SONGS` in `js/app/config.js`
- Event times, links and ICS text: `EVENTS` in `js/app/config.js` (UTC
  timestamps; titles are composed from `NAMES.pairTitle`)

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
  all content visible without animation.
- CSS-keyframe petals/fireflies run even with JavaScript disabled.
- Gallery photos lazy-load; hero video loads only after the gate opens.
