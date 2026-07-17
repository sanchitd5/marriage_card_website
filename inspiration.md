# Inspiration Review: The Digital Yes templates

Source-code reviews (scraped 2026-07-17). All four sites are Lovable-built React SPAs
(Vite, React 18, Tailwind, shadcn/Radix, framer-motion, Supabase RSVP). Findings come
from the production JS/CSS bundles, not screenshots, so animation and media behavior
is exact.

Local copies (index.html + bundles + every referenced asset) live in:

| Site | Local dir | Size | Character |
|------|-----------|------|-----------|
| majestic-template.thedigitalyes.com | `inspiration/majestic/` | 24 MB | Watercolor art + video hero (Spanish) |
| bridgerton-template.thedigitalyes.com | `inspiration/bridgerton/` | 3.5 MB | Typography + pure CSS ambience |
| tdy-excellence-template.thedigitalyes.com | `inspiration/excellence/` | 57 MB | Theatrical luxury, multi-day program |
| daynight-template.thedigitalyes.com | `inspiration/daynight/` | 39 MB | English variant of majestic |
| template-teatro.thedigitalyes.com | `inspiration/teatro/` | 22 MB | Theatre concept: curtain video + scratch-card reveal |

---

# 1. Majestic (primary reference)

## What the template actually is

A one-page Spanish/English wedding invitation ("Lucia & Felipe", Finca Biniagual,
Mallorca) with a gated intro, fullscreen hero video, and a Supabase-backed RSVP flow
with an admin dashboard. Everything else is scroll-driven storytelling sections.

## Page flow (section map, in order)

1. **Intro gate (overlay)**: envelope illustration + "Ver invitacion" (view invitation)
   button + intro video (`intro-video.mp4`) + intro music (`intro-music.mp3`).
   The click gates audio autoplay (browser policy) and plays an opening sequence.
2. **Hero**: fullscreen background video (`hero-bg-l.mp4`, 1.4s-poster fallback jpg),
   `min-h-screen`, content pushed down (`pt-[42vh]`), uppercase kicker with
   `tracking-[0.3em]`, couple names, monogram badge PNG. Elements enter in a timed
   sequence (delays 0.6 / 0.8 / 0.9 / 1.2 / 1.5s).
3. **Countdown**: own tinted band (`bg-countdown`), script-font heading
   (4xl-6xl), giant thin display numbers (up to 7xl), tiny letterspaced unit labels.
4. **Couple / story**: framed couple photo in ornate frame art, couple-dancing and
   dog-with-bouquet illustrations, flower bouquet PNG accents.
5. **Venue**: painted venue illustration + real entrance photo + illustrated regional
   map (`mallorca-map-illustrated.jpg`), Google Maps deep link.
6. **Schedule / timeline**: "Arrival & Welcome Drinks" → "Ceremony" →
   "Cocktail Hour & Dinner" ("Al fresco dining under the stars") → "Party".
   Vertical line drawn with `scaleY: 0 → 1` on scroll; items fade-up staggered.
7. **Travel**: bus illustration (shuttle info).
8. **Accommodation**: hotel/lodging block with icon art.
9. **Dress code**: dedicated illustration.
10. **Gifts**: "A thoughtful gesture" copy, bank-transfer details (IBAN/Beneficiary).
11. **FAQ**: "A few gentle reminders", Radix accordion (animated open/close).
12. **RSVP**: multi-field form via Supabase: attendance yes/no, phone, companions
    (adults/children), allergies per guest, song request, accommodation need.
    Success plays a confirmation animation (`rsvp-confirmation.webm`).
    "Add to Calendar" generates an ICS file client-side (BEGIN:VCALENDAR).
13. **Footer**: full-bleed photo background, ornament divider, string-lights PNG art.
14. **Hidden admin**: login + RSVP dashboard (list of confirmations). Supabase auth.

## Design system

- **Palette (HSL vars)**: ivory background `34 33% 91%`, sage `72 13% 45%`,
  sage-dark `72 19% 32%` (also the text color), cream `55 18% 65%`,
  gold `42 85% 55%`, gold-soft `42 60% 70%`. Whole site is warm ivory + muted
  olive/sage greens + gold accents. Soft lifted shadows
  (`0 20px 50px -15px rgba(58,69,52,.2)`).
- **Type**: Adobe Typekit (`use.typekit.net/dup6afg.css`). `--font-script:
  classic-script-mn` (cursive, used for emotional headings), `--font-display` and
  `--font-body: "span"` (a serif-feeling face) for everything else. Display type is
  font-weight 300 (light) and large (3rem+ titles). Kickers are 10-14px uppercase
  with 0.15-0.3em letter-spacing.
