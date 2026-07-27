# Getting a review done

How to put this site in front of a design panel and get findings you can act on.

The site is not one page, it is a **matrix**. Reviewing a single build tells you
almost nothing, and reviewing an inconsistently captured build is worse than not
reviewing at all — it burns the panel's attention on artefacts instead of design.

Both of those have already happened here:

- A panel spent its top three findings criticising "stray red and blue blobs
  sitting on the copy". Those were frames of the **theme-9 video takeover**,
  which replaces the whole scene for the duration of one music track. The review
  had to be thrown away and re-run.
- Two panels independently reported that **the couple's names were missing from
  their own wedding hero**, which is ship-blocking if true. It wasn't: the
  lockup sits at `opacity: 0` until the scramble reveal fires off the entry
  gate, and the capture had bypassed the gate.

The harness exists so neither happens again.

## Run it

```sh
node review-harness.mjs                     # full matrix, desktop + mobile
node review-harness.mjs --quick             # shipping gate state only (4 builds)
node review-harness.mjs --theme kinetic     # one skin
node review-harness.mjs --viewport mobile   # one viewport
node review-harness.mjs --hero-only         # skip the acts, hero only
node review-harness.mjs --out ./review-out --port 8722
```

It builds each variant, serves `dist/` on its own port, drives a headless
browser through the gate and every act, and writes:

```
review-out/
  <variant>/<viewport>/00-gate.png, 01-hero.png, 02-…, 03-…
  audit.json
```

Needs Playwright and a Chromium binary; both paths are overridable with
`PLAYWRIGHT_PATH` and `CHROME_PATH`, same as `gen-share-cards.mjs`.

## The matrix

| Axis | Values | Why it changes the review |
|---|---|---|
| `WEDDING_THEME` | `regency`, `kinetic` | Different templates and layout. Kinetic is a **panel deck** (Back/Next, no scrolling); Regency is a scrolling page. |
| `FROM_GROOM_SIDE` | `true`, `false` | Flips names, monograms, hashtag — **and the event list**. Groom-first shows 5 events; bride-first shows 3, because the Mehndi and Baraat are groom-side. |
| `REVEAL_DATE` | `true`, `false` | Dates and venues are gated. Whole sections change: countdown, run of show, scratch/decrypt plate, directions and calendar buttons. |
| `REVEAL_COUPLE` | `true`, `false` | Gallery is veiled or shows the couple's photos. |

`REVEAL_DATE` and `REVEAL_COUPLE` are **env overrides only** — they never write
to `site.config.mjs`, so a review run cannot accidentally commit a flipped gate.

Full matrix = 2 × 2 × 2 × 2 = **16 builds**, ×2 viewports = 32 capture sets.
`--quick` collapses the gates to their shipping state (4 builds) for a fast pass.

## What the harness handles for you

These are all mistakes that have already produced a wrong review at least once:

- **Enters through the gate for real.** Deleting `#gate` instead leaves the
  kinetic deck's `entered` flag false, so every navigation call is a silent
  no-op and each "act" screenshot is really just the hero again.
- **Forces scroll-reveal content visible**, so the panel never reports missing
  copy that is actually present — but only *content*, never chrome. An earlier
  version set `opacity: 1` on every descendant, which un-hid the desktop section
  rail on mobile and produced phantom findings.
- **Moves the pointer on desktop.** The deck chrome and crosshair cursor only
  appear on `pointermove`, so an idle capture hides the true shipping state.
  This is how a whole class of layout collisions went unnoticed.
- **Audits only what is on screen and hit-testable.** The deck stacks every act
  in the DOM, so an unscoped sweep measures controls inside panels the guest
  cannot see, and reports sizes from the wrong panel.

`audit.json` carries the objective checks a human should never have to eyeball:
horizontal overflow, tap targets under 44px, and console/page errors.

## Briefing the panel

Give reviewers the screenshot paths and **state the scope**, or they will score
things that are deliberate:

- Dates and venues are **gated on purpose**. "To be announced", the sealed
  archive and the cipher plate are intentional suspense, not unfinished work.
- **Theme-9 can no longer appear.** It is a full-screen video takeover on one
  track, and the harness now drops that track from the playlist at BUILD time
  via `EXCLUDE_TRACKS=theme-9`. Excluding it in the build is deterministic;
  pausing or skipping it in the page is a race against autoplay. If you build by
  hand for a review, pass the same flag.
- Say which viewport they are looking at, and that the kinetic build is a
  **panel deck** — a "scroll" instruction would be an affordance that cannot be
  obeyed, and reviewers have recommended one.
- Name anything already known and accepted, so they spend their attention on
  new findings.

Ask for a **score out of 10 per act plus a ranked defect list with concrete
fixes** (element, property, value). Ask them not to inflate — a generous review
is worthless. Run seats in parallel as separate agents; independent seats
disagreeing is a useful signal in itself.

