# Plan: FROM_GROOM_SIDE build-time name orientation

## TL;DR
Introduce a build-time env var `FROM_GROOM_SIDE` (default `true`) that flips
the couple's ordering everywhere it appears. Since the site is currently
"static, no build step", add a minimal Node build script that:
1. Reads `process.env.FROM_GROOM_SIDE`.
2. Populates a `names` object (Sanchit-first or Riya-first).
3. Renders template versions of `index.html`, `manifest.webmanifest`, and
   generates a small `js/app/couple.mjs` consumed by existing JS modules.
4. Emits everything to a `dist/` folder that Netlify publishes.

No visible layout change: only ordering flips. Full names appear only in
the meta description (reordered per flag). Hero remains first-name-only.

## Source of truth
`site.config.mjs` at repo root (Node + browser friendly ESM):
```
groom: {
  first: 'Sanchit', last: 'Dang',  full: 'Sanchit Dang',
  initial: 'S', surname: 'Dang',
  hashtag: '#SanchitKiRiya',
  role: 'groom',                                     // used in family-role labels
  parents:      'Ajay & Geeta Dang',
  grandparents: 'Lt. Shri Subhash Chander Dang & Mrs. Raj Rani Dang',
}
bride: {
  first: 'Riya', last: 'Verma', full: 'Riya Verma',
  initial: 'R', surname: 'Verma',
  hashtag: '#RiyaKaSanchit',
  role: 'bride',
  parents:      'Vishal & Renu Verma',
  grandparents: 'To be announced',                   // TODO: replace with real names when known
}
```
`build.js` composes a `names` view object based on the flag:
- `first_a / first_b`, `full_a / full_b`, `initial_a / initial_b`,
  `surname_a / surname_b`, `tag_primary / tag_secondary`,
  and `side_a / side_b` (each a full `{ role, parents, grandparents }` block).
- When `FROM_GROOM_SIDE=true` (default): `a=groom, b=bride`.
- When `FROM_GROOM_SIDE=false`: `a=bride, b=groom`.

## Structure change (src / dist split)

Repo after change:
```
site.config.mjs
build.js
src/
  index.template.html
  manifest.template.webmanifest
  couple.template.mjs         # → dist/js/app/couple.mjs
dist/                         # gitignored; Netlify publishes this
css/, js/, assets/, couple_images/, inspiration/   # unchanged, copied into dist/
netlify.toml                  # command="node build.js"; publish="dist"
```

Local dev: `node build.js` (or `FROM_GROOM_SIDE=false node build.js`) then
serve `dist/` (Live Server / `python -m http.server -d dist`).

## Tokens (used inside templates)

HTML tokens:
- `{{FIRST_A}}`, `{{FIRST_B}}`      → hero names, titles, footer sign, short_name
- `{{FULL_A}}`, `{{FULL_B}}`        → meta description
- `{{INITIAL_A}}`, `{{INITIAL_B}}`  → footer monogram
- `{{TAG_PRIMARY}}`, `{{TAG_SECONDARY}}` → hero-tag-text + `data-tags`
- `{{HASHTAG}}`                     → footer-tag (matches TAG_PRIMARY)
- `{{PAIR_TITLE}}`                  → `Riya & Sanchit` style strings for
                                       `<title>`, og:title, twitter:title,
                                       apple-mobile-web-app-title, manifest
- `{{FAMILY_SIDE_A}}`, `{{FAMILY_SIDE_B}}` → pre-rendered `<div class="family-side">`
                                       blocks (grand-parents + parents),
                                       ordered per the flag. `{{SURNAME_A/B}}`
                                       are dropped (no longer used on the page).

The family-side block is a small partial rendered by `build.js` from each
side object:
```html
<div class="family-side fade-up">
  <p class="family-role">Grand Parents of the {role}</p>
  <h3 class="family-names">{grandparents}</h3>
  <p class="family-role">Parents of the {role}</p>
  <h3 class="family-names">{parents}</h3>
</div>
```

JS: no tokens. Instead, generated `js/app/couple.mjs` exports `NAMES`:
```
export const NAMES = { firstA, firstB, fullA, fullB, initialA, initialB,
                       surnameA, surnameB, tagPrimary, tagSecondary,
                       pairTitle, fromGroomSide };
```

## Steps

