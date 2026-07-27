// ── Total solar eclipse (hero object of #lightshow) ───────────────────
// Replaces an earlier black-hole render. Owned by LightShow
// (js/app/lightshow.js), which builds/disposes it with the scene and hands it
// the per-frame energy/beat drive.
//
// WHY AN ECLIPSE. A review panel killed the black hole on two counts. Visually
// it kept reading as Saturn, because faking gravitational lensing with
// billboards leaves ring-system cues (a dark inner gap, a wide flat aspect)
// that only real geodesic raymarching removes. Symbolically it was worse: a
// solitary black hole is a ONE-body image selling a two-person event, and its
// dominant lay reading is annihilation and no-return rather than mutual
// attraction. An eclipse fixes both — two bodies in exact alignment, one ring
// of light, unmistakably ceremonial, and it needs no lensing at all (so the
// whole render-target warp pass is gone with it).
//
// Everything below follows a researcher pass on real totality photography
// (Baumbach–Allen coronal brightness; Ludendorff flattening; ApJ 912,44 on
// K vs F corona; S&T on the diamond ring; NASA GSFC on the chromosphere).
//
//  1. LUNAR DISC — near-black but NOT pure black, with a razor limb. Real
//     photographs sit the disc at 1-3% of inner-corona brightness (scattered
//     light and veiling glare, not earthshine), with a slight inward gradient.
//     There is no atmosphere, so the limb is sub-pixel sharp: antialias it to
//     ~1px and no more. A feathered edge is the single most common CG tell.
//  2. CORONA — the load-bearing layer, and the one that has to have STRUCTURE.
//     Radial falloff is the two-term Baumbach–Allen composite
//     I = 0.055·r^-2.5 + 1.40·r^-7, not a single exponent: the r^-7 term makes
//     the bright inner collar and the r^-2.5 term the far reach. One exponent
//     gives either a fog ball or a ring around a void. The exponent is also
//     latitude-dependent (measured -2.4 at the equator, -2.9 at the pole), so
//     the equator reaches further. Dynamic range limb→3R is ~10^4, hence the
//     mandatory tonemap — real eclipse photos are 20-frame HDR composites.
//  3. SHAPE — solar MINIMUM, flattening ~0.30 (Ludendorff index ~0 at solar
//     max, ~0.4 at min). That is the recognisable eclipse: two long equatorial
//     helmet streamers plus short polar plumes. A round corona reads as a
//     generic glow, which is exactly the failure being fixed. The streamer axis
//     is tilted off horizontal, because a level pair of wings looks like a logo.
//  4. CHROMOSPHERE — a hairline, 0.3-1% of the disc radius, ~1000× brighter
//     than the corona so it clips white, and PARTIAL (it shows only where deep
//     lunar valleys let it through). Really it is H-alpha pink; this skin is
//     palette-locked to cyan, so it is kept as a LUMINANCE feature in near-white
//     rather than rendered in the wrong hue. The thin bright thread hugging a
//     black limb is what the eye reads as "eclipse" — the pink is a colour
//     accuracy detail, and a cyan chromosphere would be indefensible.
//  5. DIAMOND RING — one surviving bead of raw photosphere, ~10^5 brighter than
//     the corona: hard-clipped white with a bloom and lens diffraction spikes.
//     Often not a round bead at all but a short residual crescent. Physically a
//     single exposure cannot hold both this and the corona, but the eye can and
//     essentially every published diamond-ring photograph is an HDR composite,
//     so showing both IS the canonical look. The corona is suppressed while the
//     diamond burns, which is what sells it as one moment rather than two
//     stickers pasted together.
//
// On the palette: a pinned 100%-saturation cyan reads as painted vinyl, because
// real emitters desaturate toward white at their hottest point. The corona
// therefore runs a three-stop intensity→saturation ramp (deep teal → #22d3ee →
// near-white) instead of one flat hue. #22d3ee is still the dominant read.
//
// Flash safety: every layer is driven by the SMOOTHED energy, never a per-beat
// spike, so nothing here is a full-viewport luminance change and the ≤50/sec
// white-flash governor in flash-cap.js is untouched. reduced-motion never
// reaches this file (initLightshow bails before the instance exists).

const DISC_K = 2.6;        // lunar disc radius / rs — kept from the previous object so the anchor maths is unchanged
const CORONA_OUT = 4.5;    // corona annulus outer edge, in disc radii
const FLATTEN = 0.30;      // Ludendorff-style flattening (solar minimum ≈ 0.25-0.35)
const TILT = -0.22;        // streamer axis tilt, rad — level wings look like a logo
const DIAMOND_ANG = 2.42;  // where the surviving bead sits on the limb (rad)

