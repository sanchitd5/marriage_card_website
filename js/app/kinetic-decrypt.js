/* Riya & Sanchit · Shubh Vivah — kinetic date reveal ("hold to decrypt")
 *
 * Replaces the shared canvas SCRATCH-OFF (js/app/scratch.js) in the KINETIC skin
 * only. A foil scratch card is a lottery-ticket metaphor; kinetic is a precision
 * console, so the date is held behind a *cipher* the guest cracks by pressing and
 * holding a key. No canvas, no new deps, GSAP optional.
 *
 * Design decisions (interaction-critic pass, see docs/kinetic-variant.md):
 *  - HOLD TO CHARGE → LATCH ON COMPLETION. Releasing before completion decays the
 *    charge back (so the press feels like work), but once resolved the date STAYS
 *    resolved. "Decay back after completion" would make the reveal an endurance
 *    test, punish tremor/motor impairment and stop anyone reading or screenshotting
 *    the date at leisure.
 *  - The trigger is a real <button>, so keyboard/AT activation (Space/Enter →
 *    click) resolves INSTANTLY. Requiring a held key is an accessibility trap.
 *  - Characters resolve CENTER-OUT with jitter, never left-to-right: a
 *    left-to-right wipe previews the string's shape (and its length) early.
 *  - Glyph churn is capped at ~15 swaps/sec/char — faster churn is a cognitive
 *    load problem for dyslexic readers and reads as noise, not cipher.
 *  - The real string sits in a visually-hidden sibling from first paint and the
 *    animating glyphs are aria-hidden, so screen-reader users never gesture.
 *  - LEAK-SAFE BY CONSTRUCTION: this module scrambles whatever the build injected
 *    into the DOM. When revealDate=false that is the placeholder token, and the
 *    interaction is byte-identical. It never masks a real string client-side.
 */

import { REDUCED, $, $$ } from './dom.js';
import { petalRain } from './celebration.js';

// Same charset as the kinetic scramble-text primitive, so the cipher plate and
// the heading scrambles read as one system.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*·';
const randGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
const isCipherable = ch => ch >= '0' && ch <= '9' || ch >= 'A' && ch <= 'Z' || ch >= 'a' && ch <= 'z';

const CHARGE_S = 1.2;  // hold time to full resolve. <0.8s reads as a glorified tap; >1.8s and people release early assuming it's broken.
const DECAY_S = 0.6;   // early release unwinds over this
const SWAP_MS = 66;    // ≈15 glyph swaps/sec/char
const LATCH_MS = 800;  // "KEY ACCEPTED" dwell before the key retires

const LABEL_IDLE = '[ HOLD TO DECRYPT ]';
const LABEL_DONE = '[ KEY ACCEPTED ]';

// One cipher plate: the scrambling text nodes plus the charge/latch state machine.
class CipherPlate {
  constructor(root, key, label) {
    this.root = root;
    this.key = key;
    this.label = label;
    this.charge = 0;     // 0..1 linear charge (time-based)
    this.held = false;
    this.latched = false;
    this.raf = 0;
    this.lastT = 0;
    this.chars = [];     // {node, i, final, cipher, threshold, glyph, swappedAt}
    this.nodes = [];     // {node, final}
  }

