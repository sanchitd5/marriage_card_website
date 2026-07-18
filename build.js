// Build step for the wedding invitation site.
// Reads FROM_GROOM_SIDE, composes name tokens, renders src/ templates into dist/.
//
// Usage:
//   node build.js                       # groom-first (default)
//   FROM_GROOM_SIDE=false node build.js # bride-first
//
// Requires Node >= 18 (uses fs.cpSync).
//
// Pure helpers (parseFromGroomSide, composeNames, htmlEscape, renderFamilySide,
// buildHtmlTokens, buildManifestTokens, applyTokens) are exported for unit tests.
// The filesystem pipeline runs only when this file is invoked directly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groom, bride, siteUrls, revealDate, wedding, weddingHidden } from './site.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Flag & names composition -----------------------------------------
// FROM_GROOM_SIDE defaults to true; only the literal string 'false' flips it.
export function parseFromGroomSide(rawFlag) {
  return rawFlag === undefined ? true : rawFlag !== 'false';
}

export function composeNames(fromGroomSide, sides = { groom, bride }, sites = siteUrls) {
  const a = fromGroomSide ? sides.groom : sides.bride;
  const b = fromGroomSide ? sides.bride : sides.groom;
  const site = fromGroomSide ? sites.groom : sites.bride;

  const pairTitle = `${a.first} & ${b.first}`;

  return {
    firstA: a.first,
    firstB: b.first,
    fullA: a.full,
    fullB: b.full,
    initialA: a.initial,
    initialB: b.initial,
    surnameA: a.surname,
    surnameB: b.surname,
    tagPrimary: a.hashtag,
    tagSecondary: b.hashtag,
    pairTitle,
    fromGroomSide,
    siteUrl: site,
    sideA: { role: a.role, parents: a.parents, grandparents: a.grandparents },
    sideB: { role: b.role, parents: b.parents, grandparents: b.grandparents },
  };
}

// ---- HTML escaping ----------------------------------------------------
// Values may contain characters that need escaping when interpolated into HTML.
// Ampersands, angle brackets, and quotes are the common cases here.
export function htmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Long "A & B" names read better split at the ampersand onto two balanced
// lines, with the "&" leading the second line. Short names stay on one line.
function formatCouple(raw) {
  const esc = htmlEscape(raw);
  // only break long "A & B" strings; short names stay on one line
  return raw.length > 24 ? esc.replace(/ &amp; /, '<br>&amp; ') : esc;
}

export function renderFamilySide(side) {
  return [
    '<div class="family-side fade-up">',
    `          <p class="family-role">Grand Parents of the ${htmlEscape(side.role)}</p>`,
    `          <h3 class="family-names">${formatCouple(side.grandparents)}</h3>`,
    `          <p class="family-role">Parents of the ${htmlEscape(side.role)}</p>`,
    `          <h3 class="family-names">${formatCouple(side.parents)}</h3>`,
    '        </div>',
  ].join('\n        ');
}

