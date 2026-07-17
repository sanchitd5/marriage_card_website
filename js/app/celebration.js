import { appState } from './state.js';

export function petalRain() {
  appState.petalShape = appState.petalShape || confetti.shapeFromPath({ path: 'M5 0C8.5 2 9.5 7 5 13C.5 7 1.5 2 5 0' });
  const isDark = document.documentElement.dataset.theme === 'dark';
  const colors = isDark
    ? ['#ffd700', '#f5c518', '#e8a020', '#ffe080', '#c88a10']
    : ['#b3273e', '#d94b60', '#b7a6d9', '#cfc3e6'];

  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (const x of [0.12, 0.38, 0.62, 0.88]) {
        confetti({
          particleCount: 12, angle: 270, spread: 55, startVelocity: 10,
          gravity: 0.5, drift: (Math.random() - 0.5) * 1.4, ticks: 500, scalar: 1.6,
          shapes: [appState.petalShape], colors, origin: { x, y: -0.08 },
          disableForReducedMotion: true,
        });
      }
    }, wave * 380);
  }
}
