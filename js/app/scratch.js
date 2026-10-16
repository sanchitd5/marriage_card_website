import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { petalRain } from './celebration.js';

export function initScratch() {
  const canvas = $('#scratch-canvas');
  const frame = $('.scratch-frame');
  if (!canvas || !frame) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let revealed = false;

  // zari weave: crossed diagonal threads + a lozenge brocade tile, drawn on the foil
  function zari(w, h) {
    const t = Math.max(8, Math.round(Math.min(w, h) / 14));
    const tile = document.createElement('canvas');
    tile.width = tile.height = t * 2;
    const c = tile.getContext('2d');
    c.lineWidth = Math.max(1, t / 8);
    c.strokeStyle = 'rgba(61,42,6,.14)';
    c.beginPath(); c.moveTo(t, 0); c.lineTo(t * 2, t); c.lineTo(t, t * 2); c.lineTo(0, t); c.closePath(); c.stroke();
    c.strokeStyle = 'rgba(255,243,184,.14)';
    c.beginPath(); c.moveTo(t, t * .45); c.lineTo(t * 1.55, t); c.lineTo(t, t * 1.55); c.lineTo(t * .45, t); c.closePath(); c.stroke();
    c.fillStyle = 'rgba(61,42,6,.16)';
    c.beginPath(); c.arc(t, t, t * .1, 0, 7); c.fill();
    ctx.fillStyle = ctx.createPattern(tile, 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1;
    for (let x = -h; x < w; x += 3) {
      ctx.strokeStyle = (x / 3) % 2 ? 'rgba(61,42,6,.10)' : 'rgba(255,243,184,.10)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
    }
  }

  let lastW = 0;
  let lastH = 0;
  function paintFoil() {
    const r = frame.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (w === lastW && h === lastH) return; // same size: keep the scratches

    lastW = w;
    lastH = h;
    canvas.width = w;
    canvas.height = h;

    // Foil skin: Regency = champagne gold; techno = brushed graphite with a
    // cyan sheen (matches the obsidian palette). Branch on the skin hook.
    const techno = document.documentElement.dataset.skin === 'techno';
    const g = ctx.createLinearGradient(0, 0, w, h);
    if (techno) {
      g.addColorStop(0, '#1a1d24');
      g.addColorStop(.25, '#2a2f3a');
      g.addColorStop(.5, '#14161c');
      g.addColorStop(.75, '#2f3542');
      g.addColorStop(1, '#1a1d24');
    } else {
      // burnished antique gold: deep bronze edges, soft highlight band
      g.addColorStop(0, '#8a6a24');
      g.addColorStop(.14, '#f3e2a9');
      g.addColorStop(.3, '#c8a04a');
      g.addColorStop(.46, '#8a6a24');
      g.addColorStop(.62, '#e6c877');
      g.addColorStop(.8, '#b08a35');
      g.addColorStop(1, '#6e5016');
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (!techno) zari(w, h);

    // foil grain
    for (let i = 0; i < w * h / 700; i++) {
      if (techno) {
        ctx.fillStyle = Math.random() > .5 ? 'rgba(34,211,238,.16)' : 'rgba(244,246,251,.12)';
      } else {
        ctx.fillStyle = Math.random() > .5 ? 'rgba(255,243,184,.22)' : 'rgba(61,42,6,.22)';
      }
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }

    if (!techno) {
      // embossed rim: light top-left, shadow bottom-right, inner hairline
      const b = Math.round(Math.min(w, h) * .03);
      ctx.lineWidth = Math.max(2, b * .6);
      ctx.strokeStyle = 'rgba(255,243,184,.55)';
      ctx.beginPath(); ctx.moveTo(b / 2, h - b / 2); ctx.lineTo(b / 2, b / 2); ctx.lineTo(w - b / 2, b / 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(61,42,6,.6)';
      ctx.beginPath(); ctx.moveTo(w - b / 2, b / 2); ctx.lineTo(w - b / 2, h - b / 2); ctx.lineTo(b / 2, h - b / 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(61,42,6,.55)';
      ctx.strokeRect(b * 2, b * 2, w - b * 4, h - b * 4);
    }

    const label = 'SCRATCH TO REVEAL';
    ctx.font = techno
      ? `700 ${Math.round(h * .08)}px "Space Mono", ui-monospace, monospace`
      : `600 ${Math.round(Math.min(h * .085, w * .048))}px Lora, serif`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = techno ? '6px' : `${Math.round(w * .012)}px`;
    const ty = h / 2 + h * .03;
    if (techno) {
      ctx.fillStyle = 'rgba(34,211,238,.62)';
      ctx.fillText(label, w / 2, ty);
    } else {
      // engraved: light edge below, dark edge above, dark brown face
      const o = Math.max(1, Math.round(h * .008));
      const band = ctx.createRadialGradient(w / 2, ty, 0, w / 2, ty, w * .45);
      band.addColorStop(0, 'rgba(255,240,190,.5)');
      band.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, ty - h * .2, w, h * .4);
      ctx.fillStyle = 'rgba(255,235,170,.6)';
      ctx.fillText(label, w / 2, ty + o);
      ctx.fillStyle = '#3a1a08';
      ctx.fillText(label, w / 2, ty);
      // flanking diamonds
      ctx.fillStyle = '#3a1a08';
      const tw = ctx.measureText(label).width / 2 + h * .09;
      for (const sx of [-1, 1]) {
        const cx = w / 2 + sx * tw, d = h * .03;
        ctx.beginPath(); ctx.moveTo(cx, ty - h * .03 - d); ctx.lineTo(cx + d, ty - h * .03); ctx.lineTo(cx, ty - h * .03 + d); ctx.lineTo(cx - d, ty - h * .03); ctx.fill();
      }
    }

    if (appState.scratchAPI.onRepaint) appState.scratchAPI.onRepaint();
  }

  function erase(x, y) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // must be opaque: destination-out erases by source alpha
    ctx.beginPath();
    ctx.arc((x - r.left) * sx, (y - r.top) * sy, 30 * sx, 0, Math.PI * 2);
    ctx.fill();
  }

  function progress() {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 64) {
      total++;
      if (data[i] === 0) clear++;
    }
    return clear / total * 100;
  }

  function reveal() {
    revealed = true;
    canvas.style.pointerEvents = 'none';
    if (window.gsap && !REDUCED) gsap.to(canvas, { autoAlpha: 0, duration: .9, ease: 'power2.out' });
    else canvas.style.opacity = 0;
    if (window.confetti && !REDUCED) petalRain();
  }

  let down = false;
  canvas.addEventListener('pointerdown', e => {
    down = true;
    erase(e.clientX, e.clientY);
  });

  window.addEventListener('pointermove', e => {
    if (down && !revealed) erase(e.clientX, e.clientY);
  });

  window.addEventListener('pointerup', () => {
    if (!down || revealed) {
      down = false;
      return;
    }
    down = false;
    if (progress() > 50) reveal();
  });

  // A cancelled pointer (touch scroll / gesture takeover) never fires pointerup —
  // without this the `down` flag latches on and later moves scratch with no press.
  window.addEventListener('pointercancel', () => { down = false; });

  new ResizeObserver(() => {
    if (!revealed) paintFoil();
  }).observe(frame);
  paintFoil();

  // The foil caption is drawn to canvas; if it paints before the mono/serif face
  // loads it stays in a fallback font, and the size guard then blocks any
  // repaint. Repaint once fonts are ready — but only while the foil is still
  // untouched, so a partial scratch is never erased.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (!revealed && progress() < 2) { lastW = -1; lastH = -1; paintFoil(); }
    }).catch(() => {});
  }

  // hooks for the scroll-driven auto-scratch in initGsap
  appState.scratchAPI.eraseNorm = (nx, ny) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // must be opaque: destination-out erases by source alpha
    ctx.beginPath();
    ctx.arc(nx * canvas.width, ny * canvas.height, canvas.height * 0.16, 0, Math.PI * 2);
    ctx.fill();
  };
  appState.scratchAPI.check = () => {
    if (!revealed && progress() > 50) reveal();
  };
  appState.scratchAPI.revealed = () => revealed;
}
