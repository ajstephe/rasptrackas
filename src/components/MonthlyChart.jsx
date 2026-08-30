import { fmtGBP } from '../lib/format.js';
import { useAnimatedPoints } from '../lib/useAnimatedPoints.js';

// ─── Monthly Gross/Net chart ─────────────────────────────────────────────────
// Extracted out of App.jsx's renderMonthlyChart closure so it can call a hook
// (useAnimatedPoints) — closures redefined fresh on every App render can't
// safely use hooks, only a real, stable component can. Same SVG, same props
// shape (big/dark/wide), same tap-a-point tooltip behaviour; the only actual
// change is that the two lines and their dots now tween from their old
// heights to their new ones when the underlying gross/net figures change,
// instead of snapping straight to the new shape.
export function MonthlyChart({ totals, PAY_PERIODS, MONO, chartTap, setChartTap, big, dark=false, wide=false }) {
  const data = totals.periodBreakdown.map(pb=>({short:PAY_PERIODS.find(p=>p.month===pb.month).short, gross:pb.combinedGross, net:pb.combinedNet}));
  const max = Math.max(...data.map(d=>d.gross), 200);
  const W = big?520:(wide?700:330), H = big?300:170, pX = big?46:34, pY = big?20:12;
  const eW = W-pX*2, eH = H-pY*2;
  const fsAxis = big?11:8, fsLbl = big?11:8, ptR = big?6:3, lineW = big?3:2;
  const targetPts = data.map((d,i)=>({x:pX+i*(eW/(data.length-1)), yG:H-pY-(d.gross/max)*eH, yN:H-pY-(d.net/max)*eH, g:d.gross, n:d.net, lbl:d.short}));
  const pts = useAnimatedPoints(targetPts, ['yG','yN'], 500);
  const gp = pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.yG}`).join(' ');
  const np = pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.yN}`).join(' ');
  const tapPt = (chartTap && chartTap.chart==='mon' && chartTap.big===big) ? pts[chartTap.i] : null;
  const toggle = i => setChartTap(t=>(t&&t.chart==='mon'&&t.i===i&&t.big===big)?null:{chart:'mon',i,big});
  // Dark variant sits on the navy Total Gross YTD card, so grid/label
  // colours flip to bright blue-white instead of slate-on-white.
  const gridStroke = dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';
  const axisFill    = dark ? '#64748b' : '#cbd5e1';
  const lblFill      = dark ? '#94a3b8' : '#94a3b8';
  const dotStroke   = dark ? '#0f2744' : 'white';
  const tooltipBg    = dark ? '#132f52' : '#1e3a5f';

  let tooltip = null;
  if (tapPt) {
    const tw = big?150:114;
    const padTop = big?16:12, lineH = big?17:14, padBottom = big?10:8;
    const th = padTop + lineH*2 + padBottom;
    let tx = tapPt.x - tw/2; if (tx<2) tx=2; if (tx+tw>W-2) tx=W-2-tw;
    const topY = Math.min(tapPt.yG, tapPt.yN);
    let ty = topY - th - 10; if (ty<2) ty = Math.max(tapPt.yG,tapPt.yN) + 14;
    tooltip = (
      <g>
        <rect x={tx} y={ty} width={tw} height={th} rx="7" fill={tooltipBg}/>
        <text x={tx+tw/2} y={ty+padTop} textAnchor="middle" dominantBaseline="middle" style={{fontSize:big?10:8,fontWeight:900,fill:'#93c5fd'}}>{tapPt.lbl}</text>
        <text x={tx+tw/2} y={ty+padTop+lineH} textAnchor="middle" dominantBaseline="middle" style={{fontFamily:MONO,fontSize:big?11:9,fontWeight:600,fill:'#6ee7b7'}}>Gross {fmtGBP(tapPt.g)}</text>
        <text x={tx+tw/2} y={ty+padTop+lineH*2} textAnchor="middle" dominantBaseline="middle" style={{fontFamily:MONO,fontSize:big?11:9,fontWeight:600,fill:'#fca5a5'}}>Net {fmtGBP(tapPt.n)}</text>
      </g>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',overflow:'visible'}} preserveAspectRatio="none">
      {[0,0.5,1].map(v=>(<g key={v}><line x1={pX} y1={H-pY-v*eH} x2={W-pX} y2={H-pY-v*eH} stroke={gridStroke} strokeWidth="1" strokeDasharray={v===0?'0':'3 4'}/><text x={pX-4} y={H-pY-v*eH} textAnchor="end" dominantBaseline="middle" style={{fontSize:fsAxis,fill:axisFill,fontWeight:700}}>£{Math.round(max*v)}</text></g>))}
      {pts.map((p,i)=><text key={i} x={p.x} y={H-pY+(big?17:11)} textAnchor="middle" style={{fontSize:fsLbl,fill:lblFill,fontWeight:900}}>{p.lbl}</text>)}
      <path d={np} fill="none" stroke="#f87171" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round"/>
      <path d={gp} fill="none" stroke="#34d399" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={p.x} cy={p.yG} r={ptR} fill="#34d399" stroke={dotStroke} strokeWidth="1.5" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
          <circle cx={p.x} cy={p.yG} r={ptR+7} fill="transparent" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
          <circle cx={p.x} cy={p.yN} r={ptR} fill="#f87171" stroke={dotStroke} strokeWidth="1.5" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
          <circle cx={p.x} cy={p.yN} r={ptR+7} fill="transparent" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
        </g>
      ))}
      {tooltip}
    </svg>
  );
}