  // Collect the plate's text nodes and pre-compute a per-character resolve
  // threshold. Rank is distance from the node's centre (centre resolves first),
  // normalised, then jittered so the resolve front never looks mechanical.
  scan() {
    for (const el of $$('[data-kdc-cipher]', this.root)) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
        const final = node.__kdcFinal != null ? node.__kdcFinal : (node.__kdcFinal = node.nodeValue);
        this.nodes.push({ node, final });
        const mid = (final.length - 1) / 2;
        for (let i = 0; i < final.length; i++) {
          const ch = final[i];
          if (!isCipherable(ch)) continue;
          const rank = mid === 0 ? 0 : Math.abs(i - mid) / mid; // 0 = centre, 1 = edge
          const jitter = (Math.random() - 0.5) * 0.24;
          this.chars.push({
            nodeIdx: this.nodes.length - 1,
            i,
            final: ch,
            threshold: Math.min(0.98, Math.max(0, rank * 0.88 + 0.06 + jitter)),
            glyph: randGlyph(),
            swappedAt: 0,
          });
        }
      }
    }
    return this.nodes.length > 0;
  }

  // Paint the plate at eased progress `p` (0 = full cipher, 1 = plain text).
  render(p, now) {
    const out = this.nodes.map(n => n.final.split(''));
    for (const c of this.chars) {
      if (p >= c.threshold) continue;             // resolved — leave the final char
      if (now - c.swappedAt >= SWAP_MS) { c.glyph = randGlyph(); c.swappedAt = now; }
      out[c.nodeIdx][c.i] = c.glyph;
    }
    this.nodes.forEach((n, idx) => { n.node.nodeValue = out[idx].join(''); });
  }

  // Show the plain text and stop cycling. Idempotent.
  settle() {
    this.nodes.forEach(n => { n.node.nodeValue = n.final; });
    this.root.classList.remove('is-decrypting');
    this.root.style.removeProperty('--kdc-charge');
  }

  // ── charge loop ───────────────────────────────────────────────────────
  // One rAF integrates the charge up while held and down while released, so
  // there is a single source of truth and no tween to overwrite. Eased
  // progress is power2.in (charge²): the last characters snap in fast, which
  // reads as "cracking" rather than "fading".
  tick(now) {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.lastT) / 1000); // clamp: a backgrounded tab must not dump a huge delta
    this.lastT = now;

    this.charge += this.held ? dt / CHARGE_S : -dt / DECAY_S;
    if (this.charge >= 1) { this.latch(); return; }
    if (this.charge <= 0) {
      this.charge = 0;
      this.render(0, now);
      this.root.style.setProperty('--kdc-charge', '0');
      this.setLabel(LABEL_IDLE);
      this.root.classList.remove('is-decrypting');
      return; // idle: stop the loop until the next press
    }

    const p = this.charge * this.charge;
    this.render(p, now);
    this.root.style.setProperty('--kdc-charge', String(this.charge.toFixed(3)));
    this.setLabel(`[ DECRYPTING… ${Math.round(this.charge * 100)}% ]`);
    this.pump();
  }

  pump() {
    if (this.raf || this.latched) return;
    this.raf = requestAnimationFrame(now => this.tick(now));
  }

  press() {
    if (this.latched) return;
    this.held = true;
    this.root.classList.add('is-decrypting');
    this.lastT = performance.now();
    this.pump();
  }

  release() {
    if (this.latched || !this.held) return;
    this.held = false;
    this.lastT = performance.now();
    this.pump(); // keep running so the charge decays visibly
  }

  setLabel(text) {
    if (this.label && this.label.textContent !== text) this.label.textContent = text;
  }

  // Completion: resolve, confirm, retire the key. The date stays revealed.
  latch() {
    if (this.latched) return;
    this.latched = true;
    this.held = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.settle();
    this.root.classList.add('is-decrypted');
    this.root.style.setProperty('--kdc-charge', '1');

    if (window.gsap && !REDUCED) {
      const plate = $('.scratch-under', this.root) || this.root;
      gsap.fromTo(plate, { opacity: 0.4 }, { opacity: 1, duration: 0.25, ease: 'expo.out' });
    }
    if (window.confetti && !REDUCED) petalRain();

    this.setLabel(LABEL_DONE);
    if (this.key) {
      this.key.disabled = true;
      setTimeout(() => {
        if (!this.key) return;
        if (window.gsap && !REDUCED) {
          gsap.to(this.key, { autoAlpha: 0, height: 0, margin: 0, duration: 0.4, ease: 'power2.inOut', onComplete: () => this.key.remove() });
        } else {
          this.key.remove();
        }
      }, LATCH_MS);
    }
  }
}

export function initKineticDecrypt() {
  const root = $('.kdc');
  if (!root) return;
  const key = $('#kdc-key', root);
  const label = $('.kdc-key-label', root);

  const plate = new CipherPlate(root, key, label);
  if (!plate.scan()) return;

  // Reduced motion: the date is content, and content a gesture is hiding must be
  // visible by default. No cipher, no key, no loop.
  if (REDUCED) {
    plate.settle();
    root.classList.add('is-decrypted');
    if (key) key.remove();
    return;
  }

  plate.render(0, performance.now());
  root.style.setProperty('--kdc-charge', '0');
  if (!key) { plate.latch(); return; } // no trigger in the DOM → never trap the date

  // Pointer path: hold to charge. setPointerCapture keeps the gesture alive when
  // the finger drifts off the key (otherwise pointerleave kills it mid-charge).
  // `touch-action: none` on the key is what stops the browser claiming the
  // gesture and firing pointercancel — a passive-listener/preventDefault dance
  // cannot do that, because touch-action is evaluated before any listener runs.
  let fromPointer = false;
  key.addEventListener('pointerdown', e => {
    fromPointer = true;
    if (key.setPointerCapture) { try { key.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ } }
    plate.press();
  });
  const up = () => plate.release();
  key.addEventListener('pointerup', up);
  key.addEventListener('pointercancel', up);
  key.addEventListener('lostpointercapture', up);

  // Keyboard / AT / switch control: Space and Enter fire `click` on a real
  // button. Resolve instantly — a held key is an accessibility trap. A tap with
  // a pointer also fires click, so gate on the pointerdown flag and nudge
  // instead (the affordance says HOLD).
  key.addEventListener('click', () => {
    if (!fromPointer) { plate.latch(); return; }
    fromPointer = false;
    if (plate.latched) return;
    root.classList.add('is-nudge');
    setTimeout(() => root.classList.remove('is-nudge'), 520);
  });

  // A window-level blur (alt-tab mid-hold) never fires pointerup on some
  // platforms; without this the charge would keep climbing while the tab is away.
  window.addEventListener('blur', up);
}
