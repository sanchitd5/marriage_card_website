// Generates the two social share cards (1200x630 OG images) from the base
// backdrop assets/images/gen/share-source.png, overlaying the couple's names
// in the site's own fonts. One per side (name order differs):
//   groom -> assets/images/invitation-card-share.jpg      ("Sanchit & Riya")
//   bride -> assets/images/invitation-card-share-bride.jpg ("Riya & Sanchit")
//
// Renders with headless chromium (Playwright) so fonts match the live site,
// then downscales via ffmpeg to keep each card small (~280KB) for WhatsApp.
//
// Usage: node gen-share-cards.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { groom, bride, revealDate, wedding } from './site.config.mjs';

const PW = process.env.PLAYWRIGHT_PATH ||
  '/Users/sanchitdang/.npm/_npx/423231821c231c73/node_modules/playwright/index.js';
const CHROME = process.env.CHROME_PATH ||
  '/Users/sanchitdang/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const root = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(root, 'assets/images/gen/share-source.png');
const outDir = path.join(root, 'assets/images');
const tmpDir = process.env.TMPDIR || '/tmp';

// Date/city are gated by revealDate so the OG share image never leaks the
// wedding date before you publish it. While hidden: a date-free "Save the Date"
// teaser and no city. Real values are sourced from site.config (single source).
const DATE = revealDate ? wedding.dateRange : 'Save the Date';
const CITY = revealDate ? wedding.heroLocation : '';

const bg = 'data:image/png;base64,' + fs.readFileSync(base).toString('base64');

function html(nameA, nameB) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Great+Vibes&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Prata&display=swap" rel="stylesheet">
<style>
  * { margin:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; }
  .card { position:relative; width:1200px; height:630px; overflow:hidden;
    background:url('${bg}') center/cover no-repeat; }
  .stack { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center;
    padding-top:14px; }
  .kicker { font-family:"Cormorant Garamond",serif; font-weight:500;
    text-transform:uppercase; letter-spacing:.42em; font-size:26px;
    color:hsl(265 20% 38% / .68); margin-bottom:-6px; padding-left:.42em; }
  .names { font-family:"Great Vibes",cursive; font-size:118px; line-height:1;
    color:hsl(265 20% 38%); text-shadow:0 2px 14px hsl(40 36% 97% / .7); }
  .names .amp { color:hsl(40 45% 52%); }
  .rule { width:150px; height:1px; margin:22px 0 18px;
    background:linear-gradient(90deg,transparent,hsl(40 45% 52% / .85),transparent); }
  .date { font-family:"Prata",serif; font-size:34px; color:hsl(268 14% 24% / .9);
    letter-spacing:.02em; margin-bottom:10px; }
  .city { font-family:"Cormorant Garamond",serif; font-weight:500;
    text-transform:uppercase; letter-spacing:.3em; font-size:23px;
    color:hsl(40 45% 40%); padding-left:.3em; }
</style></head>
<body><div class="card"><div class="stack">
  <div class="kicker">Shubh Vivah</div>
  <div class="names">${nameA} <span class="amp">&amp;</span> ${nameB}</div>
  <div class="rule"></div>
  <div class="date">${DATE}</div>
  ${CITY ? `<div class="city">${CITY}</div>` : ''}
</div></div></body></html>`;
}

const pw = await import(PW);
const { chromium } = pw.default || pw;
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const cards = [
  { file: 'invitation-card-share.jpg', a: groom.first, b: bride.first },
  { file: 'invitation-card-share-bride.jpg', a: bride.first, b: groom.first },
];

for (const c of cards) {
  await page.setContent(html(c.a, c.b), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const tmpPng = path.join(tmpDir, `share-${c.a}.png`);
  await page.screenshot({ path: tmpPng, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  const out = path.join(outDir, c.file);
  // downscale 2x screenshot -> 1200x630 jpg, tuned small for WhatsApp
  execSync(`ffmpeg -v error -y -i "${tmpPng}" -vf "scale=1200:630:flags=lanczos" -q:v 4 "${out}"`);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${c.file}: "${c.a} & ${c.b}" -> ${kb}KB`);
  fs.rmSync(tmpPng, { force: true });
}

await browser.close();
console.log('done');
