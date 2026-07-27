// ── Review harness ────────────────────────────────────────────────────
// Builds every shipping permutation of the invitation, drives each one in a
// headless browser, and writes a screenshot set a design panel can review.
//
// WHY THIS EXISTS. Reviewing one build tells you almost nothing: the site is a
// matrix. The skin changes the whole layout, FROM_GROOM_SIDE flips names AND
// which events appear, and the two reveal gates change what is on the page at
// all. Bugs hide in the combinations — a rule that only breaks bride-first, or
// copy that only reads wrong once the dates unlock. Reviewing them by hand is
// slow and easy to do inconsistently, and an inconsistent capture wastes a
// reviewer's time on artefacts instead of design (this has already happened
// twice: once capturing during the theme-9 video takeover, once capturing
// before the scroll-reveal had run, which made a reviewer report that the
// couple's names were missing).
//
// See GET_REVIEW_DONE.md for how to use the output.
//
// Usage:
//   node review-harness.mjs                    # every variant, desktop + mobile
//   node review-harness.mjs --theme kinetic    # one skin
//   node review-harness.mjs --quick            # default gates only (2 builds)
//   node review-harness.mjs --viewport mobile  # one viewport
//   node review-harness.mjs --out ./review-out
//
// Requires a built dist/ served locally; the harness starts and stops its own
// static server on --port (default 8722), so nothing else needs to be running.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Playwright is not a project dependency (the site ships zero runtime deps), so
// it is resolved from wherever it already exists on the machine, same as
// gen-share-cards.mjs does.
const PW = process.env.PLAYWRIGHT_PATH ||
  '/Users/sanchitdang/.npm/_npx/423231821c231c73/node_modules/playwright/index.js';
const CHROME = process.env.CHROME_PATH ||
  '/Users/sanchitdang/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell';

// ── the matrix ────────────────────────────────────────────────────────
const THEMES = ['regency', 'kinetic'];
const SIDES = [true, false];          // FROM_GROOM_SIDE
const REVEAL_DATES = [false, true];   // gated first: that is the shipping state today
const REVEAL_COUPLES = [false, true];

// NB: width/height MUST be nested under `viewport`. Spread flat into newPage()
// they are silently ignored and every context falls back to Playwright's
// 1280x720 default — which made the "mobile" captures not mobile at all.
const VIEWPORTS = {
  desktop: { viewport: { width: 1600, height: 1075 }, deviceScaleFactor: 1.25, isMobile: false, hasTouch: false },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

function parseArgs(argv) {
  const a = { theme: null, viewport: null, quick: false, out: 'review-out', port: 8722, acts: true };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--quick') a.quick = true;
    else if (k === '--theme') a.theme = argv[++i];
    else if (k === '--viewport') a.viewport = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--port') a.port = Number(argv[++i]);
    else if (k === '--hero-only') a.acts = false;
  }
  return a;
}

function variants(args) {
  const themes = args.theme ? [args.theme] : THEMES;
  const out = [];
  for (const theme of themes) {
    for (const side of SIDES) {
      // --quick renders the shipping gate state only; the full run covers all four
      const dates = args.quick ? [false] : REVEAL_DATES;
      const couples = args.quick ? [false] : REVEAL_COUPLES;
      for (const revealDate of dates) {
        for (const revealCouple of couples) {
          out.push({ theme, side, revealDate, revealCouple });
        }
      }
    }
  }
  return out;
}

const slug = (v) =>
  [v.theme, v.side ? 'groom' : 'bride', `date-${v.revealDate ? 'on' : 'off'}`, `couple-${v.revealCouple ? 'on' : 'off'}`].join('_');

function build(v) {
  execFileSync(process.execPath, ['build.js'], {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      WEDDING_THEME: v.theme,
      FROM_GROOM_SIDE: String(v.side),
      REVEAL_DATE: String(v.revealDate),
      REVEAL_COUPLE: String(v.revealCouple),
      // theme-9 triggers a full-viewport VIDEO TAKEOVER that replaces the whole
      // scene for the length of the track, so a capture taken while it plays is
      // video frames rather than the design — a panel already spent an entire
      // review critiquing those frames. Dropping the track from the playlist at
      // BUILD time is deterministic; pausing or skipping it in the page is a
      // race against autoplay.
      EXCLUDE_TRACKS: [process.env.EXCLUDE_TRACKS, 'theme-9'].filter(Boolean).join(','),
    },
  });
}

