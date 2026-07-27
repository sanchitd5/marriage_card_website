# Design

What each variant is, what it must look like, and why. Read alongside
`GET_REVIEW_DONE.md`, which covers how to capture and review them.

This file is the record of design *decisions*. If you change a rule here, change
it because the reasoning below is wrong — not because a screenshot looked off in
one state. Several rules exist precisely because a screenshot lied.

## The variant matrix

Sixteen builds. Four axes, all independent.

| Axis | Values | What actually changes |
|---|---|---|
| `WEDDING_THEME` | `regency`, `kinetic` | Two different products sharing one data layer. Different template, type system, palette, and navigation model. |
| `FROM_GROOM_SIDE` | `true`, `false` | Name order, monogram, hashtag, share card, deploy URL — **and the event list**. |
| `REVEAL_DATE` | `false`, `true` | Whether dates and venues exist on the page at all. |
| `REVEAL_COUPLE` | `false`, `true` | Whether the gallery shows the couple or a veil. |

`REVEAL_DATE` and `REVEAL_COUPLE` are env overrides for review only. The shipping
value lives in `site.config.mjs`.

---

## The two skins

### Regency (default) — family-facing

Warm ivory and gold, painted palace artwork, script display face, falling
petals. A **scrolling page**: the guest scrolls, and a scroll cue is honest.

Register is formal and inclusive of elders. This is the build that carries the
family blessings section and the full invitation grammar.

### Kinetic — friends-facing

Obsidian and a single cyan accent. A **panel deck**: six fixed acts, navigated by
a Back/Next bar and a section rail. **The wheel does nothing**, so any "scroll"
affordance here is an instruction that cannot be obeyed — that is why the shared
`.scroll-cue` is hidden on this skin, and it should stay hidden.

`data-skin="techno"` is carried by kinetic so it inherits the techno runtime
(light show, milkdrop, gallery veil, audio). The standalone `techno` target is
frozen legacy; see CLAUDE.md.

---

## Kinetic design system

Established while taking the hero from 4.5 to 9.8 with a design panel.

**Type — three voices, no more.**

- **Archivo Variable** for display. It carries a real `wdth` axis, so the name
  lockup is genuinely extended rather than synthetically stretched. Space
  Grotesk was dropped from the hero: it is a proportional companion to Space
  Mono with no display cut, which is exactly why the names read as generic
  Helvetica at 130px.
- **Space Mono** for labels, kickers, the hashtag, deck chrome.
- **Noto Serif Devanagari** for the shloka only.

**Hierarchy is luminance, not size.** On a dark page the brightest element reads
as nearest. The couple's names must be the brightest and the only pure-white
mass; everything else is subordinate. If the artwork out-shouts the names, the
artwork is wrong, not the names.

**Spacing.** Inter-group gaps must be >3x intra-group gaps. Six near-identical
40–60px gaps destroy grouping entirely — the hero read as seven orphans until
this was imposed.

**The accent budget.** Cyan appears on roughly three things per screen. It was
spread across five and stopped being an accent. Notably it is *not* spent on
rules or separators.

**One warm token.** `#f0e4d6`, borrowed from the eclipse's ~3200K diamond bead,
carries the human voice line and the salutation. This is a highlight, not a
second hue — the obsidian + cyan lock holds.

### The name lockup

Both names render at **one shared point size**, computed at runtime
(`js/app/name-fit.js`), with the longer name flush left and the shorter flush
right so the block squares by alignment.

This is an equity rule, not a typographic one. At a single point size a
seven-letter name renders ~450px wider than a four-letter one, so the groom
optically outweighs the bride. An earlier attempt scaled each name to equal
*width*, which simply inverted the unfairness — the four-letter name doubled in
cap height and the bride dominated. Equal size plus opposed alignment is the
only version where neither partner is bigger.

It must be computed at runtime because the names are build tokens and
`FROM_GROOM_SIDE` flips which is which; no hardcoded ratio survives a rebuild.