export class Eclipse {
  constructor(THREE, scene, camera, tier, rs, z, ox = 0, oy = 0) {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.tier = tier;
    this.rs = rs;
    this.discR = rs * DISC_K;
    this.center = new THREE.Vector3(ox, oy, z);
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.textures = [];
    this.mats = [];
    this.geos = [];
    this.t = 0;

    this.buildFarHaze();
    this.buildCorona();
    this.buildDisc();
    this.buildChromosphere();
    this.buildDiamond();
    scene.add(this.group);
  }

  track(geo, mat) { if (geo) this.geos.push(geo); if (mat) this.mats.push(mat); return mat; }

  worldPerPx() {
    const vh = 2 * Math.abs(this.center.z) * Math.tan((this.camera.fov * Math.PI / 180) / 2);
    return vh / Math.max(1, window.innerHeight);
  }

  // ── 1. Lunar disc ───────────────────────────────────────────────────
  // The only depth-writing layer, so it genuinely occludes the mote field and
  // the accent glow behind it. Near-black with an inward gradient, razor limb.
  buildDisc() {
    const THREE = this.THREE;
    const geo = new THREE.CircleGeometry(this.discR * 1.02, 128);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: true, depthTest: true, fog: false,
      uniforms: { uR: { value: this.discR } },
      vertexShader: `
        varying vec2 vXY;
        void main(){ vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform float uR;
        varying vec2 vXY;
        void main(){
          float r = length(vXY) / uR;
          // ~1px antialias and not a pixel more — no atmosphere means no terminator
          float aa = fwidth(r) * 1.2;
          float a = 1.0 - smoothstep(1.0 - aa, 1.0, r);
          if (a <= 0.002) discard;
          // 1-3% of inner-corona brightness, brighter just inside the limb:
          // scattered light and veiling glare, not a lit surface
          vec3 col = mix(vec3(0.004, 0.010, 0.016), vec3(0.012, 0.030, 0.040), pow(r, 3.0));
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.disc = new THREE.Mesh(geo, this.track(geo, mat));
    this.disc.renderOrder = 2;   // after the corona: the moon is in FRONT of it
    this.group.add(this.disc);
  }

  // ── 2/3. Corona ─────────────────────────────────────────────────────
  buildCorona() {
    const THREE = this.THREE;
    const geo = new THREE.RingGeometry(this.discR * 0.99, this.discR * CORONA_OUT, 160, 1);
    const oct = this.tier >= 2 ? 4 : this.tier === 1 ? 3 : 2;
    const fine = this.tier >= 2 ? 1 : 0;   // drop the finest thread layer below tier 2
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uR: { value: this.discR }, uTime: { value: 0 },
        uBright: { value: 1.0 }, uDiamond: { value: 0.0 },
        uFlat: { value: FLATTEN }, uTilt: { value: TILT },
      },
      vertexShader: `
        varying vec2 vXY;
        void main(){ vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        #define OCT ${oct}
        #define FINE ${fine}
        uniform float uR, uTime, uBright, uDiamond, uFlat, uTilt;
        varying vec2 vXY;

        float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vnoise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
                     mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
        }
        float fbm(vec2 p){
          float a = 0.5, s = 0.0;
          for (int i = 0; i < OCT; i++) { s += a * vnoise(p); p *= 2.0; a *= 0.5; }
          return s;
        }

        void main(){
          vec2 p = vXY / uR;                       // disc-radius units

          // (A) flattening, applied in the SAMPLING coords so streamers stretch too
          float c = cos(uTilt), s = sin(uTilt);
          vec2 q = mat2(c, -s, s, c) * p;
          q.y /= (1.0 - uFlat);
          float r = length(q);
          if (r < 1.0) discard;                    // behind the moon
          float th = atan(q.y, q.x);

          // (B) equator reaches further than the pole (measured -2.4 vs -2.9)
          float lat = abs(sin(th));
          float expo = mix(2.40, 2.90, lat);

          // (C) Baumbach-Allen: r^-7 inner collar + r^-2.5 far reach
          float base = 0.055 * pow(r, -expo) + 1.40 * pow(r, -7.0);

          // (D) STREAMERS. Noise is sampled on the UNIT CIRCLE, never on th
          // directly — that is seamless and aperiodic, whereas any sin(n*th)
          // term is a periodic spoke generator and reads instantly as CG. The
          // log(r) shear makes streamers CURVE with radius instead of spoking,
          // and the stretched radial domain elongates features along r into
          // filaments.
          float shear = 0.35 * log(r);
          vec2 dir = vec2(cos(th + shear), sin(th + shear));
          float drift = uTime * 0.02;              // corona is static on human timescales
          float n1 = fbm(dir * 2.2 + vec2(drift, r * 0.30));
          float n2 = fbm(dir * 6.0 + vec2(11.0 - drift, r * 0.55));
          float nsum = n1 * 0.62 + n2 * 0.38;
          #if FINE
            float n3 = fbm(dir * 17.0 + vec2(23.0, r * 0.90));
            nsum = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
          #endif
          // ridged → bright thin crests (filaments), not soft clouds
          float ridge = pow(1.0 - abs(nsum), 3.0);
          // inner corona is smooth, outer corona is all structure
          float structAmt = smoothstep(1.02, 2.2, r);
          float struc = mix(1.0, 0.35 + 1.9 * ridge, structAmt);
          // helmet streamers: broad at the base, pinched to a cusp at the tip
          struc *= 1.0 + 0.5 * smoothstep(1.0, 1.5, r) * smoothstep(4.5, 2.0, r);

          // (E) polar plumes — short, straight, high frequency, equator-suppressed;
          // and equatorial streamers are markedly brighter than the plumes
          float plume = pow(max(0.0, lat - 0.55) / 0.45, 2.0)
                      * exp(-(r - 1.0) * 3.2)
                      * (0.5 + 0.5 * fbm(dir * 30.0));
          float eqBoost = 1.0 + 0.9 * pow(1.0 - lat, 3.0);

          float I = (base * struc * eqBoost + plume * 0.25) * uBright;

          // (F) tonemap — the limb→3R range is ~10^4, so this is mandatory
          float L = 1.0 - exp(-I * 5.5);   // k tuned so the streamers clear the noise floor
          // (H) the diamond outshines the corona by ~10^5; dim it while lit
          L *= mix(1.0, 0.55, uDiamond);
          if (L <= 0.003) discard;

          // (G) intensity → saturation. A flat 100%-saturation cyan reads as
          // painted vinyl; real emitters desaturate toward white where hottest.
          vec3 COOL = vec3(0.04, 0.20, 0.30);
          vec3 MID  = vec3(0.133, 0.827, 0.933);   // #22d3ee
          vec3 HOT  = vec3(0.92, 0.99, 1.00);
          vec3 col = mix(COOL, MID, smoothstep(0.0, 0.35, L));
          col = mix(col, HOT, smoothstep(0.55, 1.0, L));
          gl_FragColor = vec4(col * L, L);
        }`,
    });
    this.corona = new THREE.Mesh(geo, this.track(geo, mat));
    this.corona.renderOrder = 1;
    this.coronaMat = mat;
    this.group.add(this.corona);
  }

  // ── 4. Chromosphere ─────────────────────────────────────────────────
  // A hairline on the limb, clipped white, and only on part of the
  // circumference — it shows through deep lunar valleys, not all the way round.
  buildChromosphere() {
    const THREE = this.THREE;
    const geo = new THREE.RingGeometry(this.discR * 1.0, this.discR * 1.014, 256, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, fog: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uBright: { value: 1.0 } },
      vertexShader: `
        varying vec2 vXY;
        void main(){ vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform float uBright;
        varying vec2 vXY;
        float hash11(float x){ return fract(sin(x * 91.3458) * 47453.5453); }
        float n1d(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(hash11(i), hash11(i+1.0), f); }
        void main(){
          float ang = atan(vXY.y, vXY.x);
          // irregular arcs: present on roughly half the limb, as in a real photo
          float m = n1d(ang * 3.4 + 1.7) * 0.6 + n1d(ang * 9.1) * 0.4;
          float vis = smoothstep(0.42, 0.68, m);
          if (vis <= 0.01) discard;
          // near-white, not H-alpha pink: the palette is cyan-locked, and the
          // read is "thin bright thread on a black limb", not the hue
          gl_FragColor = vec4(vec3(0.88, 0.98, 1.0) * vis * uBright * 1.6, vis * uBright);
        }`,
    });
    this.chromo = new THREE.Mesh(geo, this.track(geo, mat));
    this.chromo.renderOrder = 3;
    this.chromoMat = mat;
    this.group.add(this.chromo);
  }

  // ── 5. Diamond ring ─────────────────────────────────────────────────
  // One surviving bead: a hard white core, a bloom, and lens diffraction
  // spikes — all baked into a single sprite texture so it is one draw call.
  buildDiamond() {
    const THREE = this.THREE;
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const h = S / 2;
    const rg = g.createRadialGradient(h, h, 0, h, h, h);
    rg.addColorStop(0.00, 'rgba(255,252,246,1)');      // ~3200K: the single warm point on the page
    rg.addColorStop(0.045, 'rgba(255,246,232,0.95)');
    rg.addColorStop(0.11, 'rgba(214,247,255,0.42)');
    rg.addColorStop(0.30, 'rgba(120,220,255,0.12)');
    rg.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    // diffraction spikes — every real photograph of this has them
    g.globalCompositeOperation = 'lighter';
    g.translate(h, h);
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate((Math.PI / 2) * i + Math.PI / 4);
      const lg = g.createLinearGradient(0, 0, h, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0.42)');
      lg.addColorStop(0.12, 'rgba(190,240,255,0.28)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, -1.7); g.lineTo(h * 0.6, -0.4); g.lineTo(h * 0.6, 0.4); g.lineTo(0, 1.7); g.closePath(); g.fill();
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    this.textures.push(tex);
    const mat = new THREE.SpriteMaterial({
      map: tex, color: 0xffffff, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    });
    this.mats.push(mat);
    this.diamond = new THREE.Sprite(mat);
    this.diamond.scale.set(this.discR * 3.4, this.discR * 3.4, 1);
    // sits ON the limb, not floating outside it
    this.diamond.position.set(Math.cos(DIAMOND_ANG) * this.discR, Math.sin(DIAMOND_ANG) * this.discR, 0.01);
    this.diamond.renderOrder = 4;
    this.diamondMat = mat;
    this.group.add(this.diamond);
  }

  // ── Far F-corona haze ───────────────────────────────────────────────
  // The dust corona: smooth, featureless, elliptical, flattened on the ecliptic.
  // Broad and very faint — it is the reach that keeps the corona from ending in
  // a hard edge. Skipped on tier 0.
  buildFarHaze() {
    if (this.tier < 1) return;
    const THREE = this.THREE;
    const S = 128;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0.00, 'rgba(150,225,255,0.30)');
    rg.addColorStop(0.22, 'rgba(90,190,230,0.13)');
    rg.addColorStop(0.55, 'rgba(40,120,160,0.045)');
    rg.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    this.textures.push(tex);
    const mat = new THREE.SpriteMaterial({
      map: tex, color: 0x9fe4ff, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    });
    this.mats.push(mat);
    this.haze = new THREE.Sprite(mat);
    const w = this.discR * 9.0;
    this.haze.scale.set(w, w * (1 - 0.45), 1);   // flattened on the ecliptic axis
    this.haze.renderOrder = 0;
    this.hazeMat = mat;
    this.group.add(this.haze);
  }

  resize(pixelRatio) {
    this.rendererPR = pixelRatio;
  }

  setCenterOffset(ox, oy, oz = this.center.z) {
    if (this.center.x === ox && this.center.y === oy && this.center.z === oz) return;
    this.center.x = ox; this.center.y = oy; this.center.z = oz;
    this.group.position.copy(this.center);
  }

  update(dt, now, energy, beat, ignite) {
    this.t += dt;
    this.group.visible = ignite > 0.02;   // dormant pre-tap, like the rest of the show

    // The diamond breathes slowly rather than strobing — it is the hero
    // highlight, and a per-beat spike here would be a large-area luminance
    // change (the flash budget lives in flash-cap.js and is not ours to spend).
    const breathe = 0.62 + 0.38 * Math.sin(now * 0.22);
    const dia = (0.45 + 0.55 * breathe) * (0.35 + 0.65 * energy) * ignite;

    if (this.coronaMat) {
      this.coronaMat.uniforms.uTime.value = this.t;
      this.coronaMat.uniforms.uBright.value = (1.55 + energy * 0.85) * ignite;
      this.coronaMat.uniforms.uDiamond.value = Math.min(1, dia);
    }
    if (this.chromoMat) this.chromoMat.uniforms.uBright.value = (0.5 + energy * 0.5) * ignite;
    if (this.diamondMat) this.diamondMat.opacity = Math.min(1, dia * 0.9);
    if (this.hazeMat) this.hazeMat.opacity = (0.16 + energy * 0.20) * ignite;
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const g of this.geos) { try { g.dispose(); } catch (e) {} }
    for (const m of this.mats) { try { m.dispose(); } catch (e) {} }
    for (const t of this.textures) { try { t.dispose(); } catch (e) {} }
    this.geos = []; this.mats = []; this.textures = [];
    this.coronaMat = this.chromoMat = this.diamondMat = this.hazeMat = null;
  }
}
