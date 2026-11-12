import { Fragment, useState } from 'react';
import { fmtGBP, fmtHrs, payLabel, shiftSpan } from '../lib/format.js';
import { Ico, FireExitIcon } from './Icons.jsx';
import { useCountUp } from '../lib/useCountUp.js';
import { localDateStr, PAY_PERIODS } from '../lib/payPeriods.js';
import { submitWindow } from '../lib/deadline.js';

// ─── Home (dashboard) tab ────────────────────────────────────────────────────
// Extracted verbatim from App.jsx's tab==='dashboard' IIFE — no behaviour
// change. renderMonthlyChart, S and the various setters/refs all come in as
// props rather than being closed over directly.
import { SetupCard } from './SetupCard.jsx';
export function TabDashboard({
  isWide, settings, setTab, totals, currPeriodIdx, toilLedger, carmsOutstanding,
  salaryBreakdownExpanded, setSalaryBreakdownExpanded,
  scrollToTaxImpact, setTaxImpactExpanded,
  skipBreakdownReset, setBreakdownView, setCalPeriodIdx,
  renderMonthlyChart, S, MONO, BRASS, animClass='fi',
  session, setSignOutConfirmOpen, saveSett,
}) {
  // The two headline mono figures count up/down when they change instead
  // of jumping straight to the new value — logging a shift, editing one,
  // or a settings change that shifts the tax calc all land as a felt
  // change in the number, not a silent swap.
  const pb = currPeriodIdx>=0 ? totals.periodBreakdown[currPeriodIdx] : null;
  // Pay month picked on the Monthly overtime chart (phones show its figures under it).
  const [chartPick, setChartPick] = useState(null);
  // Phones open and close the Overview card like Salary breakdown; computers always show it.
  const [overviewOpen, setOverviewOpen] = useState(false);
  const animatedNet = useCountUp(pb ? pb.combinedNet : 0);
  const animatedGrossYTD = useCountUp(settings.rank&&settings.service ? totals.combinedGrossYTD : 0);


  // ── Net-pay hero row ──────────────────────────────────────────────
  // Replaces the old cramped "Gross & Net" mini-columns with the one
  // figure people actually open the app to check — net pay this
  // period — given real size, a delta vs last pay month, and a trend
  // line. Gross doesn't disappear, just demotes to a small caption.
  // Deliberately NOT touching the masthead's own headline (Total
  // Gross YTD stays there — that's the tax-band-awareness number,
  // a different job). All of it comes from totals.periodBreakdown,
  // which already carries every period's combinedNet in order —
  // no new calculation, just reading neighbouring entries.
  // Rows that open another screen end in a small arrow, so it's clear they
  // can be tapped (they always could; nothing said so).
  const chev = <Ico n="cR" s={14} c="var(--quiet)" w={2.2}/>;
  const days = Math.abs(toilLedger.balance/8).toFixed(1);
  const toilSub = toilLedger.balance===0 ? 'None banked yet' : `About ${days} ${days==='1.0'?'day':'days'}${toilLedger.balance<0?' overdrawn':''} at 8h a day`;
  const taxYearLine = settings.rank&&settings.service
    ? `${Math.round(totals.taxYearDaysElapsed)} day${Math.round(totals.taxYearDaysElapsed)===1?'':'s'} into ${totals.taxYearStart.split('-')[0]}/${(parseInt(totals.taxYearStart.split('-')[0])+1).toString().slice(-2)}`
    : 'Pick your rank and pay point above to see it';
  // The statement masthead: one plain label, the figure, how far into the
  // tax year, and — when there's anything unclaimed — a pill that says
  // where tapping it goes.
  const masthead = (compact) => (
    <div style={{background:'var(--navy)',padding:compact?'12px 16px':'12px 26px',position:'relative',overflow:'hidden',display:compact?'block':'flex',justifyContent:'space-between',alignItems:'flex-end',gap:'16px',flexWrap:'wrap'}}>
      <div style={{position:'absolute',right:'-14px',top:'-14px',width:'72px',height:'72px',background:'rgba(255,255,255,0.04)',borderRadius:'50%'}}/>
      {/* Festive only (hidden by CSS in every other theme): Santa's sack of
          presents in the corner, with an elf who pops out now and then. */}
      {/* Festive only (hidden by CSS otherwise): one looping scene. The elf
          pops out of Santa's sack, the reindeer swings a bauble on a string
          at him, then rocks his chair over backwards and lies on the floor. */}
      <div className={'festive-quip q1'+(compact?'':' wide')} aria-hidden="true">Merry Christmas,<br/>ya filthy animal!</div>
      <div className={'festive-quip q2'+(compact?'':' wide')} aria-hidden="true">And a happy<br/>new year!</div>
      <svg className={'festive-scene'+(compact?'':' wide')} viewBox="0 -26 170 138" aria-hidden="true" focusable="false">
        <svg x="0" y="27" width="76" height="85" viewBox="0 0 100 112" overflow="visible">
          <g transform="matrix(-1 0 0 1 100 0)">
            <g className="deer-rock"><g className="deer-tip">
          <path d="M6 100 Q50 114 94 100" fill="none" stroke="#5e3a17" strokeWidth="5" strokeLinecap="round"/>
          <path d="M24 74 L19 101 M76 74 L81 101" stroke="#6b4423" strokeWidth="4" strokeLinecap="round"/>
          <rect x="58" y="20" width="28" height="56" rx="10" fill="#a8322a"/>
          <rect x="62" y="25" width="20" height="45" rx="7" fill="#c2453a"/>
          <rect x="14" y="64" width="70" height="13" rx="5" fill="#a8322a"/>
          <rect x="10" y="54" width="17" height="22" rx="7" fill="#c2453a"/>
          <ellipse cx="50" cy="56" rx="17" ry="14" fill="#8b5a3c"/>
          <ellipse cx="45" cy="60" rx="9" ry="8" fill="#c79a72"/>
          <rect x="27" y="66" width="7" height="22" rx="3" fill="#8b5a3c"/><rect x="27" y="85" width="7" height="5" rx="2" fill="#3a2414"/>
          <rect x="37" y="67" width="7" height="21" rx="3" fill="#7a4d31"/><rect x="37" y="85" width="7" height="5" rx="2" fill="#3a2414"/>
          <path d="M44 20 L46 8 M45 12 L51 7 M44 16 L38 10 M52 20 L58 9 M56 13 L63 11 M55 16 L54 6" stroke="#6b4423" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
          <ellipse cx="55" cy="24" rx="5" ry="2.6" fill="#7a4d31" transform="rotate(-25 55 24)"/>
          <circle cx="45" cy="30" r="11" fill="#8b5a3c"/>
          <ellipse cx="35" cy="35" rx="9" ry="6.5" fill="#c79a72"/>
          <circle cx="27.5" cy="34" r="3.6" fill="#e0312f"/>
          <circle cx="26.6" cy="32.8" r="1" fill="#ffd0d0"/>
          <circle cx="44" cy="27" r="1.7" fill="#2b1a10"/>
          <circle cx="44.6" cy="26.4" r="0.5" fill="#ffffff"/>
          <path d="M33 39.5 Q36 41.5 39 39.5" fill="none" stroke="#5e3a17" strokeWidth="1.1" strokeLinecap="round"/>
          <g className="deer-arm">
            <path d="M52 54 Q44 52 37 45" fill="none" stroke="#8b5a3c" strokeWidth="5.5" strokeLinecap="round"/>
            <path d="M24 42 L39 41 L37 47 Z" fill="#f08a24"/>
            <path d="M28 42.5 L29 45 M32 42 L33 45" stroke="#c96a12" strokeWidth="0.8"/>
            <path d="M39 42 L45 37 M39 43 L46 41 M38 44 L44 46" stroke="#3f9a3a" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="37" cy="45" r="3" fill="#5e3a22"/>
          </g>
            </g></g>
          </g>
        </svg>
        <svg x="50" y="-26" width="120" height="138" viewBox="0 -26 120 138" overflow="visible">
        <ellipse cx="60" cy="45" rx="37" ry="8" fill="#3d240e"/>
        <g className="festive-elf">
          <path d="M49 52 Q49 36 60 34 Q71 36 71 52 Z" fill="#1f8a4c"/>
          <path d="M55 35 L60 41 L65 35" fill="none" stroke="#e8b64c" strokeWidth="1.6"/>
          <g className="festive-elf-arm">
            <path d="M68 37 Q75 33 78 24" fill="none" stroke="#1f8a4c" strokeWidth="4.5" strokeLinecap="round"/>
            <circle cx="78.5" cy="22.5" r="3.6" fill="#ffffff" stroke="#2b1a10" strokeWidth="0.8"/>
          </g>
          <path d="M52 22 L44 16 L53 26 Z" fill="#f2c9a0"/>
          <path d="M68 22 L76 16 L67 26 Z" fill="#f2c9a0"/>
          <circle cx="60" cy="24" r="9" fill="#f2c9a0"/>
          <circle cx="56.6" cy="23" r="1.2" fill="#2b1a10"/>
          <circle cx="63.4" cy="23" r="1.2" fill="#2b1a10"/>
          <circle cx="54.6" cy="26.6" r="1.8" fill="#f0909a" opacity="0.7"/>
          <circle cx="65.4" cy="26.6" r="1.8" fill="#f0909a" opacity="0.7"/>
          <path d="M57 27.5 Q60 30.5 63 27.5" fill="none" stroke="#7a2a1a" strokeWidth="1.1" strokeLinecap="round"/>
          <path d="M50.5 18 Q55 3 70 2 Q78 2 80 9 L72 8 Q66 9 69.5 18 Z" fill="#1f8a4c"/>
          <rect x="49.5" y="16" width="21" height="4.2" rx="2.1" fill="#ffffff"/>
          <circle cx="80.5" cy="9.5" r="2.6" fill="#e8b64c"/>
        </g>
        <rect x="27" y="27" width="22" height="20" rx="1.5" fill="#1f8a4c"/>
        <rect x="36" y="27" width="4" height="20" fill="#e8b64c"/><rect x="27" y="35" width="22" height="4" fill="#e8b64c"/>
        <rect x="70" y="23" width="23" height="24" rx="1.5" fill="#2b6cb0"/>
        <rect x="79.5" y="23" width="4" height="24" fill="#ffffff"/><rect x="70" y="32" width="23" height="4" fill="#ffffff"/>
        <path d="M81.5 23 q-6 -7 -8 -1 q4 2 8 1 q6 -7 8 -1 q-4 2 -8 1" fill="#ffffff"/>
        <rect x="51" y="34" width="18" height="13" rx="1.5" fill="#e8b64c"/>
        <rect x="58" y="34" width="4" height="13" fill="#c8102e"/>
        <path d="M22 46 C9 62 7 94 22 105 Q60 115 98 105 C113 94 111 62 98 46 Q60 54 22 46 Z" fill="#8a5a2b"/>
        <path d="M30 60 C26 74 27 90 34 99" fill="none" stroke="#a8733d" strokeWidth="4" strokeLinecap="round" opacity="0.7"/>
        <path d="M22 46 Q60 54 98 46" fill="none" stroke="#5e3a17" strokeWidth="3" strokeLinecap="round"/>
        <path d="M48 52 q12 6 24 0" fill="none" stroke="#e8b64c" strokeWidth="3" strokeLinecap="round"/>
        <g className="festive-stars">
          <path d="M44 22 l1.6 3.4 3.6 .5 -2.6 2.5 .7 3.6 -3.3 -1.8 -3.3 1.8 .7 -3.6 -2.6 -2.5 3.6 -.5 z" fill="#ffe27a"/>
          <path d="M74 18 l1.3 2.7 2.9 .4 -2.1 2 .5 2.9 -2.6 -1.4 -2.6 1.4 .5 -2.9 -2.1 -2 2.9 -.4 z" fill="#ffffff"/>
          <path d="M60 10 l1.4 3 3.2 .4 -2.3 2.2 .6 3.2 -2.9 -1.6 -2.9 1.6 .6 -3.2 -2.3 -2.2 3.2 -.4 z" fill="#ffe27a"/>
        </g>
        </svg>
        <g className="festive-pendulum">
          <line x1="0" y1="0" x2="0" y2="106" stroke="#fff3c4" strokeWidth="1"/>
          <g transform="translate(0 115.4)">
            <circle r="6.5" fill="#e8b64c"/><circle r="6.5" fill="none" stroke="#9a6b12" strokeWidth="0.9"/>
            <path d="M-6 1 Q0 4 6 1" fill="none" stroke="#c8961e" strokeWidth="1.1"/>
            <circle cx="-2.2" cy="-2.4" r="1.8" fill="#fff8dc" opacity="0.85"/>
            <rect x="-2.4" y="-9" width="4.8" height="3" rx="0.8" fill="#b8862a"/>
          </g>
        </g>
      </svg>
      <div>
        <div style={{fontSize:compact?'14px':'15px',fontWeight:800,color:'#fff',letterSpacing:'-0.01em',marginBottom:compact?'6px':'8px'}}>Gross pay this tax year</div>
        {(()=>{
          const hasPay = !!(settings.rank&&settings.service);
          const due = hasPay ? (totals.onItsWayGross||0) : 0;
          // Nothing submitted and waiting for a payday: one figure, as before.
          if (due < 0.005) return (
            <div style={{fontFamily:MONO,fontSize:compact?'24px':'26px',fontWeight:600,color:'#fff',letterSpacing:'-0.5px',lineHeight:1.15,marginBottom:'4px'}}>
              {hasPay ? fmtGBP(animatedGrossYTD) : '—'}
            </div>
          );
          // Paid so far, and the same plus claims submitted but waiting for
          // their payday — so logging and submitting overtime moves a
          // headline figure straight away, while "Paid" still matches the
          // payslips.
          const paydays = (totals.onItsWayByPayday||[]).map(p=>new Date(p.payDate+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}));
          const lbl = {fontSize:'9.5px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'3px'};
          const fig = {fontFamily:MONO,fontSize:compact?'21px':'26px',fontWeight:600,letterSpacing:'-0.5px',lineHeight:1.15};
          return (
            <div style={{display:'flex',alignItems:'flex-start',gap:compact?'14px':'24px',marginBottom:'4px',flexWrap:'wrap'}}>
              <div>
                <div style={{...lbl,color:'var(--hero-label,#93c5fd)'}}>Paid to date</div>
                <div style={{...fig,color:'#fff'}}>{fmtGBP(animatedGrossYTD)}</div>
              </div>
              <div style={{borderLeft:'1px solid rgba(255,255,255,0.18)',paddingLeft:compact?'14px':'26px'}}>
                <div style={{...lbl,color:'var(--hero-label,#93c5fd)'}}>Paid to date + submitted</div>
                <div style={{...fig,color:'#fde68a'}}>{fmtGBP(animatedGrossYTD + due)}</div>
                <div style={{fontFamily:MONO,fontSize:compact?'10px':'10.5px',fontWeight:600,color:'#fbbf24',opacity:0.85,marginTop:'3px'}}>+{fmtGBP(due)} due {paydays.length>1?`${paydays[0]} – ${paydays[paydays.length-1]}`:paydays[0]||''}</div>
              </div>
            </div>
          );
        })()}
        <div style={{fontFamily:MONO,fontSize:compact?'10px':'10.5px',fontWeight:600,color:'#7c93b3'}}>{taxYearLine}</div>
      </div>
    </div>
  );

  const netHeroRow = (compact) => {
    const prevPb = currPeriodIdx>0  ? totals.periodBreakdown[currPeriodIdx-1] : null;
    const exp = currPeriodIdx>=0 ? totals.expected?.[currPeriodIdx] : null;
    const delta  = (pb&&prevPb) ? (pb.combinedNet - prevPb.combinedNet) : null;
    const sparkFrom = Math.max(0, currPeriodIdx - 5);
    const sparkVals = currPeriodIdx>=0 ? totals.periodBreakdown.slice(sparkFrom, currPeriodIdx+1).map(p=>p.combinedNet) : [];
    const sparkMin = sparkVals.length ? Math.min(...sparkVals) : 0;
    const sparkMax = sparkVals.length ? Math.max(...sparkVals) : 1;
    const sparkRange = sparkMax - sparkMin || 1;
    const W = compact ? 120 : 140, H = 26, PAD = 3;
    const pts = sparkVals.map((v,i)=>{
      const x = sparkVals.length>1 ? (i/(sparkVals.length-1))*W : W;
      const y = PAD + (1 - (v-sparkMin)/sparkRange) * (H - PAD*2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return (
      <div style={{padding:compact?'10px 0':'11px 0',borderBottom:'1px solid var(--border-2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:compact?'10px':'12px'}}>
          <div style={{background:'var(--tint-green-2)',padding:compact?'8px':'9px',borderRadius:compact?'10px':'11px',flexShrink:0,alignSelf:'flex-start'}}><Ico n="cash" s={compact?16:17} c="#15803d"/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px'}}>
              <span style={{fontSize:compact?'12px':'12.5px',fontWeight:700,color:'var(--muted)'}}>Net overtime this month</span>
              <span style={{fontFamily:MONO,fontSize:compact?'10px':'10.5px',fontWeight:600,color:'var(--quiet)',textAlign:'right',whiteSpace:'nowrap'}}>Gross {pb?fmtGBP(pb.combinedGross):'£0.00'}{exp&&exp.n>0&&<span style={{fontWeight:700,color:'var(--exp-ink)'}}> · +{fmtGBP(exp.gross)}</span>}</span>
            </div>
            <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'4px 8px',marginTop:'1px'}}>
              <span style={{fontFamily:MONO,fontSize:compact?'19px':'18px',fontWeight:700,color:'var(--ink)',letterSpacing:'-0.01em',lineHeight:1.2}}>{fmtGBP(animatedNet)}</span>
              {/* Last month's figure to compare with (this month is still
                  filling up); tapping it opens that pay month. */}
              {delta!=null&&(
                <button onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx-1); setTab('months'); }} className="tap-row" style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10px',fontWeight:600,color:'var(--muted)',background:'var(--chip-bg)',padding:'2px 6px 2px 8px',borderRadius:'20px',border:'none',cursor:'pointer',fontFamily:'inherit',touchAction:'manipulation',whiteSpace:'nowrap'}}>
                  <span>Last month <span style={{fontFamily:MONO,fontWeight:700,color:'var(--ink)'}}>{fmtGBP(prevPb.combinedNet)}</span></span>
                  <Ico n="cR" s={9} c="currentColor" w={2.5}/>
                </button>
              )}
              {/* What this month's planned shifts should add once worked and
                  claimed — its own colour, never part of the figure. */}
              {exp&&exp.n>0&&(
                <button onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('list'); setTab('months'); }} className="tap-row" style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10.5px',fontWeight:800,color:'var(--exp-ink)',background:'var(--exp-tint)',border:'1px dashed color-mix(in srgb, var(--exp) 55%, transparent)',padding:'2px 8px',borderRadius:'20px',cursor:'pointer',fontFamily:'inherit',touchAction:'manipulation',whiteSpace:'nowrap'}}>
                  <span style={{fontFamily:MONO}}>+{fmtGBP(exp.net)}</span>{` planned · ${exp.n} shift${exp.n!==1?'s':''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Monthly overtime, a column per pay month stacked submitted (green),
  // still to submit (red) and planned (striped blue), with a line for the
  // overtime's take-home. Under it, each month's pay in full: salary and
  // allowances, overtime, the total and what reaches the bank. Computers
  // show every month at once in a grid lined up with the columns; phones
  // show the picked month (this one to start). Months not paid yet are
  // forecasts and say so.
  const monthChartCard = (()=>{
    const pbs = totals.periodBreakdown || [];
    const today = localDateStr();
    const cols = PAY_PERIODS.map((p,idx)=>{
      const pb = pbs[idx] || {};
      const sal = pb.baseAmt || 0;
      const g = pb.combinedGross || 0, gn = pb.combinedNet || 0;
      const ts = totals.toSubmit?.[idx]; const tOn = ts && ts.gross>0.005;
      const ex = totals.expected?.[idx]; const eOn = ex && ex.n>0;
      const t = tOn ? ts.gross : 0, tn = tOn ? (ts.net||0) : 0, e = eOn ? ex.gross : 0, en = eOn ? (ex.net||0) : 0;
      const ot = g+t+e, otN = gn+tn+en;
      return { p, idx, sal, g, t, e, ot, otN, future: !!pb.payDate && pb.payDate > today, payDate: pb.payDate,
        gross: sal+ot, takeHome: (pb.monthNet||0)+tn+en };
    });
    if (!cols.some(c=>c.ot>0.005)) return null;
    const max = Math.max(1, ...cols.map(c=>c.ot));
    const sum = k => cols.reduce((a,c)=>a+c[k],0);
    const GRN='#059669', RED='#dc2626', LINE='var(--text-navy)';
    const STRIPE='repeating-linear-gradient(135deg, var(--exp) 0 4px, color-mix(in srgb, var(--exp) 50%, white) 4px 8px)';
    const H = isWide ? 76 : 84;
    const gap = isWide ? '8px' : '3px';
    const short = c => String(c.p.short||c.p.month).slice(0,3);
    const pickIdx = chartPick ?? (currPeriodIdx>=0 ? currPeriodIdx : 0);
    const openSummary = () => { skipBreakdownReset.current=true; setBreakdownView('list'); setTab('months'); };
    const pts = cols.map((c,i)=>c.ot>0.005?{x:(i+0.5)/cols.length*100, y:H - c.otN/max*H, c}:null).filter(Boolean);
    const key = (sw,t) => <span key={t} style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>{sw}{t}</span>;
    const sq = c => <i style={{width:'10px',height:'10px',borderRadius:'3px',background:c}}/>;
    const lbl = {fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'};
    const num = (v,col,w=600,fs) => <span style={{fontFamily:MONO,fontSize:fs||(isWide?'11px':'13px'),fontWeight:w,color:col,whiteSpace:'nowrap'}}>{fmtGBP(v)}</span>;
    // The grid under the columns rounds to the pound so twelve months sit
    // comfortably side by side; the phone panel keeps the pence.
    const pound = v => '£'+Math.round(v).toLocaleString('en-GB');
    const cell = (v,col,w=600) => <span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:w,color:col,whiteSpace:'nowrap'}}>{pound(v)}</span>;
    // Computers: one row per figure, a cell per month under its column.
    const ROWS = [
      ['Salary & allowances', c=>cell(c.sal,'var(--muted)')],
      ['Overtime & PA', c=>c.ot>0.005?cell(c.ot,'var(--ink)',700):<span style={{color:'var(--quiet)'}}>–</span>],
      ['Total gross', c=>cell(c.gross,'var(--ink)',800)],
      ['Take-home', c=>cell(c.takeHome,'var(--text-green-deep)',800)],
    ];
    const gridCols = `152px repeat(${cols.length},minmax(0,1fr))`;
    const TOT = [['Overtime submitted','Submitted',sum('g'),'var(--text-green-deep)'],['To submit','To submit',sum('t'),'var(--text-red-deep)'],['Planned','Planned',sum('e'),'var(--exp-ink)']];
    const pick = cols[pickIdx];
    const line = (l,v,strong,col) => <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'10px',padding:'2px 0',borderTop:strong?'1px solid var(--border-2)':'none',marginTop:strong?'3px':0,paddingTop:strong?'4px':'2px'}}>
      <span style={{fontSize:'12.5px',fontWeight:strong?800:700,color:strong?'var(--ink)':'var(--muted)'}}>{l}</span>{num(v,col,strong?800:600,'13px')}</div>;
    return (
      <div style={S.card}>
        <button disabled={isWide} onClick={()=>setOverviewOpen(v=>!v)} aria-expanded={isWide?undefined:overviewOpen} style={{touchAction:'manipulation',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',cursor:isWide?'default':'pointer'}}>
          <div style={{display:'flex',alignItems:'center',gap:'11px',minWidth:0}}>
            <div style={{background:'var(--tint-green, color-mix(in srgb, #059669 14%, transparent))',padding:isWide?'10px':'8.5px',borderRadius:isWide?'12px':'13px',flexShrink:0}}><Ico n="bar" s={isWide?17:24} c={GRN}/></div>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:800,fontSize:'13.5px',color:'var(--ink)'}}>Overview</div>
            </div>
          </div>
          {!isWide&&<span aria-hidden="true" style={{display:'flex',flexShrink:0,transform:overviewOpen?'rotate(-90deg)':'rotate(90deg)',transition:'transform 0.2s'}}><Ico n="cR" s={16} c="var(--quiet)" w={2.2}/></span>}
        </button>
        {(isWide||overviewOpen)&&<div className={isWide?undefined:'accordion-in'}>
        <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',alignItems:'baseline',gap:'6px 16px',borderTop:'1px solid var(--border-2)',marginTop:'12px',paddingTop:'10px',marginBottom:'10px'}}>
          <span style={{display:'flex',flexWrap:'wrap',gap:'5px 12px',fontSize:'11px',fontWeight:700,color:'var(--muted)'}}>
            {key(sq(GRN),'Submitted')}{key(sq(RED),'To submit')}{key(sq(STRIPE),'Planned')}
            {key(<svg width="20" height="10" aria-hidden="true"><line x1="1" y1="5" x2="19" y2="5" stroke={LINE} strokeWidth="2"/><circle cx="10" cy="5" r="3.2" fill={LINE} stroke="var(--surface)" strokeWidth="1.2"/></svg>,isWide?'Overtime take-home':'Take-home')}
          </span>
        </div>
        <div style={isWide?{display:'grid',gridTemplateColumns:gridCols,columnGap:gap}:undefined}>
          {/* Computers: the year's overtime totals stand in the space left of the bars. */}
          {isWide&&<div style={{gridRow:'span 2',display:'flex',flexDirection:'column',justifyContent:'center',gap:'6px',paddingRight:'10px'}}>
            {TOT.map(([l,,v,col])=><div key={l} style={{minWidth:0}}><div style={{...lbl,whiteSpace:'nowrap'}}>{l}</div><div style={{fontFamily:MONO,fontSize:'15px',fontWeight:700,color:col,marginTop:'1px',whiteSpace:'nowrap'}}>{fmtGBP(v)}</div></div>)}
          </div>}
          <div style={{position:'relative',...(isWide?{gridColumn:'2 / -1'}:{})}}>
            <div style={{display:'flex',alignItems:'flex-end',gap}}>
              {cols.map(c=>{ const isCurr=c.idx===currPeriodIdx, on=!isWide&&c.idx===pickIdx;
                const seg=(v,bg)=>v>0.005&&<i style={{display:'block',height:`${v/max*H}px`,background:bg}}/>;
                return (
                  <button key={c.p.month} type="button" onClick={isWide?openSummary:()=>setChartPick(c.idx)} aria-pressed={isWide?undefined:on}
                    aria-label={`${payLabel(c.p.month)}${c.future?' (forecast)':''}: overtime ${fmtGBP(c.ot)}, total pay ${fmtGBP(c.gross)}, take-home ${fmtGBP(c.takeHome)}`}
                    style={{flex:'1 1 0',minWidth:0,display:'flex',justifyContent:'center',background:on?'var(--tint-brass)':'none',borderRadius:'7px',border:'none',padding:isWide?0:'3px 0',cursor:'pointer',fontFamily:'inherit',touchAction:'manipulation'}}>
                    <span style={{height:`${H}px`,width:isWide?'40%':'58%',display:'flex',flexDirection:'column-reverse',borderRadius:'5px',overflow:'hidden',background:'var(--surface-2)',boxShadow:isCurr?`0 0 0 2px color-mix(in srgb, ${BRASS} 60%, transparent)`:'none'}}>
                      {seg(c.g,GRN)}{seg(c.t,RED)}{seg(c.e,STRIPE)}
                    </span>
                  </button>);
              })}
            </div>
            {pts.length>0&&<div aria-hidden="true" style={{position:'absolute',inset:isWide?0:'3px 0',pointerEvents:'none'}}>
              <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{display:'block',overflow:'visible'}}>
                <polyline points={pts.map(q=>`${q.x},${q.y}`).join(' ')} fill="none" stroke={LINE} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
              </svg>
              {pts.map(q=><i key={q.c.p.month} style={{position:'absolute',left:`${q.x}%`,top:`${q.y}px`,width:isWide?'10px':'8px',height:isWide?'10px':'8px',margin:isWide?'-5px 0 0 -5px':'-4px 0 0 -4px',borderRadius:'50%',background:q.c.future?'var(--surface)':LINE,border:q.c.future?`2px solid ${LINE}`:'none',boxSizing:'border-box',boxShadow:'0 0 0 2px var(--surface)'}}/>)}
            </div>}
          </div>
          <div style={{display:'flex',gap,marginTop:'4px',...(isWide?{gridColumn:'2 / -1'}:{})}}>
            {cols.map(c=>{ const isCurr=c.idx===currPeriodIdx, on=!isWide&&c.idx===pickIdx; return <span key={c.p.month} style={{flex:'1 1 0',minWidth:0,textAlign:'center',fontSize:isWide?'11.5px':'9.5px',fontWeight:isCurr||on?900:800,color:isCurr||on?BRASS:'var(--quiet)'}}>{short(c)}{isWide&&c.future&&<span style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--quiet)',lineHeight:1.1}}>forecast</span>}</span>; })}
          </div>
          {isWide&&ROWS.map(([l,f],ri)=><Fragment key={l}>
            <span style={{...lbl,whiteSpace:'nowrap',alignSelf:'stretch',display:'flex',alignItems:'center',padding:'2px 0',borderTop:ri===2?'1px solid var(--border)':ri===0?'1px solid var(--border-2)':'none',marginTop:ri===0?'6px':0,paddingTop:ri===0||ri===2?'4px':'2px',color:ri>=2?'var(--ink)':'var(--quiet)'}}>{l}</span>
            {cols.map(c=><span key={c.p.month} style={{textAlign:'center',padding:'2px 0',borderTop:ri===2?'1px solid var(--border)':ri===0?'1px solid var(--border-2)':'none',marginTop:ri===0?'6px':0,paddingTop:ri===0||ri===2?'4px':'2px',opacity:c.future?0.75:1,background:c.idx===currPeriodIdx?'color-mix(in srgb, var(--tint-brass) 70%, transparent)':'transparent'}}>{f(c)}</span>)}
          </Fragment>)}
        </div>
        {!isWide&&pick&&(
          <div style={{marginTop:'8px',padding:'8px 12px 6px',borderRadius:'12px',background:'var(--surface-2)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px',marginBottom:'2px'}}>
              <span style={{fontSize:'14px',fontWeight:900,color:'var(--ink)'}}>{payLabel(pick.p.month)}{pick.future&&<span style={{fontSize:'11px',fontWeight:700,color:'var(--quiet)'}}> · forecast</span>}</span>
              <button type="button" onClick={openSummary} style={{background:'none',border:'none',padding:0,fontFamily:'inherit',fontSize:'12px',fontWeight:800,color:BRASS,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'3px'}}>Details<Ico n="cR" s={12} c={BRASS} w={2.5}/></button>
            </div>
            {line('Salary & allowances',pick.sal,false,'var(--muted)')}
            {pick.g>0.005&&line('Overtime submitted',pick.g,false,'var(--text-green-deep)')}
            {pick.t>0.005&&line('Overtime to submit',pick.t,false,'var(--text-red-deep)')}
            {pick.e>0.005&&line('Overtime planned',pick.e,false,'var(--exp-ink)')}
            {pick.ot<=0.005&&line('Overtime & PA',0,false,'var(--quiet)')}
            {line('Total gross',pick.gross,true,'var(--ink)')}
            {line('Take-home',pick.takeHome,false,'var(--text-green-deep)')}
          </div>
        )}
        {!isWide&&<div style={{fontSize:'10.5px',fontWeight:600,color:'var(--quiet)',marginTop:'5px',textAlign:'center'}}>Tap a month for its pay · hollow dots = not paid yet</div>}
        {!isWide&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'10px',borderTop:'1px solid var(--border-2)',marginTop:'8px',paddingTop:'8px'}}>
          {TOT.map(([,l,v,col])=><div key={l} style={{minWidth:0}}><div style={lbl}>{l}</div><div style={{fontFamily:MONO,fontSize:'14px',fontWeight:700,color:col,marginTop:'1px',whiteSpace:'nowrap'}}>{fmtGBP(v)}</div></div>)}
        </div>}
        </div>}
      </div>
    );
  })();

  const salaryBreakdownCard = (
    <div style={S.card}>
      {/* Desktop starts (and stays) expanded — there's nothing to toggle
          there, so disabled rather than a plain div: same look, but
          genuinely inert (out of tab order, no click handler at all)
          instead of a div whose onClick quietly did nothing on that
          layout anyway. The accordion body used to need its own
          stopPropagation to stop a click inside it from bubbling up to
          this row's own toggle; now that the toggle lives on this button
          alone (a sibling of the body, not an ancestor of it), a click
          inside the body was never going to reach it in the first place. */}
      <button disabled={isWide} onClick={()=>setSalaryBreakdownExpanded(v=>!v)} aria-expanded={isWide?undefined:salaryBreakdownExpanded} style={{touchAction:'manipulation',WebkitTapHighlightColor:'transparent',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',cursor:isWide?'default':'pointer'}}>
        <div style={{display:'flex',alignItems:'center',gap:'11px'}}>
          <div style={{background:'var(--tint-brass)',padding:isWide?'10px':'8.5px',borderRadius:isWide?'12px':'13px',flexShrink:0}}><Ico n="bar" s={isWide?17:24} c={BRASS}/></div>
          <div>
            <div style={{fontWeight:800,fontSize:'13.5px',color:'var(--ink)'}}>Salary breakdown &amp; forecast</div>
            <div style={{fontSize:'10.5px',color:'var(--quiet)',marginTop:'1px'}}>Base, allowances, overtime, full-year projection</div>
          </div>
        </div>
        {!isWide&&<span aria-hidden="true" style={{display:'flex',flexShrink:0,transform:salaryBreakdownExpanded?'rotate(-90deg)':'rotate(90deg)',transition:'transform 0.2s'}}><Ico n="cR" s={16} c="var(--quiet)" w={2.2}/></span>}
      </button>

      {salaryBreakdownExpanded&&(
        <div className="accordion-in" style={{cursor:'default',...(isWide?{display:'grid',gridTemplateColumns:'minmax(0,1.1fr) minmax(0,1fr)',gap:'40px',alignItems:'start'}:{})}}>
          {/* Desktop: the year-to-date figures on the left, the gross salary
              bars on the right, across the card's full width (the monthly
              chart now has its own card above). Phones stack them. */}
          <div>
          {/* breakdown rows: paid so far this tax year, gross in one column
              and net in the next, so the figures line up down the card */}
          <div style={{borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px',display:'grid',gridTemplateColumns:'minmax(0,1fr) auto auto',columnGap:'14px',rowGap:'6px',alignItems:'baseline'}}>
            <span style={{fontSize:'9.5px',fontWeight:800,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Year to date</span>
            <span style={{fontSize:'9.5px',fontWeight:800,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'right'}}>Gross</span>
            <span style={{fontSize:'9.5px',fontWeight:800,color:'#059669',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'right'}}>Net</span>
            {(()=>{
              const hasPay = !!(settings.rank&&settings.service);
              const num = (v,col) => <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:col,textAlign:'right',whiteSpace:'nowrap'}}>{fmtGBP(v)}</span>;
              const row = ([label,gross,net,needsPay]) => (
                <Fragment key={label}>
                  <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>{label}</span>
                  {needsPay && !hasPay
                    ? <span style={{gridColumn:'span 2',textAlign:'right',fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--quiet)'}}>Set rank &amp; pay point</span>
                    : <>{num(gross,'var(--ink)')}{num(net,'#059669')}</>}
                </Fragment>
              );
              const rule = {gridColumn:'1 / -1',borderTop:'1px solid var(--border-2)',margin:'2px 0'};
              return (<>
                {[
                  ['Base salary', totals.salaryYTD, totals.salaryNetYTD, true],
                  ['London Weighting', totals.lwYTD, totals.lwNetYTD, true],
                  ['London Allowance', totals.laYTD, totals.laNetYTD, true],
                  ['Overtime', totals.otPaidGross, totals.otPaidNet],
                  ['Protection Allowance', totals.paPaidGross, totals.paPaidNet],
                ].map(row)}
                {totals.importedYTD>0.005 && <span style={{gridColumn:'1 / -1',fontSize:'10.5px',fontWeight:600,color:'var(--quiet)',marginTop:'-4px'}}>Overtime includes {fmtGBP(totals.importedYTD)} gross you entered as already paid (More › Config)</span>}
                {/* Everything paid so far: the rows above add up to it, and it
                    matches the payslips (gross, and take-home after pension,
                    tax and NI). */}
                {hasPay && <>
                  <div style={rule}/>
                  <span style={{fontSize:'13px',fontWeight:900,color:'var(--ink)'}}>Total</span>
                  <span style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:800,color:'var(--ink)',textAlign:'right',whiteSpace:'nowrap'}}>{fmtGBP(totals.combinedGrossYTD)}</span>
                  <span style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:800,color:'#059669',textAlign:'right',whiteSpace:'nowrap'}}>{fmtGBP(totals.combinedNetYTD)}</span>
                </>}
                {/* Claims waiting for a later payday aren't in the total; they
                    show on their own line underneath. */}
                {totals.onItsWayGross>0.005 && <>
                  {hasPay && <div style={rule}/>}
                  {row(['Submitted, not paid yet', totals.onItsWayGross, totals.onItsWayNet])}
                  {/* which payday each part lands on — it joins the total
                      once that payday has passed */}
                  {(totals.onItsWayByPayday||[]).map(p=>(
                    <Fragment key={p.payDate}>
                      <span style={{fontSize:'11.5px',fontWeight:700,color:'var(--quiet)',paddingLeft:'12px'}}>Due {new Date(p.payDate+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
                      <span style={{fontFamily:MONO,fontSize:'11px',fontWeight:600,color:'var(--quiet)',textAlign:'right',whiteSpace:'nowrap'}}>{fmtGBP(p.gross)}</span>
                      <span style={{fontFamily:MONO,fontSize:'11px',fontWeight:600,color:'var(--quiet)',textAlign:'right',whiteSpace:'nowrap'}}>{fmtGBP(p.net)}</span>
                    </Fragment>
                  ))}
                  <span style={{gridColumn:'1 / -1',fontSize:'10.5px',fontWeight:600,color:'var(--quiet)',lineHeight:1.45}}>Claims are paid on the payday for the date you mark them submitted, and join the total once that payday has passed.</span>
                </>}
              </>);
            })()}
          </div>

          </div>
          <div>
          {/* ── Gross Salary (Actual) ──
               Deliberately plots RAW gross now (combinedGrossYTD), not the
               pension-adjusted taxable figure an earlier round switched
               this to — direct request, after weighing the trade-off: the
               £50.3k/£100k/£125.1k markers were originally exact tax-band
               boundaries (assessed against pay net of pension), and now
               read as rough reference lines only, since raw gross sits
               above taxable income by the pension amount. The caption
               below says so explicitly rather than implying precision this
               no longer has — the Tax & 100K+ Calculator this button links
               to is still where the exact, pension-adjusted assessment
               lives. ── */}
          {(()=>{
            const grossYTD = totals.combinedGrossYTD;
            const over100k = grossYTD > 100000;
            const paNow = over100k ? Math.max(0, 12570 - Math.floor((grossYTD-100000)/2)) : 12570;
            const scaleMax = Math.max(125140, grossYTD*1.05);
            const pct = v => Math.max(0, Math.min(100, (v/scaleMax)*100));
            const barColor = grossYTD>=100000 ? '#ef4444' : grossYTD>=50270 ? '#f59e0b' : '#059669';
            const statusText = grossYTD>=125140 ? '+£125k — No tax-free allowance' : grossYTD>=100000 ? '+£100k — Allowance tapering' : grossYTD>=50270 ? 'Higher rate' : 'Basic rate';
            const markers = [
              { key:'pa',  value: paNow,  label: paNow===0 ? 'PA £0' : over100k ? `PA £${(paNow/1000).toFixed(1)}k` : 'PA £12.6k' },
              { key:'hr',  value: 50270,  label: '£50.3k' },
              { key:'100', value: 100000, label: '£100k' },
              { key:'125', value: 125140, label: '£125.1k' },
            ];
            return (
              <button onClick={()=>{scrollToTaxImpact.current=true;setTaxImpactExpanded(true);setTab('settings');}} className="tap-row" style={{display:'block',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px',cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'3px'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross Salary (Actual)</div>
                  <div style={{fontSize:'10px',fontWeight:800,color:barColor}}>{statusText}</div>
                </div>
                <div style={{fontSize:'9.5px',fontWeight:600,color:'var(--quiet)',marginBottom:'19px'}}>Before pension &amp; deductions — rough guide only; see Tax &amp; £100k+ calculator for your exact taxable position</div>
                <div style={{position:'relative',marginBottom:pct(125140)-pct(100000)<15?'28px':'16px'}}>
                  <div style={{background:'var(--border)',borderRadius:'2px',height:'10px',overflow:'hidden',position:'relative'}}>
                    <div style={{width:`${pct(grossYTD)}%`,height:'100%',background:barColor,transition:'width 0.3s, background 0.3s'}}/>
                  </div>
                  {markers.map(m=>(
                    <div key={m.key} style={{position:'absolute',left:`${pct(m.value)}%`,top:'-2px',width:'2px',height:'14px',background:'var(--border)',transform:'translateX(-1px)'}}>
                      <div style={{position:'absolute',top:(m.key==='125'&&pct(125140)-pct(100000)<15)?'29px':'17px',...(pct(m.value)>92?{right:0}:pct(m.value)<8?{left:0}:{left:'50%',transform:'translateX(-50%)'}),fontSize:'8px',fontWeight:800,color:'var(--muted)',whiteSpace:'nowrap'}}>{m.label}</div>
                    </div>
                  ))}
                  <div style={{position:'absolute',left:`${pct(grossYTD)}%`,top:'-5px',width:'3px',height:'20px',background:barColor,transform:'translateX(-1.5px)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}/>
                  <div style={{position:'absolute',left:`${pct(grossYTD)}%`,top:'-19px',transform:pct(grossYTD)>92?'translateX(-100%)':pct(grossYTD)<8?'none':'translateX(-50%)',fontSize:'10px',fontWeight:900,color:barColor,whiteSpace:'nowrap'}}>£{(grossYTD/1000).toFixed(1)}k</div>
                </div>
              </button>
            );
          })()}

          {/* ── Gross Salary (Forecast) ── Same switch to raw gross
               (projectedAnnualGross) as the Actual gauge above, same
               reasoning — see its comment. No longer needs taxForecast at
               all, since the raw annualised figure doesn't depend on the
               tax-forecast memo being ready. ── */}
          {(()=>{
            const grossF = totals.projectedAnnualGross;
            const over100k = grossF > 100000;
            const paNow = over100k ? Math.max(0, 12570 - Math.floor((grossF-100000)/2)) : 12570;
            const scaleMax = Math.max(125140, grossF*1.05);
            const pct = v => Math.max(0, Math.min(100, (v/scaleMax)*100));
            const barColor = grossF>=100000 ? '#ef4444' : grossF>=50270 ? '#f59e0b' : '#059669';
            const statusText = grossF>=125140 ? '+£125k — No tax-free allowance' : grossF>=100000 ? '+£100k — Allowance tapering' : grossF>=50270 ? 'Higher rate' : 'Basic rate';
            const markers = [
              { key:'pa',  value: paNow,  label: paNow===0 ? 'PA £0' : over100k ? `PA £${(paNow/1000).toFixed(1)}k` : 'PA £12.6k' },
              { key:'hr',  value: 50270,  label: '£50.3k' },
              { key:'100', value: 100000, label: '£100k' },
              { key:'125', value: 125140, label: '£125.1k' },
            ];
            return (
              <button onClick={()=>{scrollToTaxImpact.current=true;setTaxImpactExpanded(true);setTab('settings');}} className="tap-row" style={{display:'block',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px',cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'3px'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross Salary (Forecast)</div>
                  <div style={{fontSize:'10px',fontWeight:800,color:barColor}}>{statusText}</div>
                </div>
                <div style={{fontSize:'9.5px',fontWeight:600,color:'var(--quiet)',marginBottom:'19px'}}>Forecast based on your overtime submissions, before pension &amp; deductions — rough guide only</div>
                <div style={{position:'relative',marginBottom:pct(125140)-pct(100000)<15?'28px':'16px'}}>
                  <div style={{background:'var(--border)',borderRadius:'2px',height:'10px',overflow:'hidden',position:'relative'}}>
                    <div style={{width:`${pct(grossF)}%`,height:'100%',background:barColor,transition:'width 0.3s, background 0.3s'}}/>
                  </div>
                  {markers.map(m=>(
                    <div key={m.key} style={{position:'absolute',left:`${pct(m.value)}%`,top:'-2px',width:'2px',height:'14px',background:'var(--border)',transform:'translateX(-1px)'}}>
                      <div style={{position:'absolute',top:(m.key==='125'&&pct(125140)-pct(100000)<15)?'29px':'17px',...(pct(m.value)>92?{right:0}:pct(m.value)<8?{left:0}:{left:'50%',transform:'translateX(-50%)'}),fontSize:'8px',fontWeight:800,color:'var(--muted)',whiteSpace:'nowrap'}}>{m.label}</div>
                    </div>
                  ))}
                  <div style={{position:'absolute',left:`${pct(grossF)}%`,top:'-5px',width:'3px',height:'20px',background:barColor,transform:'translateX(-1.5px)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}/>
                  <div style={{position:'absolute',left:`${pct(grossF)}%`,top:'-19px',transform:pct(grossF)>92?'translateX(-100%)':pct(grossF)<8?'none':'translateX(-50%)',fontSize:'10px',fontWeight:900,color:barColor,whiteSpace:'nowrap'}}>£{(grossF/1000).toFixed(1)}k</div>
                </div>
              </button>
            );
          })()}

          </div>
        </div>
      )}
    </div>
  );

  return (
  <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
    <SetupCard where="home" settings={settings} saveSett={saveSett} S={S} BRASS={BRASS}/>

    {isWide ? (<>
    {/* ── "One statement" layout (ledger redesign) — the hero,
         Current Period, Gross & Net, TOIL Balance and CARMS teaser
         that used to each be their own bordered/shadowed card are
         now hairline-divided rows inside a single sheet, so the
         page reads as one document rather than a pile of widgets.
         Money/hours figures use the theme's figures font (tabular) instead of
         the body face, and the one wayfinding accent throughout is
         brass (BRASS) — colour stays reserved for real state
         (green/red) elsewhere. Salary Breakdown keeps its own card
         below (it has real internal complexity — an expand toggle,
         a gauge — not worth the risk of restructuring here) but its
         icon chip is recoloured to match. See the "Ledger Redesign"
         mockup this implements; git branch ledger-redesign is the
         undo path if this doesn't land well. ── */}
    <div style={{background:'var(--surface)',borderRadius:'18px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',overflow:'hidden',marginBottom:'16px'}}>
      {masthead(false)}

      {/* Desktop: the four rows sit in a 2 × 2 grid (pay month | net pay,
          TOIL | CARMS & PSOP) so each label stays close to its figure
          instead of stretching across the full width. */}
      <div style={{padding:'4px 26px',display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',columnGap:'44px',alignItems:'stretch'}}>
        {totals.curr&&(
          <button onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); setTab('months'); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'11px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:'1px',borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <div style={{background:'var(--tint-teal)',padding:'9px',borderRadius:'13px',flexShrink:0}}><Ico n="cal" s={17} c="#0d9488"/></div>
              <div>
                <div style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>Current pay month</div>
                <div style={{display:'flex',alignItems:'baseline',gap:'8px',marginTop:'1px'}}>
                  <span style={{fontSize:'18px',fontWeight:800,color:'var(--ink)',letterSpacing:'-0.01em',lineHeight:1.2}}>{payLabel(totals.curr.month)}</span>
                  <span style={{fontSize:'12px',fontWeight:600,color:'var(--quiet)'}}>{shiftSpan(totals.curr.start,totals.curr.end)}</span>
                </div>
              </div>
            </div>
            {chev}
          </button>
        )}
        {netHeroRow(false)}
        <button onClick={()=>setTab('graph')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'11px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:0,borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
            <div style={{background:toilLedger.balance<0?'var(--tint-red)':'var(--tint-purple)',padding:'9px',borderRadius:'11px',flexShrink:0}}><Ico n="clock" s={17} c={toilLedger.balance<0?'var(--text-red-deep)':'#7c3aed'}/></div>
            <div>
              <div style={{fontSize:'14px',fontWeight:800,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>TOIL balance{toilLedger.balance<0?' · overdrawn':''}</div>
              <div style={{fontSize:'11px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--quiet)',marginTop:'1px'}}>{toilSub}</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{fontFamily:MONO,fontSize:'15px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>{fmtHrs(toilLedger.balance)}</div>
            {chev}
          </div>
        </button>
        {carmsOutstanding.totalClaims>0&&(
          <button onClick={()=>setTab('carms')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'11px 0',cursor:'pointer',background:'none',border:'none',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <div style={{background:'var(--tint-amber)',padding:'9px',borderRadius:'13px',flexShrink:0}}><Ico n="checklist" s={17} c={BRASS}/></div>
              <div>
                <div style={{fontSize:'14px',fontWeight:800,color:'var(--ink)'}}>Overtime &amp; PA to submit</div>
                <div style={{fontSize:'10.5px',color:'var(--quiet)',fontWeight:600,marginTop:'1px'}}>Submit by {submitWindow(localDateStr())?.byShort} for {submitWindow(localDateStr())?.month}</div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}><div style={{fontFamily:MONO,fontSize:'15px',fontWeight:600,color:'var(--text-red-deep)',textAlign:'right',lineHeight:1.2}}>{fmtGBP(carmsOutstanding.totalAmount)}<span style={{display:'block',fontFamily:'inherit',fontSize:'10.5px',fontWeight:700,color:'var(--quiet)',textAlign:'right'}}>{carmsOutstanding.totalClaims} claim{carmsOutstanding.totalClaims!==1?'s':''}</span></div>{chev}</div>
          </button>
        )}
      </div>
    </div>

    {monthChartCard}
    {settings.rank&&settings.service&&salaryBreakdownCard}
    </>) : (<>
    {/* ── Mobile "one statement" layout — same idea as desktop: a
         full-bleed navy masthead the ledger rows grow directly out
         of, instead of a separate floating hero card sitting above
         disconnected stat tiles. Salary Breakdown keeps its own
         card below, same reasoning as desktop. ── */}
    <div style={{background:'var(--surface)',borderRadius:'18px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',overflow:'hidden',marginBottom:'10px'}}>
      {masthead(true)}

      <div style={{padding:'2px 18px'}}>
        {totals.curr&&(
          <button onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); setTab('months'); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'10px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:'1px',borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{background:'var(--tint-teal)',padding:'8px',borderRadius:'13px',flexShrink:0}}><Ico n="cal" s={16} c="#0d9488"/></div>
              <div>
                <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)'}}>{payLabel(totals.curr.month)}</div>
                <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--quiet)',marginTop:'1px'}}>{shiftSpan(totals.curr.start,totals.curr.end)}</div>
              </div>
            </div>
            {chev}
          </button>
        )}
        {netHeroRow(true)}
        <button onClick={()=>setTab('graph')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'10px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:carmsOutstanding.totalClaims>0?'1px':0,borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{background:toilLedger.balance<0?'var(--tint-red)':'var(--tint-purple)',padding:'8px',borderRadius:'10px',flexShrink:0}}><Ico n="clock" s={16} c={toilLedger.balance<0?'var(--text-red-deep)':'#7c3aed'}/></div>
            <div>
              <div style={{fontSize:'13px',fontWeight:800,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>TOIL balance{toilLedger.balance<0?' · overdrawn':''}</div>
              <div style={{fontSize:'10.5px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--quiet)',marginTop:'1px'}}>{toilSub}</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>{fmtHrs(toilLedger.balance)}</div>
            {chev}
          </div>
        </button>
        {carmsOutstanding.totalClaims>0&&(
          <button onClick={()=>setTab('carms')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'10px 0',cursor:'pointer',background:'none',border:'none',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',minWidth:0,flex:1}}>
              <div style={{background:'var(--tint-amber)',padding:'8px',borderRadius:'13px',flexShrink:0}}><Ico n="checklist" s={16} c={BRASS}/></div>
              <div>
                <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)'}}>Overtime &amp; PA to submit</div>
                <div style={{fontSize:'9.5px',color:'var(--quiet)',fontWeight:600,marginTop:'1px'}}>Submit by {submitWindow(localDateStr())?.byShort} for {submitWindow(localDateStr())?.month}</div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0,marginLeft:'10px'}}><div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:'var(--text-red-deep)',textAlign:'right',lineHeight:1.2}}>{fmtGBP(carmsOutstanding.totalAmount)}<span style={{display:'block',fontFamily:'inherit',fontSize:'10.5px',fontWeight:700,color:'var(--quiet)',textAlign:'right'}}>{carmsOutstanding.totalClaims} claim{carmsOutstanding.totalClaims!==1?'s':''}</span></div>{chev}</div>
          </button>
        )}
      </div>
    </div>

    {monthChartCard}
    {settings.rank&&settings.service&&salaryBreakdownCard}

    {/* Mobile-only — a low-key way to sign out from Home itself, instead
        of only reachable from the bottom of More... Deliberately a small
        icon pill rather than a full box: this is a dashboard people
        check often, not an actions screen, so it shouldn't compete with
        the real content above it. */}
    {session&&(
      <div style={{display:'flex',justifyContent:'center',marginTop:'14px'}}>
        <button onClick={()=>setSignOutConfirmOpen(true)} style={{display:'flex',alignItems:'center',gap:'7px',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'20px',padding:'8px 14px',cursor:'pointer',fontFamily:'inherit'}}>
          <FireExitIcon size={15} color="#059669"/>
          <span style={{fontWeight:700,fontSize:'12px',color:'#059669'}}>Sign out</span>
        </button>
      </div>
    )}
    </>)}

    <div style={{fontSize:'10.5px',color:'var(--text-red-deep)',textAlign:'center',lineHeight:1.5,padding:'8px 12px 0'}}>For guidance only. Always verify amounts against your payslip.</div>
  </div>
  );
}