### The hero object: a total solar eclipse

Two bodies in exact alignment, one ring of light. It replaced a black hole,
which failed on two counts: visually it kept reading as Saturn, because faking
gravitational lensing with billboards leaves ring-system cues; and symbolically
a solitary black hole is a **one-body image selling a two-person event**, whose
lay reading is annihilation rather than mutual attraction.

Implementation notes live in `js/app/eclipse.js`. The layers that matter: a
near-black lunar disc with a ~1px limb (a feathered edge is the top CG tell), a
corona on the two-term Baumbach–Allen falloff with solar-minimum flattening, a
partial chromosphere hairline, and the diamond ring.

**Placement is a hard rule.** The eclipse is a *margin object* in dialogue with
the type across a gutter. It must never print under a kicker, headline or body
copy. On mobile it is pinned to the top-right corner, the only region of a 390px
panel with no text, with an explicit z-order below content. It has broken this
rule twice: once centred over body copy, once relocated to exactly headline
altitude.

---

## Mobile

The desktop layout carries insets that exist to clear the deck's section rail.
**That rail does not exist below 1100px**, so every one of those insets is scoped
to `@media (min-width: 1100px)`. Unscoped, they resolved to a 216px left padding
on a 390px screen and squeezed the copy column to 176px.

Rules:

- Panels centre in the viewport **minus the nav bar** (~95px), not the full
  viewport, or every act rides high above a dead band.
- The deck nav bar is full-bleed, permanently visible on touch, and padded with
  `env(safe-area-inset-bottom)`. It is revealed by `pointermove` on desktop — an
  event a touch screen never sends — so without this the deck's only navigation
  is invisible on a phone.
- Tap targets ≥44px. 44 is the floor; the hold-to-decrypt control is 56 because
  a sustained press is far less forgiving one-handed.
- The countdown is a **horizontal 4-up** with masked numerals (`––`) in the
  digits' own footprint. A vertical ladder loses the DD:HH:MM:SS silhouette,
  which matters *more* when the values are hidden because the shape carries the
  meaning the digits cannot. Dots read as a loading skeleton; three filled plus
  one hollow is literally a progress-dot pattern.

### The contrast guard

`#milkdrop` screen-blends the music visualiser over the whole page at an opacity
written per frame from the track's drop level. On desktop a large dark field
dilutes it; on a 390px screen it floods the panel and body copy falls to ~1.2:1.

It is capped on mobile with `!important` — necessary specifically because the
value is inline and written every frame, and legibility must not lose to it.

This is also why a single screenshot cannot settle a contrast question: the same
panel is legible on a quiet passage and washed out on a loud one.

---

## Content rules that apply to every variant

**Gating is leak-proof by construction.** Real dates and venues live only in
`site.config.mjs` and `events.config.mjs` and are injected at build time. While
`revealDate` is false, nothing date- or venue-identifying appears anywhere in
`dist/` — verified by test, not by inspection.

**The run of show is data, not markup.** `events.config.mjs` is the single source
of truth, shared by both skins. Events are side-aware: the Mehndi is at the
groom's home and the Baraat is his procession, so a bride-first build must not
advertise either as though that guest were invited. Groom-first shows five
events, bride-first three.

**Invite variants** (`WEDDING_INVITE=full|friends|wedding`) show a guest only the
events they are invited to. `full` means "everything this side hosts" rather
than a hand-maintained list, so it cannot drift as the programme grows.

**The gate states it once.** Repeating "Date & time to be announced" per card was
six grey lines at three events and ten at five; the gate ends up dominating the
act. The programme says it once, above the list.

