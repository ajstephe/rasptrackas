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
