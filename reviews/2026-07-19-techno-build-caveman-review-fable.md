# Techno build — caveman code review (Fable, xhigh)

Date: 2026-07-19. Subagent: caveman:cavecrew-reviewer, model claude-fable-5, effort xhigh
(single-agent workflow wf_291f88f3-4bf). Scope: whole techno build — techno template, techno.css,
lightshow.js, milkdrop.js, main.js, build.js techno paths, gen-envelopes.mjs, and every techno
branch in the shared JS.

Tally: 1 bug, 24 risk, 10 nit, 1 question.

## Findings (verbatim)

### src/index.techno.template.html
- :455 🟡 risk: a compromise of any of the 3 CDN origins (cdnjs, jsdelivr, unpkg; 10 scripts) runs arbitrary JS in every guest's browser. Add `integrity` + `crossorigin` (SRI) to all pinned CDN scripts.
- :249 🟡 risk: `role="dialog" aria-modal="true"` gate has no focus trap and the page behind is not `inert`; Tab escapes into hidden content while scroll is locked. Trap focus in #gate or set `inert` on #smooth-wrapper until finish().
- :280 🟡 risk: `#floating-cue` is `aria-hidden="true"` yet ui.js wires a click-to-scroll action to it; interactive control invisible to AT and unreachable by keyboard. Make it a `<button>` and drop aria-hidden.
- :134 🟡 risk: the 60-line sun-position day/night resolver still runs on a dark-only skin, and its daytime "light" verdict feeds ui.js which rewrites meta theme-color to Regency cream (see ui.js:400). Hard-return "dark" on techno or delete the resolver.
- :13 ❓ question: techno og:image reuses the Regency-styled share card (`invitation-card-share.jpg`); intended, or does the techno deploy need its own card?
- :273 🔵 nit: theme-toggle button ships but techno.css force-hides it with `!important`; dead markup + dead aria wiring. Omit from the techno template.
- :73 🔵 nit: `transition: background .25s` on a conic-gradient can't interpolate without an `@property` registration for `--boot-p`; the boot arc steps, never tweens. Register the property or drop the transition.
- :320 🔵 nit: `data-text` attrs on `.hero-name` are unused by techno.css (Regency glow-dup leftover). Delete.

### css/techno.css
- :601 🟡 risk: `.hero-wave i` is double-driven: the `wave-breathe` keyframe animates height 16%..100% while `scaleY(calc(.5 + var(--energy)*1.3))` multiplies on top; at energy ~1 bars render ~40px in a 22px track (no overflow clip) and poke at the date line. Drive one axis only or cap the scale.
- :200 🔵 nit: `.gate--techno .gate-stage { display:none }` makes the `#gate.revealing` shaft-burst/grid-fade keyframes (L223-226) dead on techno. Delete the stage markup + keyframes or re-point the burst (see gate.js:118).
- :79 🔵 nit: fixed full-viewport grain with `mix-blend-mode: overlay` forces a blend composite over two animating WebGL canvases every frame; real GPU cost on phones. Consider opacity-only grain.
- :294 🔵 nit: dead rules on techno: `#fullscreen-toggle` (element absent from template), icon-sun/moon swap rules L306-308 (toggle hidden), `::view-transition` rules L745-747 (no theme switch), `.eyebrow-sub` L144 (class unused). Prune.

### js/app/lightshow.js
- :431 🟡 risk: the "TEMP: always visible once ignited" gate ships: the dancer is no longer drop-gated, so `--drop` (L443) pins ~1 after the tap, permanently lifting the vignette 80% (techno.css:342 says "lifts during a drop") and dimming motes 30% (L444). Restore drop-gating or derate `--drop`.
- :404 🟡 risk: three `:root` custom-property writes per RAF frame force document-wide style recalc plus animated text-shadow repaints (hero names, count digits) every frame on top of WebGL; the governor only degrades the GL side. Quantize writes (e.g. 0.05 steps, skip no-ops) or scope the vars to the affected subtrees.
- :352 🟡 risk: `floor()` hides the canvas but leaves `--beat`/`--energy`/`--drop` at their last values; frozen beat glow and a lifted vignette persist over the CSS fog. Reset all three vars in floor().
- :91 🟡 risk: no `webglcontextlost/restored` handling; a lost context (common after iOS backgrounding) leaves a frozen or black backdrop with `#ambient` still hidden. On contextlost call floor().
- :465 🟡 risk: resize never re-runs `fitAndAddDancers`/`fitToPixels`; after rotation the mecha keeps the stale pixel size and the portrait-vs-side placement chosen at build. Debounced refit on resize.
- :31 🟡 risk: `flashSafe`/`flashMaxPerSec` from envelopes.json is never read; the documented contract ("runtime damps full-field response for unsafe tracks", gen-envelopes.mjs:16) is unimplemented. Consume the flag or delete the contract claim.
- :31 🔵 nit: envelope fetch fires before the `window.THREE` guard (L73); with three.js absent the ~300KB JSON downloads for nothing. Move fetch below the guard.
- :347 🔵 nit: `rebuild()` constructs a second `WebGLRenderer` on the same canvas; `getContext` returns the old context and new attribute requests are silently ignored, works by accident. Keep one renderer, rebuild only the scene.

