import { REDUCED, $ } from './dom.js';
import { appState } from './state.js';
import { petalRain } from './celebration.js';

export function initScratch() {
  const canvas = $('#scratch-canvas');
  const frame = $('.scratch-frame');
  if (!canvas || !frame) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let revealed = false;

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
      g.addColorStop(0, '#c9a03e');
      g.addColorStop(.25, '#e8cf8a');
      g.addColorStop(.5, '#b8923a');
      g.addColorStop(.75, '#f0dda6');
      g.addColorStop(1, '#c9a03e');
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // foil speckle
    for (let i = 0; i < w * h / 900; i++) {
      if (techno) {
        ctx.fillStyle = Math.random() > .5 ? 'rgba(34,211,238,.16)' : 'rgba(244,246,251,.12)';
      } else {
        ctx.fillStyle = Math.random() > .5 ? 'rgba(255,244,214,.28)' : 'rgba(122,90,26,.18)';
      }
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }

    ctx.font = techno
      ? `700 ${Math.round(h * .08)}px "Space Mono", ui-monospace, monospace`
      : `500 ${Math.round(h * .09)}px Lora, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = techno ? 'rgba(34,211,238,.62)' : 'rgba(94,70,20,.55)';
    ctx.letterSpacing = techno ? '6px' : '4px';
    ctx.fillText('SCRATCH TO REVEAL', w / 2, h / 2 + h * .03);

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