- **Layout**: single column, `max-w-4xl` centered, `.section-padding` (3rem 1.5rem
  mobile, 5rem 3rem desktop). Sections alternate ivory and tinted bands.
- **Artwork style**: hand-painted watercolor-style illustrations (couple, venue, map,
  bus, dress code, envelope) as PNGs with soft edges, plus ornate frames, monogram
  badge, string lights. This is exactly the AI-generated-art approach in PROMPT.md.

## Animation inventory (the part worth copying)

All framer-motion; no GSAP, no smooth-scroll lib (just CSS `scroll-behavior: smooth`).

- **Workhorse**: `initial {opacity:0, y:20} → whileInView {opacity:1, y:0}`,
  duration 0.6s (13 uses). Variants: y:30 dur 0.8 for bigger blocks.
- **Stagger**: list items `delay: index * 0.08`, dur 0.4.
- **Hero entrance**: sequenced delays 0.6→1.5s after intro gate.
- **Timeline line draw**: `scaleY: 0 → 1` on scroll (transform-origin top).
- **Zoom-in**: `opacity:0, scale:.9 → 1` for framed photo/cards.
- **Ambient loop**: one infinite 3s ease-in-out pulse (scroll cue / heartbeat accent).
- **Slow reveals**: 1.2-2s easeInOut one-offs (envelope open, ornament draws).
- **Parallax**: 2 uses of `useScroll`/`useTransform` (hero video + a section bg).
- **Micro**: accordion height animation, toast slide-ins, button hover tints.

Net: restrained system. One fade-up primitive reused everywhere + a few hero-moment
set pieces (intro gate, video hero, line draw). Feels rich because of art + video,
not animation quantity.

## Media strategy

- Hero ambience = short looping muted mp4 with jpg poster (fast first paint).
- Intro music mp3 unlocked by the gate click.
- RSVP success = transparent-ish webm animation.
- All art shipped as hashed static assets; no external image CDN.

## Adapting to our build (vanilla + GSAP, static, no backend)

- Intro gate → parchment envelope overlay; click starts shehnai audio + GSAP intro
  timeline. Solves autoplay policy the same way the template does.
- framer `whileInView` fade-up → one GSAP `ScrollTrigger` batch utility
  (`y:24, opacity:0, dur:0.6, stagger:0.08`). Same numbers, same feel.
- Timeline `scaleY` draw → GSAP `scaleY` on a line div, or DrawSVG on an ornament path.
- Parallax hero → ScrollTrigger scrub on hero media.
- Hero video → optional; AI-generated parchment art + tsParticles petals can replace
  it to stay fully static and light. If video wanted, same muted-loop+poster pattern.
- Supabase RSVP and gifts section → excluded by request (no RSVP, no gifts on our
  site). Still copy the "Add to Calendar" ICS generation (pure client-side,
  template proves it).
- FAQ accordion, per-event Maps deep links, illustrated venue map
  (Zirakpur/Ambala instead of Mallorca): all portable ideas.
- Fonts: swap Typekit for free pairing, e.g. Great Vibes or Tangerine (script) +
  Cormorant Garamond light (display) + a readable body serif via Google Fonts.
- Palette: keep their ivory-base logic and HSL-variable structure, but the final
  palette follows the Bridgerton direction (see synthesis item 8), not
  maroon/rani pink.

## Gaps / cautions

- Template is mobile-first single column; matches our phone-primary requirement.
- Their 720 KB JS bundle is the cost of React; our vanilla build should stay far
  under that even with GSAP (~70 KB) + tsParticles slim.
- `prefers-reduced-motion` handling not evident in their bundle; we add it.
- Their content is one venue / one day; ours is 3 events across 2 venues, so the
  schedule/timeline section becomes the structural centerpiece, not an afterthought.

---

# 2. Bridgerton (`inspiration/bridgerton/`)

Regency-era wedding invite (French chateau, Angouleme region). The outlier of the
four: almost zero raster art. One hero poster jpg, ~120 self-hosted Cormorant
Garamond woff/woff2 files (fontsource, all weights and italics), and everything
else is typography plus CSS-keyframe ambience.

**Design system**
- Palette: ivory `40 33% 97%` background, dusty blue primary `204 24% 60%`,
  blush `11 42% 86%`, champagne `38 30% 76%`, sage `110 14% 70%`, pearl white.
  Deep plum foreground `340 24% 28%`. Softer and cooler than majestic.
