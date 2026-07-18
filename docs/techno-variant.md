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

**Flash safety (WCAG 2.3.1).** The generator lints every track for large energy
jumps per second. The background stays black, motes are small-area, and the
full-field glow's brightness change is rate-limited, so no full-viewport high
contrast change exceeds three per second for anyone. The build-time lint is the
primary guard, the runtime rate-limit is the backstop.

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
