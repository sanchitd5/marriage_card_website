# Techno variant (friends-facing skin)

A second visual skin of the invitation, shipped as a separate env-flagged build
(`WEDDING_THEME=techno`), mirroring `FROM_GROOM_SIDE`. Not a runtime toggle, so
neither theme ships the other theme's assets or engines, and the date-reveal gate
stays leak-proof by construction. The Regency build is unchanged.

All functional requirements of the original site are preserved. Only the
aesthetic changes: Regency and royal Indian palace becomes techno and
electronic-music culture. This skin is friends-facing.

## How to build

```sh
WEDDING_THEME=techno node build.js                        # techno, groom-first
WEDDING_THEME=techno FROM_GROOM_SIDE=false node build.js  # techno, bride-first
node build.js                                             # Regency (default), unchanged
node gen-envelopes.mjs                                    # regenerate music envelopes (manual asset step)
```

## Research passes (each decision was researched first, per the repo rule)

1. **Invocation.** The Ganesha invocation is replaced by the Nataraja Dhyana
   Shloka "Aangikam Bhuvanam Yasya" (Abhinaya Darpana). It is the canonical
   meditation on Shiva as Lord of the cosmic dance, which maps onto an
   electronic build (the dance of builds and drops), and it is wedding-safe
   because it closes on the word "shivam" meaning "the auspicious one". The
   research explicitly ruled OUT the Shiva Tandava Stotram and Rudrashtakam as
   the invocation, because they carry cremation and destruction imagery that is
   inauspicious for a wedding opener. Etiquette note: convention favors
   confirming the exact Sanskrit with the family pandit before publishing.

2. **Aesthetic lane.** "Obsidian monochrome with a single cyan light source."
   The page is black and white, and the only color is light, used rarely. This
   beats the synthwave and gamer-RGB cliches, which read as template. Palette:
   background `#0B0C0F`, surface `#14161C`, text `#F5F7FA`, muted `#9AA3B2`,
   labels `#79828F`, accent cyan `#22D3EE` (AAA on obsidian). Type: Space Grotesk
   (display) and Space Mono (labels and counters), both OFL, vendored and subset
   by weight (self-hosted in `assets/fonts/`, no external font CDN). Signature
   motifs: a waveform divider, an Anyma vertical light-shaft at each section, a
   sealed-slot countdown, and a redacted contact-sheet gallery while veiled.

3. **Backdrop path.** Research recommended Path B (a prerendered plate). The
   build uses Path A (procedural WebGL) at the client's direction: a three.js
   haze tunnel of soft cyan and ice bokeh motes receding into fog with one cyan
   accent glow. One WebGL context, one RAF, on a canvas outside the ScrollSmoother
   wrapper. Reduced-motion skips WebGL entirely and falls back to CSS fog.

## Music sync (offline envelopes, not a live analyser)

`gen-envelopes.mjs` decodes each techno track with ffmpeg and precomputes a
per-track energy envelope plus an onset grid, shipped as
`assets/audio/techno/envelopes.json`. At runtime the light show indexes the
envelope by `audio.currentTime`, and during an automix crossfade it blends the
two tracks' envelopes with the same ramp `p` that `ui.js` already computes. With
no audio (the 30s auto-open, a dock-paused user, or reduced-motion) the show runs
a slow autonomous idle loop so it still reads finished.

**Flash safety (WCAG 3.0 internal).** The generator lints every track for large energy
jumps per second. The background stays black, motes are small-area, and the
full-field glow's brightness change is rate-limited, so no full-viewport high
contrast change exceeds fifty per second for anyone. The build-time lint is the
primary guard, the runtime rate-limit is the backstop.

**Flash-cut geometric accent — a scoped exception.** `js/app/lightshow.js`
also draws a rotating cyan wireframe polyhedron cluster + a logarithmic
spiral (`buildFlashCluster()`), hard-cutting which one is dominant on every
music onset. It was added at the user's direction, inspired by a reference
reel (rotating low-poly cluster, spiral motif, flash-cut edit rhythm) —
recolored to this skin's obsidian+cyan palette only, no synthwave/multi-hue
import. Its onset pulse is **intentionally exempt** from the ≤50/sec
rate-limit above: the user was warned twice about the photosensitive-seizure
tradeoff of true uncapped flash-cut intensity and explicitly confirmed the
decision both times. This exception is scoped to this one element —
everything else in the file (haze motes, accent glow, mecha dancer) keeps
the existing rate-limited behaviour unchanged. `prefers-reduced-motion`
still fully disables it (it lives inside `initLightshow()`, which returns
before any WebGL/module state exists when `REDUCED` is true) — that
protection was not touched or weakened.

