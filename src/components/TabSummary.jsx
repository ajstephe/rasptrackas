import { useEffect, useRef, useState } from 'react';
import { buildCalendarWeeks, localDateStr } from '../lib/payPeriods.js';
import { KEYS, dualWrite } from '../lib/storage.js';
import { fmt, fmtHrs, fmtGBP, fmtD, payLabel } from '../lib/format.js';
import { isOtSubmitted, isPaSubmitted, effectiveOtDate, effectivePaDate, periodIdxForDate } from '../lib/calc.js';
import { RATE_TIER_LABEL } from '../lib/payRates.js';
import { partNets } from '../lib/payroll.js';
import { Ico } from './Icons.jsx';
import { SegSlider } from './SegSlider.jsx';
import { Tooltip } from './Tooltip.jsx';
import { submitWindow, daysUntil, shortDay } from '../lib/deadline.js';

// ─── Summary tab (List View + Calendar View) ────────────────────────────────
// Extracted verbatim from App.jsx's tab==='months' block — no behaviour
// change. The biggest and most state-entangled of the six tabs (dual view
// modes, heavy per-period/per-day derived figures, swipe handling), so it
// takes the most props of any extraction so far - all explicit, nothing
// bundled into an opaque object.
export function TabSummary({
  isWide, S, MONO, BRASS,
  stickyRef, mainRef, monthRefs, entryRefs, calSwipeStartX,
  breakdownView, setBreakdownView, defaultBreakdownView, setDefaultBreakdownView,
  currPeriodIdx, calPeriodIdx, setCalPeriodIdx, expanded, setExpanded,
  calLegendExpanded, setCalLegendExpanded,
  focusEntryId, confirmDel, setConfirmDel, setPulsePeriodIdx,
  setSelectedCalDay, setConfirmCreateDay,
  PAY_PERIODS, fyEntries, totals, carmsOutstanding, todayStr, entryNet,
  calcEntry, crossPeriodInfo, carmsBadge, renderDatePills, renderFYTotalsCard,
  openQuickSubmit, jumpTo, snapToActiveMonth, startEdit, delEntry, setTab, animClass='fi',
}) {
  // Hours split by claim status: overtime marked submitted on CARMS, and
  // overtime still to submit (a future shift counts as planned instead).
  const hrsSplit = list => { let sub=0, pend=0, plan=0, nSub=0, nPend=0, nPlan=0; list.forEach(e=>{ const c=calcEntry(e); const h=c.h1+c.h2+c.h3; if(!h) return; if(e.date>todayStr) { plan+=h; nPlan++; } else if(isOtSubmitted(e)) { sub+=h; nSub++; } else { pend+=h; nPend++; } }); return {sub,pend,plan,nSub,nPend,nPlan}; };
  const RED='#dc2626', GRN='#059669';
  // Shifts worked in the previous pay year but claimed into one of this
  // year's pay months: their money counts in that month, so they're listed
  // there too (after the month's own shifts), carrying their "counted in"
  // mark. Hours worked still belong to the month they were worked.
  const lateInto = p => fyEntries.filter(e=>{
    if (e.date >= PAY_PERIODS[0].start) return false;
    const c = calcEntry(e);
    const inP = d => d>=p.start && d<=p.end;
    return (c.h1+c.h2+c.h3>0 && isOtSubmitted(e) && inP(effectiveOtDate(e))) || (c.pa>0 && isPaSubmitted(e) && inP(effectivePaDate(e)));
  });

  // Purely a gesture-visual concern (not app state), so it's local rather
  // than lifted like calSwipeStartX — mutated directly via the ref during
  // the drag rather than through React state, so the calendar visibly
  // tracks the finger at 60fps instead of only reacting once the swipe ends.
  const weeksGridRef = useRef(null);
  // Axis-lock for the calendar swipe — a touch that starts over the
  // calendar could just as easily be a vertical scroll as a horizontal
  // month-swipe, and letting both happen at once (the grid dragging
  // sideways while the page also scrolls under your thumb) feels like the
  // gesture is fighting itself. calSwipeAxisRef decides 'x' or 'y' from the
  // first few pixels of movement and commits to it for the rest of that
  // touch; only once it's decided 'x' do we call preventDefault to stop
  // the page's own vertical scroll for the remainder of the gesture.
  const calCardRef = useRef(null);
  const calSwipeStartYRef = useRef(null);
  const calSwipeAxisRef = useRef(null);

  // Which Compact-view rows have their notes drawer open — purely a UI
  // concern local to this tab (nothing else reads it, nothing persists it),
  // unlike expanded/calPeriodIdx above which App.jsx lifts because other
  // things (jumpTo, the post-save navigation) need to drive them from outside.
  const [openNotes, setOpenNotes] = useState(()=>new Set());
  const toggleNotes = id => setOpenNotes(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // React's onTouchMove is bound passively (matching the browser's own
  // default, for scroll performance), so calling preventDefault from the
  // JSX prop would silently do nothing — this needs a real, non-passive
  // listener attached directly to the node.
  useEffect(() => {
    const el = calCardRef.current;
    if (!el || isWide) return;
    const onMove = (e) => {
      if (calSwipeStartX.current===null || !weeksGridRef.current) return;
      const dx = e.touches[0].clientX - calSwipeStartX.current;
      const dy = e.touches[0].clientY - calSwipeStartYRef.current;
      if (calSwipeAxisRef.current===null) {
        // a couple of pixels of "is this even a drag yet" dead zone before
        // committing, so a near-vertical scroll never gets mistaken for x
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        calSwipeAxisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (calSwipeAxisRef.current!=='x') return; // vertical — let the page scroll as normal
      e.preventDefault();
      // rubber-banded past 90px so a long drag doesn't just keep dragging
      // the grid off into space — same idea as an iOS scroll-past-the-end
      // bounce, capped rather than elastic.
      const damped = Math.abs(dx) > 90 ? Math.sign(dx) * (90 + (Math.abs(dx) - 90) * 0.25) : dx;
      weeksGridRef.current.style.transform = `translateX(${damped}px)`;
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [isWide, calSwipeStartX]);
  // One breakdown layout for a pay period — overtime by rate (with the dates
  // each came from), Protection Allowance, TOIL, and anything still to submit —
  // shared by the Calendar's totals card and an opened month in Months view,
  // so the two always read the same way.
  const periodBreakdownRows = ({pb, tierHours, tierGross, tierDates, paCount, paGross, paDates, toilWorked, toilBanked, toilWaiting=0, carmsGroup, periodIdx, extra=null}) => {
    const lineRow = {display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'10px',fontSize:'12.5px',fontWeight:700};
    const tier = (key,lbl) => tierHours[key]>0 && (
      <div key={key} style={{padding:'7px 0'}}>
        <div style={{...lineRow,color:'var(--ink)'}}><span>{fmtHrs(tierHours[key])} at {lbl}</span><span style={{fontFamily:MONO}}>{fmt(tierGross[key])}</span></div>
        <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'2px'}}>{renderDatePills(tierDates[key],'var(--muted)')}</div>
      </div>
    );
    const paLine = k => paCount[k]>0 && (
      <div key={k} style={{padding:'7px 0'}}>
        <div style={{...lineRow,color:'var(--text-amber-deep)'}}><span>{k} × {paCount[k]}</span><span style={{fontFamily:MONO}}>{fmt(paGross[k])}</span></div>
        <div style={{fontSize:'10px',fontWeight:700,color:'#b45309',marginTop:'2px'}}>{renderDatePills(paDates[k],'#b45309')}</div>
      </div>
    );
    const section = {borderTop:'1px solid var(--border-2)',padding:'8px 0 2px'};
    // Phones stack the gross · net figures under the heading: beside
    // "Protection Allowance" there wasn't room and "net" wrapped alone.
    const secHead = (lbl,col,gross,net) => (
      <div style={isWide?{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px'}:{display:'flex',flexDirection:'column',gap:'2px'}}>
        <span style={{fontSize:'10px',fontWeight:900,color:col,textTransform:'uppercase',letterSpacing:'0.06em'}}>{lbl}</span>
        <span style={{fontFamily:MONO,fontSize:'11px',fontWeight:600,color:'var(--quiet)'}}>{fmt(gross)} gross · <span style={{color:'#059669'}}>{fmt(net)} net</span></span>
      </div>
    );
    const linkRow = (onClick, icon, iconCol, label, value, valueCol, subLine) => (
      <button onClick={onClick} className="tap-row" style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',background:'none',border:'none',borderTop:'1px solid var(--border-2)',padding:'11px 0 4px',textAlign:'left',fontFamily:'inherit',cursor:'pointer'}}>
        <Ico n={icon} s={14} c={iconCol}/>
        <span style={{flex:1,fontSize:'12.5px',fontWeight:700,color:'var(--ink)'}}>{label}{subLine&&<span style={{display:'block',fontSize:'11px',fontWeight:600,color:'var(--muted)',marginTop:'2px'}}>{subLine}</span>}</span>
        {value&&<span style={{fontFamily:MONO,fontSize:'13px',fontWeight:700,color:valueCol}}>{value}</span>}
        <Ico n="cR" s={13} c="var(--quiet)" w={2.2}/>
      </button>
    );
    const noOT = tierHours.t133+tierHours.t150+tierHours.t200===0;
    const noPA = paCount.PA1+paCount.PA2+paCount.PA3===0;
    if (noOT && noPA && !extra && !toilWorked && !carmsGroup) return (
      <div style={{padding:'18px 0 8px',textAlign:'center'}}><div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)'}}>No overtime or PA yet</div><div style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)',marginTop:'3px'}}>Pick a day on the calendar to log a shift.</div></div>
    );
    return (<>
      {!noOT&&<div style={section}>
        {secHead('Overtime','var(--text-blue-deep)',pb.ot,pb.otResult.net)}
        {tier('t133','1.33×')}{tier('t150','1.5×')}{tier('t200','2×')}
      </div>}
      {!noPA&&<div style={section}>
        {secHead('Protection Allowance','var(--text-amber-deep)',pb.pa,pb.paResult.net)}
        {paLine('PA1')}{paLine('PA2')}{paLine('PA3')}
      </div>}
      {/* e.g. the Calendar's planned-shifts section */}
      {extra}
      {(toilWorked>0||toilBanked>0)&&linkRow(()=>setTab('graph'),'clock','#7c3aed',<>TOIL <span style={{fontFamily:MONO,fontWeight:600,color:'var(--text-purple-deep)',marginLeft:'4px'}}>{fmtHrs(toilWorked)} worked → {fmtHrs(toilBanked)}{toilWaiting>0?'':' banked'}</span></>,null,null,
        // Unsubmitted TOIL isn't in the balance yet (TOIL page) — say how
        // much of this period's figure that is, so the two pages agree.
        toilWaiting>0 ? `${toilBanked-toilWaiting>1e-6?`${fmtHrs(toilBanked-toilWaiting)} in your balance · `:''}${fmtHrs(toilWaiting)} waiting to submit` : null)}
      {carmsGroup&&linkRow(ev=>{ ev.stopPropagation(); setTab('carms'); setPulsePeriodIdx(periodIdx); },'checklist',BRASS,'Overtime & PA to submit',fmtGBP(carmsGroup.periodTotal),'var(--text-red-deep)')}
    </>);
  };

  // A shift's own heading block — the date as the heading, any TOIL/Mix tag,
  // then the reason in normal letters, the submission status and any
  // cross-period note. Edit sits beside the date; delete is a quieter icon
  // set apart from it (and still asks first). Used by the Shifts view,
  // an opened month in Months view, and matches the calendar day pop-up.
  const shiftHead = (e, {onEdit, onDelete, deleting, showDate=true, extra=null}) => (
    <>
      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
        <span style={{fontWeight:900,fontSize:'14px',color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{showDate ? new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : (e.reason||'Shift')}</span>
        {e.takeAs==='toil'&&<span style={{fontSize:'10px',fontWeight:800,padding:'2px 7px',borderRadius:'6px',background:'var(--tint-purple)',color:'var(--tag-purple)',flexShrink:0}}>TOIL</span>}
        {e.takeAs==='mix'&&<span style={{fontSize:'10px',fontWeight:800,padding:'2px 7px',borderRadius:'6px',background:'var(--tint-purple)',color:'var(--tag-purple)',flexShrink:0}}>Mix</span>}
        <span style={{flex:1}}/>
        {extra}
        <Tooltip label="Edit shift"><button onClick={onEdit} aria-label="Edit this shift" style={{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',width:'28px',height:'28px',borderRadius:'8px',background:'var(--chip-bg)',border:'none',cursor:'pointer',padding:0}}><Ico n="edit" s={13} c="#64748b"/></button></Tooltip>
        <Tooltip label="Delete shift"><button onClick={onDelete} aria-label="Delete this shift" style={{flexShrink:0,marginLeft:'6px',display:'flex',alignItems:'center',justifyContent:'center',width:'28px',height:'28px',borderRadius:'8px',background:deleting?'var(--tint-red)':'transparent',border:'none',cursor:'pointer',padding:0,transition:'all 0.15s'}}><Ico n="trash" s={13} c="#ef4444"/></button></Tooltip>
      </div>
      {showDate&&<div style={{fontSize:'12.5px',fontWeight:600,color:'var(--muted)',marginTop:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.reason||'Shift'}</div>}
    </>
  );

  // Everything the Months view shows for one pay month: its shifts (by the
  // dates worked), its money (by claim date, from periodBreakdown), the
  // overtime/PA/TOIL breakdown for an opened month, and its hours split.
  const periodCalc = (p, idx) => {
    const pE=fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
    const pb=totals.periodBreakdown[idx];
    // Hours-worked stats (top-of-card "Total O/T Hours", TOIL
    // worked/banked) stay period-local — what actually happened
    // in this period, regardless of submission status, matching
    // what the calendar cells for these dates show.
    let totalToilWorked=0,totalToilBanked=0,totalToilWaiting=0;
    pE.forEach(e=>{
      const c=calcEntry(e);
      totalToilWorked+=c.toilH; totalToilBanked+=c.toilBanked;
      if(!isOtSubmitted(e)&&e.date<=todayStr) totalToilWaiting+=c.toilBanked;
    });
    // OT Pay / PA box data is different on purpose: it iterates
    // EVERY entry in the financial year, not just ones worked in
    // this period, and groups each by which period its money is
    // actually submitted to — same attribution periodBreakdown
    // itself already uses. A shift worked 15 Jul but submitted
    // 16 Aug shows up here, in August's box, carrying its
    // original worked date (15/07) rather than the submission
    // date, so the box always matches what's genuinely in its
    // own Gross figure above it.
    let pa1=0,pa2=0,pa3=0;
    const tierHours = { t133:0, t150:0, t200:0 };
    const tierDates = { t133:[], t150:[], t200:[] };
    const tierGross = { t133:0, t150:0, t200:0 };
    const paDates = { PA1:[], PA2:[], PA3:[] };
    const paGross = { PA1:0, PA2:0, PA3:0 };
    fyEntries.forEach(e=>{
      const c=calcEntry(e);
      const otCounted = isOtSubmitted(e) && periodIdxForDate(effectiveOtDate(e))===idx;
      const paCounted = isPaSubmitted(e) && periodIdxForDate(effectivePaDate(e))===idx;
      const isCross = periodIdxForDate(e.date)!==idx;
      if (otCounted) {
        if (c.payH1>0) { tierHours.t133+=c.payH1; tierDates.t133.push({d:fmtD(e.date),counted:true,cross:isCross}); tierGross.t133+=c.ot1; }
        if (c.payH2>0) { tierHours.t150+=c.payH2; tierDates.t150.push({d:fmtD(e.date),counted:true,cross:isCross}); tierGross.t150+=c.ot2; }
        if (c.payH3>0) { tierHours.t200+=c.payH3; tierDates.t200.push({d:fmtD(e.date),counted:true,cross:isCross}); tierGross.t200+=c.ot3; }
      }
      if (paCounted) {
        if(e.paRate==='PA1'){pa1++; paDates.PA1.push({d:fmtD(e.date),counted:true,cross:isCross}); paGross.PA1+=c.pa;}
        else if(e.paRate==='PA2'){pa2++; paDates.PA2.push({d:fmtD(e.date),counted:true,cross:isCross}); paGross.PA2+=c.pa;}
        else if(e.paRate==='PA3'){pa3++; paDates.PA3.push({d:fmtD(e.date),counted:true,cross:isCross}); paGross.PA3+=c.pa;}
      }
    });
    const totG=pb.combinedGross, totN=pb.combinedNet;
    return { p, idx, pE, pb, totG, totN, tierHours, tierGross, tierDates, paGross, paDates, paCount:{PA1:pa1,PA2:pa2,PA3:pa3},
      totalToilWorked, totalToilBanked, totalToilWaiting, sp:hrsSplit(pE), carms:carmsOutstanding.groups.find(g=>g.periodIdx===idx) };
  };

  // ── Months view ──────────────────────────────────────────────────────────
  // A headline card with the tax year so far (and this pay month's hours
  // split), then one line per pay month: a bar for its size, gross and net
  // in columns, and a status that only speaks up when there's something to
  // do. Planned shifts show in sky blue under the figures they'd add to.
  // Opening a month shows its breakdown beside a list of its shifts; opening
  // a shift shows its rates, notes, and Edit / Delete.
  const listRef = useRef(null);
  const [openShift, setOpenShift] = useState(null);
  const [hoverM, setHoverM] = useState(null);   // Months bar under the mouse: {idx, x, below}
  const [listW, setListW] = useState(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver==='undefined') return;
    const ro = new ResizeObserver(([en]) => setListW(en.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakdownView]);
  const W = listW ?? (isWide ? 1000 : 360);
  const rowCols = isWide && W>=760;              // month lines in columns
  const roomy = W>=1150;                         // wider name and figure columns
  const sideBySide = isWide && W>=1080;          // opened month: breakdown beside shifts
  const shiftCols = isWide && (sideBySide ? W-356 : W-32)>=720;  // shift list in columns
  const MONTH_COLS = roomy ? '190px minmax(0,1fr) 112px 104px 176px 18px' : '160px minmax(0,1fr) 100px 92px 160px 18px';
  const SHIFT_COLS = '96px minmax(0,1fr) 72px 96px 96px 104px 14px';
  const GROSS_STRIPE = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--text-navy) 38%, transparent) 0 4px, color-mix(in srgb, var(--text-navy) 22%, transparent) 4px 8px)';
  const PLAN_STRIPE = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--exp) 60%, transparent) 0 3px, color-mix(in srgb, var(--exp) 20%, transparent) 3px 6px)';
  const label = {fontSize:'10px',fontWeight:900,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--quiet)'};

  const chevron = open => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--quiet)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.25s',transform:open?'rotate(180deg)':'none',flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>;
  const tick = <span title="All submitted" aria-label="All submitted" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'20px',height:'20px',borderRadius:'50%',background:'var(--tint-green)',flexShrink:0}}><Ico n="check" s={11} c="var(--text-green-deep)" w={3.2}/></span>;
  const nowTag = <span style={{fontSize:'9px',fontWeight:900,letterSpacing:'0.06em',textTransform:'uppercase',color:'#fff',background:BRASS,borderRadius:'999px',padding:'1px 6px',flexShrink:0}}>Now</span>;
  const tag = (txt,bg,col) => <span key={txt} style={{fontSize:'10.5px',fontWeight:800,padding:'1px 7px',borderRadius:'6px',background:bg,color:col,whiteSpace:'nowrap'}}>{txt}</span>;
  const money = (v,col,size=14.5,w=600) => <span style={{fontFamily:MONO,fontSize:`${size}px`,fontWeight:w,color:col,whiteSpace:'nowrap'}}>{v}</span>;
  const planned = v => <div style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--exp-ink)',marginTop:'2px',whiteSpace:'nowrap'}}>{v}</div>;
  const dash = <span style={{fontFamily:MONO,fontSize:'14px',color:'var(--quiet)'}}>—</span>;
  const lineItem = (l,r,col='var(--ink)') => <div style={{display:'flex',justifyContent:'space-between',gap:'10px',fontSize:'12.5px',fontWeight:600,color:'var(--muted)',padding:'3px 0'}}><span>{l}</span><span style={{fontFamily:MONO,fontWeight:600,color:col,whiteSpace:'nowrap'}}>{r}</span></div>;
  const goSubmit = (ev, idx) => { ev.stopPropagation(); setTab('carms'); setPulsePeriodIdx(idx); };
  const submitLink = (m, size=12) => (
    <button type="button" onClick={ev=>goSubmit(ev,m.idx)} style={{display:'inline-flex',alignItems:'center',gap:'5px',background:'var(--tint-red)',color:'var(--text-red-deep)',border:'none',borderRadius:'999px',padding:'3px 10px',fontSize:`${size}px`,fontWeight:800,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
      {fmtGBP(m.carms.periodTotal)} to submit <Ico n="cR" s={10} c="var(--text-red-deep)" w={2.6}/>
    </button>
  );
  // Opening or closing a month also clears the bar's hover box, so it
  // doesn't sit over the month that's just opened.
  const toggleMonth = m => { setHoverM(null); setExpanded(expanded===m.p.month?null:m.p.month); };
  // A month line contains the to-submit button, so it's a role="button"
  // div rather than a <button> (which may not hold another button).
  const pressable = fn => ({role:'button', tabIndex:0, onClick:fn, onKeyDown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); } }});
  // Planned shifts get their own sky-blue line, so they're only named here
  // when a month has nothing else in it.
  const shiftsTxt = m => { const n=m.sp.nSub+m.sp.nPend; return n===0&&m.sp.nPlan>0 ? `${m.sp.nPlan} planned shift${m.sp.nPlan!==1?'s':''}` : `${n} shift${n!==1?'s':''}`; };
  // Nothing worked or paid yet (planned shifts don't count).
  const isEmpty = m => m.totG===0 && m.totN===0 && !m.carms && m.pE.every(e=>e.date>todayStr) && lateInto(m.p).length===0;
  const monthStatus = m => m.carms ? submitLink(m, 11.5)
    : !isEmpty(m) ? tick
    : m.pE.length>0 ? <span style={{fontSize:'12px',fontWeight:700,color:'var(--exp-ink)'}}>Planned</span> : null;

  // ── An opened month ──
  const tierLines = m => [['t133','1.33×'],['t150','1.5×'],['t200','2×']].filter(([k])=>m.tierHours[k]>0).map(([k,l])=>({lbl:l,h:m.tierHours[k],g:m.tierGross[k]}));
  const paLines = m => ['PA1','PA2','PA3'].filter(k=>m.paCount[k]>0).map(k=>({lbl:k,n:m.paCount[k],g:m.paGross[k]}));

  // What the month's pay is made of: one bar (overtime blue, PA amber), the
  // rate lines under each part, then TOIL.
  const monthMakeUp = m => {
    const ot=m.pb.ot, pa=m.pb.pa, tot=ot+pa;
    const head = (col,sw,txt,v) => <div style={{display:'flex',alignItems:'center',gap:'7px',fontSize:'11.5px',fontWeight:900,letterSpacing:'0.04em',textTransform:'uppercase',color:col,marginTop:'10px'}}><span style={{width:'9px',height:'9px',borderRadius:'3px',background:sw,flexShrink:0}}/>{txt}<span style={{marginLeft:'auto',fontFamily:MONO,fontWeight:700,letterSpacing:0}}>{fmt(v)}</span></div>;
    return (
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'10px',flexWrap:'wrap'}}>
          {money(fmtGBP(m.totG),'var(--text-navy)',22,700)}{money(`${fmtGBP(m.totN)} net`,GRN,15,700)}
        </div>
        {tot>0.005 && <div aria-hidden="true" style={{display:'flex',height:'12px',borderRadius:'6px',overflow:'hidden',margin:'10px 0 2px',background:'var(--surface-2)'}}>
          <div style={{width:`${ot/tot*100}%`,background:'#2563eb'}}/><div style={{width:`${pa/tot*100}%`,background:'#d97706'}}/>
        </div>}
        {ot>0.005&&<>{head('var(--text-blue-deep)','#2563eb','Overtime',ot)}
        <div style={{paddingLeft:'16px'}}>{tierLines(m).map(r=><div key={r.lbl}>{lineItem(`${fmtHrs(r.h)} at ${r.lbl}`,fmt(r.g),'var(--muted)')}</div>)}</div></>}
        {pa>0.005&&<>{head('var(--text-amber-deep)','#d97706','Protection Allowance',pa)}
        <div style={{paddingLeft:'16px'}}>{paLines(m).map(r=><div key={r.lbl}>{lineItem(`${r.lbl} × ${r.n}`,fmt(r.g),'var(--muted)')}</div>)}</div></>}
        {(m.totalToilWorked>0||m.totalToilBanked>0)&&<button type="button" onClick={ev=>{ev.stopPropagation(); setTab('graph');}} className="tap-row" style={{display:'flex',alignItems:'center',gap:'8px',width:'100%',marginTop:'12px',padding:'10px 0 2px',borderTop:'1px solid var(--border-2)',borderLeft:'none',borderRight:'none',borderBottom:'none',background:'none',fontFamily:'inherit',cursor:'pointer',textAlign:'left'}}>
          <Ico n="clock" s={14} c="#7c3aed"/>
          <span style={{flex:1,fontSize:'12.5px',fontWeight:700,color:'var(--ink)'}}>TOIL <span style={{color:'var(--text-purple-deep)',fontFamily:MONO,fontWeight:600}}>{fmtHrs(m.totalToilWorked)} → {fmtHrs(m.totalToilBanked)}{m.totalToilWaiting>0?'':' banked'}</span>
            {/* Unsubmitted TOIL isn't in the balance yet (TOIL page) — say how much of this is, so the two pages agree. */}
            {m.totalToilWaiting>0&&<span style={{display:'block',fontSize:'11px',fontWeight:600,color:'var(--muted)',marginTop:'2px'}}>{m.totalToilBanked-m.totalToilWaiting>1e-6?`${fmtHrs(m.totalToilBanked-m.totalToilWaiting)} in your balance · `:''}{fmtHrs(m.totalToilWaiting)} waiting to submit</span>}
          </span>
          <Ico n="cR" s={13} c="var(--quiet)" w={2.2}/>
        </button>}
      </div>);
  };

  // One shift as a line: date, duty, hours, gross, net and status, with
  // small tags. Opening it shows its rates, PA, note, and Edit / Delete.
  const shiftLine = (e, m) => {
    const c=calcEntry(e), open=openShift===e.id, fut=e.date>todayStr;
    const hrs=c.h1+c.h2+c.h3, hasPA=e.paRate&&e.paRate!=='None', hasClaim=hrs>0||hasPA;
    const sub=(hrs===0||isOtSubmitted(e))&&(!hasPA||isPaSubmitted(e));
    const net=c.gross>0.005?entryNet(e):0;
    const toilOnly=c.gross<0.005&&c.toilBanked>0;
    const late=e.date<m.p.start||e.date>m.p.end, xp=crossPeriodInfo(e);
    const focus=focusEntryId===e.id;
    const status = fut ? <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--exp-ink)'}}>Planned</span>
      : !hasClaim ? <span style={{fontSize:'11.5px',fontWeight:700,color:'var(--quiet)'}}>Record only</span>
      : sub ? tick : <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-red-deep)',whiteSpace:'nowrap'}}>Not submitted</span>;
    const tags = [
      e.takeAs==='toil'&&tag('TOIL','var(--tint-purple)','var(--tag-purple)'),
      e.takeAs==='mix'&&tag('Mix','var(--tint-purple)','var(--tag-purple)'),
      hasPA&&tag(e.paRate,'var(--tint-amber)','var(--text-amber-deep)'),
      late&&tag('Late claim','var(--tint-indigo)','var(--text-indigo-deep)'),
      xp&&tag(`Paid in ${xp.label}`,'var(--tint-indigo)','var(--text-indigo-deep)'),
      e.comments&&tag('Note','var(--chip-bg)','var(--muted)'),
    ].filter(Boolean);
    const date = new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    const gCol = fut?'var(--exp-ink)':'var(--text-navy)', nCol = fut?'var(--exp-ink)':GRN;
    const toggle = () => { setConfirmDel(null); setOpenShift(open?null:e.id); };
    const base = {...pressable(toggle), 'aria-expanded':open, className:`tap-row${focus?' entry-flash':''}`};
    const rowBg = focus ? 'var(--tint-blue)' : 'transparent';
    const btn = {borderRadius:'8px',padding:'6px 12px',fontSize:'12.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'};
    return (
      <div key={e.id} ref={el=>entryRefs.current[e.id]=el}>
        {shiftCols ? (
          <div {...base} style={{display:'grid',gridTemplateColumns:SHIFT_COLS,gap:'8px',alignItems:'center',padding:'9px 4px',borderBottom:open?'none':'1px solid var(--border-2)',cursor:'pointer',background:rowBg,borderRadius:'8px',transition:'background 0.4s ease'}}>
            <span style={{fontWeight:800,fontSize:'13px',color:'var(--ink)',whiteSpace:'nowrap'}}>{date}</span>
            <span style={{minWidth:0,display:'flex',alignItems:'center',gap:'6px'}}><span style={{fontSize:'13px',fontWeight:600,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.reason||'Shift'}</span>{tags}</span>
            <span style={{textAlign:'right'}}>{money(fmtHrs(hrs),'var(--ink)',13.5,500)}</span>
            {toilOnly ? <span style={{gridColumn:'span 2',textAlign:'right',fontSize:'12.5px',fontWeight:700,color:'var(--text-purple-deep)'}}>{fmtHrs(c.toilBanked)} TOIL · no pay</span> : (<>
              <span style={{textAlign:'right'}}>{money(fmt(c.gross),gCol,13.5)}</span>
              <span style={{textAlign:'right'}}>{money(fmt(net),nCol,13.5)}</span></>)}
            <span style={{textAlign:'right'}}>{status}</span>
            {chevron(open)}
          </div>
        ) : (
          <div {...base} style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start',gap:'10px',padding:'10px 2px',borderBottom:open?'none':'1px solid var(--border-2)',cursor:'pointer',background:rowBg,borderRadius:'8px',transition:'background 0.4s ease'}}>
            <span style={{flex:1,minWidth:0}}>
              <span style={{display:'flex',alignItems:'center',gap:'8px'}}><span style={{fontWeight:800,fontSize:'13.5px',color:'var(--ink)'}}>{date}</span>{(fut||!hasClaim)&&status}</span>
              <span style={{display:'block',fontSize:'12.5px',fontWeight:600,color:'var(--muted)',marginTop:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fmtHrs(hrs)} · {e.reason||'Shift'}</span>
              {tags.length>0&&<span style={{display:'flex',flexWrap:'wrap',gap:'4px',marginTop:'4px'}}>{tags}</span>}
            </span>
            <span style={{textAlign:'right'}}>
              {toilOnly ? <span style={{fontSize:'12.5px',fontWeight:700,color:'var(--text-purple-deep)'}}>{fmtHrs(c.toilBanked)} TOIL</span> : (<>
                <span style={{display:'block'}}>{money(fmt(c.gross),gCol,13.5)}</span><span style={{display:'block',marginTop:'2px'}}>{money(fmt(net),nCol,13.5)}</span></>)}
            </span>
            <span style={{paddingTop:'3px'}}>{chevron(open)}</span>
            {/* Full width under the line, so "Submit overtime" fits on one line. */}
            {!fut&&hasClaim&&<span style={{flexBasis:'100%',marginTop:'-4px'}}>{carmsBadge(e, 9, true)}</span>}
          </div>
        )}
        {open&&(
          <div className="accordion-in" style={{background:'var(--surface-2)',borderRadius:'10px',padding:'10px 12px',margin:shiftCols?'0 0 8px 104px':'0 0 8px'}}>
            {c.payH1>0&&lineItem(`${fmtHrs(c.payH1)} at 1.33× · £${c.r.r133.toFixed(2)}/hr`,fmt(c.ot1))}
            {c.payH2>0&&lineItem(`${fmtHrs(c.payH2)} at 1.5× · £${c.r.r150.toFixed(2)}/hr`,fmt(c.ot2))}
            {c.payH3>0&&lineItem(`${fmtHrs(c.payH3)} at 2× · £${c.r.r200.toFixed(2)}/hr`,fmt(c.ot3))}
            {c.toilH>0&&lineItem(`${fmtHrs(c.toilH)} at ${RATE_TIER_LABEL[c.otRateTier]}× as TOIL`,`${fmtHrs(c.toilBanked)} banked`,'var(--text-purple-deep)')}
            {hasPA&&lineItem(`${e.paRate}`,fmt(c.pa),'var(--text-amber-deep)')}
            {!hasClaim&&!toilOnly&&<div style={{fontSize:'12.5px',fontWeight:600,color:'var(--muted)'}}>A record of the shift, with nothing to submit.</div>}
            {xp&&<div style={{fontSize:'12px',fontWeight:600,color:'var(--text-indigo-deep)',marginTop:'4px'}}>{xp.both?'Overtime & PA':xp.ot?'Overtime':'PA'} paid in {xp.label}</div>}
            {e.comments&&<div style={{fontSize:'12.5px',fontStyle:'italic',color:'var(--ink)',borderLeft:'2px solid var(--border)',paddingLeft:'8px',margin:'8px 0 2px',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{e.comments}</div>}
            <div style={{display:'flex',gap:'8px',marginTop:'10px',flexWrap:'wrap',alignItems:'center'}}>
              {confirmDel===e.id ? (<>
                <span style={{fontSize:'13px',fontWeight:800,color:'var(--text-red-deep)',marginRight:'auto'}}>Delete this shift?</span>
                <button type="button" onClick={()=>setConfirmDel(null)} style={{...btn,background:'var(--surface)',border:'1px solid var(--border)',color:'var(--muted)'}}>Cancel</button>
                <button type="button" onClick={()=>delEntry(e.id)} style={{...btn,background:'#dc2626',border:'none',color:'#fff'}}>Delete</button>
              </>) : (<>
                {/* Mark a claim submitted from here: each opens the date picker for that claim alone.
                    Phone lines already have the tappable ✗ chips above, so these show on computer only. */}
                {shiftCols&&!fut&&hrs>0&&!isOtSubmitted(e)&&<button type="button" onClick={ev=>{ ev.stopPropagation(); openQuickSubmit(e,{ot:true}); }} style={{...btn,display:'inline-flex',alignItems:'center',gap:'6px',background:'var(--tint-red)',border:'1px solid color-mix(in srgb, #dc2626 40%, transparent)',color:'var(--text-red-deep)'}}><Ico n="cal" s={12} c="var(--text-red-deep)"/>Submit overtime</button>}
                {shiftCols&&!fut&&hasPA&&!isPaSubmitted(e)&&<button type="button" onClick={ev=>{ ev.stopPropagation(); openQuickSubmit(e,{pa:true}); }} style={{...btn,display:'inline-flex',alignItems:'center',gap:'6px',background:'var(--tint-red)',border:'1px solid color-mix(in srgb, #dc2626 40%, transparent)',color:'var(--text-red-deep)'}}><Ico n="cal" s={12} c="var(--text-red-deep)"/>Submit {e.paRate}</button>}
                <button type="button" onClick={()=>startEdit(e)} style={{...btn,display:'inline-flex',alignItems:'center',gap:'6px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--ink)'}}><Ico n="edit" s={12} c="var(--muted)"/>Edit shift</button>
                <button type="button" onClick={()=>setConfirmDel(e.id)} style={{...btn,display:'inline-flex',alignItems:'center',gap:'6px',background:'transparent',border:'none',color:'var(--text-red-deep)'}}><Ico n="trash" s={12} c="#ef4444"/>Delete</button>
              </>)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const shiftList = m => {
    const list=[...[...m.pE].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0), ...lateInto(m.p)];
    return (<div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px',flexWrap:'wrap',margin:'2px 0 6px'}}>
        <span style={label}>Shifts · {list.length}</span>
        {list.length>0&&<span style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)'}}>{isWide?'Click':'Tap'} a shift for its rates, notes and edit</span>}
      </div>
      {shiftCols&&list.length>0&&<div style={{display:'grid',gridTemplateColumns:SHIFT_COLS,gap:'8px',padding:'0 4px 6px',borderBottom:'1px solid var(--border)',...label,fontSize:'10px'}}><span>Date</span><span>Duty</span><span style={{textAlign:'right'}}>Hours</span><span style={{textAlign:'right'}}>Gross</span><span style={{textAlign:'right'}}>Net</span><span style={{textAlign:'right'}}>Status</span><span/></div>}
      {list.length===0
        ? <div style={{padding:'18px 0 8px',textAlign:'center'}}><div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)'}}>No shifts yet this pay month</div><div style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>Log a shift and it'll show up here</div></div>
        : list.map(e=>shiftLine(e,m))}
    </div>);
  };

  const monthOpened = m => {
    const banner = m.carms && (
      <button type="button" onClick={ev=>goSubmit(ev,m.idx)} style={{display:'flex',alignItems:'center',gap:'10px',width:'100%',background:'var(--tint-red)',border:'none',borderRadius:'11px',padding:'10px 12px',marginBottom:'12px',textAlign:'left',fontFamily:'inherit',cursor:'pointer'}}>
        <Ico n="checklist" s={15} c="var(--text-red-deep)"/>
        <span style={{flex:1,fontSize:'13px',fontWeight:800,color:'var(--text-red-deep)'}}>{fmtGBP(m.carms.periodTotal)} still to submit on CARMS &amp; PSOP</span>
        <span style={{fontSize:'12.5px',fontWeight:800,color:'var(--text-red-deep)',whiteSpace:'nowrap'}}>Review ›</span>
      </button>);
    const close = <button type="button" onClick={()=>setExpanded(null)} style={{display:'flex',alignItems:'center',gap:'4px',margin:'10px auto 0',background:'none',border:'none',fontSize:'12.5px',fontWeight:800,color:BRASS,cursor:'pointer',fontFamily:'inherit'}}>Close {payLabel(m.p.month)} <Ico n="cU" s={12} c={BRASS}/></button>;
    const dates = <div style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)',marginBottom:'10px'}}>Shifts worked {fmtD(m.p.start)} – {fmtD(m.p.end)}</div>;
    return sideBySide ? (
      <div className="accordion-in" style={{padding:'16px',display:'grid',gridTemplateColumns:'300px minmax(0,1fr)',gap:'24px'}}>
        <div>{dates}{banner}{monthMakeUp(m)}</div>
        <div>{shiftList(m)}{close}</div>
      </div>
    ) : (
      <div className="accordion-in" style={{padding:isWide?'14px 16px':'12px'}}>
        {dates}{banner}<div style={{marginBottom:'16px',maxWidth:isWide?'460px':undefined}}>{monthMakeUp(m)}</div>{shiftList(m)}{close}
      </div>
    );
  };

  // ── The year: headline card, then a line per month ──
  const monthsView = infos => {
    // Nothing logged in this tax year yet: one friendly message instead of a
    // headline of £0.00s and a line per empty month.
    if (fyEntries.length===0) return (
      <div style={{...S.card,padding:'34px 20px',textAlign:'center'}}>
        <div style={{width:'46px',height:'46px',borderRadius:'50%',background:'var(--tint-brass)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}><Ico n="list" s={20} c={BRASS} w={2.2}/></div>
        <div style={{fontSize:'16px',fontWeight:900,color:'var(--ink)'}}>No overtime yet</div>
        <div style={{fontSize:'13px',fontWeight:600,color:'var(--muted)',margin:'4px auto 16px',maxWidth:'34ch'}}>Log your first shift and each pay month's gross, net and hours will show up here.</div>
        <button type="button" onClick={()=>setTab('add')} style={{display:'inline-flex',alignItems:'center',gap:'6px',background:BRASS,color:'#fff',border:'none',borderRadius:'11px',padding:'10px 18px',fontSize:'13.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}><Ico n="plus" s={14} c="#fff" w={2.6}/>Log overtime</button>
      </div>
    );
    const shown = infos.filter(m => !(m.p.start>todayStr && isEmpty(m) && m.pE.length===0 && !m.carms && expanded!==m.p.month && m.idx!==currPeriodIdx));
    const later = infos.filter(m => !shown.includes(m));
    // A computer reads the year in date order; a phone puts the newest first.
    const rows = isWide ? shown : [...shown].reverse();
    const T = shown.reduce((a,m)=>({hrs:a.hrs+m.sp.sub+m.sp.pend, n:a.n+m.sp.nSub+m.sp.nPend, g:a.g+m.totG, net:a.net+m.totN}), {hrs:0,n:0,g:0,net:0});
    const EY = totals.expectedYear;
    const exOf = m => { const ex = totals.expected?.[m.idx]; return ex&&ex.n>0 ? ex : null; };
    const max = Math.max(1, ...shown.map(m=>m.totG+(exOf(m)?.gross||0)));
    const fy = String(PAY_PERIODS[0].month).split(' ')[1];
    const cm = currPeriodIdx>=0 ? infos[currPeriodIdx] : null;

    // Claimed on the top line (gross in grey stripes, its net in solid green
    // inside it); planned on a second line underneath, only when the month has
    // planned shifts (gross in blue stripes, its net in solid blue inside it).
    const bar = m => { const ex=exOf(m), g=m.totG, n=m.totN, eg=ex?ex.gross:0, en=ex?ex.net:0;
      const pc = v => Math.min(100, v/max*100);
      const seg = (w,bg) => <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${pc(w)}%`,background:bg,borderRadius:'4px'}}/>;
      const line = kids => <div style={{position:'relative',height:eg>0?'7px':'10px',borderRadius:'4px',background:'var(--surface-2)',overflow:'hidden'}}>{kids}</div>;
      return <div aria-hidden="true" style={{display:'grid',gap:'3px'}}>
        {line(<>{g>0&&seg(g,GROSS_STRIPE)}{n>0&&seg(n,GRN)}</>)}
        {eg>0&&line(<>{seg(eg,PLAN_STRIPE)}{en>0&&seg(en,'var(--exp)')}</>)}
      </div>; };

    // Computer only: hovering a bar shows what's in it. It follows the mouse
    // along the bar, opening below for months in the top half of the screen
    // and above for the rest, so the sticky header never covers it.
    const tipRow = (sw,lbl,sub,gv,nv,col) => <div style={{display:'grid',gridTemplateColumns:'14px minmax(0,1fr) 78px 78px',columnGap:'8px',alignItems:'center',padding:'4px 0'}}>
      <span style={{width:'10px',height:'10px',borderRadius:'3px',background:sw||'transparent'}}/>
      <span style={{minWidth:0,fontSize:'12px',fontWeight:800,color:col||'var(--ink)'}}>{lbl}{sub&&<span style={{display:'block',fontSize:'10.5px',fontWeight:600,color:'var(--quiet)'}}>{sub}</span>}</span>
      <span style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:700,color:col==='var(--muted)'?'var(--muted)':'var(--text-navy)',textAlign:'right',whiteSpace:'nowrap'}}>{gv}</span>
      <span style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:700,color:col==='var(--muted)'?'var(--muted)':GRN,textAlign:'right',whiteSpace:'nowrap'}}>{nv}</span>
    </div>;
    const barTip = m => { const ex=exOf(m), ts=totals.toSubmit?.[m.idx], hrs=m.sp.sub+m.sp.pend, nSh=m.sp.nSub+m.sp.nPend, ot=m.pb.ot, pa=m.pb.pa;
      const parts = [ot>0.005&&`Overtime ${fmtGBP(ot)}`, pa>0.005&&`PA ${fmtGBP(pa)}`].filter(Boolean).join(' · ');
      return <div role="tooltip" style={{position:'absolute',left:`${hoverM.x}px`,...(hoverM.below?{top:'calc(100% + 2px)'}:{bottom:'calc(100% + 2px)'}),transform:'translateX(-50%)',zIndex:20,width:'380px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',boxShadow:'0 10px 30px rgba(15,23,42,0.18)',padding:'10px 12px 8px',pointerEvents:'none',textAlign:'left'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px',paddingBottom:'6px',borderBottom:'1px solid var(--border-2)',marginBottom:'2px'}}>
          <span style={{fontSize:'13px',fontWeight:900,color:'var(--ink)'}}>{payLabel(m.p.month)}</span>
          <span style={{display:'flex',gap:'24px',...label}}><span>Gross</span><span>Net</span></span>
        </div>
        {(m.totG>0.005||!ex)&&tipRow(GRN,'Submitted',parts||null,fmtGBP(m.totG),fmtGBP(m.totN))}
        {ex&&tipRow('var(--exp)','Planned',`${ex.n} shift${ex.n!==1?'s':''} · ${fmtHrs(ex.hrs)}`,`+${fmtGBP(ex.gross)}`,`+${fmtGBP(ex.net)}`,'var(--exp-ink)')}
        {ts&&ts.n>0&&ts.gross>0.005&&tipRow('#dc2626','To submit','Not in the bar until submitted',fmtGBP(ts.gross),fmtGBP(ts.net),'var(--text-red-deep)')}
        {hrs>0&&<div style={{fontSize:'11px',fontWeight:600,color:'var(--quiet)',borderTop:'1px solid var(--border-2)',marginTop:'4px',paddingTop:'6px'}}>{fmtHrs(hrs)} worked over {nSh} shift{nSh!==1?'s':''}</div>}
      </div>; };
    const onBarMove = (ev, m) => { const r=ev.currentTarget.getBoundingClientRect(); const x=Math.max(190,Math.min(r.width-190,ev.clientX-r.left)); const below=r.top<window.innerHeight/2;
      setHoverM(h=>h&&h.idx===m.idx&&Math.abs(h.x-x)<2&&h.below===below?h:{idx:m.idx,x,below}); };

    const big = (lbl,v,col,sub,subCol='var(--exp-ink)') => <div style={{minWidth:0}}>
      <div style={label}>{lbl}</div>
      <div style={{fontFamily:MONO,fontSize:isWide?'24px':'19px',fontWeight:700,color:col,marginTop:'2px',whiteSpace:'nowrap'}}>{v}</div>
      {sub&&<div style={{fontFamily:/£/.test(sub)?MONO:undefined,fontSize:'11.5px',fontWeight:700,color:subCol,marginTop:'2px',whiteSpace:'nowrap'}}>{sub}</div>}
    </div>;

    const monthLine = m => {
      const {p, idx, sp, totG, totN} = m;
      const isCurr=idx===currPeriodIdx, open=expanded===p.month, ex=exOf(m), empty=isEmpty(m);
      const name = <span style={{display:'flex',alignItems:'center',gap:'7px',minWidth:0,fontWeight:800,fontSize:'14.5px',color:'var(--ink)'}}><span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{payLabel(p.month)}</span>{isCurr&&nowTag}</span>;
      const sub = <div style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)',marginTop:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{empty?shiftsTxt(m):(sp.nSub+sp.nPend===0&&!sp.nPlan)?'Claims from earlier shifts':`${fmtHrs(sp.sub+sp.pend)} · ${shiftsTxt(m)}`}</div>;
      const lineStyle = {cursor:'pointer',padding:'11px 8px',borderBottom:open?'none':'1px solid var(--border-2)',background:open?'var(--surface-2)':isCurr?'var(--tint-brass)':'transparent',borderRadius:open?'12px 12px 0 0':isCurr?'10px':0,boxShadow:isCurr&&!open?`inset 3px 0 0 ${BRASS}`:'none',...(hoverM?.idx===idx?{position:'relative',zIndex:30}:{})};
      return (
        <div key={p.month} ref={el=>monthRefs.current[p.month]=el}>
          <div {...pressable(()=>toggleMonth(m))} aria-expanded={open} className="tap-row" style={lineStyle}>
            {rowCols ? (
              <div style={{display:'grid',gridTemplateColumns:MONTH_COLS,gap:'14px',alignItems:'center'}}>
                <span style={{minWidth:0}}>{name}{sub}</span>
                <div data-bar onMouseMove={ev=>onBarMove(ev,m)} onMouseLeave={()=>setHoverM(h=>h&&h.idx===m.idx?null:h)} style={{position:'relative',padding:'10px 0'}}>{bar(m)}{hoverM?.idx===m.idx&&barTip(m)}</div>
                <span style={{textAlign:'right'}}>{empty?dash:money(fmtGBP(totG),'var(--text-navy)')}{ex&&planned(`+${fmtGBP(ex.gross)}`)}</span>
                <span style={{textAlign:'right'}}>{empty?dash:money(fmtGBP(totN),GRN,13.5)}{ex&&planned(`+${fmtGBP(ex.net)}`)}</span>
                <span style={{display:'flex',justifyContent:'flex-end'}}>{monthStatus(m)}</span>
                {chevron(open)}
              </div>
            ) : (<>
              <div style={{display:'flex',alignItems:'flex-start',gap:'8px'}}>
                <span style={{flex:1,minWidth:0}}>{name}{sub}{ex&&planned(`+${fmtGBP(ex.gross)} · +${fmtGBP(ex.net)} net planned`)}</span>
                <span style={{textAlign:'right',flexShrink:0}}>
                  {empty ? <span style={{fontSize:'12.5px',fontWeight:700,color:'var(--quiet)'}}>—</span> : <span>{money(fmtGBP(totG),'var(--text-navy)')}<span style={W>=340?{marginLeft:'9px'}:{display:'block',textAlign:'right',marginTop:'2px'}}>{money(fmtGBP(totN),GRN,13)}</span></span>}
                </span>
                <span style={{paddingTop:'3px'}}>{chevron(open)}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginTop:'8px',marginRight:'21px'}}>
                <span style={{flex:1}}>{bar(m)}</span>{monthStatus(m)}
              </div>
            </>)}
          </div>
          {open&&<div style={{borderRadius:'0 0 12px 12px',marginBottom:'8px',border:'1px solid var(--border-2)',borderTop:'none',background:'var(--surface)'}}>{monthOpened(m)}</div>}
        </div>
      );
    };

    const swatch = (bg,txt) => <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}><span style={{width:'10px',height:'10px',borderRadius:'3px',background:bg}}/>{txt}</span>;
    return (<>
      <div style={{...S.card,padding:isWide?'18px 20px':'16px',marginBottom:'10px'}}>
        <div style={{fontWeight:900,fontSize:'15px',color:'var(--ink)',marginBottom:'12px'}}>Overtime &amp; PA · tax year {fy}/{String(Number(fy)+1).slice(-2)} so far</div>
        <div style={{display:'grid',gridTemplateColumns:isWide?'repeat(3,minmax(0,1fr))':'repeat(2,minmax(0,1fr))',gap:'14px'}}>
          {big('Gross',fmtGBP(T.g),'var(--text-navy)',EY?.n>0?`+${fmtGBP(EY.gross)} planned`:null)}
          {big('Net',fmtGBP(T.net),GRN,EY?.n>0?`+${fmtGBP(EY.net)} planned`:null)}
          {isWide&&big('Hours',fmtHrs(T.hrs),'var(--ink)',`${T.n} shift${T.n!==1?'s':''}`,'var(--muted)')}
        </div>
        {!isWide&&<div style={{fontSize:'12px',fontWeight:600,color:'var(--muted)',marginTop:'10px'}}>{fmtHrs(T.hrs)} over {T.n} shift{T.n!==1?'s':''}</div>}
        {EY?.n>0&&<div style={{fontSize:'11.5px',fontWeight:600,color:'var(--muted)',marginTop:'6px'}}>Planned: {EY.n} shift{EY.n!==1?'s':''} still to work. Each is paid in its own pay month if submitted by that month's deadline.</div>}
        {cm&&(cm.sp.sub+cm.sp.pend+cm.sp.plan>0||cm.carms)&&<div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'6px 16px',marginTop:'14px',paddingTop:'12px',borderTop:'1px solid var(--border-2)',fontSize:'12.5px',fontWeight:700}}>
          <span style={{color:'var(--ink)'}}>{payLabel(cm.p.month)}:</span>
          {cm.sp.sub>0&&<span style={{color:'var(--text-green-deep)'}}>{fmtHrs(cm.sp.sub)} submitted</span>}
          {cm.sp.pend>0&&<span style={{color:'var(--text-red-deep)'}}>{fmtHrs(cm.sp.pend)} not submitted</span>}
          {cm.sp.plan>0&&<span style={{color:'var(--exp-ink)'}}>{fmtHrs(cm.sp.plan)} planned</span>}
          {cm.carms&&<span style={{marginLeft:'auto'}}>{submitLink(cm)}</span>}
        </div>}
      </div>
      <div ref={listRef} style={{...S.card,padding:isWide?'14px 16px':'12px 10px'}}>
        <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'6px 14px',padding:'2px 8px 10px',fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>
          {swatch(GROSS_STRIPE,'Gross')}{swatch(GRN,'Net')}{EY?.n>0&&<>{swatch(PLAN_STRIPE,'Planned gross')}{swatch('var(--exp)','Planned net')}</>}
          <span style={{marginLeft:'auto',fontWeight:600,color:'var(--quiet)'}}>{isWide?'Click':'Tap'} a month to open it</span>
        </div>
        {rowCols&&<div style={{display:'grid',gridTemplateColumns:MONTH_COLS,gap:'14px',padding:'0 8px 7px',borderBottom:'1px solid var(--border)',...label,fontSize:'10px'}}><span>Pay month</span><span/><span style={{textAlign:'right'}}>Gross</span><span style={{textAlign:'right'}}>Net</span><span style={{textAlign:'right'}}>Status</span><span/></div>}
        {rows.map(monthLine)}
        {later.length>0&&<div style={{display:'flex',justifyContent:'space-between',gap:'8px',padding:'12px 8px 4px',fontSize:'13px',fontWeight:600,color:'var(--quiet)'}}><span>{later.length>1?`${String(later[0].p.month).split(' ')[0]} – ${payLabel(later[later.length-1].p.month)}`:payLabel(later[0].p.month)}</span><span>Nothing yet</span></div>}
      </div>
    </>);
  };

  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
      {/* Heading sits in normal flow, like every other tab's — it scrolls
          away with the page instead of living inside the sticky group
          below. It used to be the sticky div's own first child, sharing
          that div's tinted/blurred backdrop with no visual break before
          the Calendar/List toggle immediately under it — which read as
          the heading being the toggle card's own title bar rather than
          the page's heading. Only the actually-functional bit (the view
          toggle and month pills) needs to stay pinned while scrolling. ── */}
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:'0 0 12px',letterSpacing:'-0.5px'}}>Summary</h2>

      {/* Sticky header — toggle and month pills float together. Rounded
          and bordered like every other card in the app (S.card's own
          18px radius) rather than a flush, hard-cornered strip — the
          frosted blur/tint is kept (this still wants to read as glass,
          not a solid card, since content scrolls underneath it while
          pinned), just given the same edges as everything else. Sitting
          inside the tab's own 14px page padding already insets it
          exactly like any other card, including while stuck — sticky
          only affects its vertical position, not its width. ── */}
      <div ref={stickyRef} style={{position:'sticky',top:0,zIndex:20,background:'rgba(var(--surface-2-rgb),0.82)',backdropFilter:'blur(16px) saturate(1.5)',WebkitBackdropFilter:'blur(16px) saturate(1.5)',borderRadius:'18px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',overflow:'hidden',paddingTop:'10px',paddingBottom:'8px',paddingLeft:'12px',paddingRight:'12px',marginBottom:'6px'}}>
        {/* Three plain views: Calendar, Shifts (was "Compact") and Months
            (was "List"), named for what each shows. The default view is
            tagged "Default" in the switch; the line underneath either
            confirms the open view is the default or offers a clear button
            to make it so. */}
        {(()=>{
          const views = [
            {id:'calendar', lbl:'Calendar', icon:'cal',   go:()=>{ setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'auto'}); }},
            {id:'compact',  lbl:'Shifts',   icon:'table', go:()=>{ setBreakdownView('compact'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'auto'}); }},
            {id:'list',     lbl:'Months',   icon:'list',  go:()=>{ setBreakdownView('list'); snapToActiveMonth(); }},
          ];
          const current = views.find(v=>v.id===breakdownView) || views[0];
          const isDefault = defaultBreakdownView===breakdownView;
          return (<>
            <SegSlider activeKey={breakdownView} trackStyle={{display:'flex',background:'var(--chip-bg)',borderRadius:'14px',padding:'4px',boxShadow:'0 4px 14px rgba(15,23,42,0.08)'}} indicatorStyle={{background:BRASS,borderRadius:'11px',boxShadow:`0 2px 8px color-mix(in srgb, ${BRASS} 35%, transparent)`}}>
              {views.map(v=>{
                const on = breakdownView===v.id, isDef = defaultBreakdownView===v.id;
                return (
                <button key={v.id} type="button" data-seg-key={v.id} aria-pressed={on} aria-label={`${v.lbl}${isDef?' (default view)':''}`} onClick={v.go} style={{position:'relative',zIndex:1,flex:1,padding:'7px 3px 6px',borderRadius:'11px',border:'none',fontWeight:900,fontSize:'12px',fontFamily:'inherit',cursor:'pointer',background:'transparent',color:on?'#fff':'var(--muted)',transition:'color 0.15s',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'3px'}}>
                  <span style={{display:'flex',alignItems:'center',gap:'5px'}}><Ico n={v.icon} s={12} c={on?'#fff':'var(--muted)'} w={2.5}/>{v.lbl}</span>
                  {/* The default view carries a small "Default" tag in the
                      switch itself, so it's visible whichever view is open.
                      The others keep an invisible tag of the same size so
                      all three segments stay the same height. */}
                  <span style={{fontSize:'9px',fontWeight:900,letterSpacing:'0.06em',textTransform:'uppercase',padding:'1px 6px',borderRadius:'999px',lineHeight:1.4,visibility:isDef?'visible':'hidden',background:on?'rgba(255,255,255,0.22)':'var(--surface)',color:on?'#fff':BRASS,border:on?'none':`1px solid color-mix(in srgb, ${BRASS} 40%, transparent)`}}>Default</span>
                </button>
                );
              })}
            </SegSlider>
            <div style={{display:'flex',justifyContent:'center',marginTop:'8px'}}>
              {isDefault ? (
                <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'12px',fontWeight:700,color:'var(--text-green-deep)',background:'var(--tint-green)',borderRadius:'20px',padding:'5px 12px'}}>
                  <Ico n="check" s={12} c="var(--text-green-deep)" w={3}/>{current.lbl} is your default view
                </span>
              ) : (
                <button type="button" onClick={()=>{ setDefaultBreakdownView(breakdownView); dualWrite(KEYS.defaultBreakdownView,breakdownView); }} style={{display:'inline-flex',alignItems:'center',gap:'6px',background:'var(--surface)',border:`1.5px dashed color-mix(in srgb, ${BRASS} 55%, transparent)`,borderRadius:'20px',padding:'6px 13px',fontSize:'12px',fontWeight:800,color:BRASS,cursor:'pointer',fontFamily:'inherit'}}>
                  {isWide?'Click':'Tap'} here to set {current.lbl} as your default view
                </button>
              )}
            </div>
          </>);
        })()}

        {/* month jump pills — part of the sticky header in List View.
            On desktop, boxed to match the Calendar/List toggle above
            rather than floating loose in the open page. */}
        {breakdownView==='list'&&(
          <div style={isWide?{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'14px',padding:'10px 14px',marginTop:'8px'}:{}}>
          <div className="month-pills" style={{display:'flex',gap:'3px',paddingTop:isWide?0:'8px',justifyContent:'center'}}>
            {PAY_PERIODS.map((p,idx)=>{
              const isCurr=idx===currPeriodIdx, isOpen=expanded===p.month;
              // Matches Calendar View's own guarantee that exactly one
              // pill always reads as "active" — falls back to the
              // current period when nothing's been manually expanded,
              // rather than leaving every pill unselected once a card
              // gets collapsed.
              const isActive = expanded===null ? isCurr : isOpen;
              const hasOutstanding = carmsOutstanding.groups.some(g=>g.periodIdx===idx);
              return(
                // flex:1 with minWidth:0 lets all twelve periods share the
                // row evenly and fit without horizontal scrolling, rather
                // than each sizing to its own text and overflowing.
                <button key={p.short} onClick={()=>jumpTo(p.month)} style={{flex:'1 1 0',minWidth:0,padding:isWide?'5px 4px':'5px 0',borderRadius:'14px',border:isActive?`1.5px solid ${BRASS}`:hasOutstanding?'1px solid var(--border-2)':isCurr?`1.5px solid ${BRASS}`:'1px solid var(--border-2)',background:hasOutstanding?'var(--tint-red)':isActive?BRASS:isCurr?'var(--tint-brass)':'var(--surface)',color:hasOutstanding?'var(--text-red-deep)':isActive?'#fff':isCurr?BRASS:'var(--muted)',fontSize:isWide?'12px':'10.5px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.14s',textAlign:'center',overflow:'hidden'}}>
                  {isWide ? p.short : p.short.slice(0,3)}
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* month pills — Calendar View equivalent, selects the period
            being viewed. Same boxed treatment on desktop as List View
            above, for consistency between the two. Compact reuses this
            exact block (and calPeriodIdx) rather than getting its own —
            both are "one period at a time" views, unlike List's stack of
            twelve independently-expandable cards. */}
        {(breakdownView==='calendar'||breakdownView==='compact')&&(
          <div style={isWide?{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'14px',padding:'10px 14px',marginTop:'8px'}:{}}>
          <div className="month-pills" style={{display:'flex',gap:'3px',paddingTop:isWide?0:'8px',justifyContent:'center'}}>
            {PAY_PERIODS.map((p,idx)=>{
              const isCurr=idx===currPeriodIdx;
              const isSel=(calPeriodIdx===null?currPeriodIdx:calPeriodIdx)===idx;
              const hasOutstanding = carmsOutstanding.groups.some(g=>g.periodIdx===idx);
              return(
                <button key={p.short} onClick={()=>{ setCalPeriodIdx(idx); if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'smooth'}); }} style={{flex:'1 1 0',minWidth:0,padding:isWide?'5px 4px':'5px 0',borderRadius:'14px',border:isSel?`1.5px solid ${BRASS}`:hasOutstanding?'1px solid var(--border-2)':isCurr?`1.5px solid ${BRASS}`:'1px solid var(--border-2)',background:hasOutstanding?'var(--tint-red)':isSel?BRASS:isCurr?'var(--tint-brass)':'var(--surface)',color:hasOutstanding?'var(--text-red-deep)':isSel?'#fff':isCurr?BRASS:'var(--muted)',fontSize:isWide?'12px':'10.5px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.14s',textAlign:'center',overflow:'hidden'}}>
                  {isWide ? p.short : p.short.slice(0,3)}
                </button>
              );
            })}
          </div>
          </div>
        )}
      </div>

      {/* key={breakdownView} forces a full remount on every List↔Calendar
          switch, purely so .fi's fade-in replays — the SegSlider pill up
          top already slides between the two, but the content underneath
          used to hard-cut with no transition of its own at all. Both
          branches are prop-driven (nothing keeps state across the switch
          that a remount would lose), so this is safe. ── */}
      <div key={breakdownView} className="fi">
      {breakdownView==='list' ? (()=>{
      const infos = PAY_PERIODS.map((p,idx)=>periodCalc(p,idx));
      return monthsView(infos);
      })() : breakdownView==='compact' ? (
      <>
      {/* ══════════════════ COMPACT VIEW — one period, dense rows ══════════════════
          Deliberately doesn't render renderFYTotalsCard() below, unlike
          Calendar — this view's whole point is showing just the selected month, and the
          financial-year archive card belongs to a different question than
          "what happened in this period". ── */}
      {(()=>{
        const cIdx = calPeriodIdx===null ? currPeriodIdx : calPeriodIdx;
        const cPeriod = PAY_PERIODS[cIdx];
        const cEntries = fyEntries.filter(e=>e.date>=cPeriod.start&&e.date<=cPeriod.end);
        const pb = totals.periodBreakdown[cIdx];
        // Tier tags reflect hours actually WORKED at each rate (h1/h2/h3 —
        // includes any portion diverted to TOIL), not just the paid portion
        // (payH1/payH2/payH3) the old per-tier breakdown box used — "rate"
        // here answers "what was this shift worked at", separately from
        // whether it was taken as pay or TOIL.
        const TIER_LABEL = { h1:'1.33×', h2:'1.5×', h3:'2×' };

        // ── Money on each card, split by status ──
        // Green: submitted, its share of the take-home in the month it was
        // paid in. Red: worked but not claimed, what it would add once
        // claimed. Sky blue: planned, expected. Gross and net sit in fixed,
        // right-aligned columns shared with the month total below, so the
        // figures line up all the way down.
        const COLS = 'minmax(0,1fr) 78px 78px';
        const claimedNet = new Map();
        totals.periodBreakdown.forEach(mb=>partNets(mb).forEach(x=>{ const k = `${x.part.entry.id}:${x.part.kind}`; claimedNet.set(k, (claimedNet.get(k)||0) + x.net); }));
        const covers = (ot, pa, rate) => ot&&pa ? `Overtime & ${rate}` : ot ? 'Overtime' : rate;
        const moneyRows = (e, c) => {
          if (c.gross<0.005) return c.toilBanked>0 ? [{k:'toil'}] : [];
          const hasOT = c.h1+c.h2+c.h3>0 && c.ot>0, hasPA = c.pa>0;
          if (e.date>todayStr) return [{k:'exp', lab:'Planned', det:covers(hasOT,hasPA,e.paRate), g:c.gross, n:entryNet(e)}];
          const sOT = hasOT && isOtSubmitted(e), sPA = hasPA && isPaSubmitted(e);
          const rows = [];
          if (sOT||sPA) rows.push({k:'sub', lab:'✓ Submitted', det:covers(sOT,sPA,e.paRate), g:(sOT?c.ot:0)+(sPA?c.pa:0),
            n:(sOT?claimedNet.get(`${e.id}:ot`)||0:0)+(sPA?claimedNet.get(`${e.id}:pa`)||0:0)});
          const tOT = hasOT && !sOT, tPA = hasPA && !sPA;
          // Overtime (CARMS) and PA (PSOP) are separate claims that can go in
          // on different days, so each outstanding one gets its own row and
          // button. Each net is what that claim adds on its own.
          if (tOT) rows.push({k:'todo', key:'todo-ot', lab:'Submit overtime', det:'Not submitted yet', g:c.ot, n:entryNet({...e, paRate:'None'}), parts:{ot:true}});
          if (tPA) rows.push({k:'todo', key:'todo-pa', lab:`Submit ${e.paRate}`, det:'Not submitted yet', g:c.pa, n:entryNet({...e, hours133:'', hours150:'', hours200:'', toilHours:''}), parts:{pa:true}});
          return rows;
        };
        const ROW = {
          sub:  {bg:'var(--tint-green)', lab:'var(--text-green-deep)', g:'var(--text-navy)', n:GRN},
          todo: {bg:'var(--tint-red)', lab:'var(--text-red-deep)', g:'var(--text-red-deep)', n:'var(--text-red-deep)'},
          exp:  {bg:'var(--exp-tint)', lab:'var(--exp-ink)', g:'var(--exp-ink)', n:'var(--exp)', dashed:true},
        };
        const fig = (v, col) => <span style={{fontFamily:MONO,fontVariantNumeric:'tabular-nums',fontSize:'13.5px',fontWeight:700,color:col,textAlign:'right',whiteSpace:'nowrap'}}>{v}</span>;
        const colHead = {fontSize:'10px',fontWeight:900,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--quiet)'};
        const moneyBlock = (e, c) => {
          const rows = moneyRows(e, c);
          if (!rows.length) return null;
          if (rows[0].k==='toil') return (
            <div style={{display:'flex',alignItems:'center',gap:'8px',background:'var(--tint-purple)',borderRadius:'8px',padding:'7px 8px',marginTop:'8px',fontSize:'12px',fontWeight:800,color:'var(--tag-purple)'}}>
              <Ico n="clock" s={12} c="var(--tag-purple)" w={2.2}/>Taken as TOIL<span style={{marginLeft:'auto',fontFamily:MONO,fontWeight:700}}>{fmtHrs(c.toilBanked)} banked · no pay</span>
            </div>
          );
          return (
            <div style={{marginTop:'8px',borderTop:'1px solid var(--border-2)',paddingTop:'6px',display:'grid',gap:'4px'}}>
              <div style={{display:'grid',gridTemplateColumns:COLS,columnGap:'10px',padding:'0 8px',...colHead}}><span/><span style={{textAlign:'right'}}>Gross</span><span style={{textAlign:'right'}}>Net</span></div>
              {rows.map(r=>{ const st = ROW[r.k];
                const box = {display:'grid',gridTemplateColumns:COLS,columnGap:'10px',alignItems:'center',borderRadius:'8px',padding:'5px 8px',background:st.bg,outline:st.dashed?'1px dashed color-mix(in srgb, var(--exp) 55%, transparent)':'none',outlineOffset:'-1px',lineHeight:1.25};
                const inner = (<>
                  <span style={{minWidth:0,fontSize:'12px',fontWeight:800,color:st.lab}}>{r.k==='todo'&&<span style={{display:'inline-flex',verticalAlign:'-1px',marginRight:'4px'}}><Ico n="cal" s={11} c={st.lab} w={2.4}/></span>}{r.lab}<span style={{display:'block',fontSize:'10.5px',fontWeight:700,opacity:0.85}}>{r.det}</span></span>
                  {fig(fmtGBP(r.g), st.g)}{fig(fmtGBP(r.n), st.n)}
                </>);
                // The "To submit" box opens the date picker to mark this
                // shift's outstanding claim(s) as submitted.
                return r.k==='todo'
                  ? <button key={r.key||r.k} type="button" className="tap-row" title="Pick the date you submitted it" onClick={ev=>{ ev.stopPropagation(); openQuickSubmit(e, r.parts); }} style={{...box,width:'100%',border:'none',textAlign:'left',fontFamily:'inherit',cursor:'pointer'}}>{inner}</button>
                  : <div key={r.key||r.k} style={box}>{inner}</div>;
              })}
            </div>
          );
        };

        return (
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'2px 3px 10px'}}>
              <div style={{fontWeight:900,fontSize:'16px',color:'var(--ink)',letterSpacing:'-0.3px'}}>{payLabel(cPeriod.month)}</div>
              <div style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:'var(--quiet)'}}>Shifts {fmtD(cPeriod.start)} – {fmtD(cPeriod.end)}</div>
            </div>

            {cEntries.length+lateInto(cPeriod).length===0 ? (
              <div style={{textAlign:'center',padding:'20px 10px 24px'}}>
                <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'var(--tint-blue)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
                  <Ico n="cal" s={18} c="#1e40af" w={2}/>
                </div>
                <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)',marginBottom:'3px'}}>No shifts in this pay month</div>
                <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:600}}>Shifts you log between {fmtD(cPeriod.start)} and {fmtD(cPeriod.end)} show up here.</div>
              </div>
            ) : <div style={isWide?{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:'8px',alignItems:'stretch',marginBottom:'8px'}:undefined}>{[...[...cEntries].sort((a,b)=>new Date(a.date)-new Date(b.date)), ...lateInto(cPeriod)].map(e=>{
              const c = calcEntry(e);
              const tiers = [];
              if (c.h1>0) tiers.push(TIER_LABEL.h1);
              if (c.h2>0) tiers.push(TIER_LABEL.h2);
              if (c.h3>0) tiers.push(TIER_LABEL.h3);
              if (c.toilH>0 && tiers.length===0) tiers.push('TOIL');
              const rateLabel = tiers.length ? tiers.join(' + ') : '—';
              const hasPA = e.paRate && e.paRate!=='None';
              const notesOpen = openNotes.has(e.id);
              const cardProps = e.comments ? {
                role:'button', tabIndex:0, onClick:()=>toggleNotes(e.id),
                onKeyDown:ev=>{ if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); toggleNotes(e.id); } },
              } : {};
              return (
                // On a computer every card is the same height (room for two
                // money rows), so the grid lines up; opening notes only grows
                // that card's row.
                <div key={e.id} ref={el=>entryRefs.current[e.id]=el} className={focusEntryId===e.id?'entry-flash':''} {...cardProps} style={{background:focusEntryId===e.id?'var(--tint-blue)':'var(--surface)',border:focusEntryId===e.id?'2px solid #2563eb':'1px solid var(--border-2)',borderRadius:'12px',padding:'10px 12px',marginBottom:isWide?0:'6px',...(isWide?{minHeight:'200px',boxSizing:'border-box'}:{}),transition:'background 0.4s ease, border-color 0.4s ease',cursor:e.comments?'pointer':'default'}}>
                  {/* The date is the heading; the reason sits under it in
                      normal letters, then hours, rate, PA and status. Edit
                      stays beside the date; delete is a quieter icon set
                      apart from it so it's harder to hit by mistake (and
                      still asks first). Each button stops the click from
                      also reaching the card's own notes toggle. */}
                  {shiftHead(e,{onEdit:ev=>{ev.stopPropagation();setConfirmDel(null);startEdit(e);}, onDelete:ev=>{ev.stopPropagation();setConfirmDel(confirmDel===e.id?null:e.id);}, deleting:confirmDel===e.id,
                    extra: e.comments&&(
                      <button onClick={ev=>{ev.stopPropagation();toggleNotes(e.id);}} aria-label={notesOpen?'Hide notes':'Show notes'} style={{flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',width:'28px',height:'28px',borderRadius:'8px',background:'var(--chip-bg)',border:'none',cursor:'pointer',padding:0}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.2s',transform:notesOpen?'rotate(180deg)':'none'}}><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                    )})}
                  {/* delete confirmation — same shape as List View's own */}
                  {confirmDel===e.id&&(
                    <div onClick={ev=>ev.stopPropagation()} style={{background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'11px',padding:'8px 10px',marginTop:'7px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                      <span style={{fontSize:'12px',fontWeight:700,color:'var(--text-red-deep)'}}>Delete this shift?</span>
                      <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                        <button onClick={()=>setConfirmDel(null)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'7px',padding:'4px 10px',fontSize:'11.5px',fontWeight:900,color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                        <button onClick={()=>delEntry(e.id)} style={{background:'#dc2626',border:'none',borderRadius:'7px',padding:'4px 10px',fontSize:'11.5px',fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Delete</button>
                      </div>
                    </div>
                  )}
                  <div style={{display:'flex',alignItems:'center',gap:'7px',flexWrap:'wrap',marginTop:'6px',fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--muted)'}}>
                    <span style={{color:'var(--ink)',fontWeight:700}}>{fmtHrs(c.h1+c.h2+c.h3)}</span>
                    <span style={{color:'var(--border)'}}>·</span>
                    <span>{rateLabel}</span>
                    <span style={{color:'var(--border)'}}>·</span>
                    <span style={{color:hasPA?'#b45309':'var(--quiet)'}}>{hasPA?`${e.paRate} · ${fmt(c.pa)}`:'No PA'}</span>
                    {/* Same shared badge as List View and the calendar day
                        popup (see carmsBadge in App.jsx) — null for a pure
                        record with nothing to submit, green when everything
                        claimable on this entry is in, red (and tappable
                        straight to the entry's own toggle) otherwise. */}
                    {/* On a computer the Submitted / To submit rows below say the
                        same thing (and the red row marks it submitted), so the
                        chip is left off there to keep cards one height. */}

                  </div>
                  {/* Status chips aren't needed here any more: each claim has its own
                      Submitted / To submit row below, and a red row marks it submitted. */}
                  {moneyBlock(e, c)}
                  {e.comments&&(
                    <div style={{display:'grid',gridTemplateRows:notesOpen?'1fr':'0fr',transition:'grid-template-rows 0.28s cubic-bezier(.32,.72,0,1)'}}>
                      <div style={{overflow:'hidden'}}>
                        <div style={{borderTop:'1px solid var(--border-2)',marginTop:'8px',paddingTop:'7px'}}>
                          <div style={{fontSize:'12px',fontStyle:'italic',color:'var(--ink)',borderLeft:'2px solid var(--border-2)',paddingLeft:'8px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.5}}>{e.comments}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}</div>}

            {cEntries.length>0 && (()=>{
              // The month's shifts by status, in the same columns as the
              // cards: submitted (the month's real pay), to submit (once
              // claimed), planned (expected), and all of them together.
              const sp = hrsSplit(cEntries), ts = totals.toSubmit?.[cIdx] || {gross:0,net:0,n:0}, ex = totals.expected?.[cIdx] || {gross:0,net:0,n:0};
              // A month's pay can include claims for shifts listed under
              // another month (claimed late), and a shift here can be paid in
              // a later month. Say so, so the green line still tallies.
              const shown = new Set([...cEntries, ...lateInto(cPeriod)].map(e=>e.id));
              const inPb = new Set(pb.parts.map(x=>`${x.entry.id}:${x.kind}`));
              const carriedIn = pb.parts.filter(x=>!shown.has(x.entry.id)).reduce((a,x)=>a+x.amount,0);
              const paidElsewhere = cEntries.reduce((a,e)=>{ if (e.date>todayStr) return a; const c=calcEntry(e);
                return a + (c.h1+c.h2+c.h3>0&&c.ot>0&&isOtSubmitted(e)&&!inPb.has(`${e.id}:ot`)?c.ot:0) + (c.pa>0&&isPaSubmitted(e)&&!inPb.has(`${e.id}:pa`)?c.pa:0); },0);
              const notes = [carriedIn>0.005&&`Submitted includes ${fmtGBP(carriedIn)} submitted this month for shifts listed under an earlier month.`, paidElsewhere>0.005&&`${fmtGBP(paidElsewhere)} of the submitted money on these shifts is paid in another month.`].filter(Boolean);
              const lines = [
                {col:GRN, k:'Submitted', s:`in ${payLabel(cPeriod.month)}`, h:sp.sub, g:pb.combinedGross, n:pb.combinedNet, gc:'var(--text-navy)', nc:GRN, show:true},
                {col:RED, k:'To submit', s:`${ts.n} claim${ts.n!==1?'s':''} · `+(cPeriod.end<todayStr?`submitted now, paid in ${submitWindow(todayStr)?.month||'a later month'}`:`submit by ${submitWindow(cPeriod.end)?.byShort} for ${payLabel(cPeriod.month)}`), h:sp.pend, g:ts.gross, n:ts.net, gc:'var(--text-red-deep)', nc:'var(--text-red-deep)', show:ts.gross>0.005},
                {col:'var(--exp)', k:'Planned', s:`${ex.n} shift${ex.n!==1?'s':''}, if submitted by ${submitWindow(cPeriod.end)?.byShort}`, h:sp.plan, g:ex.gross, n:ex.net, gc:'var(--exp-ink)', nc:'var(--exp)', show:ex.n>0},
              ].filter(l=>l.show);
              const TC = isWide ? 'minmax(0,1fr) 64px 78px 78px' : COLS;
              const allG = lines.reduce((a,l)=>a+l.g,0), allN = lines.reduce((a,l)=>a+l.n,0), allH = lines.reduce((a,l)=>a+l.h,0);
              const row = {display:'grid',gridTemplateColumns:TC,columnGap:'10px',alignItems:'center',padding:'7px 8px',borderBottom:'1px solid var(--border-2)'};
              const hrsCell = h => isWide && <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--ink)',textAlign:'right',whiteSpace:'nowrap'}}>{fmtHrs(h)}</span>;
              return (
                <div style={{background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px',marginTop:'4px',boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px',marginBottom:'8px'}}>
                    <span style={{fontSize:'13px',fontWeight:900,color:'var(--ink)'}}>This month's shifts</span>
                    <span style={{fontSize:'10.5px',fontWeight:600,color:'var(--quiet)'}}>{payLabel(cPeriod.month)}</span>
                  </div>
                  {allG>0.005&&lines.length>1&&(
                    <div role="img" aria-label={lines.map(l=>`${l.k} ${fmtGBP(l.g)}`).join(', ')} style={{display:'flex',height:'10px',borderRadius:'6px',overflow:'hidden',marginBottom:'10px',background:'var(--chip-bg)'}}>
                      {lines.map(l=><i key={l.k} style={{display:'block',width:`${(l.g/allG)*100}%`,background:l.k.startsWith('Planned')?'repeating-linear-gradient(135deg, var(--exp) 0 6px, color-mix(in srgb, var(--exp) 55%, white) 6px 12px)':l.col}}/>)}
                    </div>
                  )}
                  <div style={{...row,padding:'0 8px 6px',...colHead}}><span/>{isWide&&<span style={{textAlign:'right'}}>Hours</span>}<span style={{textAlign:'right'}}>Gross</span><span style={{textAlign:'right'}}>Net</span></div>
                  {lines.map(l=>(
                    <div key={l.k} style={row}>
                      <span style={{display:'flex',alignItems:'center',gap:'7px',minWidth:0,fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}>
                        <i aria-hidden="true" style={{width:'10px',height:'10px',borderRadius:'3px',background:l.col,flexShrink:0}}/>
                        <span style={{minWidth:0}}>{l.k}<span style={{display:'block',fontSize:'10.5px',fontWeight:600,color:'var(--quiet)'}}>{isWide?l.s:`${fmtHrs(l.h)} · ${l.s}`}</span></span>
                      </span>
                      {hrsCell(l.h)}{fig(fmtGBP(l.g), l.gc)}{fig(fmtGBP(l.n), l.nc)}
                    </div>
                  ))}
                  {lines.length>1&&(
                    <div style={{...row,borderBottom:'none',borderTop:'2px solid var(--border)'}}>
                      <span style={{fontSize:'13.5px',fontWeight:800,color:'var(--ink)'}}>All shifts<span style={{display:'block',fontSize:'10.5px',fontWeight:600,color:'var(--quiet)'}}>{isWide?'':`${fmtHrs(allH)} · `}{cEntries.length} shift{cEntries.length!==1?'s':''}</span></span>
                      {hrsCell(allH)}{fig(fmtGBP(allG),'var(--ink)')}{fig(fmtGBP(allN),'var(--ink)')}
                    </div>
                  )}
                  {(lines.length>1||notes.length>0)&&<div style={{fontSize:'10.5px',fontWeight:600,color:'var(--quiet)',padding:'6px 8px 0',display:'grid',gap:'3px'}}>
                    {notes.map(t=><span key={t}>{t}</span>)}
                    {lines.length>1&&<span>Net for "to submit" is what it adds once submitted. "Planned" assumes the shift is worked and submitted by {submitWindow(cPeriod.end)?.byShort}; anything submitted later is paid in {submitWindow(cPeriod.end)?.next}.</span>}
                  </div>}
                </div>
              );
            })()}
          </>
        );
      })()}
      </>
      ) : (
      <>
      {/* ══════════════════ CALENDAR VIEW (Overtime Visualiser) ══════════════════ */}
      {(()=>{
        const cIdx = calPeriodIdx===null ? currPeriodIdx : calPeriodIdx;
        const cPeriod = PAY_PERIODS[cIdx];
        const cEntries = fyEntries.filter(e=>e.date>=cPeriod.start&&e.date<=cPeriod.end);
        const weeks = buildCalendarWeeks(cPeriod);

        // period-level totals for the breakdown boxes (mirrors List View)
        const pb = totals.periodBreakdown[cIdx];
        // Hours-worked stats stay period-local (see List View comment
        // for the reasoning), split into submitted and not submitted by
        // hrsSplit. OT Pay / PA box data below iterates
        // every entry in the year and groups by submission-period
        // attribution instead, carrying each shift's original worked
        // date.
        let pToilWorked=0, pToilBanked=0, pToilWaiting=0;
        cEntries.forEach(e=>{
          const c = calcEntry(e);
          pToilWorked+=c.toilH; pToilBanked+=c.toilBanked;
          if(!isOtSubmitted(e)&&e.date<=todayStr) pToilWaiting+=c.toilBanked;
        });
        let ppa1=0, ppa2=0, ppa3=0;
        const pTierHours = { t133:0, t150:0, t200:0 };
        const pTierDates = { t133:[], t150:[], t200:[] };
        const pTierGross = { t133:0, t150:0, t200:0 };
        const pPaDates = { PA1:[], PA2:[], PA3:[] };
        const pPaGross = { PA1:0, PA2:0, PA3:0 };
        fyEntries.forEach(e=>{
          const c = calcEntry(e);
          const otCounted = isOtSubmitted(e) && periodIdxForDate(effectiveOtDate(e))===cIdx;
          const paCounted = isPaSubmitted(e) && periodIdxForDate(effectivePaDate(e))===cIdx;
          const isCross = periodIdxForDate(e.date)!==cIdx;
          if (otCounted) {
            if (c.payH1>0) { pTierHours.t133+=c.payH1; pTierDates.t133.push({d:fmtD(e.date),counted:true,cross:isCross}); pTierGross.t133+=c.ot1; }
            if (c.payH2>0) { pTierHours.t150+=c.payH2; pTierDates.t150.push({d:fmtD(e.date),counted:true,cross:isCross}); pTierGross.t150+=c.ot2; }
            if (c.payH3>0) { pTierHours.t200+=c.payH3; pTierDates.t200.push({d:fmtD(e.date),counted:true,cross:isCross}); pTierGross.t200+=c.ot3; }
          }
          if (paCounted) {
            if(e.paRate==='PA1'){ppa1++; pPaDates.PA1.push({d:fmtD(e.date),counted:true,cross:isCross}); pPaGross.PA1+=c.pa;}
            else if(e.paRate==='PA2'){ppa2++; pPaDates.PA2.push({d:fmtD(e.date),counted:true,cross:isCross}); pPaGross.PA2+=c.pa;}
            else if(e.paRate==='PA3'){ppa3++; pPaDates.PA3.push({d:fmtD(e.date),counted:true,cross:isCross}); pPaGross.PA3+=c.pa;}
          }
        });

        const dayInfo = (date) => {
          if (!date) return null;
          const ds = localDateStr(date);
          const dEntries = cEntries.filter(e=>e.date===ds);
          let h1=0,h2=0,h3=0;
          dEntries.forEach(e=>{ const c=calcEntry(e); h1+=c.h1; h2+=c.h2; h3+=c.h3; });
          const totalHrs = h1+h2+h3;
          const hasPA = dEntries.some(e=>e.paRate&&e.paRate!=='None');
          const hasToil = dEntries.some(e=>e.otRateTier&&(parseFloat(e.toilHours)||0)>0);
          // Hours text is colored by rate tier — blue 1.33x, green 1.5x,
          // red 2.0x — independent of the cell's own background/border,
          // which reflects CARMS submission status instead. Mixed-rate
          // days (more than one tier worked) fall back to the default.
          const ratesUsed = [h1>0, h2>0, h3>0].filter(Boolean).length;
          const rateColor = ratesUsed===1 ? (h1>0?'var(--ink)':h2>0?'#059669':'#dc2626') : 'var(--ink)';
          // A day only reads as "fully submitted" once every entry on
          // it has both parts settled — overtime, and PA if there is
          // any. One outstanding piece keeps the whole day flagged,
          // same as a day with nothing submitted at all. An entry with
          // zero claimable OT hours (actual shift matched the roster —
          // logged purely for the record, not as an overtime claim)
          // has nothing to submit on the OT side, so it never keeps a
          // day flagged as outstanding on that account alone.
          const isFullySubmitted = dEntries.length>0 && dEntries.every(e => {
            const c = calcEntry(e);
            const entryHasOT = c.h1+c.h2+c.h3 > 0;
            return (!entryHasOT || isOtSubmitted(e)) && (!e.paRate || e.paRate==='None' || isPaSubmitted(e));
          });
          // A day where the only thing logged is a record-keeping entry
          // — no overtime hours, no PA — has nothing to claim at all,
          // so it shouldn't read as red (outstanding) or green
          // (submitted); neither applies when there was never anything
          // to submit in the first place.
          const isRecordOnly = dEntries.length>0 && totalHrs===0 && !hasPA;
          // A shift still to come can't be claimed yet, so it gets its own
          // "planned" look rather than the red of something overdue.
          const isPlanned = dEntries.length>0 && !isFullySubmitted && !isRecordOnly && ds>todayStr;
          // Cross-period detection is independent of whether the
          // *other* part of the day is submitted — OT/TOIL goes
          // through CARMS and PA goes through PSOP on separate
          // timelines, so it's normal for one side to already be
          // submitted and counted in a different period while the
          // other is still outstanding. This drives the asterisk
          // marker only — the cell's background/border always just
          // reflects plain submitted/outstanding status, same as
          // every other day, so there's a single consistent signal
          // for "is this done" and a single separate one for "did
          // part of it move periods" rather than the two overlapping.
          const crossInfo = dEntries.length===1 ? crossPeriodInfo(dEntries[0]) : null;
          return { ds, dEntries, totalHrs, hasPA, hasToil, hasOT: dEntries.length>0, isFullySubmitted, isRecordOnly, isPlanned, crossInfo, rateColor, periodIdx: cIdx };
        };

        return (
          <>
            {/* period navigator */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
              <button onClick={()=>setCalPeriodIdx(i=>Math.max(0,(i===null?currPeriodIdx:i)-1))} disabled={cIdx===0} aria-label="Previous pay month" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'9px 14px',cursor:cIdx===0?'default':'pointer',opacity:cIdx===0?0.3:1}}><Ico n="cL" s={18} c={BRASS}/></button>
              <div style={{textAlign:'center'}}>
                {cIdx===currPeriodIdx&&(
                  <div style={{display:'flex',justifyContent:'center',marginBottom:'4px'}}>{nowTag}</div>
                )}
                <div style={{fontWeight:900,fontSize:'22px',color:cIdx===currPeriodIdx?BRASS:'var(--ink)'}}>{payLabel(cPeriod.month)}</div>
                <div style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:600,color:'var(--quiet)'}}>Shifts {fmtD(cPeriod.start)} – {fmtD(cPeriod.end)}</div>
                {/* On a computer the shift count and hours are left to the calendar
                    and the totals card below, which already show them. */}
                {!isWide&&cEntries.length===0&&<div style={{fontSize:'12px',fontWeight:700,color:'var(--quiet)',marginTop:'3px'}}>No overtime or PA yet</div>}
                {!isWide&&cEntries.length>0&&(<>
                  <div style={{fontSize:'12px',fontWeight:700,color:'var(--muted)',marginTop:'3px'}}>{cEntries.length} shift{cEntries.length!==1?'s':''}</div>
                  <div style={{fontSize:'12px',fontWeight:700,marginTop:'1px',display:'flex',flexWrap:'wrap',justifyContent:'center',columnGap:'6px'}}><span style={{color:GRN,whiteSpace:'nowrap'}}>{fmtHrs(hrsSplit(cEntries).sub)} submitted</span><span style={{color:hrsSplit(cEntries).pend>0?RED:'var(--quiet)',whiteSpace:'nowrap'}}>{fmtHrs(hrsSplit(cEntries).pend)} not submitted</span></div>
                </>)}
              </div>
              <button onClick={()=>setCalPeriodIdx(i=>Math.min(11,(i===null?currPeriodIdx:i)+1))} disabled={cIdx===11} aria-label="Next pay month" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'9px 14px',cursor:cIdx===11?'default':'pointer',opacity:cIdx===11?0.3:1}}><Ico n="cR" s={18} c={BRASS}/></button>
            </div>


            <div className="hint-pulse" style={{fontSize:'14px',color:'var(--quiet)',textAlign:'center',fontWeight:600,margin:'10px 0'}}>{isWide?'Click':'Tap'} a day to see its shifts or log one</div>

            {/* A computer shows the calendar and the month's breakdown side by
                side; a phone stacks them. */}
            <div className={isWide?'split-cal':undefined}>
            {/* calendar grid */}
            <div
              ref={calCardRef}
              onTouchStart={isWide?undefined:(e=>{
                calSwipeStartX.current = e.touches[0].clientX;
                calSwipeStartYRef.current = e.touches[0].clientY;
                calSwipeAxisRef.current = null;
                if (weeksGridRef.current) weeksGridRef.current.style.transition = 'none';
              })}
              onTouchEnd={isWide?undefined:(e=>{
                if (calSwipeStartX.current===null) return;
                const dx = e.changedTouches[0].clientX - calSwipeStartX.current;
                const wasHorizontal = calSwipeAxisRef.current==='x';
                calSwipeStartX.current = null;
                calSwipeAxisRef.current = null;
                if (weeksGridRef.current) {
                  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                  weeksGridRef.current.style.transition = reduced ? 'none' : 'transform 0.28s cubic-bezier(.32,.72,0,1)';
                  weeksGridRef.current.style.transform = 'translateX(0px)';
                }
                if (!wasHorizontal || Math.abs(dx) < 50) return; // a vertical scroll, or too small to count as an intentional swipe
                if (dx > 0) setCalPeriodIdx(i=>Math.max(0,(i===null?currPeriodIdx:i)-1));
                else setCalPeriodIdx(i=>Math.min(11,(i===null?currPeriodIdx:i)+1));
              })}
              style={{...S.card,overflow:'hidden'}}>
              {/* minmax(0,1fr) is essential — plain '1fr' lets long cell text (e.g. "5h@1.33x")
                  force columns wider than their share, which pushed the grid past the screen edge */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'3px',marginBottom:'8px'}}>
                {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>(
                  <div key={d} style={{textAlign:'center',fontSize:'13px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',minWidth:0,overflow:'hidden'}}>{d}</div>
                ))}
              </div>
              <div ref={weeksGridRef} style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                {weeks.map((week,wi)=>(
                  <div key={`${cIdx}-${wi}`} style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'3px'}}>
                    {week.map((date,di)=>{
                      if (!date) return <div key={`${cIdx}-${wi}-${di}-empty`} style={{minWidth:0}}/>;
                      const info = dayInfo(date);
                      const isToday = info.ds===todayStr;
                      return (
                        <button key={info.ds} onClick={()=>{
                            if (info.hasOT) { setSelectedCalDay(info); }
                            else { setConfirmCreateDay(info.ds); }
                          }}
                          style={{
                            ...(isWide ? {height:'76px'} : {aspectRatio:'1', minHeight:'46px'}),
                            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                            borderRadius:'10px', border: isToday?`2px solid ${BRASS}`:info.isPlanned?'1.5px dashed color-mix(in srgb, #2563eb 45%, transparent)':'1px solid var(--border-2)',
                            background: info.isRecordOnly?'var(--border)':info.isPlanned?'var(--tint-blue)':info.hasOT ? (info.isFullySubmitted?'var(--tint-green)':'var(--tint-red)') : 'transparent',
                            cursor:'pointer', padding:'2px 1px', fontFamily:'inherit', position:'relative',
                            minWidth:0, width:'100%', overflow:'hidden', boxSizing:'border-box', gap:'2px',
                          }}>
                          <span style={{position:'absolute',top:'1px',left:'3px',fontSize:isWide?'8px':'7px',fontWeight:900,color:date.getMonth()%2===0?'#2563eb':'#0d9488',textTransform:'uppercase',letterSpacing:'0.3px',lineHeight:1}}>{date.toLocaleDateString('en-GB',{month:'short'})}</span>
                          {/* Cross-period marker — the sole signal for "part of this day
                              counted in a different period", independent of the cell's normal
                              submitted/outstanding colouring. A small rounded sparkle inset
                              into the top-right corner (mirroring the month tag's top-left
                              spot) so it never competes with the PA/TOIL dots below. Drawn
                              with rounded stroke caps rather than a font glyph so it renders
                              identically on every device. */}
                          {info.crossInfo&&(
                            <svg style={{position:'absolute',top:isWide?'3px':'2px',right:isWide?'3px':'2px'}} width={isWide?12:10} height={isWide?12:10} viewBox="0 0 24 24" fill="none">
                              <g stroke="#4338ca" strokeWidth="3.2" strokeLinecap="round">
                                <line x1="12" y1="3" x2="12" y2="21"/>
                                <line x1="4.5" y1="7.5" x2="19.5" y2="16.5"/>
                                <line x1="19.5" y1="7.5" x2="4.5" y2="16.5"/>
                              </g>
                            </svg>
                          )}
                          <span style={{fontSize:isWide?'16px':'13px',fontWeight:info.hasOT?900:600,color:info.isRecordOnly?'var(--muted)':info.isPlanned?'var(--text-blue-deep)':info.hasOT?(info.isFullySubmitted?'#15803d':'var(--text-red-deep)'):'var(--quiet)',lineHeight:1}}>{date.getDate()}</span>
                          {info.totalHrs>0&&(
                            <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:info.rateColor,lineHeight:1,maxWidth:'100%',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{isWide ? fmtHrs(info.totalHrs) : fmtHrs(info.totalHrs).replace(/h (\d+)m$/,'h$1')}</span>
                          )}
                          {(info.hasPA||info.hasToil)&&(
                            <div style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
                              {info.hasPA&&<div style={{width:'4px',height:'4px',borderRadius:'50%',background:'#f59e0b',flexShrink:0}}/>}
                              {info.hasToil&&<div style={{width:'4px',height:'4px',borderRadius:'50%',background:'#7c3aed',flexShrink:0}}/>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* legend — desktop: one horizontal wrapped row instead
                   of the two-column stacked layout, so it no longer
                   needs the manual flex-align matching between
                   columns; mobile keeps the original two-column
                   layout unchanged. ── */}
              {isWide ? (
                <div style={{display:'flex',flexDirection:'column',gap:'10px',marginTop:'16px',paddingTop:'16px',borderTop:'1px solid var(--border-2)'}}>
                  <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'center',gap:'18px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--tint-red)',border:'1.5px solid color-mix(in srgb, #dc2626 45%, transparent)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>Not submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--tint-green)',border:'1.5px solid color-mix(in srgb, #059669 45%, transparent)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>Submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--tint-blue)',border:'1.5px dashed color-mix(in srgb, #2563eb 55%, transparent)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>Planned</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--border)',border:'1.5px solid color-mix(in srgb, #64748b 35%, transparent)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>Record only</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><g stroke="#4338ca" strokeWidth="3.2" strokeLinecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="4.5" y1="7.5" x2="19.5" y2="16.5"/><line x1="19.5" y1="7.5" x2="4.5" y2="16.5"/></g></svg>
                      <span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>Paid in another pay month</span>
                    </div>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:'18px'}}>
                    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'18px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#f59e0b'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>PA</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#7c3aed'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>TOIL</span></div>
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'18px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--ink)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>1.33×</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'#059669'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>1.5×</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'#dc2626'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>2×</span></div>
                    </div>
                  </div>
                </div>
              ) : (
              <div style={{marginTop:'12px',paddingTop:'12px',borderTop:'1px solid var(--border-2)'}}>
                <button onClick={()=>setCalLegendExpanded(v=>!v)} style={{width:'100%',background:'none',border:'none',padding:0,display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',fontFamily:'inherit',fontSize:'12.5px',fontWeight:800,color:BRASS,cursor:'pointer'}}>
                  What do the colours mean?
                  <span style={{display:'flex',transform:calLegendExpanded?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s'}}><Ico n="cR" s={11} c={BRASS} w={2.5}/></span>
                </button>
                {calLegendExpanded&&(
                <div className="accordion-in" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginTop:'14px'}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'6px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--tint-red)',border:'1.5px solid color-mix(in srgb, #dc2626 45%, transparent)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>Not submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--tint-green)',border:'1.5px solid color-mix(in srgb, #059669 45%, transparent)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>Submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--tint-blue)',border:'1.5px dashed color-mix(in srgb, #2563eb 55%, transparent)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>Planned</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--border)',border:'1.5px solid color-mix(in srgb, #64748b 35%, transparent)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>Record only</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                      <div style={{width:'11px',display:'flex',justifyContent:'center',flexShrink:0}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><g stroke="#4338ca" strokeWidth="3.2" strokeLinecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="4.5" y1="7.5" x2="19.5" y2="16.5"/><line x1="19.5" y1="7.5" x2="4.5" y2="16.5"/></g></svg>
                      </div>
                      <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>Paid in another pay month</span>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'8px'}}>
                    <div style={{display:'flex',gap:'10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#f59e0b'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>PA</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#7c3aed'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>TOIL</span></div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'6px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--ink)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>1.33×</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#059669'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>1.5×</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#dc2626'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>2×</span></div>
                    </div>
                  </div>
                </div>
                )}
              </div>
              )}
            </div>

            {/* One totals card for the period: gross, net and hours up top,
                then what made them up (overtime by rate, Protection Allowance), TOIL, and
                anything still to submit — each of the last two opens its
                own tab, as the separate boxes used to. */}
            {(()=>{
              const g = carmsOutstanding.groups.find(g=>g.periodIdx===cIdx);
              return (
                <div style={{...S.card,marginTop:'2px'}}>
                  <div style={{display:'grid',gridTemplateColumns:isWide?'repeat(4,minmax(0,1fr))':'repeat(2,minmax(0,1fr))',rowGap:'12px',textAlign:'center',marginBottom:'10px'}}>
                    {[['Gross',fmt(pb.combinedGross),'var(--text-navy)'],['Net',fmt(pb.combinedNet),'#059669'],['Submitted',fmtHrs(hrsSplit(cEntries).sub),GRN],['Not submitted',fmtHrs(hrsSplit(cEntries).pend),hrsSplit(cEntries).pend>0?RED:'var(--quiet)']].map(([k,v,col],n)=>(
                      <div key={k} style={{borderLeft:(isWide?n:n%2)?'1px solid var(--border-2)':'none',padding:'2px 4px'}}>
                        <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.07em',whiteSpace:'nowrap'}}>{k}</div>
                        <div style={{fontFamily:MONO,fontSize:isWide?'20px':'17px',fontWeight:600,color:col,marginTop:'2px'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {(()=>{
                    // Planned shifts in this pay month, in sky blue and never
                    // part of the real figures above: a phone gets one strip
                    // under the figures; a computer gets its own section in
                    // the breakdown listing each shift and the month's total
                    // if they're claimed on time.
                    const ex = totals.expected?.[cIdx];
                    const hasEx = !!(ex && ex.n>0);
                    const sky = {color:'var(--exp-ink)'};
                    const skyBox = {background:'var(--exp-tint)',border:'1px dashed color-mix(in srgb, var(--exp) 55%, transparent)',borderRadius:'11px'};
                    const shiftsLbl = hasEx ? `Planned · ${ex.n} shift${ex.n!==1?'s':''}` : '';
                    const strip = hasEx && !isWide && (
                      <div style={{...skyBox,padding:'9px 12px',marginBottom:'10px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px'}}>
                        <span><span style={{display:'block',fontSize:'9.5px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.06em',...sky}}>{shiftsLbl}</span><span style={{fontFamily:MONO,fontSize:'17px',fontWeight:600,...sky}}>{fmtHrs(ex.hrs)}</span></span>
                        <span style={{textAlign:'right',fontFamily:MONO,fontSize:'12.5px',fontWeight:700,...sky}}>+{fmtGBP(ex.gross)} gross<span style={{display:'block'}}>+{fmtGBP(ex.net)} net</span></span>
                      </div>
                      <div style={{borderTop:'1px dashed color-mix(in srgb, var(--exp) 45%, transparent)',marginTop:'8px',paddingTop:'7px',fontSize:'11.5px',fontWeight:700,lineHeight:1.4,...sky}}>Submit by {submitWindow(cPeriod.end)?.byLong} for {payLabel(cPeriod.month)}. Submitted after that, they're paid in {submitWindow(cPeriod.end)?.next}.</div>
                      </div>
                    );
                    const planned = cEntries.filter(e=>e.date>todayStr).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
                    const section = hasEx && isWide && (
                      <div style={{borderTop:'1px solid var(--border-2)',padding:'8px 0 2px'}}>
                        <div style={{...skyBox,padding:'9px 11px'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'8px'}}>
                            <span style={{fontSize:'10px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.06em',...sky}}>{shiftsLbl} · <span style={{textTransform:'none'}}>{fmtHrs(ex.hrs)}</span></span>
                            <span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:700,...sky}}>+{fmtGBP(ex.gross)} gross · +{fmtGBP(ex.net)} net</span>
                          </div>
                          {planned.map(e=>{ const c=calcEntry(e); return (
                            <div key={e.id} style={{display:'flex',justifyContent:'space-between',gap:'10px',fontSize:'12.5px',fontWeight:700,...sky,padding:'6px 0 0'}}>
                              <span>{new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} · {fmtHrs(c.h1+c.h2+c.h3)}{e.paRate&&e.paRate!=='None'?` · ${e.paRate}`:''}</span>
                              <span style={{fontFamily:MONO}}>{fmtGBP(c.gross)}</span>
                            </div>); })}
                          <div style={{borderTop:'1px dashed color-mix(in srgb, var(--exp) 45%, transparent)',marginTop:'8px',paddingTop:'7px',fontSize:'12px',fontWeight:700,...sky}}>Submit by {submitWindow(cPeriod.end)?.byLong} and {payLabel(cPeriod.month)} comes to <span style={{fontFamily:MONO,whiteSpace:'nowrap'}}>{fmtGBP(pb.combinedGross+ex.gross)} gross · {fmtGBP(pb.combinedNet+ex.net)} net</span></div><div style={{fontSize:'11.5px',fontWeight:600,marginTop:'3px',...sky}}>Submitted after that, they're paid in {submitWindow(cPeriod.end)?.next}.</div>
                        </div>
                      </div>
                    );
                    return (<>
                      {strip}
                      {periodBreakdownRows({pb, tierHours:pTierHours, tierGross:pTierGross, tierDates:pTierDates, paCount:{PA1:ppa1,PA2:ppa2,PA3:ppa3}, paGross:pPaGross, paDates:pPaDates, toilWorked:pToilWorked, toilBanked:pToilBanked, toilWaiting:pToilWaiting, carmsGroup:g, periodIdx:cIdx, extra:section})}
                    </>);
                  })()}
                </div>
              );
            })()}
            </div>
            {renderFYTotalsCard()}
          </>
        );
      })()}
      </>
      )}
      </div>
    </div>
  );
}
