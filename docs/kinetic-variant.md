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

## Control panel / setup-wizard (no scrolling)

In the full-motion path the page **does not scroll and has no scroll effect**:
`kinetic.js` adds `html.k-deck`, stacks every act (`.hero` / `.band` /
`.footer`) as a fixed full-viewport **panel**, and navigation is a control
panel — a labelled left **side menu** (`#k-panel-menu`, jump to any panel) plus
**Back / Next** buttons and a **step counter** (`#k-panel-controls`). There is
NO wheel / swipe / arrow-key navigation; every panel change is an explicit click
(buttons are real `<button>`s, so Tab+Enter still works). Panels crossfade and
the incoming heading scramble-resolves; each panel reveals on enter (fade-up
stagger, countdown settle, interlude timeline). The HUD marker updates per
panel; the per-section index is hidden (the menu + counter own numbering). On
mobile the menu collapses to a compact bottom Back/Next+counter bar. A panel
taller than the viewport scrolls its own overflow natively (never changes
panel). **Reduced-motion / no-GSAP / no-JS keep a plain scrolling page** (no
`k-deck`, none of this chrome) so all content stays reachable.

## Side wireframe dancer

`js/app/kinetic-dancer.js` renders a **persistent procedural wireframe humanoid**
(an "Iron-Man-suit" read — cube helmet, broad chest plate with an arc-reactor
core, blocky plated limbs, slab hands/feet) on the right side, across all
panels, that **dances to the background music**. It's ~15 nested `Group` bones
(no glTF/skeleton), cyan additive `LineSegments` with a scaled halo copy for
fake bloom, on its own low-DPR WebGL canvas (`#k-dancer-canvas`, fixed, behind
panel content). The dance is a continuous groove (phase accumulator whose
speed/amplitude scale with the music) + beat accents, all damped toward targets;
it reads the repo's existing offline-envelope energy via `appState.lightshow.energy`
(no new AnalyserNode) and idle-grooves when silent. Brightness pulses on the
beat (bar-weighted, smooth decay curve — not a hard flash); checked against
WCAG 2.3.1: this project's 125-150 BPM tracks are 2.08-2.5 beats/sec, under
the 3-flashes/sec G19 ceiling regardless of amplitude. Hidden on mobile
(≤900px) and under reduced-motion. Replaces the earlier interactive
rings. `lightshow.js` suppresses its own solid mecha when `data-variant="kinetic"`
so the two figures don't clash.

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

## Dancer model attribution

The kinetic side dancer loads a rigged glTF: **"Armadrillo"** by **kimni88**
(https://sketchfab.com/3d-models/armadrillo-6dc598423875484fb9dc8d7cbff1f122),
licensed **CC-BY-4.0** (http://creativecommons.org/licenses/by/4.0/). Shipped
under `assets/scene/armadrillo/` (full licence in that folder's `license.txt`).
It's driven procedurally by the beat-locked choreography (no baked animation
clips) and rendered as a cyan wireframe to match the theme.
