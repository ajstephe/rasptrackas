// ── display helpers — pure formatting, no React/DOM dependency ─────────────
// Money with a thousands comma (£4,948.90), the same as fmtGBP, so every
// figure in the app reads the same way.
export const fmt    = n=>`£${n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
// Decimal hours → words people read without thinking: 1.25 → "1h 15m",
// 2 → "2h", 0.667 → "40m", -1.683 → "−1h 41m". Every on-screen hours figure
// goes through this.
export const fmtHrs = n=>{
  if (Math.abs(n) < 1e-6) n = 0;
  const sign = n<0 ? '\u2212' : '';
  const abs = Math.abs(n);
  let h = Math.floor(abs);
  let m = Math.round((abs-h)*60);
  if (m===60) { h+=1; m=0; }
  if (m===0) return `${sign}${h}h`;
  if (h===0) return `${sign}${m}m`;
  return `${sign}${h}h ${m}m`;
};
// A pay period is named after the month it's paid in ("November 2026"), but
// covers shifts worked weeks earlier — on 26 Sept the current period is
// "November 2026", which read like a wrong date. These two put the pay month
// and the shift dates side by side: "November pay" · "Shifts 7 Sept – 11 Oct".
export const payLabel = month => `${String(month||'').split(' ')[0]} pay`;
export const shiftSpan = (start, end) => `Shifts ${fmtDShort(start)} – ${fmtDShort(end)}`;
const fmtDShort = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
export const fmtGBP = n=>`£${n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const fmtD   = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
// "Synced 4 minutes ago" — for the Sync button's timestamp, not a general-
// purpose calendar helper, so it only needs to read naturally for the
// short spans a sync actually happens across (seconds through a couple of
// days if the app's been closed a while) rather than covering every range
// a full relative-date library would.
export const fmtRelTime = (epochMs, now=Date.now())=>{
  const s = Math.max(0, Math.round((now-epochMs)/1000));
  // The label only refreshes once a minute, so seconds would sit stale.
  if (s<60) return 'just now';
  const m = Math.round(s/60);
  if (m<60) return `${m} minute${m===1?'':'s'} ago`;
  const h = Math.round(m/60);
  if (h<24) return `${h} hour${h===1?'':'s'} ago`;
  const d = Math.round(h/24);
  return `${d} day${d===1?'':'s'} ago`;
};
