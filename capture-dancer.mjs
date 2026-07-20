// Frame-capture harness for the kinetic wireframe dancer — a MANUAL verify
// step (like the other gen-*/capture scripts), NOT wired into build.js. It
// serves dist/ over HTTP, boots the kinetic page in headless chromium, skips
// the entry gate, forces the dancer canvas fully opaque, then screenshots the
// #k-dancer-canvas at several times so the groove/poses can be reviewed as
// stills. The dancer animates from an idle-energy baseline with no audio, so
// no trusted gesture / music is needed — beat-LOCKED accenting won't show
// (that needs real playback) but amplitude, move variety and pose safety do.
//
//   node capture-dancer.mjs            # 8 frames → /tmp/dancer-frames/*.png
//   FRAMES=12 GAP_MS=350 node capture-dancer.mjs
//
// Requires: a built dist/ (WEDDING_THEME=kinetic node build.js) + Playwright
// chromium. Paths overridable via PLAYWRIGHT_PATH / CHROME_PATH, same as
// gen-share-cards.mjs. Network access is needed (THREE + loaders load from CDN).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const PW = process.env.PLAYWRIGHT_PATH ||
  '/Users/sanchitdang/.npm/_npx/423231821c231c73/node_modules/playwright/index.js';
const CHROME = process.env.CHROME_PATH ||
  '/Users/sanchitdang/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, 'dist');
const outDir = process.env.OUT_DIR || '/tmp/dancer-frames';
const FRAMES = parseInt(process.env.FRAMES || '8', 10);
const GAP_MS = parseInt(process.env.GAP_MS || '450', 10);
const PORT_PREF = parseInt(process.env.PORT || '0', 10);   // 0 = ephemeral (avoids EADDRINUSE from a prior run)

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(`no ${distDir}/index.html — run: WEDDING_THEME=kinetic node build.js`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// ── minimal static server (correct MIME for ES modules + gltf assets) ──
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4',
};
const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(distDir, path.normalize(p));
    if (!fp.startsWith(distDir) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT_PREF, r));
const PORT = server.address().port;   // actual (ephemeral if PORT_PREF was 0)
console.log(`serving dist/ on http://127.0.0.1:${PORT}`);

const pw = await import(PW);
const { chromium } = pw.default || pw;
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: 'no-preference',   // reduced-motion hides the canvas + skips the dancer
});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text()); });

// track the two model loads so we know the dancers are actually in the scene
const loaded = new Set();
page.on('response', (r) => { const u = r.url(); if (u.endsWith('scene.gltf')) loaded.add(u); });

console.log('loading page …');
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });

// skip the entry gate (synthetic click; audio stays blocked, dancer doesn't need it)
await page.waitForSelector('.gate-card', { timeout: 15000 });
await page.evaluate(() => document.querySelector('.gate-card').click());
await page.waitForTimeout(1500);   // gate dissolve + removal (~1.2s)

// Force the full-viewport crowd/featured canvas opaque (k-deck dims it to .5).
// #k-dancer-canvas is display:none now — everything renders on #k-ambient-dancers.
await page.addStyleTag({ content: '#k-ambient-dancers{opacity:1 !important} .gate{display:none !important}' });

// Only the armadrillo (rigA) loads now — fairy-punk is suppressed — so wait for
// ONE scene.gltf, then settle for model wire-up + the crowd pool + featured build.
for (let i = 0; i < 40 && loaded.size < 1; i++) await page.waitForTimeout(250);
console.log(`models loaded: ${loaded.size} — settling for crowd/featured/welcome …`);
await page.waitForSelector('#k-ambient-dancers', { timeout: 15000 });
await page.waitForTimeout(3000);   // crowd fills toward the floor + welcome giant window

// Full-VIEWPORT screenshots: the scene is full-screen now (crowd + featured
// armadrillo + the welcome presenter giant), so capture the whole page, not one
// canvas element. NOTE: headless has no trusted gesture, so audio stays blocked
// → no real music DROP fires; the drop-takeover giant can't be verified here,
// only the idle groove, crowd (5+), featured armadrillo, cyan tint, and (if
// caught in-window) the post-gate welcome giant.
console.log(`capturing ${FRAMES} full-viewport frames every ${GAP_MS}ms …`);
const written = [];
for (let i = 0; i < FRAMES; i++) {
  const f = path.join(outDir, `dancer-${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: f });
  written.push(f);
  await page.waitForTimeout(GAP_MS);
}

await browser.close();
server.close();
console.log(`\nwrote ${written.length} frames to ${outDir}:`);
for (const f of written) console.log('  ' + f);
console.log('done');
