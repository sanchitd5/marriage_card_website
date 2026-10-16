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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  groom,
  bride,
  siteUrls,
  revealDate,
  wedding,
  weddingHidden,
  gallery,
  coupleRevealOffsetHours,
  outfitRevealOffsetHours,
} from "./site.config.mjs";
import {
  EVENT_DEFS,
  eventsForInvite,
  isEventForSide,
  splitProgramme,
  resolveVariant,
  DEFAULT_VARIANT,
} from "./events.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Flag & names composition -----------------------------------------
// FROM_GROOM_SIDE defaults to true; only the literal string 'false' flips it.
export function parseFromGroomSide(rawFlag) {
  return rawFlag === undefined ? true : rawFlag !== "false";
}

// ---- Theme flag (visual skin) -----------------------------------------
// WEDDING_THEME selects the visual skin, mirroring FROM_GROOM_SIDE. Default
// 'regency' (the original Bridgerton build); 'techno' opts into the
// friends-facing techno skin, and 'kinetic' is a techno-based variant that
// reuses every techno asset (audio playlist, 3D scene, obsidian colours, no
// Regency video) and differs ONLY in which HTML template it renders. Kept a
// pure helper so both the pipeline and unit tests read the same value.
export function parseTheme(rawFlag) {
  if (rawFlag === "kinetic") return "kinetic";
  if (rawFlag === "techno") return "techno";
  return "regency";
}

// Techno-based themes share ALL asset/plumbing decisions (techno audio, 3D
// scene, obsidian manifest colours, dropped Regency video); they differ only
// in the HTML template rendered. Use this everywhere an asset choice hinges on
// "is this a techno build?" so 'kinetic' tracks 'techno' automatically.
export function isTechnoBased(theme) {
  return theme === "techno" || theme === "kinetic";
}

// ---- Couple-photo reveal gate -----------------------------------------
// Gallery photos of the couple stay hidden until `coupleRevealOffsetHours`
// after the wedding start, computed from the build clock so the first deploy
// at/after that moment reveals them. REVEAL_COUPLE=true|false forces it.
export const COUPLE_REVEAL_OFFSET_MS =
  (coupleRevealOffsetHours || 0) * 60 * 60 * 1000;

// Reveal moment (epoch-ms) for the couple photos: weddingTs + offset. The
// "is it time yet?" check happens at RUNTIME in the browser against
// authoritative server time (js/app/time.js + gallery.js), so the gallery
// self-reveals with no redeploy. Special values: `0` = reveal immediately,
// `null` = stay hidden (REVEAL_COUPLE=false, or a fail-safe on a bad timestamp).
export function computeRevealTs(weddingTsUTC, offsetMs, env) {
  if (env === "true") return 0;
  if (env === "false") return null;
  if (!Array.isArray(weddingTsUTC) || weddingTsUTC.length < 6) return null;
  return Date.UTC(...weddingTsUTC) + offsetMs;
}

export function computeCoupleRevealTs(
  weddingTsUTC,
  env = process.env.REVEAL_COUPLE,
) {
  return computeRevealTs(weddingTsUTC, COUPLE_REVEAL_OFFSET_MS, env);
}

// Outfit veil: art-couple-veiled-v2.jpg (from FINAL couple-mughal-1) until weddingTs + outfitRevealOffsetHours,
// then art-couple-true.jpg (same runtime server-time check). REVEAL_OUTFIT forces.
export const OUTFIT_REVEAL_OFFSET_MS =
  (outfitRevealOffsetHours || 0) * 60 * 60 * 1000;
export function computeOutfitRevealTs(
  weddingTsUTC,
  env = process.env.REVEAL_OUTFIT,
) {
  return computeRevealTs(weddingTsUTC, OUTFIT_REVEAL_OFFSET_MS, env);
}

