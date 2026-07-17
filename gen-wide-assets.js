#!/usr/bin/env node
/**
 * gen-wide-assets.js
 * Generates desktop/tablet landscape (16:9) variants of gate images and
 * a landscape gate-reveal-day video. Run with:
 *   GEMINI_API_KEY=<key> node gen-wide-assets.js
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('❌  GEMINI_API_KEY not set'); process.exit(1); }

const GEN_DIR = path.join(__dirname, 'assets/images/gen');
const IMG_DIR = path.join(__dirname, 'assets/images');
const VID_DIR = path.join(__dirname, 'assets/videos');
fs.mkdirSync(GEN_DIR, { recursive: true });

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = Object.assign(require('url').parse(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    });
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          let parsed = JSON.parse(Buffer.concat(chunks).toString());
          // Some endpoints wrap the response in an array — unwrap it
          if (Array.isArray(parsed)) parsed = parsed[0];
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Image generation ────────────────────────────────────────────────────────

const IMAGEN_ULTRA = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key=${KEY}`;
const IMAGEN_STD   = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${KEY}`;
const GEMINI_IMG   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${KEY}`;

async function tryImagen(url, prompt) {
  const r = await post(url, {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: '16:9' },
  });
  if (r.error) throw new Error(`${r.error.code}: ${r.error.message}`);
  const b64 = r.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('No image bytes');
  return Buffer.from(b64, 'base64');
}

async function generateImage(prompt, outPng) {
  // ── Try Imagen 4 Ultra ──────────────────────────────────────────────────────
  for (const [label, url] of [['Imagen 4 Ultra', IMAGEN_ULTRA], ['Imagen 4', IMAGEN_STD]]) {
    console.log(`  → Trying ${label}…`);
    try {
      const buf = await tryImagen(url, prompt);
      fs.writeFileSync(outPng, buf);
      console.log(`  ✓ ${label} → ${outPng}`);
      return;
    } catch (e) {
      console.warn(`  ⚠  ${label} failed (${e.message.slice(0, 80)}), trying next…`);
    }
  }

  // ── Fallback: gemini-3-pro-image ────────────────────────────────────────────
  console.log(`  → Trying gemini-3-pro-image…`);
  const r = await post(GEMINI_IMG, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    },
  });
  if (r.error) throw new Error(`gemini-3-pro-image: ${r.error.code}: ${r.error.message}`);
  const part = r.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!part) {
    console.error('Full response:', JSON.stringify(r, null, 2));
    throw new Error('gemini-3-pro-image returned no image data');
  }
  fs.writeFileSync(outPng, Buffer.from(part.inlineData.data, 'base64'));
  console.log(`  ✓ gemini-3-pro-image → ${outPng}`);
}

// ─── Video generation ────────────────────────────────────────────────────────
// Primary: veo-3.1-generate-preview with image-to-video conditioning
// Fallback: gemini-omni-flash-preview via /v1beta/interactions (text-to-video)

const VEO_URL          = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning?key=${KEY}`;
const INTERACTIONS_URL = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${KEY}`;

/**
 * @param {string} prompt
 * @param {string} outMp4
 * @param {string|null} firstFramePath  Path to a JPEG/PNG to condition the first frame
 */
async function generateVideo(prompt, outMp4, firstFramePath = null) {
  // ── Primary: Veo 3.1 (image-to-video when firstFrame provided) ─────────────
  console.log(`  → Trying Veo 3.1${firstFramePath ? ' (image-to-video)' : ''}…`);
  try {
    const instance = { prompt };
    if (firstFramePath && fs.existsSync(firstFramePath)) {
      instance.image = {
        bytesBase64Encoded: fs.readFileSync(firstFramePath).toString('base64'),
        mimeType: firstFramePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
      };
    }
    const r = await post(VEO_URL, {
      instances: [instance],
      parameters: { aspectRatio: '16:9', sampleCount: 1, durationSeconds: 8, resolution: '720p' },
    });
    if (r.error) throw new Error(`${r.error.code}: ${r.error.message}`);
    await pollVeoOperation(r, outMp4);
    return;
  } catch (e) {
    console.warn(`  ⚠  Veo 3.1 failed (${e.message.slice(0, 90)}), falling back to gemini-omni…`);
  }

  // ── Fallback: gemini-omni-flash-preview (text-to-video, synchronous) ────────
  console.log(`  → Trying gemini-omni-flash-preview (interactions)…`);
  const r2 = await post(INTERACTIONS_URL, {
    model: 'models/gemini-omni-flash-preview',
    input: prompt,
    generation_config: { video_config: { task: 'text_to_video' } },
    response_modalities: ['video'],
    response_format: { type: 'video', duration: '7s' },
  });
  if (r2.error) throw new Error(`gemini-omni: ${r2.error.code}: ${r2.error.message}`);
  const videoStep = (r2.steps || []).find(s => s.type === 'model_output');
  const videoPart = (videoStep?.content || []).find(c => c.mime_type?.startsWith('video/'));
  if (!videoPart?.data) throw new Error('gemini-omni returned no video data');
  fs.writeFileSync(outMp4, Buffer.from(videoPart.data, 'base64'));
  console.log(`  ✓ gemini-omni-flash-preview → ${outMp4}`);
}

