# Batch 2 desktop art-direction — adversarial research + critique

Date: 2026-07-19. Subagent: general-purpose (research + adversarial design director).
Context: techno skin, desktop composition overhaul. Baselines captured at 1440x900.

## Core reframe (changes the whole plan)

The problem is NOT "everything is centred." Centred is correct for the emotional and
sacred core, and Anyma's own site is a centred single-column media stack (ornament-light).
The real disease is visible in the CSS: **triple-nested centring / width throttle**. `.wrap`
is 74rem (~1184px) but inside it content is pinned far tighter: 24rem (countdown, scratch),
26rem (gallery veil note), 30rem (footer line, interlude art), 34rem (interlude quote), all
`margin-inline:auto` + `text-align:center`. On a 1440 canvas that is a ~380-540px ribbon
inside an 1184px wrap inside a 1440 viewport. That reads as a template column marooned in a void.

**The fix that removes ~70% of the problem is width + scale + rhythm discipline, not asymmetry.**
Asymmetry is the risky, cliche-adjacent cure. Award-winning dark editorial = extreme type-scale
contrast (huge display vs. whisper captions) + macro whitespace on an 8pt rhythm, NOT density.

## Research findings (cited)

- Anyma's real site: centred single-column media stack, ornament-light. Half the "editorial
  grid" plan fights the stated north star. (anyma.com; wikipedia/Anyma)
- 2026 "so over" list: index rails, 01/06 section numbering, bento grids, "minimalism without
  soul," "motion for motion's sake." Failure = lack of intention, not the aesthetic.
  (creativeboom.com/insight/10-trends-creatives-are-so-over-in-2026)
- Ghosted/oversized watermark type reads premium ONLY as a single restrained gesture with macro
  whitespace; repeated per section it reads "absorbed into templates." (venngage, creativeboom)
- Wide gutters at 1440+ are a luxury asset ONLY when composed on a rhythm; the discriminator
  between "luxury void" and "dead space" is whether every element has a clear role. (designrush, canva)
- Wedding: the shloka/sacred verse must LEAD, be centred, reverent breathing room; off-centre or
  watermark = irreverent. Couple names + invitational close stay prominent/centred. Asymmetric
  editorial is a 2026 luxury signal ONLY for supporting/informational content (events, dates,
  gallery captions). (shaadivibes, indianweddingcard, theknot, paperlust)
- Biggest failure mode: the page stops looking like a heartfelt invitation and becomes a
  portfolio/landing page the moment layout cleverness carries the message. (wedsites, format)

## Verdicts on the 8 draft points

1. Index rail + promote orphan tick -> MOSTLY CUT. Rail = SaaS furniture, on the fatigue list,
   redundant with in-content TRACK 01/02/HEADLINE. The orphan cyan tick is a bug (`.wrap::before`
   at left:0 of the centred 74rem wrap, lands ~128px in from edge). DELETE it. Left-anchor only
   informational section headers via named grid lines.
2. Per-section ghosted watermark type -> CUT. Highest cliche risk; fights the existing central
   light-shaft `.band::before`; irreverent near shloka/names; contrast/WCAG risk. If kept at all:
   ONE gesture, one informational band, never near sacred/names.
3. Countdown break-centre -> MODIFY. Right symptom (undersized), wrong cure. Keep centred (suspense
   beat + scratch ritual want focal centre). Fix scale: widen cells, bump numerals. Optionally place
   countdown + scratch side-by-side (2-col) to fill width while keeping centre of mass.
4. Events asymmetry -> KEEP INTENT, MODIFY MEANS. Strongest section for asymmetry (informational).
   But express hierarchy via SIZE not column-starvation: keep all three cards readable (guests must
   compare time/venue/dress), make headline card taller + slightly wider. Left-anchor the header.
5. Interlude split -> KEEP with guardrail. Best-justified split. But portrait CONTAINED with a
   margin (not bleeding off-screen), quote large-but-not-billboard, still dignified. 5-7 or 6-6.
6. Gallery veil full-bleed blurred tiles -> CUT the blurred tiles (LEAK: ships real gated photos,
   un-blurrable by URL). Redesign veil as an intentional SEALED OBJECT: glyph-seal motif + SEALED +
   locked frame counter (00 / N). Shrink (drop 46svh min-height on desktop), centre, let it breathe.
7. Footer corner furniture / coordinates -> CUT the scatter. This is the hand-signed close, the most
   intimate moment; keep centred and warm. Coordinates = cold portfolio trope. Only valid part:
   "pull content up" (top-align to kill the dead top band from min-height:100svh flex-centre).
8. Corner furniture to fill dead bands -> MODIFY. Treat the cause: stop forcing 100svh on
   informational bands (countdown, events, gallery); size to content + bounded padding on 8pt rhythm.
   Where a band stays tall, compose the seam with ONE element (existing waveform divider), not corners.

## Stay centred (non-negotiable): hero names + shloka, any shloka, interlude pull-quote, gallery veil object, footer sign-off.
## Asymmetry budget: events grid (size hierarchy + left header), countdown/gallery section headers, interlude portrait/quote split.

## Ranked fixes (highest leverage first)

1. Kill the inner max-width throttle + fix scale (24/26/30/34rem caps) on desktop. Extreme scale
   contrast. This alone dissolves the marooned strip with zero gimmick, zero cyan spend.
2. Delete the orphan corner-tick.
3. Countdown + scratch side-by-side (2-col), section centred, header optionally left-anchored.
4. Relax min-height:100svh on the three informational bands; compose seam with waveform divider.
5. Events: size-based hierarchy (taller/slightly wider headline), header left-anchored.
6. Interlude split (5-7), portrait contained, quote centred opposite.
7. Footer: keep centred, top-align.
8. Gallery veil: sealed object (glyph-seal + SEALED + frame count), shrunk + centred. No blurred tiles.
9. SKIP: index rail, 01/06 numbering, ghosted watermark type, footer coordinates.

Cyan budget already spent by beat-reactive accents (`.hero-amp`, `.count-num`, `.scratch-date`,
`.event-card--main` glow). Every new element must be ice-white or hairline, never cyan.

## Red-team: single most likely way this makes the page WORSE

Applying the full portfolio kit at once (rail + 01/06 + watermark + coordinates + corner furniture)
turns a heartfelt restrained invitation into a generic Awwwards-template SaaS page AND desecrates the
sacred/emotional core (watermark behind the shloka, sign-off flung to corners, couple as a lookbook).
Both more generic and less heartfelt in one move.

Avoid: spend asymmetry/furniture ONLY on informational bands; keep every emotional/sacred moment
centred and still; fix WIDTH + SCALE + RHYTHM before adding DECORATION. Intention test (Creative Boom):
does the element encode real information (real event number, real date, real seal state)? If it is there
to look sophisticated, cut it.
