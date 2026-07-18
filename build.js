// Build step for the wedding invitation site.
// Reads FROM_GROOM_SIDE, composes name tokens, renders src/ templates into dist/.
//
// Usage:
//   node build.js                       # groom-first (default)
//   FROM_GROOM_SIDE=false node build.js # bride-first
//
// Requires Node >= 18 (uses fs.cpSync).
//
// Pure helpers (parseFromGroomSide, composeNames, htmlEscape, joinFamilies,
// buildFamilyBlessing, buildHtmlTokens, buildManifestTokens, applyTokens) are
// exported for unit tests.
// The filesystem pipeline runs only when this file is invoked directly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groom, bride, siteUrls, revealDate, wedding, weddingHidden, gallery, coupleRevealOffsetHours } from './site.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Flag & names composition -----------------------------------------
// FROM_GROOM_SIDE defaults to true; only the literal string 'false' flips it.
export function parseFromGroomSide(rawFlag) {
  return rawFlag === undefined ? true : rawFlag !== 'false';
}

// ---- Theme flag (visual skin) -----------------------------------------
// WEDDING_THEME selects the visual skin, mirroring FROM_GROOM_SIDE. Default
// 'regency' (the original Bridgerton build); only the literal 'techno' opts
// into the friends-facing techno skin. Kept a pure helper so both the pipeline
// and unit tests read the same value. The theme picks a template + stylesheet
// and, for techno, drops the Regency video tree (rendered scene replaces it).
export function parseTheme(rawFlag) {
  return rawFlag === 'techno' ? 'techno' : 'regency';
}

// ---- Couple-photo reveal gate -----------------------------------------
// Gallery photos of the couple stay hidden until `coupleRevealOffsetHours`
// after the wedding start, computed from the build clock so the first deploy
// at/after that moment reveals them. REVEAL_COUPLE=true|false forces it.
export const COUPLE_REVEAL_OFFSET_MS = (coupleRevealOffsetHours || 0) * 60 * 60 * 1000;

