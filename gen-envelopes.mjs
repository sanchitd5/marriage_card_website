// Offline music-envelope generator for the techno skin's light show.
//
//   node gen-envelopes.mjs
//
// Like the other gen-* scripts, this is a MANUAL asset step — it is NOT wired
// into `node build.js`. It decodes each techno track with ffmpeg and computes,
// per track:
//   • env      — a normalized 0..1 energy envelope at ENV_FPS (drives continuous
//                params: glow, tunnel speed, bar height)
//   • onsets   — beat/onset times in seconds (drives discrete "drop" cues)
//   • flash    — a WCAG 2.3.1 flash-safety report: the max number of large
//                energy jumps per any 1s window. The runtime maps the envelope
//                to LOW-luminance, mostly small-area light, so no full-viewport
//                high-contrast flash exceeds 3/sec for anyone. This build-time
//                lint is the PRIMARY guard (stronger than a runtime clamp);
//                tracks over the limit are flagged so the runtime damps their
//                full-field response to small-area accents only.
//
// Output: assets/audio/techno/envelopes.json  (indexed by track name at runtime
// against audio.currentTime; ships with the techno build).
//
// Requires ffmpeg on PATH (same posture as gen-share-cards.mjs / gen-wide-assets.js).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SR = 11025;          // decode sample rate (plenty for an energy envelope)
const ENV_FPS = 25;        // envelope resolution (runtime interpolates between)
const HOP = Math.round(SR / ENV_FPS);
const WIN = HOP * 2;       // analysis window (overlapping)
// Flash lint: a "large jump" is a rise in normalized energy over this much
// within one envelope frame; WCAG 2.3.1 allows ≤ 3 such flashes per second for
// a full-field high-contrast change.
const FLASH_JUMP = 0.45;
const FLASH_LIMIT_PER_SEC = 3;

const audioDir = path.join(__dirname, 'assets', 'audio', 'techno');

function decodePCM(file) {
  // mono float32 little-endian to stdout
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${file}: ${r.stderr}`);
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

function rmsEnvelope(pcm) {
  const frames = Math.max(1, Math.floor((pcm.length - WIN) / HOP));
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const start = i * HOP;
    let sum = 0;
    for (let j = 0; j < WIN; j++) { const s = pcm[start + j] || 0; sum += s * s; }
    env[i] = Math.sqrt(sum / WIN);
  }
  return env;
}

// Normalize to 0..1 using the 98th percentile as the ceiling (ignores rare
// peaks so the body of the track uses the full range).
function normalize(env) {
  const sorted = Float32Array.from(env).sort();
  const ceil = sorted[Math.floor(sorted.length * 0.98)] || 1e-6;
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) out[i] = Math.min(1, env[i] / ceil);
  return out;
}

// Onsets: positive energy flux peaks above an adaptive local mean.
function detectOnsets(env) {
  const flux = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
  const onsets = [];
  const W = ENV_FPS; // ~1s local window for the adaptive threshold
  let last = -Infinity;
  for (let i = 1; i < flux.length - 1; i++) {
    let mean = 0, n = 0;
    for (let k = Math.max(0, i - W); k < Math.min(flux.length, i + W); k++) { mean += flux[k]; n++; }
    mean /= n;
    const thresh = mean * 1.8 + 0.02;
    if (flux[i] > thresh && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && (i - last) > ENV_FPS * 0.12) {
      onsets.push(+(i / ENV_FPS).toFixed(3));
      last = i;
    }
  }
  return onsets;
}

// Flash lint: max count, over any 1s sliding window, of frame-to-frame rises
// larger than FLASH_JUMP (a would-be large luminance step).
function flashReport(env) {
  const bigJumpFrames = [];
  for (let i = 1; i < env.length; i++) if (env[i] - env[i - 1] > FLASH_JUMP) bigJumpFrames.push(i);
  let maxPerSec = 0;
  for (let a = 0; a < bigJumpFrames.length; a++) {
    let c = 0;
    for (let b = a; b < bigJumpFrames.length; b++) {
      if (bigJumpFrames[b] - bigJumpFrames[a] <= ENV_FPS) c++; else break;
    }
    maxPerSec = Math.max(maxPerSec, c);
  }
  return { maxPerSec, safe: maxPerSec <= FLASH_LIMIT_PER_SEC };
}

function run() {
  if (!fs.existsSync(audioDir)) { console.error(`no ${audioDir} — acquire the techno tracks first`); process.exit(1); }
  const files = fs.readdirSync(audioDir).filter((f) => /^theme-\d+\.mp3$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  if (!files.length) { console.error('no theme-N.mp3 tracks found'); process.exit(1); }

  const out = { fps: ENV_FPS, tracks: {} };
  let anyUnsafe = false;
  for (const f of files) {
    const name = 'techno/' + f.replace(/\.mp3$/, '');
    process.stdout.write(`· ${f} … `);
    const pcm = decodePCM(path.join(audioDir, f));
    const env = normalize(rmsEnvelope(pcm));
    const onsets = detectOnsets(env);
    const flash = flashReport(env);
    if (!flash.safe) anyUnsafe = true;
    out.tracks[name] = {
      duration: +(pcm.length / SR).toFixed(2),
      env: Array.from(env, (v) => +v.toFixed(3)),
      onsets,
      flashMaxPerSec: flash.maxPerSec,
      flashSafe: flash.safe, // false → runtime damps full-field response to small-area accents
    };
    console.log(`${(pcm.length / SR).toFixed(0)}s, ${onsets.length} onsets, flash ${flash.maxPerSec}/s ${flash.safe ? 'OK' : '⚠ DAMPED'}`);
  }

  const outFile = path.join(audioDir, 'envelopes.json');
  fs.writeFileSync(outFile, JSON.stringify(out));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`\nwrote ${outFile} (${kb}KB)`);
  console.log(anyUnsafe
    ? 'NOTE: some tracks exceed 3 large jumps/sec — the runtime keeps their response small-area/low-delta (flash-safe by construction).'
    : 'all tracks within the 3-flash/sec budget for full-field response.');
}

run();
