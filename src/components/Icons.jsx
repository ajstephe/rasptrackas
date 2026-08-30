// ─── icon component ───────────────────────────────────────────────────────────
export const Ico = ({ n, s=20, c, w=2, f='none' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={f} stroke={c||'currentColor'}
       strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    {n==='home'  &&<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
    {n==='plus'  &&<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
    {n==='cog'   &&<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}
    {n==='edit'  &&<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}
    {n==='trash' &&<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>}
    {n==='save'  &&<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>}
    {n==='clock' &&<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
    {n==='coffee' &&<><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>}
    {n==='checklist' &&<><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 13 1.5 1.5L13.5 11"/><path d="M9 18h6"/></>}
    {n==='cash' &&<><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.3"/><path d="M6 12h.01M18 12h.01"/></>}
    {n==='cR'    &&<polyline points="9 18 15 12 9 6"/>}
    {n==='cL'    &&<polyline points="15 18 9 12 15 6"/>}
    {n==='cU'    &&<polyline points="18 15 12 9 6 15"/>}
    {n==='cD'    &&<polyline points="6 9 12 15 18 9"/>}
    {n==='list'  &&<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>}
    {n==='star'  &&<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
    {n==='cal'   &&<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
    {n==='bar'   &&<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>}
    {n==='uPlus' &&<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>}
    {n==='check' &&<polyline points="20 6 9 17 4 12"/>}
    {n==='shield'&&<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
    {n==='calc'  &&<><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M16 14h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M16 18h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></>}
    {n==='back'  &&<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>}
    {n==='undo'  &&<><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.31"/></>}
    {n==='x'     &&<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
    {n==='dl'    &&<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}
    {n==='ul'    &&<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>}
    {n==='mail'  &&<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></>}
    {n==='table' &&<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></>}
    {n==='doc'   &&<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}
    {n==='share' &&<><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>}
    {n==='bell'  &&<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
    {n==='refresh'&&<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>}
    {n==='user'&&<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>}
    {n==='sun'&&<><circle cx="12" cy="12" r="4.5"/><path d="M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4"/></>}
    {n==='moon'&&<path d="M20.5 13.7A8.5 8.5 0 1 1 10.3 3.5a7 7 0 0 0 10.2 10.2z"/>}
    {n==='lock'&&<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
  </svg>
);

// Original cartoon-style £50 note icon for the header. Deliberately generic —
// no portrait, no Bank of England insignia, no reproduced security features —
// just enough banknote "character" (gradient, see-through window motif,
// guilloche-style texture, serif denomination) to read clearly at a glance.
export function ClockCashIcon({ width=28, height=19 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 44 30" style={{flexShrink:0}}>
      <defs>
        <linearGradient id="noteGradFront" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e"/>
          <stop offset="60%" stopColor="#16a34a"/>
          <stop offset="100%" stopColor="#15803d"/>
        </linearGradient>
      </defs>

      {/* clock */}
      <circle cx="12" cy="13" r="10" fill="#fff" stroke="#1e3a5f" strokeWidth="2"/>
      <g stroke="#1e3a5f" strokeWidth="1" strokeLinecap="round">
        <line x1="12" y1="4.3" x2="12" y2="6"/>
        <line x1="12" y1="20" x2="12" y2="21.7"/>
        <line x1="3.3" y1="13" x2="5" y2="13"/>
        <line x1="19" y1="13" x2="20.7" y2="13"/>
      </g>
      <line x1="12" y1="13" x2="12" y2="7.8" stroke="#1e3a5f" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="12" y1="13" x2="15.6" y2="10.2" stroke="#2563eb" strokeWidth="1.7" strokeLinecap="round"/>
      <circle cx="12" cy="13" r="1.1" fill="#1e3a5f"/>

      {/* three-bill stack, overlapping the clock's bottom-right */}
      <rect x="19" y="19" width="23" height="9" rx="1.6" fill="#136534" stroke="#0f3d21" strokeWidth="0.6"/>
      <rect x="18" y="17" width="23" height="9" rx="1.6" fill="#178a41" stroke="#0f3d21" strokeWidth="0.6"/>
      <rect x="17" y="15" width="23" height="9" rx="1.6" fill="url(#noteGradFront)" stroke="#0f3d21" strokeWidth="0.7"/>
      <text x="28.5" y="23" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontSize="10" fontWeight="900" fill="#f0fdf4">£</text>
    </svg>
  );
}

// Simplified fire-exit-sign pictogram — running figure heading through a
// doorway, with a directional arrow — evoking the standard green exit
// sign. White strokes/fills throughout, meant to sit on a green backdrop.
export function FireExitIcon({ size=20, color='#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="4" r="1.7" fill={color}/>
      <path d="M6.5 6 L8 11" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M8 11 L10.5 13 L9.5 16.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M8 11 L4.8 13 L4 11.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M7 7.3 L9.8 6.8" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M6.8 7.6 L4.8 9.5" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
      <rect x="15.5" y="2.5" width="6.5" height="19" rx="0.6" stroke={color} strokeWidth="1.4"/>
      <path d="M11.5 12 H19" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M16.3 9 L19.3 12 L16.3 15" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