async function pollVeoOperation(opResponse, outMp4) {
  const opName = opResponse.name;
  if (!opName) throw new Error(`Veo: no operation name. Response: ${JSON.stringify(opResponse).slice(0, 200)}`);

  console.log(`  ⏳ Polling ${opName}…`);
  // op_name is already the full resource path, e.g. "models/veo-.../operations/xyz"
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${KEY}`;
  for (let i = 0; i < 72; i++) {   // up to 12 minutes
    await sleep(10000);
    const status = await get(pollUrl);
    if (status.error) throw new Error(`Poll error: ${JSON.stringify(status.error)}`);
    if (status.done) {
      // correct path: .response.generateVideoResponse.generatedSamples[0].video.uri
      const samples = status.response?.generateVideoResponse?.generatedSamples;
      if (!samples?.length) {
        throw new Error(`Veo done but no samples. response keys: ${Object.keys(status.response || {}).join(', ')}`);
      }
      const videoUri = samples[0]?.video?.uri;
      if (!videoUri) throw new Error(`No video URI in sample: ${JSON.stringify(samples[0]).slice(0, 200)}`);
      // URI requires the API key for authenticated download
      await downloadFile(`${videoUri}&key=${KEY}`, outMp4);
      console.log(`  ✓ Veo 3.1 → ${outMp4}`);
      return;
    }
    process.stdout.write(`  ⏳ Still processing… (${(i + 1) * 10}s elapsed)\r`);
  }
  throw new Error('Veo job timed out after 12 minutes');
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', e => { fs.unlink(dest, () => {}); reject(e); });
  });
}

// ─── sips crop helper ────────────────────────────────────────────────────────
// Crops a PNG to 1920×1080 (center crop) and saves as JPG

function cropToJpg(srcPng, destJpg, w = 1920, h = 1080) {
  try {
    // First get dimensions
    const info = execSync(`sips -g pixelWidth -g pixelHeight "${srcPng}" 2>/dev/null`).toString();
    const pw = parseInt((info.match(/pixelWidth:\s*(\d+)/) || [])[1]);
    const ph = parseInt((info.match(/pixelHeight:\s*(\d+)/) || [])[1]);
    if (!pw || !ph) throw new Error('Could not read dimensions');

    // Scale so the smallest dimension fits, then crop center
    const scaleW = w / pw, scaleH = h / ph;
    const scale  = Math.max(scaleW, scaleH);
    const scaledW = Math.round(pw * scale);
    const scaledH = Math.round(ph * scale);
    const cropX  = Math.round((scaledW - w) / 2);
    const cropY  = Math.round((scaledH - h) / 2);

    // sips: resample then crop
    execSync(`sips --resampleWidth ${scaledW} "${srcPng}" --out /tmp/_wide_scaled.png 2>/dev/null`);
    execSync(`sips --cropToHeightWidth ${h} ${w} --cropOffset ${cropY} ${cropX} /tmp/_wide_scaled.png --out /tmp/_wide_cropped.png 2>/dev/null`);
    execSync(`sips -s format jpeg -s formatOptions 90 /tmp/_wide_cropped.png --out "${destJpg}" 2>/dev/null`);
    console.log(`  ✓ Cropped → ${destJpg} (${w}×${h})`);
  } catch (e) {
    // Fallback: just convert without crop
    console.warn(`  ⚠  sips crop failed (${e.message}), using direct convert`);
    execSync(`sips -s format jpeg -s formatOptions 90 "${srcPng}" --out "${destJpg}" 2>/dev/null`);
    console.log(`  ✓ Converted (no crop) → ${destJpg}`);
  }
}

// ─── Asset definitions ───────────────────────────────────────────────────────

const IMAGE_ASSETS = [
  {
    key: 'gate-closed-wide',
    gen: path.join(GEN_DIR, 'gate-closed-wide.png'),
    out: path.join(IMG_DIR, 'art-gate-closed-wide.jpg'),
    prompt: `Wide cinematic landscape oil painting: royal Indian palace entrance, twin towering gilded doors sealed shut, ornate carved wood with gold filigree patterns, marigold and wisteria garland toran draped above the arch, flanked by marble columns adorned with peacock motifs and climbing jasmine, dusty lavender sky, champagne gold light, warm afternoon atmosphere, Regency-era Indian palace aesthetic, dusty pastel palette — lavender, blush, champagne — generous sky and flanking space, wide establishing composition, impressionist painted style, soft cinematic lighting, no people`,
  },
  {
    key: 'gate-open-wide',
    gen: path.join(GEN_DIR, 'gate-open-wide.png'),
    out: path.join(IMG_DIR, 'art-gate-open-wide.jpg'),
    prompt: `Wide cinematic landscape oil painting: royal Indian palace entrance, twin gilded doors swung dramatically open, ornate carved wood pushed to the sides, revealing a sunlit golden marble courtyard beyond with marigold petals drifting in the air and a distant fountain, marigold and wisteria garlands still draping the arch above, champagne gold streaming afternoon light, Regency-era Indian palace aesthetic, dusty pastel palette — lavender, blush, champagne gold — wide establishing composition, impressionist painted style, magical inviting atmosphere, no people`,
  },
  {
    key: 'gate-closed-night-wide',
    gen: path.join(GEN_DIR, 'gate-closed-night-wide.png'),
    out: path.join(IMG_DIR, 'art-gate-closed-night-wide.jpg'),
    prompt: `Wide cinematic landscape oil painting: royal Indian palace entrance at night, twin gilded doors sealed shut, warm golden oil lamp diyas and candles flanking the steps, marigold and wisteria garland toran glowing softly in candlelight, deep indigo and violet night sky with twinkling stars above, peacock motifs on columns catching warm light, mysterious and romantic atmosphere, Regency-era Indian palace aesthetic, rich jewel-toned night palette — deep indigo, warm gold, blush — impressionist painted style, no people`,
  },
  {
    key: 'gate-open-night-wide',
    gen: path.join(GEN_DIR, 'gate-open-night-wide.png'),
    out: path.join(IMG_DIR, 'art-gate-open-night-wide.jpg'),
    prompt: `Wide cinematic landscape oil painting: royal Indian palace entrance at night, twin gilded doors swung wide open, warm golden candlelight and oil lamp diyas emanating from within the courtyard beyond, floating marigold petals glowing in the light, deep indigo star-filled sky above, marigold and wisteria garlands on arch framing the opening, magical dreamy atmosphere, Regency-era Indian palace aesthetic, jewel-toned night palette — deep indigo, warm gold, champagne, blush — impressionist painted style, no people`,
  },
];

const VIDEO_ASSETS = [
  {
    key: 'gate-reveal-day-wide',
    out: path.join(VID_DIR, 'gate-reveal-day-wide.mp4'),
    // first frame extracted from video → overwrites the generated still
    closedStill: path.join(IMG_DIR, 'art-gate-closed-wide.jpg'),
    prompt: `Starting from a still painting of royal Indian palace entrance doors sealed shut — ornate gilded doors, marigold and wisteria garland toran above the arch, warm champagne gold afternoon light, dusty lavender sky. The doors then slowly and gracefully swing open from center, marigold petals floating inward, revealing a sunlit marble courtyard beyond. Champagne gold and lavender palette, painterly impressionist aesthetic, gentle motion, no people, smooth cinematic camera slightly drifting forward`,
  },
  {
    key: 'gate-reveal-night-wide',
    out: path.join(VID_DIR, 'gate-reveal-night-wide.mp4'),
    // first frame extracted from video → overwrites the generated still
    closedStill: path.join(IMG_DIR, 'art-gate-closed-night-wide.jpg'),
    prompt: `Starting from a still painting of royal Indian palace entrance doors sealed shut at night — gilded ornate doors, oil lamp diyas glowing on the steps, marigold and wisteria garland toran in warm candlelight, deep indigo star-filled sky. The doors then slowly and gracefully swing open from center, marigold petals floating inward, warm candlelight streaming through the opening to reveal a magical courtyard with twinkling stars. Deep indigo and warm gold palette, painterly impressionist aesthetic, gentle motion, no people, smooth cinematic camera slightly drifting forward`,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let allOk = true;

  // ── Images ──────────────────────────────────────────────────────────────────
  for (const a of IMAGE_ASSETS) {
    console.log(`\n📸  Generating ${a.key}…`);
    try {
      if (fs.existsSync(a.out)) {
        console.log(`  ✓ Already exists: ${a.out} — skipping`);
        continue;
      }
      await generateImage(a.prompt, a.gen);
      cropToJpg(a.gen, a.out);
    } catch (e) {
      console.error(`  ✗ FAILED: ${e.message}`);
      allOk = false;
    }
  }

  // ── Videos ──────────────────────────────────────────────────────────────────
  for (const v of VIDEO_ASSETS) {
    console.log(`\n🎬  Generating video ${v.key}…`);
    try {
      if (fs.existsSync(v.out)) {
        console.log(`  ✓ Already exists: ${v.out} — skipping`);
      } else {
        await generateVideo(v.prompt, v.out, v.firstFrame || null);
      }
      // Always (re)extract first frame → closed-gate still must match video exactly
      if (v.closedStill) {
        console.log(`  → Extracting first frame → ${v.closedStill}…`);
        execSync(`ffmpeg -y -i "${v.out}" -vframes 1 -q:v 2 "${v.closedStill}" 2>/dev/null`);
        console.log(`  ✓ First frame → ${v.closedStill}`);
      }
    } catch (e) {
      console.error(`  ✗ FAILED: ${e.message}`);
      allOk = false;
    }
  }

  console.log('\n' + (allOk ? '✅  All assets generated.' : '⚠️  Some assets failed — see above.'));
  console.log('\n📋  Next step: update index.html + gate.js to serve wide assets on ≥ 768px viewports.');
}

main().catch(e => { console.error(e); process.exit(1); });