// Reveal moment (epoch-ms) for the couple photos: weddingTs + offset. The
// "is it time yet?" check happens at RUNTIME in the browser against
// authoritative server time (js/app/time.js + gallery.js), so the gallery
// self-reveals with no redeploy. Special values: `0` = reveal immediately,
// `null` = stay hidden (REVEAL_COUPLE=false, or a fail-safe on a bad timestamp).
export function computeCoupleRevealTs(weddingTsUTC, env = process.env.REVEAL_COUPLE) {
  if (env === 'true') return 0;
  if (env === 'false') return null;
  if (!Array.isArray(weddingTsUTC) || weddingTsUTC.length < 6) return null;
  return Date.UTC(...weddingTsUTC) + COUPLE_REVEAL_OFFSET_MS;
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
    sideA: { role: a.role, families: a.families },
    sideB: { role: b.role, families: b.families },
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

// "With the blessings of our elders" — the family surnames are embedded in a
// single declarative union line, not a bare list: "In the joining of {PRIMARY}
// and {OTHER}, two houses become one." Works for 1..n surnames on the FROM side
// plus one on the other, and flips with FROM_GROOM_SIDE. See CLAUDE.md.
//
// Each `families` entry is one of:
//   'Dang'              -> surname
//   { name, relation }  -> surname (relation unused in prose)
//   { tbd: true }       -> not-yet-confirmed placeholder -> SKIPPED in the prose
//
// Extract real surnames (drops tbd/empty). `limit` caps how many (the OTHER
// side lists only its primary surname).
function familyNames(families, { limit } = {}) {
  let list = (Array.isArray(families) ? families : [])
    .map((f) => (typeof f === 'string' ? f : f && !f.tbd && f.name ? f.name : null))
    .filter((n) => n && String(n).trim());
  if (typeof limit === 'number') list = list.slice(0, limit);
  return list;
}
// Join surnames into an article phrase, en-GB ampersand grammar (NO Oxford comma
// before "&"): 1 -> "the Dang family"; n -> "the Dang, Bhalla, Arora &amp; Batra
// families". Surnames wrapped in <span class="fq-fam"> so the upright names stand
// out inside the italic quote. Returns null when there are no names.
export function joinFamilies(families, opts) {
  const esc = familyNames(families, opts).map(htmlEscape);
  if (!esc.length) return null;
  const joined = esc.length === 1 ? esc[0] : `${esc.slice(0, -1).join(', ')} &amp; ${esc[esc.length - 1]}`;
  const noun = esc.length === 1 ? 'family' : 'families';
  // nbsp binds the article to the surnames so "the" never strands at a line end
  return `the <span class="fq-fam">${joined}</span> ${noun}`;
}

// The union line. PRIMARY = FROM-side (all its families), OTHER = other side
// (primary surname only). No numeral and no "houses": the FROM side can name many
// surnames, so a "two houses become one" count would contradict the visible list.
// "united in love" is count-safe for 1..n and side-agnostic (flips for free).
// Deliberate punctuation: "&" WITHIN a side, spelled "and" BETWEEN the two sides.
// That disambiguates which names belong to which family; do not "fix" it to match.
export function buildFamilyBlessing(sideA, sideB) {
  const primary = joinFamilies(sideA && sideA.families);
  const other = joinFamilies(sideB && sideB.families, { limit: 1 });
  // No terminal period: an unpunctuated flourish, matching the kicker and the
  // closing "Your presence is the only gift we seek" line.
  const s = primary && other ? `${primary} and ${other}, united in love` : 'Two families, united in love';
  return s.charAt(0).toUpperCase() + s.slice(1); // "the …" → "The …"
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
    FAMILY_BLESSING_NAMES: buildFamilyBlessing(names.sideA, names.sideB),
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
  const theme = parseTheme(process.env.WEDDING_THEME);
  const names = composeNames(fromGroomSide);
  const htmlTokens = buildHtmlTokens(names);
  const manifestTokens = buildManifestTokens(names);

  // Couple-photo gate: the photos always ship; the browser reveals the gallery
  // at this moment using authoritative server time (no redeploy needed).
  // REVEAL_COUPLE=true|false forces reveal-now / stay-hidden.
  const coupleRevealTs = computeCoupleRevealTs(wedding.weddingTsUTC);

  const root = __dirname;
  const dist = path.join(root, 'dist');
  const srcDir = path.join(root, 'src');

  console.log(`build: WEDDING_THEME=${theme} FROM_GROOM_SIDE=${fromGroomSide} → pairTitle="${names.pairTitle}"`);
  const tsDesc = coupleRevealTs === 0 ? 'immediately' : coupleRevealTs == null ? 'never (hidden)' : new Date(coupleRevealTs).toISOString();
  console.log(`build: couple photos ship; browser reveals gallery at ${tsDesc} (runtime server-time check)`);

  // Wipe & recreate dist/
  fs.rmSync(dist, { recursive: true, force: true });
  ensureDir(dist);

  // Copy static trees verbatim into dist/. couple_images/ and inspiration/ are
  // gitignored source-only drops (web copies live in assets/photos/), so they
  // are intentionally excluded from the published build.
  const staticTrees = ['css', 'js', 'assets'];
  // Skip gitignored subpaths (raw AI generations live in assets/images/gen/).
  // The techno skin renders its backdrop scene instead of shipping video, so it
  // drops the whole Regency assets/videos/ tree (LOCKED: no palace footage in
  // the techno build). A techno Path-B plate, when added, lives outside videos/.
  const copyFilter = (src) => {
    const parts = src.split(path.sep);
    if (parts.includes('gen')) return false;
    if (theme === 'techno') {
      // No Regency palace footage in the techno build (LOCKED).
      if (parts.includes('videos')) return false;
      // Ship only the techno playlist (assets/audio/techno/*), not the Regency
      // top-level tracks (assets/audio/theme-N.mp3).
      const ai = parts.indexOf('audio');
      if (ai !== -1 && parts.length === ai + 2 && /^theme-\d+\.mp3$/.test(parts[ai + 1])) return false;
    }
    return true;
  };
  for (const dir of staticTrees) {
    const from = path.join(root, dir);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dist, dir), { recursive: true, filter: copyFilter });
  }

  // Render index.html (theme picks the template; techno uses its own skin).
  const templateFile = theme === 'techno' ? 'index.techno.template.html' : 'index.template.html';
  const htmlTemplate = fs.readFileSync(path.join(srcDir, templateFile), 'utf8');
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
  // The techno skin has its OWN playlist under assets/audio/techno/; names are
  // emitted with the `techno/` prefix so ui.js's `assets/audio/${name}.mp3`
  // resolves. Regency keeps the top-level tracks.
  const songPrefix = theme === 'techno' ? 'techno/' : '';
  const audioDir = theme === 'techno'
    ? path.join(root, 'assets', 'audio', 'techno')
    : path.join(root, 'assets', 'audio');
  const songs = fs.existsSync(audioDir)
    ? fs.readdirSync(audioDir)
        .map((f) => /^(theme-(\d+))\.mp3$/.exec(f))
        .filter(Boolean)
        .sort((a, b) => Number(a[2]) - Number(b[2]))
        .map((m) => songPrefix + m[1])
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
    'export const COUPLE_REVEAL_TS = ' + JSON.stringify(coupleRevealTs) + ';',
    'export const GALLERY = ' + JSON.stringify(gallery) + ';',
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
