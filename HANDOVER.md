# Handover — Techno skin of the Sanchit & Riya wedding invite

You are continuing work on a **techno / Anyma-Afterlife styled, friends-facing
variant** of a mobile-first Hindu wedding invitation, shipped as a separate
env-flagged build. Goal: make it **state-of-the-art**. Original brief:
`/Users/sanchitdang/dev/techno-variant-prompt.md`.

## Repo / deploy
- `/Users/sanchitdang/dev/marriage_card_website`, git branch **main**, remote
  `github.com/sanchitd5/marriage_card_website`.
- **Netlify auto-deploys from `main` on push.** Netlify build command is
  `node build.js` (= the REGENCY default). For the TECHNO build to deploy,
  `WEDDING_THEME=techno` must be set in the Netlify site env (or netlify.toml).
  **FLAG: confirm this is set, else the deploy is Regency.**
- `revealDate = true` currently → dates are published (11 and 12 December 2026,
  Chandigarh and Ambala). While `false`, no date/venue leaks into `dist/`.

## Workflow rules (MUST follow — the user is strict on these)
- **Commit + push directly to `main`. NO sub-branches** (only main deploys).
  `git push` is often blocked by the auto-approval classifier → ask the user to
  run `!git push origin main` or approve. Standard flow: commit, then
  `git fetch origin && git rebase origin/main && git push origin main` (the user
  pushes their own commits too, so rebase first).
- **Consult a reviewer subagent BEFORE any non-trivial task** — critique the
  plan/design, fold in, then build.
- **Surface subagent output** — the user can't see background agents. Relay full
  reports inline AND save to `reviews/<date>-<topic>.md`.
- **No em dashes in prose docs** (org rule). Caveman-terse chat mode may be
  active; code/commits/PRs written normally.
- After any UI change: build, screenshot, adversarial review (per CLAUDE.md).

## Architecture
- `WEDDING_THEME` flag (`build.js` `parseTheme`): techno picks
  `src/index.techno.template.html` + `css/techno.css`; the copy filter excludes
  `assets/videos` and top-level Regency `theme-N.mp3` from techno, and excludes
  `assets/scene` from Regency. Techno audio lives in `assets/audio/techno/`
  (SONGS glob emits `techno/theme-N`).
- **Skin hook**: `<html data-skin="techno">` — shared JS modules
  (scratch/confetti/sparkle/gate/countdown/gallery) branch on it instead of being
  duplicated. Keep it that way.
- Fonts vendored+subset in `assets/fonts/` (Space Grotesk, Space Mono, Noto Serif
  Devanagari). No font CDN.
- Family-blessings section is OMITTED from the techno template only. Do NOT delete
  `buildFamilyBlessing`/`joinFamilies` or their tests (Regency uses them).

## Key files
- `src/index.techno.template.html` — techno template.
- `css/techno.css` — the full techno visual system.
- `js/app/lightshow.js` — WebGL haze-tunnel backdrop + the mecha dancer + the
  `state.drop` signal. three.js r128 (CDN) + GLTFLoader/DRACOLoader. `DANCER`
  config object controls the mecha size/xyz. `setupMechaScene()` re-adds
  lights+env per build (survives governor rebuild).
- `js/app/milkdrop.js` — butterchurn MilkDrop viz, drop-gated (opacity follows
  `appState.lightshow.drop`). Does NOT tap the music (silent analyser feed).
- `js/app/ui.js` — music (two Audio elements, crossfade), exposes `_trackName`
  and `crossP` for envelope sync.
- `assets/scene/mecha.glb` — 2.8MB chrome mecha (Draco + webp).
- `gen-envelopes.mjs` — offline envelope generator (ffmpeg) →
  `assets/audio/techno/envelopes.json`.

## Done
- Phase 1: full obsidian reskin, Nataraja Shiva invocation (`Āṅgikaṃ Bhuvanaṃ
  Yasya`), vendored fonts, video-free CSS gate reveal.