// ---- Tokens for the HTML template -------------------------------------
// FIRST_A / FIRST_B etc. get HTML-escaped when injected.
// PAIR_TITLE keeps the raw '&' so <title> renders "A & B"; where the
// template uses "&amp;", it must remain "&amp;" in the output too.
export function buildHtmlTokens(names, reveal = revealDate) {
  const w = reveal ? wedding : null;
  const h = weddingHidden;
  const ev = w ? w.events : null;
  return {
    // ── Date/venue tokens (gated by revealDate; placeholders when hidden) ──
    // Whole hero date+location line, or a suspense quote when hidden (so
    // neither the date nor the cities are hinted on the hero).
    HERO_LINE: reveal
      ? `${w.heroDate} <span class="hero-date-sep">·</span> <span class="hero-date-location">${w.heroLocation}</span>`
      : `<span class="hero-date-location">${h.heroLine}</span>`,
    TITLE_DATE: reveal ? w.titleDate : h.titleDate,
    MONTH_YEAR: reveal ? w.monthYear : h.monthYear,
    META_LOCATION: reveal ? w.metaLocation : h.metaLocation,
    DATE_RANGE: reveal ? w.dateRange : h.dateRange,
    SCRATCH_DATE: reveal ? w.scratchDate : h.scratchDate,
    SCRATCH_SUB: reveal ? w.scratchSub : h.scratchSub,
    EVENT_HALDI_WHEN: reveal ? ev.haldi.when : h.eventWhen,
    EVENT_HALDI_DT: reveal ? ev.haldi.datetime : '',
    EVENT_HALDI_VENUE: reveal ? htmlEscape(ev.haldi.venue) : h.eventVenue,
    EVENT_HALDI_MAP: reveal ? ev.haldi.map : '',
    EVENT_COCKTAIL_WHEN: reveal ? ev.cocktail.when : h.eventWhen,
    EVENT_COCKTAIL_DT: reveal ? ev.cocktail.datetime : '',
    EVENT_COCKTAIL_VENUE: reveal ? htmlEscape(ev.cocktail.venue) : h.eventVenue,
    EVENT_COCKTAIL_MAP: reveal ? ev.cocktail.map : '',
    EVENT_WEDDING_WHEN: reveal ? ev.wedding.when : h.eventWhen,
    EVENT_WEDDING_DT: reveal ? ev.wedding.datetime : '',
    EVENT_WEDDING_VENUE: reveal ? htmlEscape(ev.wedding.venue) : h.eventVenue,
    EVENT_WEDDING_MAP: reveal ? ev.wedding.map : '',
    // shown-only-when-revealed / shown-only-when-hidden attribute switches
    REVEAL_ONLY: reveal ? '' : 'hidden',
    SECRET_ONLY: reveal ? 'hidden' : '',
    FIRST_A: htmlEscape(names.firstA),
    FIRST_B: htmlEscape(names.firstB),
    FULL_A: htmlEscape(names.fullA),
    FULL_B: htmlEscape(names.fullB),
    INITIAL_A: htmlEscape(names.initialA),
    INITIAL_B: htmlEscape(names.initialB),
    TAG_PRIMARY: htmlEscape(names.tagPrimary),
    TAG_SECONDARY: htmlEscape(names.tagSecondary),
    HASHTAG: htmlEscape(names.tagPrimary),
    PAIR_TITLE: htmlEscape(names.pairTitle),
    PAIR_TITLE_RAW: names.pairTitle, // for meta content where "&" is fine
    FAMILY_SIDE_A: renderFamilySide(names.sideA),
    FAMILY_SIDE_B: renderFamilySide(names.sideB),
    SITE_URL: htmlEscape(names.siteUrl),
    // Per-side social share card (name order differs); see gen-share-cards.mjs.
    SHARE_IMG: names.fromGroomSide ? 'invitation-card-share.jpg' : 'invitation-card-share-bride.jpg',
  };
}

// ---- Manifest tokens (JSON, only need raw values) ---------------------
export function buildManifestTokens(names) {
  return {
    PAIR_TITLE: names.pairTitle,
  };
}