**Phase 1 — Scaffolding (parallel-safe)**
1. Create `site.config.mjs` with the couple constants above.
2. Create `build.js`:
   - Parse `FROM_GROOM_SIDE` (`'true' | 'false' | undefined`, default true).
   - Wipe & recreate `dist/`.
   - Copy static trees (`css/`, `js/`, `assets/`, `couple_images/`,
     `inspiration/`) into `dist/` via `fs.cpSync(..., { recursive: true })`.
   - Render templates in `src/` → `dist/` root using naive
     `String.replace(/\{\{TOKEN\}\}/g, value)` (escape HTML-safe values).
   - Emit `dist/js/app/couple.mjs` from `src/couple.template.mjs` (or build
     the file string in JS).
3. Add npm scripts to `package.json` (create if missing):
   `"build": "node build.js"`, `"build:bride": "FROM_GROOM_SIDE=false node build.js"`.
4. Add `dist/` to `.gitignore`.

**Phase 2 — Templatize existing files (parallel-safe after Phase 1)**
5. Move `index.html` → `src/index.template.html`; replace hard-coded strings
   with tokens at these sites:
   - line 6 `<title>` → `{{PAIR_TITLE}} — Shubh Vivah · 12 December 2026`
   - line 7 meta description → `... union of {{FULL_A}} and {{FULL_B}} ...`
   - lines 8, 11, 13, 20 (og/twitter/apple titles) → `{{PAIR_TITLE}}`
   - line 11 `og:image:alt` → `... {{FIRST_A}} and {{FIRST_B}}'s wedding ...`
   - lines 224/226 hero names → `{{FIRST_A}}` / `{{FIRST_B}}`
   - line 230 `data-tags` and inner text → `{{TAG_PRIMARY}},{{TAG_SECONDARY}}`
     and text `{{TAG_PRIMARY}}`
   - family section (currently line 337, a single-heading `<h3>`) is
     **replaced entirely** with the two-side structure:
     ```html
     <div class="family-grid">
       {{FAMILY_SIDE_A}}
       <span class="family-divider fade-up" aria-hidden="true"></span>
       {{FAMILY_SIDE_B}}
     </div>
     ```
     The existing single-heading CSS rule `.family-grid > .family-names`
     (styles.css:514) becomes dormant — no CSS change required; the
     two-column path (`.family-grid { grid-template-columns: 1fr auto 1fr }`,
     styles.css:501) already supports this layout.
   - line 349 footer sign → `{{FIRST_A}} &amp; {{FIRST_B}}`
   - line 348 monogram `<p class="footer-monogram">` →
     `{{INITIAL_A}}<em>&amp;</em>{{INITIAL_B}}`
   - line 350 footer-tag → `{{HASHTAG}}`
6. Move `manifest.webmanifest` → `src/manifest.template.webmanifest`;
   `name` → `{{PAIR_TITLE}} - Shubh Vivah`, `short_name` → `{{PAIR_TITLE}}`.
7. Create `src/couple.template.mjs` (or inline in build.js) that exports NAMES.

**Phase 3 — JS refactor (depends on Phase 1)**
8. `js/app/config.js`: import `NAMES` from `./couple.mjs`; rewrite
   `EVENTS.*.title` from literals to
   ``Haldi — ${NAMES.pairTitle}`` etc. `SONGS`, `MAPS`, `WEDDING_TS`
   unchanged. Also export/pass through `NAMES` for consumers.
9. `js/app/ui.js` (`icsFor` + download filename):
   - `PRODID:-//${NAMES.pairTitle}//Wedding//EN`
   - UID stays event-scoped but slug uses `NAMES.firstA/firstB` lowercased,
     e.g., ``UID:${ev.start}-${slug}-wedding@${slugNoDash}``.
   - Download filename: ``${btn.dataset.ics}-${firstA}-${firstB}.ics`` lowercased.
10. `js/app/hero.js` `startHashtagCycle`: currently reads from `data-tags`
    on the DOM, so it already picks up the flipped order — no code change
    needed here. Confirm by inspection only.

**Phase 4 — Deployment wiring (depends on Phase 1)**
11. `netlify.toml`: add `[build] command = "node build.js"`,
    change `publish = "."` → `publish = "dist"`. Keep existing header rules
    (Netlify applies them relative to publish dir, so paths still work).