- Type: Cormorant Garamond for script, display AND body (single-family site,
  differentiation via size/weight/italics). Playfair Display, EB Garamond, Lora
  present as fallbacks.
- i18n string keys (`welcome.title1`, `schedule.ceremony.desc`), multi-language.

**Animation inventory (richest CSS ambience of the four)**
- Custom keyframes: `petalFall`, `fireflyDrift`, `fireflyPulse`, `sparkleBurst`,
  `sparkleDrift`, `sparkleTrail`, `shootingStar`, `starTwinkle`, `starBeat`,
  `twinkle`, `dust-drift`, `slow-zoom`. Ambient particle life implemented in pure
  CSS on absolutely-positioned elements, no particle library.
- `slow-zoom` on the static hero poster fakes a video (Ken Burns). Cheap and light.
- Signature reveals: `clipPath: inset(100% 0 0 0) → inset(0)` (curtain-style
  unveil), `scaleX: 0 → 1` ornament divider draws.
- Luxurious timing: 1.6s / 1.8s entrances with cubic-bezier `[.25, 1, .5, 1]`,
  ambient loops at 4.5s and 6s infinite ease-in-out. Fade-ups reach only
  `opacity: .95` in places (deliberate softness).
- Envelope-with-wax-seal intro gate (alt text: "Invitation envelope with wax seal").
- Content extras: "Please RSVP by <date>" deadline framing, hotel tiers with
  distance notes, salon/grooming recommendations section.

**Steal for ours**: CSS-only ambience layer (petals/fireflies/sparkles) as a
zero-JS fallback under tsParticles, slow-zoom Ken Burns on AI art, clipPath
unveils for section art, the long `[.25,1,.5,1]` easing for hero moments, RSVP
deadline line, hotel-tier layout for out-of-town guests.

---

# 3. TDY Excellence (`inspiration/excellence/`)

Luxury multi-day Istanbul wedding (Peninsula Hotel, Bosphorus welcome cruise).
Heaviest media (57 MB): hero video mp4, intro video mp4, background-music mp3,
RSVP confirmation webm.

**Design system**
- Palette: warm champagne `40 33% 95%` background with a single deep forest-green
  accent `137 19% 28%` doing all the work (their CSS names like `--burgundy` and
  `--gold` all point at the same green; lazy theming, but the two-tone result is
  strikingly elegant).
- Type: Typekit `parfumerie-script` (ornate script) + `mrs-eaves` (classic serif
  body). The most "engraved stationery" feel of the four.

**Signature: theatrical set-dressing**
Layered PNG scenery: stage curtains (left/center/right), classical columns,
flower vases, rose corners, candles, cypress trees. Sections are composed like
a stage set; curtain art + entrance animations read as a reveal performance.
Ambient loops are slow (6s, 7s, 8s infinite) for candle flicker / drift effects.
One `marquee` keyframe (scrolling strip).

**Content architecture (maps to our multi-event need)**
- "The Celebrations" hub: Welcome Cruise + Wedding day as separate program blocks.
- Wedding-day sub-timeline: Arrival & Welcome Drinks → Ceremony → Banquet →
  Party → After Party.
- Per-event dress code ("White Cocktail Attire" for cruise; men/women guidance
  per event).
- Hotel options with illustration cards (Peninsula, Marriott, Novotel).
- Background music toggle (site-wide mp3), monogram brand mark.

**Steal for ours**: the multi-event program structure (Haldi / Cocktail / Wedding
as distinct blocks with own sub-details), per-event dress code, curtain/column
set-dressing idea translated to Indian motifs (mandap pillars, marigold toran
garland instead of curtains, diyas instead of candles), site-wide music toggle.

---

# 4. Day & Night (`inspiration/daynight/`)

English-language variant of majestic: same Lucia & Felipe content, same Typekit
fonts (`classic-script-mn` + `span`), near-identical sage/gold palette (background
shifted to `50 25% 88%`), same watercolor asset set re-exported as PNG, plus a
hero video mp4 and a `.mov` intro video. No actual day-to-night color mechanic
despite the name.

**Deltas worth noting vs majestic**
- Framer-motion petal-fall particle system: randomized `x, y, rotate, scale`
  per petal, drifting down 180px while fading and rotating 180deg, staggered
  delays, 2s easeOut. A JS-driven petal rain blueprint (ours: marigold petals
  via tsParticles or GSAP equivalent).
- `height: 0 → auto` expand/collapse used for progressive disclosure (RSVP form
  steps, accordions).
