// Festive theme only (hidden by CSS in every other theme): a reindeer
// crawling through a pitch-dark air vent across the Gross pay banner, lit
// only by the lighter in his hoof. He stops three times to mutter a bit of his line, then crawls
// on and bumps into the grille at the end, and the scene fades out.
export function FestiveVent({ wide }) {
  const cls = wide ? ' wide' : '';
  return (<>
    <div className={'vent-quip l1'+cls} aria-hidden="true">Come out to the <em>coast</em>…</div>
    <div className={'vent-quip l2'+cls} aria-hidden="true">we’ll get <em>togetheeerrr</em>…</div>
    <div className={'vent-quip l3'+cls} aria-hidden="true">have a few <em>laaaaughs</em>…</div>
    {/* After he's gone: a voice from off screen. */}
    <div className={'vent-caption c1'+cls} aria-hidden="true">Now I have a machine gun.</div>
    <div className={'vent-caption c2'+cls} aria-hidden="true"><em>Ho.</em></div>
    <div className={'vent-caption c3'+cls} aria-hidden="true"><em>Ho.</em></div>
    <div className={'vent-caption c4'+cls} aria-hidden="true"><em>Ho.</em></div>
    <svg className={'festive-vent'+cls} viewBox="0 0 260 80" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ventMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9dee4"/><stop offset=".45" stopColor="#a9b1bb"/><stop offset="1" stopColor="#7d8692"/>
        </linearGradient>
        <radialGradient id="ventGlow"><stop offset="0" stopColor="#ffcf6b" stopOpacity=".75"/><stop offset=".5" stopColor="#ff9a2e" stopOpacity=".25"/><stop offset="1" stopColor="#ff9a2e" stopOpacity="0"/></radialGradient>
        <clipPath id="ventInside"><rect x="0" y="24" width="260" height="40"/></clipPath>
        <radialGradient id="ventHole"><stop offset="0" stopColor="#000"/><stop offset=".45" stopColor="#000"/><stop offset="1" stopColor="#fff"/></radialGradient>
        {/* Darkness everywhere except a pool of light round the lighter, which travels with him. */}
        <mask id="ventDark" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="80">
          <rect x="0" y="0" width="260" height="80" fill="#fff"/>
          <g className="vent-deer"><g className="vent-pool"><circle cx="51" cy="48" r="30" fill="url(#ventHole)"/></g></g>
        </mask>
      </defs>
      {/* hanging straps */}
      <path d="M40 0 V18 M130 0 V18 M220 0 V18" stroke="#5b636d" strokeWidth="2"/>
      <g className="vent-duct">
        {/* the duct, its front cut away so we can see in */}
        <rect x="0" y="16" width="260" height="54" fill="url(#ventMetal)"/>
        <rect x="0" y="24" width="260" height="40" fill="#15181d"/>
        <g clipPath="url(#ventInside)">
          {/* the inside of the duct: only seen by lighter-light */}
          <rect x="0" y="24" width="260" height="40" fill="#3b424c"/>
          <rect x="0" y="56" width="260" height="8" fill="#2c323a"/>
          {[8,30,52,74,96,118,140,162,184,206,228,250].map(x=><path key={x} d={`M${x} 24 V64`} stroke="#555e69" strokeWidth="1.4"/>)}
          <path d="M0 30 H260 M0 56 H260" stroke="#4a525d" strokeWidth="1"/>
          <g className="vent-deer">
            <g className="vent-bob">
              {/* back legs, tucked */}
              <path d="M8 57 Q14 60 22 57" stroke="#6b4423" strokeWidth="4" fill="none" strokeLinecap="round"/>
              {/* body, belly to the floor */}
              <ellipse cx="22" cy="51" rx="18" ry="8" fill="#8b5a3c"/>
              <ellipse cx="25" cy="54" rx="10" ry="4" fill="#c79a72"/>
              {/* white tank top, fitted, from the side: covers the back and chest, with a wide
                  scooped neck hole, wide strap over the shoulder, the front leg coming out of the armhole */}
              <defs><clipPath id="ventVest"><path d="M10 46.4 Q19 42.4 27.6 42.8 Q30.4 48.2 35.6 49 Q38.6 50.4 38.6 55.4 Q26 60.4 11 57.8 Q7.8 51.4 10 46.4 Z"/></clipPath></defs>
              <path d="M10 46.4 Q19 42.4 27.6 42.8 Q30.4 48.2 35.6 49 Q38.6 50.4 38.6 55.4 Q26 60.4 11 57.8 Q7.8 51.4 10 46.4 Z" fill="#fbfbf9"/>
              <g clipPath="url(#ventVest)" stroke="#e4e4de" strokeWidth=".4">
                {[12,14.5,17,19.5,22,24.5,27,29.5,32,34.5,37].map(x=><path key={x} d={`M${x} 40 L${x+1} 61`}/>)}
              </g>
              {/* armhole: the shoulder showing through, with the leg coming out of it */}
              <ellipse cx="31.6" cy="52.4" rx="3.3" ry="3.8" fill="#8b5a3c" stroke="#e3e3dd" strokeWidth=".9"/>
              <path d="M29.6 50.4 Q31.6 49.2 33.6 50.4" stroke="#7a4d31" strokeWidth=".8" fill="none"/>
              {/* neck edge and hem */}
              <path d="M27.6 42.8 Q30.4 48.2 35.6 49 Q38.6 50.4 38.6 55.4" stroke="#e3e3dd" strokeWidth="1.1" fill="none"/>
              <path d="M11 57.8 Q26 60.4 38.6 55.4" stroke="#e3e3dd" strokeWidth="1" fill="none"/>
              <path d="M5 49 q-4 -3 -2 -6" stroke="#8b5a3c" strokeWidth="3" fill="none" strokeLinecap="round"/>
              {/* front legs, elbow-crawling */}
              <g className="vent-leg a"><path d="M34 52 L42 58 L50 57" stroke="#7a4d31" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
              <g className="vent-leg b"><path d="M32 53 L40 59 L47 58" stroke="#6b4423" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>
              {/* head, low and forward */}
              <ellipse cx="45" cy="44" rx="8" ry="7" fill="#8b5a3c"/>
              <ellipse cx="52" cy="47" rx="6" ry="4.4" fill="#c79a72"/>
              <circle cx="57.5" cy="46" r="2.6" fill="#e0312f"/>
              <circle cx="57" cy="45.2" r=".8" fill="#ffd0d0"/>
              <circle cx="47" cy="42" r="1.3" fill="#2b1a10"/>
              <ellipse cx="40" cy="39" rx="3.4" ry="1.8" fill="#7a4d31" transform="rotate(-20 40 39)"/>
              {/* antlers scraping the roof */}
              <path className="vent-antler" d="M42 37 L40 27 M41 31 L36 27 M44 37 L48 26 M46.5 30 L52 27" stroke="#6b4423" strokeWidth="2" strokeLinecap="round" fill="none"/>
              {/* lighter in the front hoof */}
              <rect x="49" y="53" width="4" height="6" rx="1" fill="#c0c4ca"/>
              <path className="vent-flame" d="M51 53 q-2.4 -3.6 0 -7 q2.4 3.4 0 7 z" fill="#ffb02e"/>
              <path d="M51 52.5 q-1 -1.8 0 -3.4 q1 1.6 0 3.4 z" fill="#fff3b0"/>
            </g>
          </g>
          <rect x="0" y="24" width="260" height="40" fill="#030405" mask="url(#ventDark)"/>
          <g className="vent-deer"><circle className="vent-glow" cx="51" cy="48" r="30" fill="url(#ventGlow)" style={{mixBlendMode:'screen'}}/></g>
        </g>
        {/* lip of the cut-away and seams */}
        <rect x="0" y="62" width="260" height="3" fill="#8e97a2"/>
        {/* stencilled on the side */}
        <text x="130" y="69.6" textAnchor="middle" fontSize="6.6" fontWeight="900" letterSpacing="1.8" fill="#2f353d" fontFamily="Arial, Helvetica, sans-serif">NAKATOMI PLAZA</text>
        <path d="M26 16 V24 M234 16 V24" stroke="#6f7782" strokeWidth="1.2"/>
        {[8,18,242,252].map(x=><circle key={x} cx={x} cy="20" r="1.1" fill="#6f7782"/>)}
        {/* stencilled along the top */}
        <text x="130" y="22" textAnchor="middle" fontSize="5.4" fontWeight="900" letterSpacing="1.2" fill="#2f353d" fontFamily="Arial, Helvetica, sans-serif">DIE HARD <tspan fill="#b3121f">IS</tspan> A CHRISTMAS FILM !!!</text>
      </g>
    </svg>
  </>);
}