// ---- Utilities --------------------------------------------------------
export function applyTokens(source, tokens) {
  let out = source;
  for (const [key, value] of Object.entries(tokens)) {
    // Function replacer so literal '$' sequences in values aren't treated
    // as replacement patterns ($&, $1, etc.).
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), () => value);
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---- Pipeline ---------------------------------------------------------
// Runs the full render only when build.js is invoked directly. Importing the
// module (e.g. from tests) loads the pure helpers above with no side effects.
function runBuild() {
  // Node version guard
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (Number.isNaN(nodeMajor) || nodeMajor < 18) {
    console.error(`build.js requires Node >= 18 (found ${process.versions.node}).`);
    process.exit(1);
  }

  const fromGroomSide = parseFromGroomSide(process.env.FROM_GROOM_SIDE);
  const names = composeNames(fromGroomSide);
  const htmlTokens = buildHtmlTokens(names);
  const manifestTokens = buildManifestTokens(names);

  const root = __dirname;
  const dist = path.join(root, 'dist');
  const srcDir = path.join(root, 'src');

  console.log(`build: FROM_GROOM_SIDE=${fromGroomSide} → pairTitle="${names.pairTitle}"`);

  // Wipe & recreate dist/
  fs.rmSync(dist, { recursive: true, force: true });
  ensureDir(dist);

  // Copy static trees verbatim into dist/. couple_images/ and inspiration/ are
  // gitignored source-only drops (web copies live in assets/photos/), so they
  // are intentionally excluded from the published build.
  const staticTrees = ['css', 'js', 'assets'];
  // Skip gitignored subpaths (raw AI generations live in assets/images/gen/).
  const copyFilter = (src) => !src.split(path.sep).includes('gen');
  for (const dir of staticTrees) {
    const from = path.join(root, dir);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dist, dir), { recursive: true, filter: copyFilter });
  }

  // Render index.html
  const htmlTemplate = fs.readFileSync(path.join(srcDir, 'index.template.html'), 'utf8');
  fs.writeFileSync(path.join(dist, 'index.html'), applyTokens(htmlTemplate, htmlTokens));

  // Render manifest.webmanifest
  const manifestTemplate = fs.readFileSync(
    path.join(srcDir, 'manifest.template.webmanifest'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dist, 'manifest.webmanifest'),
    applyTokens(manifestTemplate, manifestTokens),
  );

  // Discover the music pool from assets/audio/theme-N.mp3 (sorted numerically),
  // so adding/removing a track needs no code change — just drop the file in.
  const audioDir = path.join(root, 'assets', 'audio');
  const songs = fs.existsSync(audioDir)
    ? fs.readdirSync(audioDir)
        .map((f) => /^(theme-(\d+))\.mp3$/.exec(f))
        .filter(Boolean)
        .sort((a, b) => Number(a[2]) - Number(b[2]))
        .map((m) => m[1])
    : [];
  console.log(`build: discovered ${songs.length} music track(s)`);

  // Emit dist/js/app/couple.mjs (build-generated, imported by config.js/ui.js).
  // Date fields are emitted ONLY when revealDate is true, so the shipped JS
  // never contains the wedding date/times while hidden.
  const eventDates = revealDate
    ? Object.fromEntries(
        Object.entries(wedding.events).map(([k, v]) => [k, { start: v.start, end: v.end }]),
      )
    : null;
  // Venue name + map link are venue-identifying — emit only when revealed, so
  // the shipped config.js (copied verbatim) never contains them while hidden.
  const eventVenues = revealDate
    ? Object.fromEntries(
        Object.entries(wedding.events).map(([k, v]) => [k, { location: v.venue, map: v.map }]),
      )
    : null;
  const coupleModule = [
    '// Auto-generated by build.js. Do not edit — regenerate via `node build.js`.',
    'export const NAMES = ' + JSON.stringify(names, null, 2) + ';',
    'export const SONGS = ' + JSON.stringify(songs) + ';',
    'export const REVEAL_DATE = ' + JSON.stringify(revealDate) + ';',
    'export const WEDDING_TS = ' + (revealDate ? 'Date.UTC(' + wedding.weddingTsUTC.join(', ') + ')' : 'null') + ';',
    'export const EVENT_DATES = ' + JSON.stringify(eventDates) + ';',
    'export const EVENT_VENUES = ' + JSON.stringify(eventVenues) + ';',
    '',
  ].join('\n');
  const coupleOut = path.join(dist, 'js', 'app', 'couple.mjs');
  ensureDir(path.dirname(coupleOut));
  fs.writeFileSync(coupleOut, coupleModule);

  // Also emit the couple module at the root js/app/ path so local dev without
  // a build step (e.g. serving from repo root) still resolves the import.
  // This file is gitignored to avoid churn when the flag flips.
  const coupleRoot = path.join(root, 'js', 'app', 'couple.mjs');
  fs.writeFileSync(coupleRoot, coupleModule);

  console.log(`build: wrote dist/ (${staticTrees.join(', ')}, index.html, manifest.webmanifest, js/app/couple.mjs)`);
}

// Run the pipeline only when invoked directly (`node build.js`), not on import.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) runBuild();
