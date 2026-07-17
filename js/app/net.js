// Connection-aware video quality tier.
// hd = 1440p (default), md = 1080p (-md), sd = 720p (-sd).
// Uses the Network Information API where available (Chrome/Android/Edge).
// Safari/Firefox lack it -> fall back to a viewport heuristic.

const RANK = { sd: 0, md: 1, hd: 2 };
const lower = (a, b) => (RANK[a] <= RANK[b] ? a : b);

export function videoTier() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  // No API: assume desktop/wifi is fine, be conservative on small screens.
  if (!c) return window.matchMedia('(min-width: 768px)').matches ? 'hd' : 'md';
  if (c.saveData) return 'sd'; // user opted into data-saver

  let tier = 'hd';
  const et = c.effectiveType;
  if (et === 'slow-2g' || et === '2g') tier = lower(tier, 'sd');
  else if (et === '3g') tier = lower(tier, 'md');

  const dl = c.downlink; // Mbps estimate
  if (typeof dl === 'number') {
    if (dl < 1.5) tier = lower(tier, 'sd');
    else if (dl < 5) tier = lower(tier, 'md');
  }
  return tier;
}

// Filename suffix for the chosen tier.
export const videoSuffix = () => ({ hd: '', md: '-md', sd: '-sd' }[videoTier()]);
