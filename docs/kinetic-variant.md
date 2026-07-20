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

## The dancer duet

`js/app/kinetic-dancer.js` renders **two loaded, rigged glTF humanoids** —
the "Armadrillo" and a rigged-for-this-project "fairy punk" figure (see
attribution below) — sharing one canvas/renderer/camera, side by side, across
every panel: an ambient wedding-duet motif, not a literal depiction of either
half of the couple. Own low-DPR WebGL canvas (`#k-dancer-canvas`, fixed,
behind panel content). Hidden on mobile ≤900px in favour of a full-width
"reserved stage"/watermark treatment (see the mobile-UI section above) and
hidden entirely under reduced-motion. `lightshow.js` suppresses its own solid
mecha when `data-variant="kinetic"` so the figures don't clash.

**Render style — chrome + wireframe accent, not wireframe-only.** Each mesh
gets a shaded chrome base pass (`MeshMatcapMaterial`, a matcap texture drawn
procedurally to an offscreen canvas at load — no HDRI/network fetch, no scene
lights needed) so sculpted form and facial features actually read, plus a thin
additive cyan wireframe pass on a `.clone()` of the same mesh (rebinds to the
same `Skeleton` for free) as a "circuitry" accent on top. Brightness (the
wireframe accent's opacity + the chrome pass's colour multiplier) pulses on
the beat via a bar-weighted, smooth decay curve, not a hard flash — WCAG
2.3.1 is deprioritized project-wide per the owner's call, though for the
record this project's 125-150 BPM tracks are 2.08-2.5 beats/sec, under the
3-flashes/sec G19 ceiling regardless of amplitude.

**Choreography.** A 12-move procedural library (`MOVE_TABLE` — grooveSway,
handsFace, strike, breakdown, stepTouch, bodyWave, reachOpen, tribalStomp,
invocation, groundedIsolation, crouchProwl, polyStep) replaces the original
single continuous-groove loop. Each dancer independently re-picks a
weighted-random move every 8 beats from a context-gated pool (idle / low-energy
/ high-energy "drop"), biased toward moves whose `affinity` tag matches
whichever instrument register (bass/kick, mid melodic/vocal, hi-hat/percussion)
currently dominates the track — computed from a multi-band RMS envelope
(`envLow`/`envMid`/`envHigh` in `assets/audio/techno/envelopes.json`,
ffmpeg band-pass decodes via `gen-envelopes.mjs`). Per-beat accent magnitude
tracks the track's REAL loudness at that instant (`beatStrength`, sampled from
the offline envelope), not just a fixed phase/bar-position formula. A cheap
per-beat/per-move-instance jitter (a sine-hash "coherent noise" stand-in) plus
a slightly asymmetric master oscillator keep the motion from reading as
perfectly repeating/mechanical. `strike` (a wind-up + punch accent) fires in
unison for both dancers on a sustained-loud section's rising edge — the one
choreographed moment they always hit together.

**Portable retargeting engine (`js/app/dance-retarget.js`).** The choreography
is authored once against a rig-agnostic PROXY layer (named joint ROLES, in the
lineage of Unity's Humanoid Avatar and the VRM humanoid bone spec: a required
core of 13 roles plus optional roles for spine subdivisions, shoulders, hands,
individual fingers, toes and accessory chains like a tail). A small engine maps
those proxy rotations onto whatever bones a model actually provides, so porting
a NEW rig needs only a role→bone-name map — the engine derives the
canonical→local axis mapping ANALYTICALLY from the captured bind pose (a
per-bone child-direction change of basis, `qCorr = setFromUnitVectors`), which
replaces the old per-bone, per-rig trial-and-error axis-sign hunting. A move
authored on core roles runs identically on any rig with the core; a richer rig
can add flourishes on optional roles it provides, and a simpler rig degrades
gracefully (the proxy exists but has no adapter, so the write is a free no-op).
The spring-damper secondary motion, beat/BPM sync, instrument-band selection and
authored arc all operate on the proxy/clock layer, so they generalize across
rigs for free. **The two shipping rigs are driven in EXPLICIT mode** — each
supplies the exact hand-tuned `{ rest, axis-map }` it was verified with, so the
engine's explicit path is bit-identical to the original inline retarget (proven
`maxCompDiff = 0` across all 12 move poses on both rigs) and both dancers look
and move exactly as before. **Honest scope:** the analytic path removes the
axis-sign guessing (at load it auto-recovers the torso, forearms and shins to
<2° of the hand-tuned result on both rigs), but rest-pose normalization
(bringing a T-pose arm down to a hanging rest), bone roll about the limb axis,
and leaf bones with no child to point down remain a small declared hint — the
residual every mature retargeter (Unity, VRM, Mixamo) also leaves to a human
"put the model in a clean T-pose" step. The engine measures and logs, per rig,
how close the hint-free analytic derivation gets to each hand-tuned bone
(`appState.dancer.retargetReport`) — the honest evidence for what is now
automatic vs. what still needs a person. Pure retarget math is unit-tested
(`test/dance-retarget.test.mjs`).

**Authored arc (offline, hand-read — not a shipped model).** A proposal to use
an LLM (Gemma 3n E2B) to pick moves live, in-browser, was reviewed and
rejected (model size 1.5-5.6GB+, multi-second in-browser latency on real
phones, and a 12-option weighted pick isn't an LLM-shaped problem anyway —
see git history for the full review). Instead, `assets/audio/techno/choreo-arcs.json`
is a per-track list of hand-authored sections (intro/groove/build/drop/
breakdown/outro), read directly off each track's actual energy curve — a
static, zero-runtime-cost build artifact. It overrides the live pool gate
where it *knows* the structure (a 'drop' section commits to the high-energy
pool, 'breakdown' commits to calm, ahead of the live signal catching up) and
triggers the synchronized duet `strike` right as a known drop begins, instead
of only reacting to the live threshold. A missing/failed fetch falls back to
the live-only behaviour exactly as before.

**Per-panel placement.** The duet doesn't sit in the same spot on every
panel — `PANEL_LAYOUTS`/`PANEL_GROUP` in `kinetic-dancer.js` group panels into
a few placement modes (`display`, `displayAlt`, `interludeAlt`, `dense`) that
vary each rig's position/scale/depth (which figure is foreground/larger,
how far apart they stand) so the composition changes panel to panel instead
of reading as a static sticker pasted in one corner, while never crossing a
button/heading/paragraph on any panel at any checked breakpoint.

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

The kinetic dancer duet loads two rigged glTFs, both driven procedurally by
the same beat-locked choreography engine (no baked animation clips):

- **"Armadrillo"** by **kimni88**
  (https://sketchfab.com/3d-models/armadrillo-6dc598423875484fb9dc8d7cbff1f122),
  licensed **CC-BY-4.0**. Shipped under `assets/scene/armadrillo/` (full
  licence in that folder's `license.txt`). A 50-bone T-pose rig as sourced.
- **"DP Techno Fairy Punk Set HD Textures"** by **BilloXD**
  (https://sketchfab.com/3d-models/dp-techno-fairy-punk-set-hd-textures-6c2d6ff1ca3043ff9ffdf884ffbba1b8),
  licensed **CC-BY-4.0**. Shipped as static, unrigged geometry from Sketchfab
  and **rigged for this project** headlessly in Blender (a custom 13-bone
  biped armature in a hanging-arms bind pose, matching the joint set the
  choreography engine drives) — see `assets/scene/fairy-punk/license.txt` for
  the full note and credit. Source PBR textures were not re-exported (the
  runtime renders both dancers as chrome + wireframe with a shared material
  stack, so the source textures are unused).
