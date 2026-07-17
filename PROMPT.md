# Build Spec: Riya & Sanchit, Wedding Invitation Website

## Mission
Build a heavily animated, static wedding-invitation website for an Indian
wedding. Mobile is the primary device. The site must deploy free on Netlify
with a Route53-purchased domain. No backend, no build framework required at
runtime: plain HTML/CSS/JS output.

## Design direction (final, non-negotiable)
- **Anchor aesthetic: the Bridgerton TV series** (the bride's favorite) fused
  with royal Indian wedding aesthetics: Regency romance meets Indian palace.
- Regency layer: dusty pastels (wisteria/lavender, powder blue, blush,
  champagne gold), gilded ornate frames, calligraphy script, Lady
  Whistledown-style announcement copy ("Dearest friends and family, it is
  with the greatest pleasure...").
- Copy language: Whistledown English base with tasteful Hindi/Punjabi accents
  ("Shubh Vivah") set in the script font; not fully
  bilingual.
- Indian layer: jharokha arches in place of Regency windows, marigold and
  wisteria garlands together, peacock motif where Bridgerton uses the bee,
  gold filigree and mehndi-flourish borders, baraat/pheras scene art painted
  in Regency-portrait style.
- Generational taste (couple born 1996-97, zillennial): editorial minimalism
  over ornate clutter. Generous whitespace, oversized light-weight serif
  display type, dusty muted palette, subtle paper grain, Instagram-worthy
  set-piece moments, playful micro-interactions. Must NOT read as a default
  template or as heavy traditional decoration.
- Fonts (Google Fonts, proven by the teatro reference): Great Vibes (script),
  Cormorant Garamond light (display), Lora (body). Subset, 2-3 files max.

## Reference material (local, already scraped)
`inspiration/<site>/` contains index.html, JS/CSS bundles, and every asset of
five production wedding-invite templates. `inspiration.md` holds the full
review with exact animation values. Roles:
- `majestic/` structure and section flow
- `bridgerton/` aesthetic base (palette, typography, CSS-keyframe ambience)
- `excellence/` multi-event program blocks, per-event dress code
- `daynight/` English copy tone ("Order of the Day")
- `teatro/` interactions: gate reveal, scratch-card, flicker timing

## Content

### Couple
- Groom: **Sanchit Dang** (parents: Ajay Dang & Geeta Dang)
- Bride: **Riya Verma** (parents: Vishal Verma & Renu Verma)

### Events (IST; times confirmed by the couple)
1. **Haldi** — Thu 11 Dec 2026, 11:00 AM,
   Radisson Hotel Chandigarh Zirakpur,
   map: https://maps.app.goo.gl/fQhBFytYAZKu4qBB7,
   dress code: **yellow** (haldi tones)
2. **Cocktail / Engagement** — Thu 11 Dec 2026, 8:00 PM,
   Radisson Hotel Chandigarh Zirakpur,
   map: https://maps.app.goo.gl/fQhBFytYAZKu4qBB7,
   dress code: **smart formals**
3. **Wedding** — Fri 12 Dec 2026, 7:00 PM,
   De'vansh Resort, Ambala Cantt,
   map: https://maps.app.goo.gl/RdueUZ2XfNiAnbD18,
   dress code: **traditional Indian wedding attire**

### Page sections, in order
1. **Intro gate (hybrid)**: gilded envelope with monogram wax seal; click
   cracks the seal, then royal drapes/toran part (veo-generated video) as the
   hero entrance behind it. The click also starts the music.
2. **Hero**: "**Riya & Sanchit**" (bride first, ampersand pairing; monogram
   R&S everywhere including the wax seal) in script + display serif, date,
   sequenced entrance (0.6 to 1.5s delays), veo background loop.
3. **Countdown** to the wedding (plain 1s setInterval vs UTC target).
   Include a scratch-card date reveal (canvas, destination-out erase over
   gold-foil texture; teatro pattern, touch-first). Should use user's locale timezone
4. **Event cards** (Haldi / Cocktail / Wedding): name, date/time, venue,
   "Get Directions" map link, "Add to Calendar" (client-side ICS generation),
   and per-event dress code guidance.
5. **Photo gallery**: real couple photos. Sources: `couple_images/` in repo
   root (9 pngs, place and art-direct them), plus attempt to download
   additional photos from the shared album
   https://photos.app.goo.gl/He19oT7LU7qamvux7 (fetch page, extract
   lh3.googleusercontent.com URLs, request high-res with the `=w2400`
   suffix). Album access is unverified and may be restricted: if the fetch
   fails or yields no images, build the gallery from `couple_images/` alone
   and flag the failure in the final report. Present in gilded Regency
   frames.
6. **Family**: both sets of parents, elegant type treatment.
7. **Footer**: monogram, ornament, one Whistledown-voice closing line.

### Exclusions (explicit user decisions)
- NO RSVP section or form of any kind.
- NO gifts/registry section.
(Reference templates have both; do not copy them.)

## Tech stack
- Vanilla HTML/CSS/JS. No React/Vite/build step for the shipped site.
- **GSAP (https://gsap.com) is the preferred animation engine for ALL motion
  on the site**: entrances, scroll scenes, gate sequence, particles where
  practical, micro-interactions. Reach for GSAP first; use CSS keyframes only
  as a reduced-motion/no-JS fallback layer.
- GSAP 3.15+ via cdnjs with ScrollTrigger, ScrollSmoother, SplitText, DrawSVG
  (all free since GSAP 3.13). Use heavily: scroll-driven scenes, split-text
  reveals, parallax, pinned sections, timeline-sequenced set pieces.
- tsParticles slim (floating marigold/wisteria petals), canvas-confetti
  (one celebration moment), vanilla-tilt (cards).
- CSS-keyframe ambience fallback under the JS layer (petal fall, firefly
  drift, sparkle, diya flicker `opacity [0,.9,.9,.3,.9,.3,0]` over 5s):
  cheap depth, works with JS disabled.
- Animation system: one fade-up primitive (y:20-30, 0.6-0.8s, 0.08s stagger)
  via a ScrollTrigger batch helper; luxury easing cubic-bezier(.25,1,.5,1)
  at 1.6-1.8s for hero set pieces; clipPath inset unveils for section art.
- Respect `prefers-reduced-motion`: static fallbacks, no autoplaying video.

## Asset generation (Gemini API, key in env var GEMINI_API_KEY)
- Ask user to echo the API Key
- **Images**: try `imagen-4.0-ultra-generate-001` first. If it returns 404
  ("no longer available to new users", known issue on this key), fall back
  AUTOMATICALLY to `gemini-3-pro-image` (`:generateContent`,
  `responseModalities: ["IMAGE"]`, `imageConfig.aspectRatio`) and continue;
  do not stop the build. Models output opaque images: composite/crop into
  backgrounds instead of expecting transparency. Raw generations in
  `assets/images/gen/`, web crops as `assets/images/art-*.jpg` (use `sips`).
- **Image subjects**: couple portrait in sherwani/lehenga painted in
  Regency-portrait style, gilded jharokha-arch frames, wisteria + marigold
  garlands, peacock motif, monogram wax seal, gold filigree/mehndi borders,
  haldi/cocktail/pheras vignettes in dusty pastels, closed/open drape stills
  for the gate.
- **Video (full scope, approved)**: generate with `veo-3.1-generate-preview`:
  (a) hero background loop, (b) gate drape-parting reveal between the
  closed/open stills. Serve as short muted looping mp4 with jpg poster.
- **Audio**: background music candidates (couple's picks):
  1. "Inaam" — Jasleen Royal (https://www.youtube.com/watch?v=-tbgigaf0hM)
  2. "Sunehra (Acoustic)" — Jai Dhir (https://www.youtube.com/watch?v=3IsdDhy8nA8)
  3. "Dori" (https://www.youtube.com/watch?v=pQVNbIIL3Zc)
  4. "Taaj" (https://www.youtube.com/watch?v=IjcE8SxupX8)
  Jai Dhir's wedding-theme songs are an approved pool. Delivery: runtime
  check (HEAD) for local `assets/audio/theme.mp3`; if present use `<audio>`;
  until then STREAM via YouTube IFrame Player API (video `-tbgigaf0hM`,
  fallback `3IsdDhy8nA8`), started by the gate click, controlled by the
  site's music toggle, rendered as a small visible corner mini-player
  (YouTube ToS forbids fully hidden players; ads may play). Muted/paused by
  default until the gate click. The mp3 will be supplied manually; sourcing
  and licensing are handled by the couple, not the build.

## Responsive
Mobile-first; phone is the primary device. Fully fluid across mobile, tablet,
desktop. Test at 390x844, 768x1024, 1440x900.

## Process requirements
- Research design/animation patterns with parallel subagents before building.
- Start a local static server in the background for live preview.
- Validate every section visually with `npx @playwright/cli` in vision mode
  at all three viewports. Gotcha: with ScrollSmoother active,
  `scrollIntoView` breaks ScrollTrigger; scroll inside evaluate via
  `ScrollSmoother.get().scrollTo(selector, false)`.

## Deploy
Netlify free tier + Route53 domain (delegate nameservers to Netlify DNS).
Include `netlify.toml` and a short DNS-setup note in README. Domain name not
yet chosen; use placeholders.

## Acceptance checklist
- [ ] Gate: seal cracks, drapes part, music starts, all from one tap on mobile
- [ ] All 3 events render with working map links, ICS download, dress code
- [ ] Countdown correct against 12 Dec 2026 19:00 IST (editable constant)
- [ ] Scratch-card reveal works with touch and mouse
- [ ] Gallery shows couple_images/ photos + album photos in gilded frames
- [ ] No RSVP, no gifts anywhere
- [ ] Lighthouse mobile perf reasonable (< 10 MB first load, lazy media)
- [ ] `prefers-reduced-motion` produces a calm, readable site
- [ ] Playwright vision validation passed at 390/768/1440 widths