export function composeNames(
  fromGroomSide,
  sides = { groom, bride },
  sites = siteUrls,
) {
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Long "A & B" names read better split at the ampersand onto two balanced
// lines, with the "&" leading the second line. Short names stay on one line.
function formatCouple(raw) {
  const esc = htmlEscape(raw);
  // only break long "A & B" strings; short names stay on one line
  return raw.length > 24 ? esc.replace(/ &amp; /, "<br>&amp; ") : esc;
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
    .map((f) =>
      typeof f === "string" ? f : f && !f.tbd && f.name ? f.name : null,
    )
    .filter((n) => n && String(n).trim());
  if (typeof limit === "number") list = list.slice(0, limit);
  return list;
}
// Join surnames into an article phrase, en-GB ampersand grammar (NO Oxford comma
// before "&"): 1 -> "the Dang family"; n -> "the Dang, Bhalla, Arora &amp; Batra
// families". Surnames wrapped in <span class="fq-fam"> so the upright names stand
// out inside the italic quote. Returns null when there are no names.
export function joinFamilies(families, opts) {
  const esc = familyNames(families, opts).map(htmlEscape);
  if (!esc.length) return null;
  const joined =
    esc.length === 1
      ? esc[0]
      : `${esc.slice(0, -1).join(", ")} &amp; ${esc[esc.length - 1]}`;
  const noun = esc.length === 1 ? "family" : "families";
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
  // No terminal period: an unpunctuated flourish, matching the kicker.
  const s =
    primary && other
      ? `${primary} and ${other}, united in love`
      : "Two families, united in love";
  return s.charAt(0).toUpperCase() + s.slice(1); // "the …" → "The …"
}

// Hero host line: ONLY each side's primary (first) surname, e.g. "The Dang and
// Verma families". Short enough for the hero at 390px; the full list of
// families lives in the blessings section. Flips with FROM_GROOM_SIDE because
// sideA/sideB do. Falls back to the neutral phrase when a side has no name.
export function buildFamilyHosts(sideA, sideB) {
  const a = familyNames(sideA && sideA.families, { limit: 1 }).map(htmlEscape)[0];
  const b = familyNames(sideB && sideB.families, { limit: 1 }).map(htmlEscape)[0];
  if (!a || !b) return "Two families";
  return `The <span class="fq-fam">${a}</span> and <span class="fq-fam">${b}</span> families`;
}

// REVEAL_DATE=true|false overrides site.config's `revealDate` for one build,
// mirroring how REVEAL_COUPLE overrides the couple-photo gate. This exists so a
// review/QA harness can render every gate permutation without editing config
// (and therefore without any risk of committing a flipped gate by accident).
// Anything other than the two literal strings falls through to the config value.
export function resolveRevealDate(
  env = process.env.REVEAL_DATE,
  fallback = revealDate,
) {
  if (env === "true") return true;
  if (env === "false") return false;
  return fallback;
}

// ---- Run of show ------------------------------------------------------
// Renders the event cards from events.config.mjs instead of three hardcoded
// blocks per template. The programme is now variable-length (each side hosts
// its own functions) and variant-dependent (a guest sees only what they are
// invited to), so neither template can carry a fixed list.
//
// Gated fields (when / datetime / venue / map) are looked up from
// site.config.mjs's `wedding.events` and emitted ONLY when reveal is true —
// same leak-proofing rule as every other date token. Events with no entry there
// yet simply render the hidden placeholders.
// Calendar data for one event, or null when there is nothing to add.
// Timed (gated `start`/`end`, UTC basic format) wins; otherwise a def with only
// a `date` (YYYY-MM-DD) yields an all-day entry (DTEND is exclusive: next day).
export function eventCalendar(def, g) {
  if (g && g.start) return { start: g.start, end: g.end };
  const m = def && /^(\d{4})-(\d{2})-(\d{2})$/.exec(def.date || "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1));
  const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, "");
  return { start: m[1] + m[2] + m[3], end: ymd(d), allDay: true };
}

// "2026-12-12" -> "Saturday, 12 December 2026" (UTC so the host TZ cannot shift it)
function fmtDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return isNaN(d)
    ? ymd
    : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).replace(/^(\w+) /, "$1, ");
}