12. Document in `README.md` a short "Build" section: install-free, requires
    Node ≥ 18 (for `fs.cpSync`), env var usage, and how to preview locally.

## Relevant files
- [index.html](index.html) → becomes `src/index.template.html` (lines 6–20, 224–230, 337, 348–350)
- [manifest.webmanifest](manifest.webmanifest) → becomes `src/manifest.template.webmanifest`
- [js/app/config.js](js/app/config.js) — rewrite `EVENTS.*.title` via `NAMES`
- [js/app/ui.js](js/app/ui.js) — `icsFor` PRODID/UID + download filename
- [js/app/hero.js](js/app/hero.js) — verify only; `startHashtagCycle` reads `data-tags` already
- [netlify.toml](netlify.toml) — add build command; switch publish dir
- new: `site.config.mjs`, `build.js`, `src/`, `dist/` (gitignored)

## Verification
1. `node build.js` produces `dist/` with `index.html` reading
   "Sanchit &amp; Riya" in hero names, monogram "S&R",
   `#SanchitKiRiya` as primary hashtag, and the family grid rendering the
   **groom's side on the left** (Grand Parents / Parents of the groom)
   with the bride's side on the right, separated by `.family-divider`.
2. `FROM_GROOM_SIDE=false node build.js` produces bride-first variant:
   "Riya & Sanchit", monogram "R&S", `#RiyaKaSanchit` as primary hashtag,
   and the family grid renders the **bride's side on the left**
   (Grand Parents / Parents of the bride) with the groom's side on the right.
3. `grep -R "Riya\|Sanchit\|Verma\|Dang" dist/index.html dist/manifest.webmanifest`
   → all occurrences match the chosen orientation.
4. Serve `dist/` locally, verify: title bar text, hero animation intact
   (GSAP still animates `.hero-name` / `.hero-amp`), calendar `.ics`
   downloads with correct filename and PRODID, hashtag rotates through
   both tags.
5. Netlify preview deploy with `FROM_GROOM_SIDE` set to `true` and `false`
   in site env to confirm both variants build.
6. Lighthouse/OG debugger: OG title reflects orientation.

## Decisions
- Default when `FROM_GROOM_SIDE` unset: **true** (groom-first). Rationale:
  matches site owner (Sanchit); Netlify env can override.
- Full names appear **only** in the meta description; hero remains
  first-name-only (per user answer).
- Family section is rewritten to the two-column layout with per-side
  Grand Parents + Parents blocks (per updated user spec). The flag
  controls which side renders on the left. CSS already supports this
  layout — no `styles.css` changes needed.
- Family content strings (authored):
  - Groom parents: `Ajay & Geeta Dang`
  - Groom grand-parents: `Lt. Shri Subhash Chander Dang & Mrs. Raj Rani Dang`
  - Bride parents: `Vishal & Renu Verma`
  - Bride grand-parents: `To be announced` (real names not yet known;
    tracked as a `TODO` in `site.config.mjs` — swap in place when
    confirmed, no template edit required).
- Alt text and gallery captions that mention names by hand are left as-is
  (not selected in scope).
- `WEDDING_TS`, `SONGS`, `MAPS`, all images/videos: unchanged.
- Extra parents/grandparents info from the answer is recorded but not
  surfaced on the page (no layout change requested).
- Generated `dist/` is gitignored to prevent drift; Netlify rebuilds on deploy.

## Further Considerations
1. **Alternative: lite in-place mode** — instead of `src/`+`dist/`,
   keep files at root and let `build.js` rewrite `index.html` /
   `manifest.webmanifest` / `js/app/couple.mjs` in place, gitignoring only
   `couple.mjs`. Simpler layout, but noisier `git status` when flipping
   the flag. Option A (src/dist) / Option B (in-place). Recommend A.
2. **Node version guard** — `fs.cpSync` needs Node ≥ 16.7; Netlify default
   is fine. Add an `engines.node` field or an explicit check at top of
   `build.js` to fail fast with a clear message.
3. **Preview flag on live site** — if you ever want to A/B preview both
   orientations without redeploy, we can layer an opt-in
   `?from=bride|groom` runtime override (reads `NAMES` at boot and
   re-writes DOM). Not part of this plan unless requested.