### js/app/milkdrop.js
- :76 🟡 risk: `start()` at page load creates an AudioContext (pre-gesture, permanently suspended, Chrome console warning) plus a second full-screen WebGL context although nothing can show before ignition. Lazy-init on the first `drop > EPS`.
- :52 🟡 risk: `cycleTimer` setInterval is never cleared; `stop()` only cancels the RAF, so the interval keeps firing on hidden tabs and after a lightshow floor. clearInterval in stop() or on pagehide.
- :42 🟡 risk: butterchurn renders full-screen under a 4-op CSS filter chain + `mix-blend-mode: screen` and is exempt from the lightshow FPS governor; mid-tier phones tank exactly at the drop. Feed the governor tier into pixelRatio/textureRatio or skip when the tunnel is at tier 0.

### build.js / manifest
- build.js:268 🟡 risk: the techno copy filter trims videos/audio but ships the whole `assets/images` (~34MB) although techno uses only art-couple.jpg, the share card and the manifest icon; all Regency gate stills/posters are dead weight in the techno dist. Extend the filter.
- src/manifest.template.webmanifest:6 🟡 risk: shared manifest hardcodes Regency cream `background_color`/`theme_color` (#f7f4ee) and the wax-seal icon; the techno PWA gets a cream splash over obsidian. Token-ize per theme in build.js.
- build.js:289 🔵 nit: cross-ship dead weight both ways: Regency dist carries techno.css + 8 techno woff2 fonts; techno dist carries the Regency stylesheet. Filter css/fonts by theme.

### gen-envelopes.mjs
- :49 🟡 risk: `new Float32Array(buf.buffer, buf.byteOffset, ...)` assumes 4-byte alignment; a pooled (<8KB) Buffer has an arbitrary byteOffset and throws RangeError on very short decodes. Copy into a fresh ArrayBuffer or assert `byteOffset % 4 === 0`.

### js/app/gate.js
- :118 🟡 risk: the techno reveal comment promises "flash the stage's light burst (#gate.revealing in CSS)", but techno.css hides `.gate-stage` entirely; the class only animates invisible elements, so the reveal is a bare card fade. Re-point the burst at a visible layer or drop the claim.

### js/app/scratch.js
- :59 🟡 risk: foil caption paints before Space Mono loads and the lastW/lastH guard blocks any later repaint, so "SCRATCH TO REVEAL" stays in fallback monospace forever. Repaint once on `document.fonts.ready`.
- :63 🔵 nit: `ctx.letterSpacing` is Chromium-only; Safari/Firefox render the caption untracked. Accept or letter-space manually.

### js/app/ui.js
- :400 🔴 bug: `apply()` hardcodes Regency meta theme-colors (`#191322`/`#f7f4ee`); on techno it overwrites the head's `#0b0c0f`, and a daytime auto-theme paints a cream address bar over the obsidian page. Branch the colors on `data-skin` or skip the meta write on techno.
- :410 🟡 risk: the 60s auto-theme interval + visibilitychange refresh run forever on techno although the toggle is `display:none` and the CSS ignores `data-theme`; each sun flip re-triggers the meta bug above. Early-return initTheme when skin is techno.
- :90 🟡 risk: the crossfade ramp runs on rAF; a hidden tab freezes it mid-fade, leaving BOTH tracks playing at partial volume and `m.crossP` stuck for the lightshow's envelope blend until the tab returns. Drive the ramp from `timeupdate` or setInterval.

### js/app/hero.js
- :144 🟡 risk: techno sparkle palette is cyan but `ctx.shadowColor` stays `'#ffd700'`; hashtag-swap sparkles glow gold on the obsidian skin. Branch the shadow colour with GOLDS.

### js/app/animations.js
- :204 🟡 risk: same gold `shadowColor: '#ffd700'` in doSparkleReveal behind the cyan techno sparkles. Branch it with GOLDS.

### js/app/boot-loader.js
- :109 🟡 risk: the audio warm-up settles only on `loadedmetadata`/`canplaythrough`/`error`; browsers that defer audio fetch without a gesture (iOS Low Power Mode, data-saver) fire `suspend` instead, pinning the loader until the 6/12s cap. Also settle on `suspend`/`stalled` after a short grace.

## End-to-end wiring check
No missing dependencies. Skin hook set inline pre-modules; `#lightshow`/`#milkdrop`/`#seal`/`#gallery-grid`/`#nataraja-motif` all present; `SONGS` `techno/` prefix matches envelopes.json keys exactly (6 tracks); mecha.glb, fonts, tracks, envelopes.json git-tracked and pass the techno copy filter; all techno guards early-return correctly off-skin.
