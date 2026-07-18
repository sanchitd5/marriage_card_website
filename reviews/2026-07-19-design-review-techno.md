# Techno wedding invite — design review vs the 2026 SOTA bar

Reviewer: adversarial art-director subagent. Screenshots reviewed were the
reduced-motion static state (WebGL/mecha/MilkDrop were gated off), so "no hero
visual" is partly that artifact — the live hero has haze motes + name shimmer.
The structural critiques below hold regardless of motion.

## Verdict
Conceptually the "Afterlife-invite" framing is strong and the restraint instinct
is right. In execution it reads as a **tasteful dark template, not an
art-directed experience.** Two problems dominate: in a static frame there is
almost no *visual* (no focal object, texture, or depth — centred text on flat
near-black), and it is emotionally cold for a wedding (no human presence; the one
section that should carry warmth is empty).

## Five things holding it back most
1. **No hero visual survives a still.** The signature WebGL/mecha isn't reading;
   the hero is a wordmark in a void. The bar (Anyma/Afterlife, Awwwards winners
   Iventions/Minh Pham/Chipsa) is built on one cinematic full-bleed focal object.
2. **Desktop is a stretched mobile layout.** Every section is a ~720px centred
   column in a 1440px canvas; left/right thirds + big top/bottom bands are dead
   black. The bar is art-directed asymmetry (type bleeding off edges, off-grid,
   camera-move transitions).
3. **A wedding with no humans and no warmth.** No photos/faces/venue imagery; the
   couple gallery is a sealed empty grey box. 100% cold-club, ~0% wedding.
4. **The cyan-second-word tic** ("two hearts", "so far", the ampersand, "SCRATCH
   TO REVEAL", card border) — single-accent discipline spent on a repeating
   highlighter, predictable by section 3.
5. **Components look like defaults** — 1px outlined countdown boxes with grey
   digits (bootstrap widget), gate = generic modal blurring the hero muddily,
   flat thin-bordered event cards, flat grey scratch panel.

## Genuinely good (keep)
DJ-set metaphor ("Until the drop" / "Track 01 / Headline" / #SanchitKiRiya);
mono metadata + bold display pairing; the crosshair-seal + shloka motif; single
cold accent on near-black; mobile composes better than desktop.

## Concrete moves to hit the bar
1. Commit to one hero render — make the chrome dancer (or an atmospheric Three.js
   volume) a real full-bleed, beat-reactive focal object that survives a still.
2. Re-art-direct desktop — break the centre column; oversized type bleeding off
   the left edge; asymmetric cards; kill/fill the dead vertical bands.
3. Put the couple in — a duotone portrait, a silhouette, or unlock one gallery
   frame. Cold is a style; empty is a bug.
4. Add grain + real depth (film-grain overlay + gradient depth).
5. Motion discipline — Lenis + GSAP ScrollTrigger, section transitions on
   expo.out/power3.out, scroll-timeline reveals, reduced-motion gated.
6. Tighten type; retire the "second word in cyan" pattern.
7. Reconsider the light-mode toggle (off-brand for the obsidian concept).

## Status of fixes (this repo)
- Batch 1 (done): duotone couple portrait in interlude; film grain; dark-only
  (toggle removed); cyan tic retired.
- Batch 2 (in progress): desktop art-direction.
- Batch 3 (planned): component redesign (countdown, gate, cards, scratch).
- Batch 4 (planned): stronger focal render + motion discipline.
