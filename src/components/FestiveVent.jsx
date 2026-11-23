// Festive theme only (hidden by CSS in every other theme): a reindeer
// crawling through an air vent across the Gross pay banner, lit by a
// lighter, until he bumps into the grille at the end and says his line.
export function FestiveVent({ wide }) {
  const cls = wide ? ' wide' : '';
  return (<>
    <div className={'vent-quip'+cls} aria-hidden="true">Come out to the coast, we’ll get<br/>together, have a few laughs…</div>
    <svg className={'festive-vent'+cls} viewBox="0 0 260 80" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ventMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9dee4"/><stop offset=".45" stopColor="#a9b1bb"/><stop offset="1" stopColor="#7d8692"/>
        </linearGradient>
        <radialGradient id="ventGlow"><stop offset="0" stopColor="#ffcf6b" stopOpacity=".75"/><stop offset=".5" stopColor="#ff9a2e" stopOpacity=".25"/><stop offset="1" stopColor="#ff9a2e" stopOpacity="0"/></radialGradient>
        <clipPath id="ventInside"><rect x="14" y="24" width="222" height="40"/></clipPath>
      </defs>
      {/* hanging straps */}
      <path d="M40 0 V18 M130 0 V18 M220 0 V18" stroke="#5b636d" strokeWidth="2"/>
      <g className="vent-duct">
        {/* the duct, its front cut away so we can see in */}
        <rect x="8" y="16" width="244" height="54" rx="3" fill="url(#ventMetal)"/>
        <rect x="14" y="24" width="222" height="40" fill="#15181d"/>
        <g clipPath="url(#ventInside)">
          <path d="M14 58 H236" stroke="#2a2f36" strokeWidth="1"/>
          <g className="vent-deer">
            <circle className="vent-glow" cx="52" cy="46" r="34" fill="url(#ventGlow)"/>
            <g className="vent-bob">
              {/* back legs, tucked */}
              <path d="M8 57 Q14 60 22 57" stroke="#6b4423" strokeWidth="4" fill="none" strokeLinecap="round"/>
              {/* body, belly to the floor */}
              <ellipse cx="22" cy="51" rx="18" ry="8" fill="#8b5a3c"/>
              <ellipse cx="25" cy="54" rx="10" ry="4" fill="#c79a72"/>
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
        </g>
        {/* lip of the cut-away and seams */}
        <rect x="14" y="62" width="222" height="3" fill="#8e97a2"/>
        <path d="M70 16 V24 M70 64 V70 M130 16 V24 M130 64 V70 M190 16 V24 M190 64 V70" stroke="#6f7782" strokeWidth="1.2"/>
        {[22,58,82,118,142,178,202].map(x=><circle key={x} cx={x} cy="20" r="1.1" fill="#6f7782"/>)}
        {/* grille at the end */}
        <g className="vent-grille">
          <rect x="236" y="20" width="14" height="46" rx="2" fill="#bfc6ce" stroke="#6f7782" strokeWidth="1"/>
          {[25,31,37,43,49,55,61].map(y=><rect key={y} x="238" y={y} width="10" height="2.4" fill="#5b636d"/>)}
        </g>
      </g>
      <g className="vent-bonk"><path d="M246 12 l2 -6 M252 14 l5 -4 M240 10 l-1 -6" stroke="#ffe27a" strokeWidth="2" strokeLinecap="round"/></g>
    </svg>
  </>);
}