- Phase 2: Path A WebGL haze-tunnel + offline-envelope music sync + FPS governor
  + build-time flash lint. Dormant backdrop before the tap; the tap ignites it.
- Mecha dancer: glTF (converted from a USDZ via Blender), pixel-fit sizing,
  centred on mobile / side on desktop, always-visible once ignited.
- MilkDrop viz on hard drops; beat-reactive cyan shimmer (`--beat`/`--energy`).
- 3 code reviews applied (commit `d6b8725`): far-plane fix (mecha was clipped),
  lights/env per build, geometry-safe disposal, removed the Web Audio music tap
  (was silencing music / iOS mute), removed the per-beat strobe (flash-safe),
  MilkDrop perf (render only when visible, tier gate, DPR cap).
- Design review done → `reviews/2026-07-19-design-review-techno.md`.
- Batch 1 shipped (`a9e0cd6`): cyan-duotone couple portrait in the interlude
  (uses the ungated `art-couple.jpg`), film grain, dark-only (theme toggle
  removed, one obsidian palette), retired the cyan "second-word" heading tic.

## In progress / next (the design overhaul)
- **Batch 2 (IN PROGRESS): desktop art-direction.** Biggest structural gap:
  desktop is a ~720px centred column marooned in dead black. Break the centre,
  bleed oversized type off edges, fill/kill the dead vertical bands, tighten
  rhythm, asymmetric event cards. Per-section wide-screen composition.
- **Batch 3: component redesign** — countdown (drop the outlined boxes, set
  numerals in the display face, roll animation), gate (less generic modal, stop
  the muddy hero blur behind it), event cards (depth/venue cue), scratch panel
  (real texture).
- **Batch 4: stronger focal render + motion** — make the mecha/atmosphere a
  prominent, reliable hero focal object; Lenis + GSAP scroll reveals on
  `expo.out`, section transitions, micro-interactions, all reduced-motion gated.
  Re-review against the SOTA bar.

## Deferred / flags
- **Mecha GLB licensing** — ships with no attribution/license. CONFIRM the source
  and its terms before publishing (real legal exposure); add credit or swap.
- **Draco decoder loads from gstatic** — should self-host under `assets/`.
- fitToPixels off-axis exactness + re-fit on orientation change;
  frame-rate-independent smoothing; WebGL context-loss handling; transparent PBR
  depth sorting.

## Dev loop
- Server (background, keep alive): `python3 -m http.server -d dist 8642` →
  http://127.0.0.1:8642 . Rebuild after each edit.
- Build: `WEDDING_THEME=techno node build.js` (techno) / `node build.js`
  (Regency — keep byte-identical). `npm test` = 35 tests, keep green.
- Screenshots: Playwright is installed in the scratchpad
  (`/private/tmp/.../scratchpad`, its own node_modules), not the project. Use the
  `shot.mjs` harness (reducedMotion reduce, strips gate, forces
  `.fade-up`/`.hero-seq` visible, element-shots each section mobile+desktop).
  **CAVEAT: reduced-motion shots have WebGL OFF** (tunnel/mecha/milkdrop are
  gated), so use a non-reduced capture (click `#seal`, wait ~5s) to see live viz.
- **Headless (swiftshader) cannot render the PBR chrome metal**, and its slow FPS
  makes the governor floor the WebGL — so the mecha's appearance is not verifiable
  headless. Trust the real GPU + code diagnostics. (A `window.__lsTest` hook to
  force tier / skip governor was used then stripped; re-add temporarily if you
  need to instantiate the dancer in a headless probe.)

## Design direction (locked)
Obsidian `#0B0C0F`, ice-white `#F5F7FA`, ONE cyan accent `#22D3EE` (rare/earned,
not a per-heading highlighter), Space Grotesk (display) + Space Mono (labels).
DJ-set metaphor ("Until the drop" / "Track 01 / Headline" / #SanchitKiRiya).
Nataraja shloka + crosshair-seal motif. Warmth via the duotone couple portrait.
Keep the monochrome discipline; light is the only colour.