// A minimal static server over dist/ so the harness is self-contained. ES
// modules will not load over file://, so serving is required, not optional.
function serve(port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(root, 'dist', url === '/' ? 'index.html' : url);
      if (!file.startsWith(path.join(root, 'dist'))) { res.writeHead(403).end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const body = await readFile(file);
      // NO CACHING. The harness rebuilds dist/ in place between variants and
      // serves every one from the same origin and port, so without this the
      // browser happily reuses the previous variant's index.html and CSS. That
      // is how a kinetic cell rendered the Regency skin: the loop builds regency
      // first, and the cached document survived the rebuild.
      res.writeHead(200, {
        'content-type': types[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'pragma': 'no-cache',
      });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function capture(pw, v, vpName, args) {
  const { chromium } = pw.default ?? pw;
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ ...VIEWPORTS[vpName], bypassCSP: true });
  await page.route('**/*', (route) => route.continue({ headers: { ...route.request().headers(), 'cache-control': 'no-cache' } }));
  const problems = [];
  page.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message.slice(0, 180)));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('CONSOLE ' + m.text().slice(0, 180)); });

  const outBase = path.isAbsolute(args.out) ? args.out : path.join(root, args.out);
  const dir = path.join(outBase, slug(v), vpName);
  fs.mkdirSync(dir, { recursive: true });

  await page.goto(`http://127.0.0.1:${args.port}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(dir, '00-gate.png') });

  // Enter through the gate for real. Removing #gate instead leaves the kinetic
  // deck's `entered` flag false, so every navigation call is a silent no-op and
  // each "act" capture is really just the hero again.
  // Open the gate by tapping/clicking its CENTRE. A fixed corner offset misses
  // the seal on a small viewport, and then every subsequent capture is just the
  // gate again. Verified below rather than assumed.
  const openGate = async () => {
    if (!(await page.$('#gate'))) return true;    // already open
    // Click the CARD/SEAL, not #gate. The listener lives on `.gate-card`
    // (js/app/gate.js), so a click on the backdrop does nothing — correct
    // behaviour for a backdrop, but it meant the harness silently failed to
    // enter on any skin whose card is not directly under the backdrop's centre.
    for (const sel of ['#seal', '.gate-card', '#gate']) {
      const el = await page.$(sel);
      if (!el) continue;
      if (VIEWPORTS[vpName].hasTouch) await el.tap().catch(() => {});
      else await el.click().catch(() => {});
      await page.waitForTimeout(5600);
      if (!(await page.$('#gate'))) return true;
    }
    return !(await page.$('#gate'));
  };
  let opened = await openGate();
  if (!opened) { opened = await openGate(); }     // one retry: the reveal can swallow the first tap
  if (!opened) problems.push('GATE did not open — captures after this are the gate, not the deck');

  // POSITIVE assertion, not just "#gate is gone". An earlier version only
  // checked for the gate's absence and happily reported "ok" while writing a
  // folder full of gate screenshots, because the open attempt returned truthy.
  // A capture set is only valid if real content is actually on screen.
  const entered = await page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && parseFloat(getComputedStyle(el).opacity || '1') > 0.01;
    };
    return vis('.hero-names') || vis('.hero-name') || vis('.hero-inner') || vis('main');
  });
  if (!entered) problems.push('NO CONTENT VISIBLE after entering — this capture set is not reviewable');

  // Wait for the scene to SETTLE before shooting. The gate reveal fades a
  // full-screen overlay out over a couple of seconds, and #milkdrop screen-blends
  // the music visualiser at an opacity driven per-frame by the track's drop
  // level. Shooting into either one yields a washed-out grey frame, and a
  // reviewer then reports a contrast failure that does not exist at rest.
  // Poll until the compositing layers are quiet rather than guessing a delay.
  await page.waitForFunction(() => {
    const q = (sel) => document.querySelector(sel);
    const op = (el) => (el ? parseFloat(getComputedStyle(el).opacity) || 0 : 0);
    const veil = Math.max(op(q('.gate-veil')), op(q('#k-reveal')), op(q('.k-boot')));
    return !q('#gate') && op(q('#milkdrop')) <= 0.2 && veil <= 0.05;
  }, { timeout: 9000 }).catch(() => problems.push('scene did not settle in 9s — frame may be mid-transition'));
  await page.waitForTimeout(600);

  // Force scroll-reveal content visible. The hero lockup and .fade-up blocks sit
  // at opacity 0 until GSAP/ScrollTrigger runs, and a capture that misses them
  // reports missing copy that is actually present.
  const settle = async () => {
    await page.evaluate(() => {
      // Only CONTENT is forced visible. An earlier version walked every
      // descendant and set opacity:1, which also un-hid chrome that ships
      // hidden at that breakpoint (the desktop section rail on mobile) and made
      // the audit report targets a real guest never sees.
      const sel = '.fade-up, .hero-names, .hero-name, .hero-amp, .hero-invocation,'
        + ' .hero-invocation *, .kicker, .hero-date, .hero-voice, .hero-blessing,'
        + ' .hero-await, .hero-await *, .hero-tag, .hero-tag *';
      document.querySelectorAll(sel).forEach((el) => {
        el.classList.add('is-visible');
        const cs = getComputedStyle(el);
        if (cs.opacity === '0') { el.style.opacity = '1'; el.style.transform = 'none'; el.style.visibility = 'visible'; }
      });
    });
    await page.waitForTimeout(700);
  };
  await settle();

  // The deck chrome (and the crosshair cursor) only appear after a pointermove,
  // which a touch context never sends — so nudge the pointer on desktop to
  // capture the true shipping state rather than an idle one.
  if (vpName === 'desktop') { await page.mouse.move(820, 560, { steps: 8 }); await page.waitForTimeout(700); }

  await page.screenshot({ path: path.join(dir, '01-hero.png') });

  // Walk the acts. The kinetic build is a panel deck with a section menu; the
  // Regency build is a scrolling page, so it is captured by section instead.
  if (args.acts) {
    const isDeck = await page.evaluate(() => document.documentElement.classList.contains('k-deck'));
    if (isDeck) {
      const labels = await page.evaluate(() => [...document.querySelectorAll('.k-menu-item .k-menu-label')].map((e) => e.textContent.trim()));
      for (let i = 0; i < labels.length; i++) {
        await page.evaluate((idx) => { const b = document.querySelectorAll('.k-menu-item'); if (b[idx]) b[idx].click(); }, i);
        await page.waitForTimeout(1900);
        await settle();
        // Wait for the panel transition AND the visualiser to quiet down before
        // shooting. Without this the first act after the gate came out as a
        // washed duplicate of the hero, captured mid-crossfade.
        await page.waitForFunction(() => {
          const m = document.querySelector('#milkdrop');
          return !m || (parseFloat(getComputedStyle(m).opacity) || 0) <= 0.2;
        }, { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (vpName === 'desktop') { await page.mouse.move(830 + i, 560, { steps: 4 }); await page.waitForTimeout(500); }
        const name = `${String(i + 2).padStart(2, '0')}-${labels[i].toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        await page.screenshot({ path: path.join(dir, name) });
      }
    } else {
      const ids = await page.evaluate(() => [...document.querySelectorAll('section[id], header[id], footer')].map((e) => e.id || 'footer'));
      for (let i = 0; i < ids.length; i++) {
        await page.evaluate((id) => {
          const el = document.getElementById(id) || document.querySelector('footer');
          if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        }, ids[i]);
        await page.waitForTimeout(900);
        await settle();
        await page.screenshot({ path: path.join(dir, `${String(i + 2).padStart(2, '0')}-${ids[i]}.png`) });
      }
    }
  }

  // Objective checks a reviewer should never have to eyeball. Scoped to what is
  // actually ON SCREEN and hit-testable: this deck stacks every act in the DOM,
  // so an unscoped sweep measures controls inside panels the guest cannot see.
  const audit = await page.evaluate((touch) => {
    const vw = innerWidth, vh = innerHeight;
    const small = [];
    document.querySelectorAll('button, a[href], [role=button]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 1 || r.height < 1) return;
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return;
      if (parseFloat(cs.opacity) < 0.05) return;
      // must be inside the viewport, and must be the topmost element at its own
      // centre — otherwise it belongs to a panel stacked behind this one
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;
      const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
      const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) return;
      if (!touch) return;   // 44px is a TOUCH guideline; a pointer viewport flags the whole desk chrome
      if (r.width < 44 || r.height < 44) small.push(`${(el.textContent || el.id || '').trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return { overflowX: document.documentElement.scrollWidth > vw, undersizedTargets: small.slice(0, 8) };
  }, !!VIEWPORTS[vpName].hasTouch);

  await browser.close();
  return { ...audit, problems: problems.slice(0, 8) };
}

async function main() {
  const args = parseArgs(process.argv);
  const pw = await import(PW);
  const list = variants(args);
  const vps = args.viewport ? [args.viewport] : Object.keys(VIEWPORTS);
  const outRoot = path.isAbsolute(args.out) ? args.out : path.join(root, args.out);
  fs.mkdirSync(outRoot, { recursive: true });

  const report = [];
  console.log(`review harness: ${list.length} variant(s) x ${vps.length} viewport(s)`);
  for (const v of list) {
    build(v);
    const server = await serve(args.port);
    for (const vp of vps) {
      const res = await capture(pw, v, vp, args);
      report.push({ variant: slug(v), viewport: vp, ...res });
      const flags = [res.overflowX ? 'OVERFLOW-X' : null, res.undersizedTargets.length ? `${res.undersizedTargets.length} small target(s)` : null, res.problems.length ? `${res.problems.length} console error(s)` : null].filter(Boolean);
      console.log(`  ${slug(v)} / ${vp} ${flags.length ? '— ' + flags.join(', ') : 'ok'}`);
    }
    await new Promise((r) => server.close(r));
  }

  fs.writeFileSync(path.join(outRoot, 'audit.json'), JSON.stringify(report, null, 2));
  const bad = report.filter((r) => r.overflowX || r.undersizedTargets.length || r.problems.length);
  console.log(`\nwrote ${outRoot}/  (audit.json: ${bad.length} variant/viewport pair(s) with findings)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
