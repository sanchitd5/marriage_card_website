// Authoritative "now" for the couple-photo reveal gate.
//
// We must NOT trust the visitor's device clock — otherwise anyone could reveal
// the photos early by setting their clock forward. Instead we read the `Date`
// response header from a same-origin request: that is the CDN/server's clock
// (NTP-synced), can't be tampered with client-side, and needs no CORS. Public
// time APIs are a fallback. Resolves epoch-ms, or `null` if every source fails
// (callers treat null as "stay hidden" — fail-safe).

const SANE_MIN = Date.UTC(2020, 0, 1); // reject absurd/garbage values

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => { ctrl.abort(); resolve({ aborted: true }); }, ms);
    promise(ctrl.signal).then(v => { clearTimeout(t); resolve(v); })
      .catch(() => { clearTimeout(t); resolve(null); });
  });
}

// Same-origin HEAD → the server's Date header (server/CDN time).
async function serverDateNow(timeoutMs) {
  const res = await withTimeout(
    signal => fetch(window.location.href, { method: 'HEAD', cache: 'no-store', signal }),
    timeoutMs,
  );
  if (!res || res.aborted || !res.headers) return null;
  const d = res.headers.get('date');
  const ms = d ? Date.parse(d) : NaN;
  return Number.isFinite(ms) && ms > SANE_MIN ? ms : null;
}

// CORS-enabled public time API fallbacks.
async function apiNow(timeoutMs) {
  const sources = [
    ['https://timeapi.io/api/time/current/zone?timeZone=UTC', d => Date.parse(d.dateTime)],
    ['https://worldtimeapi.org/api/timezone/Etc/UTC', d => d.unixtime * 1000],
  ];
  for (const [url, pick] of sources) {
    const res = await withTimeout(
      signal => fetch(url, { cache: 'no-store', signal }).then(r => (r.ok ? r.json() : Promise.reject())),
      timeoutMs,
    );
    if (!res || res.aborted) continue;
    const ms = pick(res);
    if (Number.isFinite(ms) && ms > SANE_MIN) return ms;
  }
  return null;
}

export async function fetchTrustedNowMs(timeoutMs = 4000) {
  return (await serverDateNow(timeoutMs)) ?? (await apiNow(timeoutMs));
}