- Copy tone in English worth borrowing: "Order of the Day", "Let's dance the
  night away!", RSVP yes/no confirmation messages, gift wording ("On the wedding
  day, you can hand us a card or envelope in person"), hotel pricing notes
  ("€180/night double room with breakfast", "Minimum 2 nights").
- Countdown implementation confirmed: plain 1s `setInterval` against a UTC
  target date. Trivial to replicate in vanilla JS.

---

# 5. Teatro (`inspiration/teatro/`)

Theatre-concept invite, the most interactive of the five (22 MB). Google Fonts
instead of Typekit: Great Vibes (script) + Cormorant Garamond (display) + Lora
(body). Exactly the free pairing we planned; teatro proves it works.

**Dual theme**
Two full CSS variable sets: a dark "stage" theme (`--background: 0 0% 12%`,
ivory foreground) and a light ivory/olive one (`40 39% 91%`). Dark theatre
sections alternate with daylight content sections.

**Signature interactions (worth copying wholesale)**
- **Curtain intro gate**: closed-curtain jpg → curtain-opening video mp4 plays →
  open-curtain jpg. The gate click doubles as audio unlock (intro-music mp3).
  Strongest "reveal performance" of all five templates.
- **Scratch-card reveal**: canvas over a gold-foil texture PNG, erased with
  pointer events via `globalCompositeOperation` (destination-out). Copy:
  "Scratch to discover the date", "Scratch all three circles to continue".
  Progress-gated: all three circles must be scratched. 60-particle burst on
  completion.
- **Marquee flicker**: opacity keyframe array `[0,.9,.9,.3,.9,.3,0]` over 5s with
  custom `times`, like a failing theatre bulb. Plus 1.5s repeat-twice glints.
- Workhorse otherwise identical: fade-up y:30/0.8s easeOut with 0.2/0.4/0.6/0.8s
  delay ladder (43 whileInView uses).
- Menu section in an ornate frame PNG (dinner menu as a playbill).

**Steal for ours**: curtain gate re-skinned as opening mandap drapes or toran
lift (veo-3.1 video between closed/open AI stills), scratch-to-reveal for the
wedding date (gold foil → date underneath, huge on mobile where touch scratching
feels native), flicker timing for diya/candle accents, dark/light alternating
sections (night baraat vs day haldi), playbill-style menu frame for the
program/timeline. Their Google Fonts trio can be adopted verbatim.

---

# Cross-template synthesis (what our build takes)

1. **One animation primitive everywhere**: fade-up `y:20-30, 0.6-0.8s` with
   staggered delays (all five sites agree). Implement once as a GSAP
   ScrollTrigger batch helper.
2. **Hero moments get slow luxury timing**: 1.2 to 1.8s, custom easing
   `[.25,1,.5,1]`, sequenced 0.6 to 1.5s delays after the intro gate.
3. **Intro gate pattern is universal**: envelope/seal overlay, click unlocks audio
   plus entrance timeline. Ours: parchment envelope with wax seal, shehnai starts
   on open.
4. **Ambience = layered, cheap**: CSS keyframe particles (bridgerton) under
   tsParticles marigolds (majestic art direction), Ken Burns slow-zoom on AI art
   when video is too heavy, veo-3.1-generate-preview loops when video is wanted.
5. **Multi-event structure from excellence**: Haldi / Cocktail / Wedding as
   program blocks, each with sub-timeline, dress code, venue map link, and
   add-to-calendar ICS.
6. **Set-dressing with Indian motifs**: toran garlands as top curtains, mandap
   columns, diyas, peacock feathers, marigold corners (excellence's curtain/column
   trick, re-skinned).
7. **Budget check**: majestic 24 MB and excellence 57 MB are heavy; ours should
   target < 10 MB first load via lazy-loaded media, poster-first video, compressed
   art (their font strategy also warns: bridgerton ships ~120 font files, we need
   2-3 subsets max).
8. **FINAL AESTHETIC ANCHOR (user decision, 2026-07-17)**: the Bridgerton TV
   series (the bride's favorite) fused with royal Indian wedding aesthetics,
   executed with zillennial restraint (couple born 1996-97): editorial
   minimalism, dusty pastels (wisteria, powder blue, blush, champagne gold),
   oversized light serif type, playful micro-interactions. The bridgerton
   template becomes the aesthetic base (its cool ivory/blush/champagne/sage
   palette and single-family Cormorant typography are already 80% there);
   majestic stays the structural base. Indian layer: jharokha arches, peacock
   in place of the bee, marigold + wisteria, Regency-style couple portrait in
   sherwani/lehenga, Whistledown-voice copy. Full spec in PROMPT.md
   "Design direction".
