// ── display helpers — pure formatting, no React/DOM dependency ─────────────
export const fmt    = n=>`£${n.toFixed(2)}`;
// Decimal hours → "HH.MM" where MM is minutes (0-59), not a decimal fraction —
// e.g. 21.5 (21h 30m) → "21.30", not "21.50".
export const fmtHM  = n=>{
  const sign = n<0 ? '-' : '';
  const abs = Math.abs(n);
  let h = Math.floor(abs);
  let m = Math.round((abs-h)*60);
  if (m===60) { h+=1; m=0; }
  return `${sign}${h}.${String(m).padStart(2,'0')}`;
};
export const fmtGBP = n=>`£${n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const fmtD   = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
export const fmtDDMM = d=>{ const dt=new Date(d+'T12:00:00'); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`; };
// "Synced 4 minutes ago" — for the Sync button's timestamp, not a general-
// purpose calendar helper, so it only needs to read naturally for the
// short spans a sync actually happens across (seconds through a couple of
// days if the app's been closed a while) rather than covering every range
// a full relative-date library would.
export const fmtRelTime = (epochMs, now=Date.now())=>{
  const s = Math.max(0, Math.round((now-epochMs)/1000));
  if (s<10) return 'just now';
  if (s<60) return `${s}s ago`;
  const m = Math.round(s/60);
  if (m<60) return `${m} minute${m===1?'':'s'} ago`;
  const h = Math.round(m/60);
  if (h<24) return `${h} hour${h===1?'':'s'} ago`;
  const d = Math.round(h/24);
  return `${d} day${d===1?'':'s'} ago`;
};
