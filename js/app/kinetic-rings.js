import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';

// ── Kinetic interactive rings (saifullah.dev-style hero object) ───────────
// Two interlocked low-poly wireframe rings — wedding bands crossed with a
// DJ/vinyl motif — rendered as cyan additive LineSegments on obsidian. The
// guest can DRAG to spin them (mouse + touch, one Pointer-Events path) with
// inertia; left alone they auto-yaw and bob gently. Adapted from saifullah.dev's
// draggable hero primitive, reskinned for the techno wedding theme.
//
// Context-count tradeoff: this runs on its OWN small, low-DPR WebGL context
// (#k-rings-canvas) rather than sharing the techno backdrop context in
// lightshow.js. A second context costs a little GPU memory, but it keeps this
// object self-contained (its own scene graph, its own pause/resume gating) and
// avoids threading a draggable overlay through the full-screen tunnel scene.
// We keep the cost down: DPR capped low, RAF runs ONLY while #rings is on
// screen and the tab is visible, and pointer listeners attach only in view.
//
// Safety & fallbacks (the inline SVG in the template stands in for all of them):
//  • reduced-motion → never inits (no context created); SVG fallback stays.
//  • no window.THREE / no canvas → return; SVG fallback stays.
//  • webglcontextlost → show the SVG fallback again and stop.
//  • any init throw → SVG fallback stays visible, return.