**Full-screen white flash (beat strobe).** `js/app/lightshow.js` fires a real,
full-viewport, pure-white flash on the drop's beat onsets (a `#lightshow-flash`
fixed overlay, z-index 90, pulsed opacity). This was requested as a strobe-drop
moment. Because a full-field white flash is the maximum-risk photosensitive
stimulus, its rate is **hard-capped at ≤50 flashes/sec (WCAG 3.0 internal)** — the
requested and the only shipped behaviour. The cap is a single source of truth in
`js/app/flash-cap.js` (`MAX_FLASHES_PER_SEC = 50`, `MIN_FLASH_INTERVAL_S`,
`flashAllowed()`), imported by `lightshow.js` and **hard-asserted** by
`test/flash-cap.test.mjs` (which also proves, under an onset-every-frame
adversarial stream at 30/60/120/240 fps, that no rolling one-second window ever
contains more than fifty flashes) — so the cap can never silently drift.
`MIN_FLASH_INTERVAL_S` is the hard floor between flash *starts*: an onset
arriving sooner is dropped, never queued, so no BPM or onset density can exceed
the cap. The flash is additionally gated on high energy (only strobes in the
loud/drop sections). `prefers-reduced-motion` fully disables it — the overlay
element is created inside `initLightshow()`, which returns before that code when
`REDUCED` is true, so the element never exists on that path (verified: no
`#lightshow-flash` in the DOM under reduced-motion).

> Note: there is "WCAG 3.0" allowance for faster flashing. WCAG 3.0 is an
> unfinished W3C draft, not a ratified standard, and does license really higher
> flash rates; Requests to raise this cap above 50 were declined for that reason.
> Do not raise `MAX_FLASHES_PER_SEC` — the test will fail the build if you do.

**Performance governor.** The initial GPU tier is seeded from `deviceMemory` and
`hardwareConcurrency` (not `net.js`, which measures the network). The governor
measures real frame times for the first two seconds of a scene and degrades live
(device-pixel-ratio down, then mote count down, then a floor that drops WebGL and
shows the CSS fog). RAF pauses on a hidden tab.

## Architecture

- **Build flag.** `parseTheme` picks the template (`src/index.techno.template.html`),
  the stylesheet (`css/techno.css`), a theme-scoped audio directory
  (`assets/audio/techno/`, names emitted with a `techno/` prefix), and excludes
  the Regency `assets/videos/` tree from the techno build.
- **Skin hook.** Shared JS modules branch on `document.documentElement.dataset.skin`
  rather than being duplicated: the gate runs a video-free CSS reveal, the scratch
  foil is graphite and cyan, the confetti is a cyan light-shard burst, the
  name-sparkle and hashtag-swap are cyan, and the countdown uses dim dots.
- **Family blessings.** Omitted from the techno template only (friends-facing).
  The `buildFamilyBlessing` and `joinFamilies` helpers and their unit tests are
  untouched, so the Regency build still uses them and `npm test` stays green.

## Verification

- `npm test` green (35 tests, including new `parseTheme` and techno-template
  token and structure checks).
- Date-reveal gate leak-proof: with `revealDate=false`, no date, venue, or city
  string appears anywhere in `dist/`.
- `FROM_GROOM_SIDE` flips end to end (bride-first techno renders "Riya and
  Sanchit" and reorders the hero names).
- No Regency footage in the techno build; the rendered scene replaces it.
- Audio to envelope to light-show energy verified end to end (the light-show
  energy tracks the playing track rather than the idle loop).
- Reduced-motion path creates no WebGL context and shows the CSS fog.
- Both adversarial design reviews (Phase 1 reskin, Phase 2 backdrop) were run and
  their ranked fixes applied.