**The invocation unfolds across the journey.** The Abhinaya Darpaṇa verse is
split: the gate carries the first half, the hero the celestial quarter ("whose
adornment is the moon, the stars"), the footer the closing salutation and the
double daṇḍa. The hero previously showed the *closing* quarter, which both
duplicated the footer and left a dangling correlative — the verse is built on a
यस्य…तं pair, so "तं नुमः" with no antecedent on screen is a fragment.

Keeping a dance-lineage invocation is deliberate: this is the dance-music skin
and Nataraja is the lord of dance. It should **not** be ported to Regency.

**Copy register.** "Announce" notifies; "join us" invites. The families issue the
invitation before the couple are named. At least one line must be the couple's
own voice in plain sentence case.

---

## Regency review findings (open)

Scored by panel on the shipping variant: gate 8.0/7.5, hero 7.5/6.0, countdown
4.0/3.5, events 5.0/4.5, gallery 4.0/5.5, family 7.5/8.0, footer 7.0/6.5.

Highest-severity, by variant:

- **`date-on`: the programme is ragged.** Mehndi and Baraat have no date, venue
  or action buttons while the other three have all four, so on the revealed
  build two cards read as "not announced" beside three complete ones. Either
  give every event a date in `site.config.mjs` or render an explicit
  `Timing to follow` line plus a disabled action row so all five share a
  skeleton.
- **`date-on`: verify the live countdown actually replaces the shimmer.** The
  capture still showed the masked row with `WEDDING_TS` set. If the shimmer path
  stays active on reveal, the real number never appears.
- **`couple-on`: palette collision.** Cream lehenga on cream backgrounds inside
  cream mats on an ivory page — the masonry reads as one pale mass. Also a
  register gap: candid phone-grade photos under "A courtship, in portraits" set
  in painted-palace art direction.
- **`bride`: event numbering restarts** on a different set, so "event 01" means
  Mehndi on one deploy and Haldi on the other. Number by canonical event id or
  drop the numerals.

Global: every `min-height:100svh` band centres a short block, so 40-55% of most
sections is empty; three competing "elegant" type treatments (letterspaced
caps / italic / script) with no fixed roles; four different vocabularies for the
same gated idea.

**Not a bug — do not "fix" it.** A reviewer reported the hero and footer showing
different hashtags in the same build and called it a token bug on both deploys.
The hero hashtag is a deliberate rotator (`hero.js: startHashtagCycle`) cycling
`data-tags` with a sparkle swap; a still frame catches whichever is showing. The
prescribed fix (point both at one field, add a test asserting hero == footer)
would have deleted a working feature.

## Pending event decisions (out of scope for review)

The programme is **not final**. Which functions run, who hosts them, and which
guests see which subset are still being decided, and a **management panel is
planned** to own that editing. `events.config.mjs` holds provisional data behind
a stable shape so the panel can write to it without touching the renderer.

Do not report these as design defects. Recorded so they are not lost:

- **Is the Baraat groom-side-only?** It is currently modelled that way, so a
  bride-first build omits it. A reviewer argues that is culturally wrong: the
  bride's family *receives* the baraat, and the milni and the dancing at the
  gate are their moment as much as the groom's.
- **No Sangeet**, which for a Punjabi wedding is the function friends most
  expect — and the one a techno-skinned card is best placed to sell. If it is
  folded into "Cocktail & Engagement", the card should say so.
- **Engagement listed after Haldi.** Confirmed correct by the couple, but elders
  may read a future-tense engagement beside the wedding as odd.
- **The Wedding row is thin** for the central event: a guest cannot tell whether
  to arrive for the baraat, the phere or dinner.
- **Bride-first shows three events and reads as short.** Whatever the final list,
  either fill the panel at n=3 or state the split explicitly, so it reads as a
  choice rather than missing data.

## Known open items

- **RSVP has no reply mechanism.** The act named RSVP offers no way to respond.
  Marked TBD by the couple.
- **Act 01's countdown** shows a masked clock, but the hero promises "the
  countdown has already started". A live ticking clock with only the date gated
  would honour that.
- **Regency copy still says "we announce the union of"** — the press-release
  register that was fixed on kinetic only.
- **Three container treatments** across the kinetic deck (grey fill, teal
  hairline, neutral 2px frame) with no card system.
- No swipe gesture and no `history.pushState` per panel on mobile.