export function initKineticRings() {
  if (REDUCED) return;                                   // static SVG fallback path
  const THREE = window.THREE;
  if (!THREE) return;                                    // SVG fallback stays visible

  const stage = $('#k-rings-stage');
  const canvas = $('#k-rings-canvas');
  const fallback = $('#k-rings-fallback');
  const hint = $('#k-rings-hint');
  const section = $('#rings');
  if (!stage || !canvas) return;                         // nothing to render into

  // ---- CSS hooks toggled by this module (matched in kinetic.css) ----
  //  stage#k-rings-stage : + 'is-live' when the canvas is rendering,
  //                        + 'is-grabbing' while a drag is active (cursor hook)
  //  canvas#k-rings-canvas : aria-hidden removed when live
  //  #k-rings-fallback : 'hidden' attribute set when live (restored on ctx loss)
  //  #k-rings-hint : + 'is-hidden' after the first interaction
  function showFallback() {
    stage.classList.remove('is-live');
    if (fallback) fallback.removeAttribute('hidden');
    canvas.setAttribute('aria-hidden', 'true');
  }
  let live = false;
  function goLive() {
    if (live) return;
    live = true;
    if (fallback) fallback.setAttribute('hidden', '');
    canvas.removeAttribute('aria-hidden');
    stage.classList.add('is-live');
  }

  // ---- renderer (small, low-DPR, own context) ----
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let renderer, scene, camera, rig, spin, disposables = [];
  let running = false, inView = false, raf = 0, dead = false;

  function stageSize() {
    return { w: stage.clientWidth || 1, h: stage.clientHeight || 1 };
  }

  // A ring = shared wireframe geometry drawn twice for a fake-bloom look:
  // a bright CORE plus a HALO copy scaled ~1.03. linewidth is ignored on WebGL,
  // so the apparent thickness/glow comes entirely from the additive halo, never
  // from a linewidth setting.
  function makeRing() {
    const torus = new THREE.TorusGeometry(1, 0.30, 8, 48); // 8 radial segs → faceted, jewel-like
    const wire = new THREE.WireframeGeometry(torus);
    torus.dispose();
    const coreMat = new THREE.LineBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const haloMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.LineSegments(wire, coreMat);
    const halo = new THREE.LineSegments(wire, haloMat);
    halo.scale.setScalar(1.03);
    const g = new THREE.Group();
    g.add(halo, core);
    disposables.push(wire, coreMat, haloMat);
    return g;
  }

  function build() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    // A lost context (iOS backgrounding, GPU reset) would freeze a dead frame;
    // drop back to the SVG fallback instead.
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); floor(); }, false);
    renderer.setPixelRatio(dpr);
    const { w, h } = stageSize();
    renderer.setSize(w, h, false);

    scene = new THREE.Scene();                            // no fog — this is a clean object shot
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.2);                       // pulled back to frame both rings
    camera.lookAt(0, 0, 0);

    // rig = outer container (bob + subtle desktop parallax);
    // spin = inner container that actually holds the rings (drag / inertia / idle yaw).
    rig = new THREE.Group();
    spin = new THREE.Group();
    rig.add(spin);
    scene.add(rig);

    // Two rings interlocked like chain links, in ONE spin group so they turn
    // together. Ring A sits in the XY plane (hole axis = Z), centred at x=-0.5.
    // Ring B is rotated 90° about X (into the XZ plane) and centred at x=+0.5;
    // its inner arc (local torus point (-1,0,0)) lands exactly on ring A's hole
    // centre (-0.5,0,0) with ~0.7 clearance, so one arc threads THROUGH ring A
    // while the rest wraps outside — a true link, not a flat crossing. The pair
    // is symmetric about the origin so the group is already framed.
    const ringA = makeRing();
    ringA.position.x = -0.5;
    const ringB = makeRing();
    ringB.position.x = 0.5;
    ringB.rotation.x = Math.PI / 2;
    spin.add(ringA, ringB);
    // a small resting tilt so the interlock reads in 3D from the first frame
    spin.rotation.set(-0.35, -0.5, 0);
  }

  // ---- interaction state (drag → inertia → idle yaw) ----
  const DRAG_K = 0.008;          // px → radians
  const FRICTION = 0.94;         // inertia decay per frame
  const IDLE_YAW = 0.15;         // rad/sec auto-spin
  let dragging = false, lastX = 0, lastY = 0, velX = 0, velY = 0;
  let parallax = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  let ptrNX = 0, ptrNY = 0;      // pointer position over the stage, normalised -0.5..0.5

  function hideHint() { if (hint) hint.classList.add('is-hidden'); }

  function onDown(e) {
    dragging = true;
    velX = velY = 0;             // kill idle-yaw / inertia contribution while dragging
    lastX = e.clientX; lastY = e.clientY;
    stage.classList.add('is-grabbing');
    hideHint();
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) {
    // track pointer over the stage for desktop parallax (even when not dragging)
    const r = stage.getBoundingClientRect();
    ptrNX = (e.clientX - r.left) / (r.width || 1) - 0.5;
    ptrNY = (e.clientY - r.top) / (r.height || 1) - 0.5;
    if (!dragging || !spin) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    spin.rotation.y += dx * DRAG_K;
    spin.rotation.x += dy * DRAG_K;
    velY = dx * DRAG_K;          // angular velocity handed to inertia on release
    velX = dy * DRAG_K;
    // touch-action:pan-y (set in CSS) already lets vertical scroll pass; only
    // suppress the browser's default gesture while we're actively spinning.
    if (e.cancelable) e.preventDefault();
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-grabbing');
    try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
    // velX/velY persist → inertia continues in frame() until it decays out.
  }

  function attachPointer() {
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
  }
  function detachPointer() {
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerup', onUp);
    stage.removeEventListener('pointercancel', onUp);
    if (dragging) { dragging = false; stage.classList.remove('is-grabbing'); }
  }

  // ---- main loop ----
  let last = 0;
  function frame(ts) {
    if (!running || dead) return;
    const now = ts / 1000;
    const dt = last ? Math.min(0.05, now - last) : 0.016;
    last = now;

    const settled = Math.abs(velX) < 1e-4 && Math.abs(velY) < 1e-4;
    if (!dragging) {
      if (!settled) {
        // inertia: keep spinning, decaying by friction each frame
        spin.rotation.y += velY;
        spin.rotation.x += velX;
        velX *= FRICTION; velY *= FRICTION;
      } else {
        velX = velY = 0;
        spin.rotation.y += IDLE_YAW * dt;   // idle auto-spin resumes
      }
    }

    // gentle idle bob (from the reference's idle sine bob) on the outer rig
    rig.position.y = Math.sin(now / 2) / 16;

    // subtle desktop pointer parallax — only when not dragging, only fine hover
    if (parallax && !dragging) {
      const tx = ptrNY * 0.12, ty = ptrNX * 0.12;
      rig.rotation.x += (tx - rig.rotation.x) * 0.05;
      rig.rotation.y += (ty - rig.rotation.y) * 0.05;
    }

    renderer.render(scene, camera);
    if (!live) goLive();                     // first successful render → reveal canvas
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (dead || running || !inView || document.hidden) return;
    running = true; last = 0; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function onResize() {
    if (dead || !renderer) return;
    const { w, h } = stageSize();
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // ---- teardown to the SVG fallback (context loss) ----
  function floor() {
    dead = true; stop(); detachPointer();
    showFallback();
    for (const d of disposables) { try { d.dispose(); } catch (_) {} }
    disposables = [];
    if (renderer) { try { renderer.dispose(); } catch (_) {} }
    scene = camera = rig = spin = renderer = null;
  }

  try {
    build();
  } catch (e) {
    floor();
    return;
  }

  // ---- active-gate: run RAF + pointer listeners only while the rings are the
  //      on-screen act AND the tab is visible; pause otherwise to spare the GPU.
  // Single entry point so both the scroll (IntersectionObserver) and the
  // non-scrolling deck can drive it. In deck mode the page never scrolls, so the
  // IO can't tell whether #rings is the current act — the deck calls setInView().
  function setInView(v) {
    if (dead || v === inView) return;
    inView = v;
    if (inView) { attachPointer(); start(); }
    else { stop(); detachPointer(); }
  }
  const deckMode = document.documentElement.classList.contains('k-deck');
  if (deckMode) {
    // wait for the deck (kinetic.js) to call appState.rings.setInView(true/false)
  } else if (section && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      setInView(entries.some((en) => en.isIntersecting));
    }, { threshold: 0.05 });
    io.observe(section);
  } else {
    setInView(true);  // no IO → always live
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(onResize);
    ro.observe(stage);
  } else {
    window.addEventListener('resize', onResize, { passive: true });
  }

  appState.rings = { start, stop, setInView, get live() { return live; } };
}