// Small gilt motif per event, same ornament language as the hashiya border:
// hairline gold strokes with one filled accent. Keyed by event id.
const EVENT_MOTIFS = {
  chowki: '<path d="M24 4c3 4 3 7 0 10-3-3-3-6 0-10z" fill="currentColor" stroke="none"/><path d="M24 14v3M10 22c0 6 6 10 14 10s14-4 14-10zM8 22h32M18 38h12M24 32v6"/><path d="M14 18c-2 2-2 4 0 6M34 18c2 2 2 4 0 6" stroke-width=".8"/>',
  haldi: '<circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/><g transform="translate(24 24)"><ellipse cy="-11" rx="4" ry="7"/><ellipse cy="-11" rx="4" ry="7" transform="rotate(45)"/><ellipse cy="-11" rx="4" ry="7" transform="rotate(90)"/><ellipse cy="-11" rx="4" ry="7" transform="rotate(135)"/><ellipse cy="-11" rx="4" ry="7" transform="rotate(180)"/><ellipse cy="-11" rx="4" ry="7" transform="rotate(225)"/><ellipse cy="-11" rx="4" ry="7" transform="rotate(270)"/><ellipse cy="-11" rx="4" ry="7" transform="rotate(315)"/></g>',
  cocktail: '<path d="M24 3v6M18 9h12M19 9c-5 4-6 12-3 20h16c3-8 2-16-3-20M16 29h16l-2 5H18zM24 34v4"/><circle cx="24" cy="41" r="2.4" fill="currentColor" stroke="none"/><path d="M20 15c-1 5-1 9 0 14M28 15c1 5 1 9 0 14M24 12v17"/>',
  baraat: '<ellipse cx="24" cy="12" rx="13" ry="4"/><path d="M11 12c-2 8-2 16 0 24M37 12c2 8 2 16 0 24"/><ellipse cx="24" cy="36" rx="13" ry="4"/><path d="M11 14l6 20M17 15l7 20M24 16l7 19M31 15l6 19M37 13l-6 22M31 15l-7 20M24 16l-7 19M17 15l-6 20" stroke-width=".8"/><path d="M5 5l11 8M43 5L32 13" /><circle cx="5" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="43" cy="5" r="1.6" fill="currentColor" stroke="none"/>',
  mehndi: '<path d="M24 4c12 8 15 22 6 33-3 4-8 6-12 5 8-9 9-20 6-38z"/><path d="M24 10c-4 10-5 20 0 30"/><path d="M26 14c3 3 4 6 4 9M25 22c3 3 4 6 3 10" stroke-width=".8"/><circle cx="14" cy="38" r="1.8" fill="currentColor" stroke="none"/><circle cx="10" cy="31" r="1.2" fill="currentColor" stroke="none"/><circle cx="36" cy="10" r="1.2" fill="currentColor" stroke="none"/>',
  wedding: '<path d="M17 20c-5 4-6 12-3 18 1 3 3 5 6 5h8c3 0 5-2 6-5 3-6 2-14-3-18M16 20h16M19 16h10v4H19z"/><circle cx="24" cy="9" r="4.5" fill="currentColor" stroke="none"/><path d="M24 14c-8 0-14-3-16-8 6-1 12 2 16 8zM24 14c8 0 14-3 16-8-6-1-12 2-16 8zM24 14c-3-3-4-6-2-9M24 14c3-3 4-6 2-9" stroke-width="1"/><path d="M17 30h14M16 35h16" stroke-width=".9"/>',
};
const IC_PIN = '<svg class="ev-ic" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true" focusable="false"><path d="M8 14.5s4.5-4.2 4.5-8A4.5 4.5 0 0 0 3.5 6.5c0 3.8 4.5 8 4.5 8z"/><circle cx="8" cy="6.5" r="1.6"/></svg>';
const IC_CAL = '<svg class="ev-ic" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true" focusable="false"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>';
function eventMotif(id) {
  const body = EVENT_MOTIFS[id];
  return body
    ? `<svg class="event-motif" viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
    : "";
}

export function buildEventCards(
  names,
  reveal = revealDate,
  fromGroomSide = true,
  variant = DEFAULT_VARIANT,
) {
  const h = weddingHidden;
  const gated = reveal && wedding && wedding.events ? wedding.events : null;
  const list = eventsForInvite(variant, fromGroomSide);
  let n = 0; // numbering counts the main programme only; the prelude is unnumbered
  return list
    .map((ev) => {
      const g = gated ? gated[ev.id] : null;
      const dt = g ? g.datetime : "";
      const map = g ? g.map : "";
      // While gated, the cards carry NO date/venue lines at all. Repeating
      // "Date & time to be announced / Venue to be announced" once per card was
      // six grey lines at three events and is ten at five — the gate ends up
      // dominating the act and reading as an unpopulated CMS. The programme states
      // it ONCE, above the list (EVENT_GATE_NOTE), and each card keeps only what is
      // actually known: its name, its dress code, and any standing venue note.
      // Revealed build: every card carries the same date / venue / dress rows. An
      // event with no gated entry (Mehndi, Baraat) gets a graceful "to follow"
      // line instead of a hole. Hidden build keeps the single programme-level note.
      const whenLine = g
        ? `<p class="event-when"><time datetime="${dt}">${g.when.split(" · ").map((x, k) => `<span class="ev-${k ? "t" : "d"}">${htmlEscape(x).replace(/(\d+) o&#39;clock/, "$1&nbsp;o&#39;clock")}</span>`).join("")}</time></p>`
        : reveal
          ? `<p class="event-when event-when--tbc">${ev.date ? `<span class="ev-d">${htmlEscape(fmtDay(ev.date))}</span><span class="ev-t">Time to follow</span>` : `<span class="ev-d">Date to follow</span><span class="ev-t">Time to follow</span>`}</p>`
          : "";
      // A revealed event can have a time before its venue is confirmed (Baraat):
      // fall through to the note / "Venue to follow" instead of "undefined".
      const venueText = g && g.venue
        ? htmlEscape(g.venue)
        : ev.venueNote
          ? htmlEscape(ev.venueNote)
          : reveal
            ? "Venue to follow"
            : "";
      const venueLine = venueText
        ? `<p class="event-venue">${venueText}</p>`
        : "";
      // No date at all (reveal gated, or e.g. Mehndi) -> no button rendered.
      const cal =
        reveal && eventCalendar(ev, g) ? `<button class="btn-quiet" data-ics="${ev.id}">${IC_CAL}<span>Add to calendar</span></button>` : "";
      const isPre = !!ev.prelude;
      const no = isPre ? "" : String(++n).padStart(2, "0");
      const noLine = isPre
        ? `<p class="event-no event-no--prelude">Evening of devotion</p><p class="event-jai" lang="hi">जय माता दी</p>`
        : `<p class="event-no">${no}</p>`;
      const noteLine = g && g.note ? `<p class="event-note">${htmlEscape(g.note)}</p>` : "";
      const addrLine = g && g.address ? `<p class="event-addr">${htmlEscape(g.address)}</p>` : "";
      const directions = g && map
        ? `<a class="btn-quiet" href="${map}" target="_blank" rel="noopener">${IC_PIN}<span>Get directions</span></a>`
        : "";
      // The headliner keeps its highlighted treatment: all three skins style
      // .event-card--main (gold frame / accent tick), driven by the def flag.
      const cls = (ev.headliner ? "event-card event-card--main" : "event-card") + (isPre ? " event-card--prelude" : "");
      const actions = directions || cal ? `${directions}\n                ${cal}` : `<span class="event-pending">Details to follow</span>`;
      return `<article class="${cls}" data-tilt data-magnetic>
              ${eventMotif(ev.id)}
              ${noLine}
              <h3 class="event-name">${htmlEscape(ev.name)}</h3>
              ${whenLine}
              ${noteLine}
              ${venueLine}
              ${addrLine}
              <p class="event-dress"><span>Dress code</span> ${htmlEscape(ev.dress)}</p>
              <div class="event-actions${directions || cal ? "" : " event-actions--pending"}">
                ${actions}
              </div>
            </article>`;
    })
    .join("\n\n            ");
}

// ---- Tokens for the HTML template -------------------------------------
// FIRST_A / FIRST_B etc. get HTML-escaped when injected.
// PAIR_TITLE keeps the raw '&' so <title> renders "A & B"; where the
// template uses "&amp;", it must remain "&amp;" in the output too.
export function buildHtmlTokens(
  names,
  reveal = revealDate,
  theme = "regency",
  fromGroomSide = true,
  variant = DEFAULT_VARIANT,
) {
  const w = reveal ? wedding : null;
  const h = weddingHidden;
  const ev = w ? w.events : null;
  return {
    // ── Date/venue tokens (gated by revealDate; placeholders when hidden) ──
    // Whole hero date+location line, or a suspense quote when hidden (so
    // neither the date nor the cities are hinted on the hero).
    HERO_LINE: reveal
      ? `${w.heroDate} <span class="hero-date-sep">·</span> <span class="hero-date-location">${w.heroLocation}</span>`
      : // site.config.mjs is shared by both builds, so the suspense line is
        // per-skin: the kinetic hero shows a total solar eclipse and its line names
        // that, which would be meaningless on the Regency hero. Falls back to the
        // neutral line if the kinetic variant is absent.
        `<span class="hero-date-location">${theme === "kinetic" ? h.heroLineKinetic || h.heroLine : h.heroLine}</span>`,
    TITLE_DATE: reveal ? w.titleDate : h.titleDate,
    MONTH_YEAR: reveal ? w.monthYear : h.monthYear,
    META_LOCATION: reveal ? w.metaLocation : h.metaLocation,
    DATE_RANGE: reveal ? w.dateRange : h.dateRange,
    SCRATCH_DATE: reveal ? w.scratchDate : h.scratchDate,
    SCRATCH_SUB: reveal ? w.scratchSub : h.scratchSub,
    EVENT_CARDS: buildEventCards(names, reveal, fromGroomSide, variant),
    EVENT_GATE_NOTE: reveal
      ? ""
      : "All dates and venues drop together. You will get them here first.",
    EVENT_HALDI_WHEN: reveal ? ev.haldi.when : h.eventWhen,
    EVENT_HALDI_DT: reveal ? ev.haldi.datetime : "",
    EVENT_HALDI_VENUE: reveal ? htmlEscape(ev.haldi.venue) : h.eventVenue,
    EVENT_HALDI_MAP: reveal ? ev.haldi.map : "",
    EVENT_COCKTAIL_WHEN: reveal ? ev.cocktail.when : h.eventWhen,
    EVENT_COCKTAIL_DT: reveal ? ev.cocktail.datetime : "",
    EVENT_COCKTAIL_VENUE: reveal ? htmlEscape(ev.cocktail.venue) : h.eventVenue,
    EVENT_COCKTAIL_MAP: reveal ? ev.cocktail.map : "",
    EVENT_WEDDING_WHEN: reveal ? ev.wedding.when : h.eventWhen,
    EVENT_WEDDING_DT: reveal ? ev.wedding.datetime : "",
    EVENT_WEDDING_VENUE: reveal ? htmlEscape(ev.wedding.venue) : h.eventVenue,
    EVENT_WEDDING_MAP: reveal ? ev.wedding.map : "",
    // shown-only-when-revealed / shown-only-when-hidden attribute switches
    REVEAL_ONLY: reveal ? "" : "hidden",
    SECRET_ONLY: reveal ? "hidden" : "",
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
    FAMILY_HOSTS: buildFamilyHosts(names.sideA, names.sideB),
    SITE_URL: htmlEscape(names.siteUrl),
    // Per-side social share card (name order differs); see gen-share-cards.mjs.
    SHARE_IMG: names.fromGroomSide
      ? "invitation-card-share.jpg"
      : "invitation-card-share-bride.jpg",
  };
}

// ---- Manifest tokens (JSON, only need raw values) ---------------------
export function buildManifestTokens(names, theme) {
  return {
    PAIR_TITLE: names.pairTitle,
    MANIFEST_THEME_COLOR: isTechnoBased(theme) ? "#0b0c0f" : "#f7f4ee",
    MANIFEST_BG_COLOR: isTechnoBased(theme) ? "#0b0c0f" : "#f7f4ee",
  };
}

// ---- Utilities --------------------------------------------------------
export function applyTokens(source, tokens) {
  let out = source;
  for (const [key, value] of Object.entries(tokens)) {
    // Function replacer so literal '$' sequences in values aren't treated
    // as replacement patterns ($&, $1, etc.).
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), () => value);
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
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (Number.isNaN(nodeMajor) || nodeMajor < 18) {
    console.error(
      `build.js requires Node >= 18 (found ${process.versions.node}).`,
    );
    process.exit(1);
  }

  const fromGroomSide = parseFromGroomSide(process.env.FROM_GROOM_SIDE);
  const theme = parseTheme(process.env.WEDDING_THEME);
  const names = composeNames(fromGroomSide);
  // WEDDING_INVITE selects which events the card shows (see events.config.mjs).
  const variant = resolveVariant(process.env.WEDDING_INVITE).id;
  const reveal = resolveRevealDate();
  const htmlTokens = buildHtmlTokens(
    names,
    reveal,
    theme,
    fromGroomSide,
    variant,
  );
  console.log(
    `build: WEDDING_INVITE=${variant} → ${eventsForInvite(variant, fromGroomSide).length} event(s)`,
  );
  const manifestTokens = buildManifestTokens(names, theme);

  // Couple-photo gate: the photos always ship; the browser reveals the gallery
  // at this moment using authoritative server time (no redeploy needed).
  // REVEAL_COUPLE=true|false forces reveal-now / stay-hidden.
  const coupleRevealTs = computeCoupleRevealTs(wedding.weddingTsUTC);
  const outfitRevealTs = computeOutfitRevealTs(wedding.weddingTsUTC);

  const root = __dirname;
  const dist = path.join(root, "dist");
  const srcDir = path.join(root, "src");

  console.log(
    `build: WEDDING_THEME=${theme} FROM_GROOM_SIDE=${fromGroomSide} → pairTitle="${names.pairTitle}"`,
  );
  const tsDesc =
    coupleRevealTs === 0
      ? "immediately"
      : coupleRevealTs == null
        ? "never (hidden)"
        : new Date(coupleRevealTs).toISOString();
  console.log(
    `build: couple photos ship; browser reveals gallery at ${tsDesc} (runtime server-time check)`,
  );

  // Wipe & recreate dist/
  fs.rmSync(dist, { recursive: true, force: true });
  ensureDir(dist);

  // Copy static trees verbatim into dist/. couple_images/ and inspiration/ are
  // gitignored source-only drops (web copies live in assets/photos/), so they
  // are intentionally excluded from the published build.
  const staticTrees = ["css", "js", "assets"];
  // Skip gitignored subpaths (raw AI generations live in assets/images/gen/).
  // The techno skin renders its backdrop scene instead of shipping video, so it
  // drops the whole Regency assets/videos/ tree (LOCKED: no palace footage in
  // the techno build). A techno Path-B plate, when added, lives outside videos/.
  const technoBased = isTechnoBased(theme);
  const copyFilter = (src) => {
    const parts = src.split(path.sep);
    if (parts.includes("gen")) return false;
    // The 3D scene asset (dancer model) is a techno-only asset.
    if (!technoBased && parts.includes("scene")) return false;
    if (!technoBased) {
      // The techno playlist (assets/audio/techno/*) is techno-only — don't ship
      // it (~34 MB of mp3) as dead weight in the Regency build.
      const ai = parts.indexOf("audio");
      if (ai !== -1 && parts[ai + 1] === "techno") return false;
    }
    if (technoBased) {
      // No Regency palace footage in the techno build (LOCKED).
      if (parts.includes("videos")) return false;
      // Ship only the techno playlist (assets/audio/techno/*), not the Regency
      // top-level tracks (assets/audio/theme-N.mp3).
      const ai = parts.indexOf("audio");
      if (
        ai !== -1 &&
        parts.length === ai + 2 &&
        /^theme-\d+\.mp3$/.test(parts[ai + 1])
      )
        return false;
    }
    return true;
  };
  for (const dir of staticTrees) {
    const from = path.join(root, dir);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dist, dir), {
      recursive: true,
      filter: copyFilter,
    });
  }

  // Render index.html (theme picks the template; techno & kinetic each use
  // their own skin, but kinetic reuses every techno asset — only the HTML
  // template differs).
  const templateFile =
    theme === "kinetic"
      ? "index.kinetic.template.html"
      : theme === "techno"
        ? "index.techno.template.html"
        : "index.template.html";
  const htmlTemplate = fs.readFileSync(path.join(srcDir, templateFile), "utf8");
  fs.writeFileSync(
    path.join(dist, "index.html"),
    applyTokens(htmlTemplate, htmlTokens),
  );

  // Render manifest.webmanifest
  const manifestTemplate = fs.readFileSync(
    path.join(srcDir, "manifest.template.webmanifest"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dist, "manifest.webmanifest"),
    applyTokens(manifestTemplate, manifestTokens),
  );

  // Discover the music pool from assets/audio/theme-N.mp3 (sorted numerically),
  // so adding/removing a track needs no code change — just drop the file in.
  // The techno skin has its OWN playlist under assets/audio/techno/; names are
  // emitted with the `techno/` prefix so ui.js's `assets/audio/${name}.mp3`
  // resolves. Regency keeps the top-level tracks.
  const songPrefix = technoBased ? "techno/" : "";
  const audioDir = technoBased
    ? path.join(root, "assets", "audio", "techno")
    : path.join(root, "assets", "audio");
  const songs = fs.existsSync(audioDir)
    ? fs
        .readdirSync(audioDir)
        .map((f) => /^(theme-(\d+))\.mp3$/.exec(f))
        .filter(Boolean)
        .sort((a, b) => Number(a[2]) - Number(b[2]))
        .map((m) => songPrefix + m[1])
    : [];
  // EXCLUDE_TRACKS=theme-9[,theme-3...] drops tracks from the playlist for one
  // build. It exists for the review harness: theme-9 triggers a full-viewport
  // VIDEO TAKEOVER that replaces the entire scene for the length of the song,
  // so any capture taken while it plays is video frames, not the design. A
  // panel already wasted a whole review critiquing those frames. Excluding it
  // at build time is more reliable than trying to pause or skip the track in
  // the page afterwards.
  if (process.env.EXCLUDE_TRACKS) {
    const excluded = (process.env.EXCLUDE_TRACKS || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const kept = excluded.length
      ? songs.filter(
          (name) =>
            !excluded.some((ex) => name === ex || name.endsWith("/" + ex)),
        )
      : songs;
    if (excluded.length) {
      console.log(
        `build: EXCLUDE_TRACKS=${excluded.join(",")} → dropped ${songs.length - kept.length} track(s)`,
      );
    }
    songs.length = 0;
    songs.push(...kept);
    console.log(`build: discovered ${songs.length} music track(s)`);
  }
  // Emit dist/js/app/couple.mjs (build-generated, imported by config.js/ui.js).
  // Date fields are emitted ONLY when revealDate is true, so the shipped JS
  // never contains the wedding date/times while hidden.
  const sideDefs = EVENT_DEFS.filter((d) => isEventForSide(d, fromGroomSide));
  const sideIds = new Set(sideDefs.map((d) => d.id));
  // Copy for prelude events lives here (not in the verbatim config.js) so the
  // other side's build never ships it.
  const eventCopy = Object.fromEntries(
    sideDefs.filter((d) => d.prelude).map((d) => [d.id, {
      title: d.name,
      description: `${d.blurb} Dress code: ${d.dress[0].toLowerCase()}${d.dress.slice(1)}.`,
    }]),
  );
  const eventDates = reveal
    ? Object.fromEntries(
        sideDefs.map((d) => [d.id, eventCalendar(d, wedding.events[d.id])])
          .filter(([, c]) => c),
      )
    : null;
  // Venue name + map link are venue-identifying — emit only when revealed, so
  // the shipped config.js (copied verbatim) never contains them while hidden.
  const eventVenues = reveal
    ? Object.fromEntries(
        Object.entries(wedding.events).filter(([k, v]) => v.venue && (sideIds.has(k) || !EVENT_DEFS.some((d) => d.id === k))).map(([k, v]) => [
          k,
          { location: v.venue, map: v.map, address: v.address, note: v.note },
        ]),
      )
    : null;
  const coupleModule = [
    "// Auto-generated by build.js. Do not edit — regenerate via `node build.js`.",
    "export const NAMES = " + JSON.stringify(names, null, 2) + ";",
    "export const SONGS = " + JSON.stringify(songs) + ";",
    "export const REVEAL_DATE = " + JSON.stringify(reveal) + ";",
    "export const WEDDING_TS = " +
      (reveal ? "Date.UTC(" + wedding.weddingTsUTC.join(", ") + ")" : "null") +
      ";",
    "export const EVENT_DATES = " + JSON.stringify(eventDates) + ";",
    "export const EVENT_VENUES = " + JSON.stringify(eventVenues) + ";",
    "export const EVENT_COPY = " + JSON.stringify(eventCopy) + ";",
    "export const COUPLE_REVEAL_TS = " + JSON.stringify(coupleRevealTs) + ";",
    "export const OUTFIT_REVEAL_TS = " + JSON.stringify(outfitRevealTs) + ";",
    "export const GALLERY = " + JSON.stringify(gallery) + ";",
    "",
  ].join("\n");
  const coupleOut = path.join(dist, "js", "app", "couple.mjs");
  ensureDir(path.dirname(coupleOut));
  fs.writeFileSync(coupleOut, coupleModule);

  // Also emit the couple module at the root js/app/ path so local dev without
  // a build step (e.g. serving from repo root) still resolves the import.
  // This file is gitignored to avoid churn when the flag flips.
  const coupleRoot = path.join(root, "js", "app", "couple.mjs");
  fs.writeFileSync(coupleRoot, coupleModule);

  console.log(
    `build: wrote dist/ (${staticTrees.join(", ")}, index.html, manifest.webmanifest, js/app/couple.mjs)`,
  );
}

// Run the pipeline only when invoked directly (`node build.js`), not on import.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) runBuild();
