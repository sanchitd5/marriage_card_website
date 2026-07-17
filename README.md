# Riya & Sanchit — Wedding Invitation

A heavily animated, mobile-first, static wedding invitation. Regency romance
(Bridgerton) fused with royal Indian palace aesthetics. Plain HTML/CSS/JS,
no build step.

## Events

| Affair | When (IST) | Where | Dress code |
|---|---|---|---|
| Haldi | Thu 11 Dec 2026, 11:00 | Radisson Hotel Chandigarh Zirakpur | Yellow |
| Cocktail & Engagement | Thu 11 Dec 2026, 20:00 | Radisson Hotel Chandigarh Zirakpur | Smart formals |
| Wedding | Fri 12 Dec 2026, 19:00 | De'vansh Resort, Ambala Cantt | Traditional Indian |

## Run locally

```sh
python3 -m http.server 8642
# open http://127.0.0.1:8642
```

Any static server works. Opening index.html via file:// also works, minus the
local-audio HEAD check.

## Structure

- `index.html` — single page, all sections
- `css/styles.css` — design tokens, layout, CSS-keyframe ambience fallback
- `js/main.js` — gate sequence, GSAP scroll scenes, countdown, scratch card,
  ICS generation, gallery, music, particles
- `assets/images/art-*.jpg` — AI-generated artwork (web crops)
- `assets/images/gen/` — raw generations (kept out of git; regenerate with
  Gemini `gemini-3-pro-image`, see PROMPT.md)
- `assets/videos/` — veo-3.1 hero loop and gate drape-reveal
- `assets/photos/` — couple photo gallery
- `assets/audio/theme-1..5.mp3` — background music pool ("Inaam",
  "Sunehra (Acoustic)", "Dori", "Taaj", "Laavan"); one is picked at
  random each visit. Note: the couple handles music licensing.

## Editing key values

- Countdown target: `WEDDING_TS` at the top of `js/main.js`
- Music pool: `SONGS` in `js/main.js` (file names under `assets/audio/`)
- Event times, links and ICS text: `EVENTS` in `js/main.js` (UTC timestamps)

## Deploy: Netlify + Route53 domain

1. Push this repo to GitHub and "Import from Git" in Netlify (or
   `netlify deploy --prod --dir .`). `netlify.toml` sets publish root and
   cache headers; there is no build command.
2. In Netlify: Domain settings → Add custom domain → enter the
   Route53-purchased domain (placeholder: `riyaandsanchit.example`).
3. Netlify shows 4 nameservers. In AWS Route53 → Registered domains →
   your domain → Actions → Edit name servers → paste Netlify's 4 NS hosts.
   (Delegating the whole domain to Netlify DNS; no Route53 hosted-zone
   records needed.)
4. Wait for propagation (minutes to a few hours). Netlify provisions
   HTTPS via Let's Encrypt automatically.

## Accessibility & performance

- `prefers-reduced-motion`: static poster, no autoplay video, no particles,
  all content visible without animation.
- CSS-keyframe petals/fireflies run even with JavaScript disabled.
- Gallery photos lazy-load; hero video loads only after the gate opens.
