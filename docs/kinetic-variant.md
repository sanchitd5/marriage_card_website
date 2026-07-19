# Kinetic variant (saifullah.dev-style console skin)

A third visual skin, shipped as a separate env-flagged build
(`WEDDING_THEME=kinetic`). It takes the **techno** skin as its base (obsidian +
single-cyan palette, Space Grotesk / Space Mono, the WebGL haze + light show, the
Nataraja invocation, the vendored fonts) and layers on the animation language of
[saifullah.dev](https://www.saifullah.dev/): a boot-console intro gate,
scramble-text name reveal, scroll-triggered reveals, a magnetic crosshair cursor,
and a mono HUD frame. The concept: **the invitation as a precision console that
boots a love story.** Friends-facing, like techno.

## How to build

```sh
WEDDING_THEME=kinetic node build.js                        # kinetic, groom-first
WEDDING_THEME=kinetic FROM_GROOM_SIDE=false node build.js  # kinetic, bride-first
```

## Architecture — techno-based, isolated engine

`parseTheme` gains a `kinetic` value; `isTechnoBased(theme)` (`techno || kinetic`)
gates every **asset** decision in `build.js` so kinetic ships identically to
techno (ships `assets/audio/techno/*` + `assets/scene/*`, drops the Regency
`videos/` tree and top-level `theme-N.mp3`, obsidian manifest colours). The only
per-theme difference is the template: `src/index.kinetic.template.html`.

- **Runtime `data-skin="techno"`** — so every shared module (`lightshow`,
  `milkdrop`, `scratch` foil, `gallery` veil, `boot-loader` audio path, cyan
  sparkle palette) runs the techno path unchanged. No third-skin branches were
  added to the shared `js/app/*` modules.
- **`data-variant="kinetic"`** — the CSS/JS hook for the console layer.
- **Own entry `js/main.kinetic.js`** + **`js/app/kinetic.js`** (the choreography).
  It deliberately does NOT call the techno/Regency `initGate`/`initGsap`/`initHero`
  (those run the video hero + sparkle reveal, which would fight the scramble). It
  reuses `buildGallery`, `initScratch`, `initCountdown`, `initCalendarButtons`,
  `initScrollCue`, `initMusicToggle`, `initLightshow`, `initMilkdrop`, `initTilt`,
  and reimplements the `.fade-up` + interlude reveals + the gate (scroll-lock,
  30s auto-open, `appState.ignited=true`, `startMusic`) itself.
- **`css/techno.css` is loaded FIRST, then `css/kinetic.css`** (the console layer:
  crosshair cursor, HUD frame, film grain, boot-console gate, section indices,
  scramble stability, plus the review-pass fixes). Kinetic-specific overrides are
  scoped under `html[data-variant="kinetic"]`.

Kinetic is obsidian-only (no day/night toggle) and uses vanilla JS scramble
(GSAP's ScrambleTextPlugin is a paid Club plugin and is not loaded).

## Signature elements

- **Boot-console gate** — `WEDDING_OS v12.12.26`, a status word cycling
  `STANDBY → SYNCING → CALIBRATING → ALIGNING HEARTS → LOCKED IN` with a fill bar
  + %, then a rounded-square monogram seal. Opaque (unlike techno's see-through
  gate, since the kinetic hero is large text that must not bleed through).
- **Scramble reveal** — on gate open, the couple's names + eyebrow resolve from
  random glyphs; band headings scramble as they scroll into view.
- **Crosshair cursor + magnetic buttons** — fine-pointer only; hidden on
  touch/reduced-motion.
- **Mono HUD** — corner ticks, a live wall-clock, and a per-section marker
  (`00 — INVOCATION` … `05 — RSVP`) driven by ScrollTrigger.

## Accessibility / fallbacks

Reduced-motion and no-JS paths reveal all content statically, set scramble
targets to their final text, drop the cursor/grain/pulse, and keep the gate
tappable. The HUD clock ticks in every path. Verified at 390px and 1440px.