## The panel prompt

Run seats **in parallel as separate subagents**. Independent seats disagreeing is
a useful signal; one agent wearing two hats averages its own opinion.

Two seats have worked well:

- **Seat A — composition / typography / art direction**
- **Seat B — guest experience / brand fit / mobile and one-handed usability**

Paste the block below, filling the four bracketed parts. Everything in it is
there because omitting it has produced a wasted review at least once.

```
You are PANEL SEAT [A: COMPOSITION / TYPOGRAPHY / ART DIRECTION
                  | B: GUEST EXPERIENCE / BRAND FIT / MOBILE & ONE-HANDED USABILITY]
reviewing [WHAT] of a wedding invitation.

Captures: [PATHS — name each file; say which viewport and which variant]
Reference for the quality bar: review-out/<variant>/desktop/01-hero.png

Read every image listed before answering.

SCOPE — score against these and nothing else:
- Obsidian + cyan, techno/Anyma, friends-facing (kinetic) OR ivory + gold,
  painted palace, family-facing (regency).
- Kinetic is a PANEL DECK: fixed Back/Next bar plus a section rail, no scrolling
  between panels, the wheel does nothing — so a "scroll" affordance would be an
  instruction that cannot be obeyed. Regency is a scrolling page.
- Dates and venues are DELIBERATELY gated. "To be announced", the sealed archive
  and the masked countdown are intentional suspense, NOT unfinished work. Judge
  whether the gated state reads as deliberate.
- OUT OF SCOPE, do not score or report:
  * the RSVP reply mechanism (no form/link is a known product decision);
  * theme-9 — the harness excludes it at build time, so it should not appear
    at all; if you see video frames, the capture was not made by the harness;
  * the EVENT LIST itself — which functions run, who hosts them, who is invited.
    That is still being decided and a management panel will own it. See
    DESIGN.md "Pending event decisions".
  * on DESKTOP, controls under 44px. 44px is a touch guideline; applied to a
    pointer viewport it flags the entire desk chrome.
- Known and accepted, do not re-report: no swipe gesture; no browser-history
  integration; hold-to-decrypt has no progress fill.

TARGET IS ABOVE [N]/10. Do not inflate — a generous review is worthless. If a
surface is 8.3, say 8.3.

Deliver:
(a) A score /10 per surface (and per viewport where both were captured).
(b) Ranked defects per surface, each with a concrete implementable fix:
    element, property, value, direction. Specific enough to apply without
    guessing.
(c) VARIANT-SPECIFIC defects — what breaks only when dates reveal, only when the
    couple photos reveal, or only on the bride-first build. Name the variant per
    finding. This is the entire point of reviewing a matrix.
(d) Global defects across surfaces; one fix here lifts several scores.
(e) [Seat B only] One-handed use on 844px: thumb reach, whether the round trip
    land -> countdown -> back works, anything needing a stretch or two hands.
Terse. No praise except where it changes a score.
```

Adjust the target upward between rounds rather than asking for perfection at the
start: a seat asked for ">9.9" on a first pass tends to produce a long list of
hygiene nits and miss the structural fault.

## Verify before you act

Reviewers work from a static image and will sometimes be confidently wrong.
Findings that were rejected here after checking: a "pale-cyan wash" on a panel
that renders near-black, and "no deck navigation on mobile" when the chrome
existed but sat at `opacity: 0` awaiting a `pointermove`.

Findings that were **accepted after initially doubting them** matter just as
much: a contrast flood *was* real — `#milkdrop` screen-blends the music
visualiser at an opacity driven per-frame by the track's drop level, so the same
panel is legible on a quiet passage and washed out on a loud one. A single
screenshot cannot tell you which you are looking at.

Concrete cases from this project, both directions:

| Reported | Reality |
|---|---|
| "Stray red/blue blobs on the copy" | Frames of the theme-9 video takeover. |
| "The couple's names are missing" | Lockup at `opacity:0` awaiting the scramble reveal. |
| "No deck navigation on mobile" | Chrome existed at `opacity:0` awaiting a `pointermove` a touch screen never sends. Half right: real defect, wrong cause. |
| "Hero and footer show different hashtags" | The hero hashtag is a deliberate rotator; a still frame catches one of two. The prescribed fix would have deleted the feature. |
| "A pale-cyan wash makes this panel unreadable" | **True.** `#milkdrop` screen-blends at an opacity driven by the music's drop level. Dismissed twice before being confirmed. |
| "The revealed build shows the dates AND 'to be revealed'" | **True.** The `hidden` attribute was set, but a `display:flex` rule overrode it. Checking the HTML was not enough; the computed style was. |

So: measure before you implement. Read the computed style, sample the pixels, or
capture the state again. Two of the biggest fixes in this project came from
probing the DOM after a screenshot looked fine, and two near-misses came from
believing a screenshot that wasn't.
