import { $, $$ } from './dom.js';

// ── Equal-measure name lockup ─────────────────────────────────────────
// Two design reviewers independently flagged the same thing: set at one point
// size, "SANCHIT" renders ~450px wider than "RIYA" purely because it has more
// letters, so on a stacked lockup the groom optically outweighs the bride. On a
// wedding invitation that is an equity problem, not a typographic nit.
//
// The fix is the editorial one: scale each line to EQUAL MEASURE rather than
// equal point size, so both names span the same width and the block reads as a
// flush rectangle. Neither name is then "bigger" — they are the same size in the
// only dimension the eye is comparing.
//
// It has to run at runtime rather than in CSS because the names come from build
// tokens (FROM_GROOM_SIDE flips which is which) and can be any length, so no
// hardcoded per-name ratio would survive a rebuild or a rename.
//
// Runs after fonts settle, and again on resize. Fully reversible: it only ever
// writes font-size on the two name spans.

const MIN_PX = 28;

function fitOnce(wrap) {
  const names = $$('.hero-name', wrap);
  if (names.length < 2) return;

  // Target measure: the width the lockup is allowed to occupy. Read it from the
  // lockup's own content box so the block stays inside the copy column.
  const host = wrap.parentElement || wrap;
  const target = host.getBoundingClientRect().width;
  if (target < 40) return;   // not laid out yet

  // Scale from the LONGEST name only, and give every line that same size.
  //
  // The first attempt fitted each line individually to the column, i.e. literal
  // equal measure. That is typographically tidy but it simply inverts the
  // unfairness: a 4-letter name stretched to the width of a 7-letter one ends up
  // with roughly double the cap height, so now the shorter name dominates. On a
  // wedding lockup the reading has to be that neither person is bigger, and the
  // only way to guarantee that is one shared point size. The rectangle the
  // reviewers wanted then comes from ALIGNMENT (the short name is flush right,
  // see css/kinetic.css) rather than from distorting the scale.
  // Measure the TEXT ADVANCE with a Range, not the element box: the name spans
  // are full-width blocks (that is what lets the short name sit flush right), so
  // their own rects all report the column width and would defeat the fit.
  const range = document.createRange();
  let probe = 0, widest = 0;
  for (const el of names) {
    el.style.fontSize = '';
    probe = parseFloat(getComputedStyle(el).fontSize) || 100;
    range.selectNodeContents(el);
    widest = Math.max(widest, range.getBoundingClientRect().width);
  }
  if (!widest) return;
  const size = Math.max(MIN_PX, probe * (target / widest));
  for (const el of names) el.style.fontSize = size.toFixed(2) + 'px';

  // Hang the ampersand on the SHORT name's left edge. The short name is flush
  // right, so its left edge is (column width - its own advance) — a number only
  // known after the shared size is applied. Without this the lockup reads as a
  // right-aligned wedge with three unrelated left starts; with it there is one
  // deliberate step, and the block finally reads as the rectangle it is meant
  // to be.
  const amp = wrap.querySelector('.hero-amp');
  const short = names[names.length - 1];
  if (amp && short) {
    range.selectNodeContents(short);
    const shortW = range.getBoundingClientRect().width;
    const indent = Math.max(0, target - shortW);
    // Give the ampersand its OWN x, between the two stems.
    //
    // Flush-aligning it to the short name's stem looked exact but collapsed the
    // lockup into two indent positions: the ampersand then read as RIYA's initial
    // glyph rather than as its own step (and its bowl ran near-tangent to the R's
    // shoulder). Placing it at a fraction of the delta gives three unequal but
    // monotonic left edges, which is the cascade the block is built on. The long
    // name is flush left, so its stem is 0 and the delta is simply `indent`.
    const AMP_STEP = 0.4;
    amp.style.textAlign = 'left';
    amp.style.marginLeft = (indent * AMP_STEP).toFixed(2) + 'px';
    amp.style.transform = 'translateY(-6px)';
  }
}

export function initNameFit() {
  const wrap = $('.hero-names');
  if (!wrap) return;
  if (document.documentElement.dataset.variant !== 'kinetic') return;

  const run = () => fitOnce(wrap);

  // after the webfont lands: Archivo is variable and swaps in late, and fitting
  // against the fallback metrics would leave the two lines mismatched
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run).catch(run);
  run();

  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 120); }, { passive: true });
}
