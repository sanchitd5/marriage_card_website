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
- **Theme-9 is out of scope.** It is a full-screen video takeover on one track.
  If a capture looks like video frames, it is; re-run rather than review it.
- Say which viewport they are looking at, and that the kinetic build is a
  **panel deck** — a "scroll" instruction would be an affordance that cannot be
  obeyed, and reviewers have recommended one.
- Name anything already known and accepted, so they spend their attention on
  new findings.

Ask for a **score out of 10 per act plus a ranked defect list with concrete
fixes** (element, property, value). Ask them not to inflate — a generous review
is worthless. Run seats in parallel as separate agents; independent seats
disagreeing is a useful signal in itself.

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

So: measure before you implement. Read the computed style, sample the pixels, or
capture the state again. Two of the biggest fixes in this project came from
probing the DOM after a screenshot looked fine, and two near-misses came from
believing a screenshot that wasn't.
