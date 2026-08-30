import { useRef } from 'react';
import { buildCalendarWeeks } from '../lib/payPeriods.js';
import { KEYS, dualWrite } from '../lib/storage.js';
import { fmt, fmtHM, fmtGBP, fmtD, fmtDDMM } from '../lib/format.js';
import { isOtSubmitted, isPaSubmitted, effectiveOtDate, effectivePaDate, periodIdxForDate } from '../lib/calc.js';
import { RATE_TIER_MULT } from '../lib/payRates.js';
import { Ico } from './Icons.jsx';
import { SegSlider } from './SegSlider.jsx';

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
  focusEntryId, confirmDel, setConfirmDel, pulsePeriodIdx, setPulsePeriodIdx,
  setSelectedCalDay, setConfirmCreateDay,
  PAY_PERIODS, fyEntries, totals, carmsOutstanding, todayStr,
  calcEntry, crossPeriodInfo, carmsBadge, renderDatePills, renderFYTotalsCard,
  jumpTo, snapToActiveMonth, startEdit, delEntry, setTab,
}) {
  // Purely a gesture-visual concern (not app state), so it's local rather
  // than lifted like calSwipeStartX — mutated directly via the ref during
  // the drag rather than through React state, so the calendar visibly
  // tracks the finger at 60fps instead of only reacting once the swipe ends.
  const weeksGridRef = useRef(null);
  return (
    <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
      {/* Sticky header — heading, toggle and month pills all float together */}
      <div ref={stickyRef} style={{position:'sticky',top:0,zIndex:20,background:'rgba(var(--surface-2-rgb),0.82)',backdropFilter:'blur(16px) saturate(1.5)',WebkitBackdropFilter:'blur(16px) saturate(1.5)',paddingTop:'14px',paddingBottom:'8px',marginTop:'-14px',marginBottom:'6px'}}>
        <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:'0 0 10px',letterSpacing:'-0.5px'}}>Summary</h2>
        <SegSlider activeKey={breakdownView} trackStyle={{display:'flex',background:'var(--chip-bg)',borderRadius:'14px',padding:'4px',boxShadow:'0 4px 14px rgba(15,23,42,0.08)'}} indicatorStyle={{background:BRASS,borderRadius:'11px',boxShadow:'0 2px 8px rgba(184,130,63,0.35)'}}>
          {/* Each half is a div rather than a button so the star can be its own
              tap target inside it — nesting buttons isn't valid HTML. */}
          <div data-seg-key="calendar" onClick={()=>{ setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'auto'}); }} style={{position:'relative',zIndex:1,flex:1,padding:'9px 6px',borderRadius:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',background:'transparent',color:breakdownView==='calendar'?'#fff':'var(--muted)',transition:'color 0.15s',display:'flex',alignItems:'center',gap:'4px',userSelect:'none'}}>
            <span style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
              <Ico n="cal" s={13} c={breakdownView==='calendar'?'#fff':'var(--muted)'} w={2.5}/>Calendar View
            </span>
            <span onClick={e=>{ e.stopPropagation(); setDefaultBreakdownView('calendar'); dualWrite(KEYS.defaultBreakdownView,'calendar'); }} className="star-tap" style={{flexShrink:0,display:'flex',alignItems:'center',padding:'4px 5px',cursor:'pointer'}}>
              <Ico n="star" s={17} w={1.8}
                c={defaultBreakdownView==='calendar'?'#fbbf24':(breakdownView==='calendar'?'rgba(255,255,255,0.5)':'#cbd5e1')}
                f={defaultBreakdownView==='calendar'?'#fbbf24':'none'}/>
            </span>
          </div>
          <div data-seg-key="list" onClick={()=>{ setBreakdownView('list'); snapToActiveMonth(); }} style={{position:'relative',zIndex:1,flex:1,padding:'9px 6px',borderRadius:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',background:'transparent',color:breakdownView==='list'?'#fff':'var(--muted)',transition:'color 0.15s',display:'flex',alignItems:'center',gap:'4px',userSelect:'none'}}>
            <span style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
              <Ico n="list" s={13} c={breakdownView==='list'?'#fff':'var(--muted)'} w={2.5}/>List View
            </span>
            <span onClick={e=>{ e.stopPropagation(); setDefaultBreakdownView('list'); dualWrite(KEYS.defaultBreakdownView,'list'); }} className="star-tap" style={{flexShrink:0,display:'flex',alignItems:'center',padding:'4px 5px',cursor:'pointer'}}>
              <Ico n="star" s={17} w={1.8}
                c={defaultBreakdownView==='list'?'#fbbf24':(breakdownView==='list'?'rgba(255,255,255,0.5)':'#cbd5e1')}
                f={defaultBreakdownView==='list'?'#fbbf24':'none'}/>
            </span>
          </div>
        </SegSlider>
        <div style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)',textAlign:'center',marginTop:'6px',lineHeight:1.4}}>
          {defaultBreakdownView==='list'?'List View':'Calendar View'} opens by default · tap ★ to change
        </div>

        {/* month jump pills — part of the sticky header in List View.
            On desktop, boxed to match the Calendar/List toggle above
            rather than floating loose in the open page. */}
        {breakdownView==='list'&&(
          <div style={isWide?{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'14px',padding:'10px 14px',marginTop:'8px'}:{}}>
          <div style={{display:'flex',gap:'3px',paddingTop:isWide?0:'8px',justifyContent:'center'}}>
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
                <button key={p.short} onClick={()=>jumpTo(p.month)} style={{flex:'1 1 0',minWidth:0,padding:isWide?'5px 4px':'5px 2px',borderRadius:'14px',border:isActive?`1.5px solid ${BRASS}`:hasOutstanding?'1px solid var(--border-2)':isCurr?`1.5px solid ${BRASS}`:'1px solid var(--border-2)',background:hasOutstanding?'var(--tint-red)':isActive?BRASS:isCurr?'var(--tint-brass)':'var(--surface)',color:hasOutstanding?'var(--text-red-deep)':isActive?'#fff':isCurr?BRASS:'var(--muted)',fontSize:isWide?'12px':'10.5px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.14s',textAlign:'center',overflow:'hidden'}}>
                  {p.short}
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* month pills — Calendar View equivalent, selects the period
            being viewed. Same boxed treatment on desktop as List View
            above, for consistency between the two. */}
        {breakdownView==='calendar'&&(
          <div style={isWide?{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'14px',padding:'10px 14px',marginTop:'8px'}:{}}>
          <div style={{display:'flex',gap:'3px',paddingTop:isWide?0:'8px',justifyContent:'center'}}>
            {PAY_PERIODS.map((p,idx)=>{
              const isCurr=idx===currPeriodIdx;
              const isSel=(calPeriodIdx===null?currPeriodIdx:calPeriodIdx)===idx;
              const hasOutstanding = carmsOutstanding.groups.some(g=>g.periodIdx===idx);
              return(
                <button key={p.short} onClick={()=>{ setCalPeriodIdx(idx); if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'smooth'}); }} style={{flex:'1 1 0',minWidth:0,padding:isWide?'5px 4px':'5px 2px',borderRadius:'14px',border:isSel?`1.5px solid ${BRASS}`:hasOutstanding?'1px solid var(--border-2)':isCurr?`1.5px solid ${BRASS}`:'1px solid var(--border-2)',background:hasOutstanding?'var(--tint-red)':isSel?BRASS:isCurr?'var(--tint-brass)':'var(--surface)',color:hasOutstanding?'var(--text-red-deep)':isSel?'#fff':isCurr?BRASS:'var(--muted)',fontSize:isWide?'12px':'10.5px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.14s',textAlign:'center',overflow:'hidden'}}>
                  {p.short}
                </button>
              );
            })}
          </div>
          </div>
        )}
      </div>

      {breakdownView==='list' ? (
      <>
      {/* Desktop: period cards reflow into a 2-column grid instead of
          one long vertical stack; the currently-open card spans both
          columns (via gridColumn below) so its OT Pay/PA boxes and
          entry rows keep full width. Mobile is untouched — `display`
          only turns into `grid` on isWide, so this container behaves
          like a normal block wrapper otherwise. ── */}
      <div style={isWide?{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px'}:undefined}>
      {PAY_PERIODS.map((p,idx)=>{
        const pE=fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
        const pb=totals.periodBreakdown[idx];
        // Hours-worked stats (top-of-card "Total O/T Hours", TOIL
        // worked/banked) stay period-local — what actually happened
        // in this period, regardless of submission status, matching
        // what the calendar cells for these dates show.
        let h133=0,h150=0,h200=0,totalToilWorked=0,totalToilBanked=0;
        pE.forEach(e=>{
          const c=calcEntry(e);
          h133+=c.h1; h150+=c.h2; h200+=c.h3;
          totalToilWorked+=c.toilH; totalToilBanked+=c.toilBanked;
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
            if (c.h1>0) { tierHours.t133+=c.h1; tierDates.t133.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); tierGross.t133+=c.ot1; }
            if (c.h2>0) { tierHours.t150+=c.h2; tierDates.t150.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); tierGross.t150+=c.ot2; }
            if (c.h3>0) { tierHours.t200+=c.h3; tierDates.t200.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); tierGross.t200+=c.ot3; }
          }
          if (paCounted) {
            if(e.paRate==='PA1'){pa1++; paDates.PA1.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); paGross.PA1+=c.pa;}
            else if(e.paRate==='PA2'){pa2++; paDates.PA2.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); paGross.PA2+=c.pa;}
            else if(e.paRate==='PA3'){pa3++; paDates.PA3.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); paGross.PA3+=c.pa;}
          }
        });
        const gOT=pb.ot, gPA=pb.pa;
        const totG=pb.combinedGross, totN=pb.combinedNet;
        const isExp=expanded===p.month, isCurr=idx===currPeriodIdx;

        // Built once, used by both the desktop two-box layout and the
        // mobile merged-card layout below, so the actual figures and
        // breakdown rows never have to be maintained in two places.
        const otPayInner = (
          <>
            <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-blue-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'}}>OT Pay</div>
            <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-navy)',marginBottom:'1px'}}>Gross: <span style={{fontFamily:MONO}}>{fmt(gOT)}</span></div>
            <div style={{fontSize:'11px',fontWeight:700,color:'#3b82f6',marginBottom:'7px'}}>Net: <span style={{fontFamily:MONO}}>{fmt(pb.otResult.net)}</span></div>
            <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'6px'}}>
              {tierHours.t133>0&&<div style={{marginBottom:'6px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--ink)'}}><span>{tierHours.t133}h @ 1.33x</span><span style={{fontFamily:MONO}}>{fmt(tierGross.t133)}</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'1px'}}>{renderDatePills(tierDates.t133,'var(--muted)')}</div>
              </div>}
              {tierHours.t150>0&&<div style={{marginBottom:'6px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--ink)'}}><span>{tierHours.t150}h @ 1.5x</span><span style={{fontFamily:MONO}}>{fmt(tierGross.t150)}</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'1px'}}>{renderDatePills(tierDates.t150,'var(--muted)')}</div>
              </div>}
              {tierHours.t200>0&&<div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--ink)'}}><span>{tierHours.t200}h @ 2.0x</span><span style={{fontFamily:MONO}}>{fmt(tierGross.t200)}</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'1px'}}>{renderDatePills(tierDates.t200,'var(--muted)')}</div>
              </div>}
            </div>
          </>
        );
        const paInner = (
          <>
            <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-amber-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'}}>PA</div>
            <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)',marginBottom:'1px'}}>Gross: <span style={{fontFamily:MONO}}>{fmt(gPA)}</span></div>
            <div style={{fontSize:'11px',fontWeight:700,color:'#d97706',marginBottom:'7px'}}>Net: <span style={{fontFamily:MONO}}>{fmt(pb.paResult.net)}</span></div>
            <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'6px'}}>
              {pa1>0&&<div style={{marginBottom:'6px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)'}}><span>PA1 × {pa1}</span><span style={{fontFamily:MONO}}>{fmt(paGross.PA1)}</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:'#b45309',marginTop:'1px'}}>{renderDatePills(paDates.PA1,'#b45309')}</div>
              </div>}
              {pa2>0&&<div style={{marginBottom:'6px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)'}}><span>PA2 × {pa2}</span><span style={{fontFamily:MONO}}>{fmt(paGross.PA2)}</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:'#b45309',marginTop:'1px'}}>{renderDatePills(paDates.PA2,'#b45309')}</div>
              </div>}
              {pa3>0&&<div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)'}}><span>PA3 × {pa3}</span><span style={{fontFamily:MONO}}>{fmt(paGross.PA3)}</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:'#b45309',marginTop:'1px'}}>{renderDatePills(paDates.PA3,'#b45309')}</div>
              </div>}
              {pa1===0&&pa2===0&&pa3===0&&<div style={{fontSize:'12px',fontWeight:700,color:'#b45309'}}>None this period</div>}
            </div>
          </>
        );

        return(
          <div key={p.month} ref={el=>monthRefs.current[p.month]=el} style={{background:'var(--surface)',borderRadius:'16px',border:'1px solid var(--border-2)',borderLeft:isCurr?`3px solid ${BRASS}`:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',marginBottom:'9px',overflow:'hidden',...(isWide&&isExp?{gridColumn:'1 / -1'}:{})}}>
            <button onClick={()=>setExpanded(isExp?null:p.month)} style={{width:'100%',textAlign:'left',padding:'16px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
              {isCurr&&<div style={{display:'inline-flex',alignItems:'center',gap:'4px',background:BRASS,color:'#fff',fontSize:'10px',fontWeight:900,padding:'3px 9px',borderRadius:'8px',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#fff'}}/>Active Month</div>}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'2px'}}>
                <div style={{fontWeight:900,fontSize:'18px',color:'var(--ink)',letterSpacing:'-0.3px'}}>{p.month}</div>
                <div style={{fontFamily:MONO,fontSize:'11px',fontWeight:600,color:'var(--quiet)'}}>{fmtD(p.start)} – {fmtD(p.end)}</div>
              </div>

              <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'11px 0',borderBottom:'1px solid var(--border-2)'}}>
                <div style={{width:'30px',height:'30px',borderRadius:'13px',background:'var(--tint-teal)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="clock" s={15} c="#0d9488"/></div>
                <div style={{flex:1,fontSize:'12.5px',fontWeight:700,color:'var(--ink)'}}>Hours worked</div>
                <div style={{fontFamily:MONO,fontSize:'13.5px',fontWeight:600,color:'var(--ink)'}}>{(h133+h150+h200).toFixed(1)}h <span style={{color:'var(--quiet)',fontWeight:400}}>· {pE.length} rec.</span></div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'11px 0',borderBottom:'1px solid var(--border-2)'}}>
                <div style={{width:'30px',height:'30px',borderRadius:'13px',background:'var(--tint-blue)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="cash" s={15} c="var(--text-navy)"/></div>
                <div style={{flex:1,fontSize:'12.5px',fontWeight:700,color:'var(--ink)'}}>Gross</div>
                <div style={{fontFamily:MONO,fontSize:'15px',fontWeight:600,color:'var(--text-navy)'}}>{fmt(totG)}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'11px 0'}}>
                <div style={{width:'30px',height:'30px',borderRadius:'13px',background:'var(--tint-green)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="cash" s={15} c="#059669"/></div>
                <div style={{flex:1,fontSize:'12.5px',fontWeight:700,color:'var(--ink)'}}>Net</div>
                <div style={{fontFamily:MONO,fontSize:'15px',fontWeight:600,color:'#059669'}}>{fmt(totN)}</div>
              </div>

              {(() => {
                const g = carmsOutstanding.groups.find(g=>g.periodIdx===idx);
                if (!g) return null;
                return (
                  <div onClick={ev=>{ ev.stopPropagation(); setTab('carms'); setPulsePeriodIdx(idx); }} className="nav-add-pulse" style={{display:'flex',alignItems:'center',gap:'11px',background:'var(--tint-amber)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 12px',marginTop:'11px',cursor:'pointer'}}>
                    <div style={{width:'30px',height:'30px',borderRadius:'13px',background:'var(--tint-brass)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="checklist" s={15} c={BRASS}/></div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'12.5px',fontWeight:700,color:'var(--ink)'}}>Awaiting submission</div>
                      <div style={{fontSize:'10px',fontWeight:600,color:'var(--quiet)',marginTop:'1px'}}>CARMS &amp; MetHR</div>
                    </div>
                    <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:BRASS}}>{fmtGBP(g.periodTotal)}</div>
                  </div>
                );
              })()}
              <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:'4px',fontSize:'11.5px',fontWeight:700,color:BRASS,marginTop:'11px'}}>
                {isExp?'Tap to collapse':'Tap to see more'}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={BRASS} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:isExp?'rotate(180deg)':'rotate(0deg)',flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </button>

            {isExp&&(
              <div className="fi" style={{background:'var(--surface-2)',borderTop:'1px solid var(--border-2)',padding:'13px'}}>
                {/* month summary — net figures now use cumulative marginal tax, rate shown.
                    Desktop: OT Pay and PA keep their own bordered boxes side by side (this
                    card already spans both grid columns once expanded, so there's room).
                    Mobile: same figures, merged into one card with a divider instead of
                    three separate boxes. ── */}
                {isWide ? (
                  <>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px',marginBottom:'9px'}}>
                      <div style={{background:'var(--surface)',borderRadius:'13px',padding:'13px',border:'1px solid var(--border-2)'}}>{otPayInner}</div>
                      <div style={{background:'var(--surface)',borderRadius:'13px',padding:'13px',border:'1px solid var(--border-2)'}}>{paInner}</div>
                    </div>
                    <div onClick={()=>setTab('graph')} style={{background:'var(--tint-purple)',borderRadius:'13px',padding:'11px',border:'1px solid var(--border-2)',cursor:'pointer',marginBottom:'9px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'5px'}}><Ico n="clock" s={11} c="#7c3aed"/><div style={{fontSize:'10px',fontWeight:900,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em'}}>TOIL</div></div>
                      <div style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-purple-deep)',marginBottom:'6px'}}>{fmtHM(totalToilWorked)}h worked → {fmtHM(totalToilBanked)}h banked</div>
                      <div style={{fontSize:'11px',fontWeight:700,color:'#8b5cf6'}}>See TOIL Tab</div>
                    </div>
                  </>
                ) : (
                  <div style={{background:'var(--surface)',borderRadius:'13px',border:'1px solid var(--border-2)',padding:'13px',marginBottom:'9px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'13px'}}>
                      <div>{otPayInner}</div>
                      <div style={{borderLeft:'1px solid var(--border-2)',paddingLeft:'13px'}}>{paInner}</div>
                    </div>
                    <div onClick={()=>setTab('graph')} style={{borderTop:'1px solid var(--border-2)',marginTop:'13px',paddingTop:'12px',cursor:'pointer'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'5px'}}><Ico n="clock" s={11} c="#7c3aed"/><div style={{fontSize:'10px',fontWeight:900,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em'}}>TOIL</div></div>
                      <div style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-purple-deep)',marginBottom:'2px'}}>{fmtHM(totalToilWorked)}h worked → {fmtHM(totalToilBanked)}h banked</div>
                      <div style={{fontSize:'11px',fontWeight:700,color:'#8b5cf6'}}>See TOIL Tab</div>
                    </div>
                  </div>
                )}

                <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',marginBottom:'9px'}}>Individual Records</div>

                {pE.length===0
                  ?<div style={{textAlign:'center',padding:'14px',color:'var(--quiet)',fontSize:'15px',fontWeight:700}}>No records yet</div>
                  :[...pE].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>{
                    const c=calcEntry(e);
                    const isFut=e.date>todayStr;
                    // individual records use the period-blended rate for each component
                    const eOTNet    = c.ot>0    ? c.ot*(1-pb.otResult.rate/100)       : 0;
                    const ePANet    = c.pa>0    ? c.pa*(1-pb.paResult.rate/100)       : 0;
                    const eNet = eOTNet+ePANet;
                    return(
                      <div key={e.id} ref={el=>entryRefs.current[e.id]=el} className={focusEntryId===e.id?'entry-flash':''} style={{background:focusEntryId===e.id?'var(--tint-blue)':'var(--surface)',borderRadius:'13px',border:focusEntryId===e.id?'2px solid #2563eb':isFut?'1px solid var(--border-2)':'1px solid #94a3b8',padding:'13px',marginBottom:'7px',position:'relative',transition:'background 0.4s ease, border-color 0.4s ease'}}>
                        {isFut&&<div style={{position:'absolute',top:'-6px',right:'9px',background:'#2563eb',color:'#fff',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',textTransform:'uppercase',letterSpacing:'0.06em'}}>Planned</div>}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'7px'}}>
                          <div>
                            <div style={{fontWeight:900,fontSize:'15px',color:'var(--ink)'}}>{new Date(e.date+'T12:00:00').toLocaleDateString('en-GB')}</div>
                            <div style={{fontSize:'10px',fontWeight:900,color:'#3b82f6',marginTop:'2px',textTransform:'uppercase'}}>Duty / Reason: {e.reason||'Shift'}</div>
                            {e.takeAs==='toil'&&<div style={{display:'inline-block',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--tint-purple)',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em'}}>TOIL</div>}
                            {e.takeAs==='mix'&&<div style={{display:'inline-block',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--tint-purple)',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em'}}>Mix — Pay + TOIL</div>}
                            {carmsBadge(e, 10)}
                            {/* Same neutral record-only indicator as the calendar day
                                view — an entry with no claimable OT hours and no PA has
                                nothing to submit, so it gets its own label rather than
                                no badge at all or a misleading submitted/outstanding one. */}
                            {c.h1+c.h2+c.h3===0 && (!e.paRate || e.paRate==='None') && (
                              <div style={{display:'inline-block',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--border)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>ⓘ Shift Record — No OT Claim</div>
                            )}
                            {(()=>{ const xp = crossPeriodInfo(e); return xp && (
                              <div style={{display:'inline-block',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--tint-indigo)',color:'var(--text-indigo-deep)',textTransform:'uppercase',letterSpacing:'0.06em'}}>↷ {xp.both?'OT & PA':xp.ot?'OT':'PA'} Counted in {xp.label}</div>
                            ); })()}
                          </div>
                          <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                            <button onClick={()=>{setConfirmDel(null);startEdit(e);}} style={{background:'var(--chip-bg)',border:'none',borderRadius:'8px',padding:'8px',cursor:'pointer',display:'flex'}}><Ico n="edit" s={14} c="#64748b"/></button>
                            <button onClick={()=>setConfirmDel(confirmDel===e.id?null:e.id)} style={{background:confirmDel===e.id?'var(--tint-red)':'var(--tint-red)',border:confirmDel===e.id?'1.5px solid var(--border-2)':'1.5px solid transparent',borderRadius:'8px',padding:'8px',cursor:'pointer',display:'flex',transition:'all 0.15s'}}><Ico n="trash" s={14} c="#ef4444"/></button>
                          </div>
                        </div>

                        {/* delete confirmation */}
                        {confirmDel===e.id&&(
                          <div style={{background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 12px',marginBottom:'9px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                            <span style={{fontSize:'14px',fontWeight:700,color:'var(--text-red-deep)'}}>Delete this record?</span>
                            <div style={{display:'flex',gap:'7px',flexShrink:0}}>
                              <button onClick={()=>setConfirmDel(null)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:'5px 12px',fontSize:'13px',fontWeight:900,color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                              <button onClick={()=>delEntry(e.id)} style={{background:'#dc2626',border:'none',borderRadius:'8px',padding:'5px 12px',fontSize:'13px',fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Delete</button>
                            </div>
                          </div>
                        )}

                        {/* notes — sits under Duty/Reason with separators, matching the Calendar View popover */}
                        {e.comments&&(
                          <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'10px',marginBottom:'10px'}}>
                            <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'4px'}}>Notes</div>
                            <div style={{fontSize:'13px',fontStyle:'italic',color:'var(--ink)',borderLeft:'2px solid var(--border-2)',paddingLeft:'8px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.5}}>{e.comments}</div>
                          </div>
                        )}

                        <div style={{background:'var(--surface-2)',borderRadius:'11px',padding:'12px'}}>
                          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                            {c.payH1>0&&(
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>{c.payH1}h @ 1.33x {c.toilH>0&&c.otRateTier==='hours133'?'(Pay)':''} <span style={{color:'var(--quiet)'}}>(£{c.r.r133.toFixed(2)}/hr)</span></span>
                                <span style={{fontSize:'14px',fontWeight:900,color:'var(--text-navy)'}}>£{c.ot1.toFixed(2)}</span>
                              </div>
                            )}
                            {c.payH2>0&&(
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>{c.payH2}h @ 1.5x {c.toilH>0&&c.otRateTier==='hours150'?'(Pay)':''} <span style={{color:'var(--quiet)'}}>(£{c.r.r150.toFixed(2)}/hr)</span></span>
                                <span style={{fontSize:'14px',fontWeight:900,color:'var(--text-navy)'}}>£{c.ot2.toFixed(2)}</span>
                              </div>
                            )}
                            {c.payH3>0&&(
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>{c.payH3}h @ 2.0x {c.toilH>0&&c.otRateTier==='hours200'?'(Pay)':''} <span style={{color:'var(--quiet)'}}>(£{c.r.r200.toFixed(2)}/hr)</span></span>
                                <span style={{fontSize:'14px',fontWeight:900,color:'var(--text-navy)'}}>£{c.ot3.toFixed(2)}</span>
                              </div>
                            )}
                            {c.toilH>0&&(
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'#6d28d9'}}>{fmtHM(c.toilH)}h @ {RATE_TIER_MULT[c.otRateTier]}x <span style={{color:'#a78bfa'}}>(TOIL{c.takeAs==='mix'?' — part of shift':''})</span></span>
                                <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-purple-deep)'}}>{fmtHM(c.toilBanked)}h banked</span>
                              </div>
                            )}
                            {e.paRate!=='None'&&(
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span style={{fontSize:'13px',fontWeight:700,color:'#b45309'}}>{e.paRate} allowance</span>
                                <span style={{fontSize:'14px',fontWeight:900,color:'var(--text-amber-deep)'}}>£{c.pa.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px',borderTop:'1px solid var(--border-2)',paddingTop:'8px',marginTop:'8px'}}>
                            <div><div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross</div><div style={{fontFamily:MONO,fontWeight:600,fontSize:'15px',color:'var(--text-navy)'}}>{fmt(c.gross)}</div></div>
                            <div style={{textAlign:'right'}}><div style={{fontSize:'10px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'0.06em'}}>Net</div><div style={{fontFamily:MONO,fontWeight:600,fontSize:'15px',color:'#059669'}}>{fmt(eNet)}</div></div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
                <button onClick={()=>setExpanded(null)} style={{width:'100%',marginTop:'4px',padding:'9px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'11px',fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px'}}>
                  Close <Ico n="cU" s={12} c="#94a3b8"/>
                </button>
              </div>
            )}
          </div>
        );
      })}
      </div>
      {renderFYTotalsCard()}
      </>
      ) : (
      <>
      {/* ══════════════════ CALENDAR VIEW (Overtime Visualiser) ══════════════════ */}
      {(()=>{
        const cIdx = calPeriodIdx===null ? currPeriodIdx : calPeriodIdx;
        const cPeriod = PAY_PERIODS[cIdx];
        const cEntries = fyEntries.filter(e=>e.date>=cPeriod.start&&e.date<=cPeriod.end);
        const cTotalHrs = cEntries.reduce((s,e)=>{ const c=calcEntry(e); return s+c.h1+c.h2+c.h3; },0);
        const weeks = buildCalendarWeeks(cPeriod);

        // period-level totals for the breakdown boxes (mirrors List View)
        const pb = totals.periodBreakdown[cIdx];
        // Hours-worked stats stay period-local (see List View comment
        // for the reasoning) — cTotalHrs above already covers the
        // Total O/T Hours stat. OT Pay / PA box data below iterates
        // every entry in the year and groups by submission-period
        // attribution instead, carrying each shift's original worked
        // date.
        let pToilWorked=0, pToilBanked=0;
        cEntries.forEach(e=>{
          const c = calcEntry(e);
          pToilWorked+=c.toilH; pToilBanked+=c.toilBanked;
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
            if (c.h1>0) { pTierHours.t133+=c.h1; pTierDates.t133.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); pTierGross.t133+=c.ot1; }
            if (c.h2>0) { pTierHours.t150+=c.h2; pTierDates.t150.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); pTierGross.t150+=c.ot2; }
            if (c.h3>0) { pTierHours.t200+=c.h3; pTierDates.t200.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); pTierGross.t200+=c.ot3; }
          }
          if (paCounted) {
            if(e.paRate==='PA1'){ppa1++; pPaDates.PA1.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); pPaGross.PA1+=c.pa;}
            else if(e.paRate==='PA2'){ppa2++; pPaDates.PA2.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); pPaGross.PA2+=c.pa;}
            else if(e.paRate==='PA3'){ppa3++; pPaDates.PA3.push({d:fmtDDMM(e.date),counted:true,cross:isCross}); pPaGross.PA3+=c.pa;}
          }
        });

        const dayInfo = (date) => {
          if (!date) return null;
          const ds = date.toISOString().split('T')[0];
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
          // Cross-period detection is independent of whether the
          // *other* part of the day is submitted — OT/TOIL goes
          // through CARMS and PA goes through MetHR on separate
          // timelines, so it's normal for one side to already be
          // submitted and counted in a different period while the
          // other is still outstanding. This drives the asterisk
          // marker only — the cell's background/border always just
          // reflects plain submitted/outstanding status, same as
          // every other day, so there's a single consistent signal
          // for "is this done" and a single separate one for "did
          // part of it move periods" rather than the two overlapping.
          const crossInfo = dEntries.length===1 ? crossPeriodInfo(dEntries[0]) : null;
          return { ds, dEntries, totalHrs, hasPA, hasToil, hasOT: dEntries.length>0, isFullySubmitted, isRecordOnly, crossInfo, rateColor, periodIdx: cIdx };
        };

        return (
          <>
            {/* period navigator */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
              <button onClick={()=>setCalPeriodIdx(i=>Math.max(0,(i===null?currPeriodIdx:i)-1))} disabled={cIdx===0} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'9px 14px',cursor:cIdx===0?'default':'pointer',opacity:cIdx===0?0.3:1}}><Ico n="cL" s={18} c={BRASS}/></button>
              <div style={{textAlign:'center'}}>
                {cIdx===currPeriodIdx&&(
                  <div style={{display:'inline-flex',alignItems:'center',gap:'4px',background:BRASS,color:'#fff',fontSize:'10px',fontWeight:900,padding:'3px 9px',borderRadius:'8px',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'4px'}}>
                    <span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#fff'}}/>Active Month
                  </div>
                )}
                <div style={{fontWeight:900,fontSize:'22px',color:cIdx===currPeriodIdx?BRASS:'var(--ink)'}}>{cPeriod.month}</div>
                <div style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--quiet)'}}>{fmtD(cPeriod.start)} – {fmtD(cPeriod.end)}</div>
              </div>
              <button onClick={()=>setCalPeriodIdx(i=>Math.min(11,(i===null?currPeriodIdx:i)+1))} disabled={cIdx===11} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',padding:'9px 14px',cursor:cIdx===11?'default':'pointer',opacity:cIdx===11?0.3:1}}><Ico n="cR" s={18} c={BRASS}/></button>
            </div>

            {/* stats strip — Shifts and Total O/T Hours. Desktop:
                a slim inline line instead of a full boxed card,
                freeing vertical space for the taller calendar grid
                below. Mobile keeps the original boxed strip. ── */}
            {isWide ? (
              <div style={{fontSize:'12.5px',fontWeight:700,color:'var(--quiet)',textAlign:'center',marginBottom:'16px'}}>
                <span style={{color:'var(--text-navy)',fontWeight:900}}>{cEntries.length}</span> shift{cEntries.length!==1?'s':''} logged &nbsp;·&nbsp; <span style={{color:'var(--text-navy)',fontWeight:900}}>{cTotalHrs}</span> total O/T hours
              </div>
            ) : (
            <div style={{...S.card,display:'flex',padding:'16px',background:'var(--surface)',border:'1px solid var(--border-2)',borderLeft:cIdx===currPeriodIdx?`3px solid ${BRASS}`:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
              <div style={{flex:1,textAlign:'center'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Shifts Logged</div>
                <div style={{fontFamily:MONO,fontSize:'22px',fontWeight:600,color:'var(--text-navy)'}}>{cEntries.length}</div>
              </div>
              <div style={{width:'1px',background:'var(--border-2)'}}/>
              <div style={{flex:1,textAlign:'center'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Total O/T Hours</div>
                <div style={{fontFamily:MONO,fontSize:'22px',fontWeight:600,color:'var(--text-navy)'}}>{cTotalHrs}</div>
              </div>
            </div>
            )}

            <div className="hint-pulse" style={{fontSize:'14px',color:'var(--quiet)',textAlign:'center',fontWeight:600,margin:'10px 0'}}>Tap a day to view details or add an entry</div>

            {/* calendar grid */}
            <div
              onTouchStart={isWide?undefined:(e=>{
                calSwipeStartX.current = e.touches[0].clientX;
                if (weeksGridRef.current) weeksGridRef.current.style.transition = 'none';
              })}
              onTouchMove={isWide?undefined:(e=>{
                if (calSwipeStartX.current===null || !weeksGridRef.current) return;
                const dx = e.touches[0].clientX - calSwipeStartX.current;
                // rubber-banded past 90px so a long drag doesn't just keep
                // dragging the grid off into space — same idea as an iOS
                // scroll-past-the-end bounce, capped rather than elastic.
                const damped = Math.abs(dx) > 90 ? Math.sign(dx) * (90 + (Math.abs(dx) - 90) * 0.25) : dx;
                weeksGridRef.current.style.transform = `translateX(${damped}px)`;
              })}
              onTouchEnd={isWide?undefined:(e=>{
                if (calSwipeStartX.current===null) return;
                const dx = e.changedTouches[0].clientX - calSwipeStartX.current;
                calSwipeStartX.current = null;
                if (weeksGridRef.current) {
                  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                  weeksGridRef.current.style.transition = reduced ? 'none' : 'transform 0.28s cubic-bezier(.32,.72,0,1)';
                  weeksGridRef.current.style.transform = 'translateX(0px)';
                }
                if (Math.abs(dx) < 50) return; // too small to count as an intentional swipe
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
                            borderRadius:'10px', border: isToday?`2px solid ${BRASS}`:info.isRecordOnly?'1px solid var(--border-2)':info.hasOT?(info.isFullySubmitted?'1px solid var(--border-2)':'1px solid var(--border-2)'):'1px solid var(--border-2)',
                            background: info.isRecordOnly?'var(--border)':info.hasOT ? (info.isFullySubmitted?'var(--tint-green)':'var(--tint-red)') : 'transparent',
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
                          <span style={{fontSize:isWide?'16px':'13px',fontWeight:info.hasOT?900:600,color:info.isRecordOnly?'var(--muted)':info.hasOT?(info.isFullySubmitted?'#15803d':'var(--text-red-deep)'):'var(--quiet)',lineHeight:1}}>{date.getDate()}</span>
                          {info.totalHrs>0&&(
                            <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:info.rateColor,lineHeight:1,maxWidth:'100%',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{info.totalHrs}h</span>
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
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--tint-red)',border:'1px solid var(--border-2)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>OT/PA Recorded NOT Submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--tint-green)',border:'1px solid var(--border-2)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>OT/PA Submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--border)',border:'1px solid var(--border-2)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>No OT — Info Only</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><g stroke="#4338ca" strokeWidth="3.2" strokeLinecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="4.5" y1="7.5" x2="19.5" y2="16.5"/><line x1="19.5" y1="7.5" x2="4.5" y2="16.5"/></g></svg>
                      <span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>OT/PA Counted Other Period</span>
                    </div>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:'18px'}}>
                    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'18px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#f59e0b'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>PA</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#7c3aed'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>TOIL</span></div>
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'18px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'var(--ink)'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>1.33x</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'#059669'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>1.5x</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'12px',height:'12px',borderRadius:'4px',background:'#dc2626'}}/><span style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)'}}>2.0x</span></div>
                    </div>
                  </div>
                </div>
              ) : (
              <div style={{marginTop:'12px',paddingTop:'12px',borderTop:'1px solid var(--border-2)'}}>
                <button onClick={()=>setCalLegendExpanded(v=>!v)} style={{width:'100%',background:'none',border:'none',padding:0,display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',fontFamily:'inherit',fontSize:'12.5px',fontWeight:800,color:'#2563eb',cursor:'pointer'}}>
                  What do the colours mean?
                  <span style={{display:'flex',transform:calLegendExpanded?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s'}}><Ico n="cR" s={11} c="#2563eb" w={2.5}/></span>
                </button>
                {calLegendExpanded&&(
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginTop:'14px'}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'6px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--tint-red)',border:'1px solid var(--border-2)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>OT/PA Recorded NOT Submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--tint-green)',border:'1px solid var(--border-2)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>OT/PA Submitted</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--border)',border:'1px solid var(--border-2)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>No OT — Info Only</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                      <div style={{width:'11px',display:'flex',justifyContent:'center',flexShrink:0}}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><g stroke="#4338ca" strokeWidth="3.2" strokeLinecap="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="4.5" y1="7.5" x2="19.5" y2="16.5"/><line x1="19.5" y1="7.5" x2="4.5" y2="16.5"/></g></svg>
                      </div>
                      <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>OT/PA Counted Other Period</span>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'8px'}}>
                    <div style={{display:'flex',gap:'10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#f59e0b'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>PA</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#7c3aed'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>TOIL</span></div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'6px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'var(--ink)'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>1.33x</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#059669'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>1.5x</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#dc2626'}}/><span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>2.0x</span></div>
                    </div>
                  </div>
                </div>
                )}
              </div>
              )}
            </div>

            {/* period breakdown boxes — same layout as List View */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px'}}>
              <div style={{background:'var(--surface)',borderRadius:'13px',padding:'13px',border:'1px solid var(--border-2)'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-blue-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'}}>OT Pay</div>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-navy)',marginBottom:'1px'}}>Gross: <span style={{fontFamily:MONO}}>{fmt(pb.ot)}</span></div>
                <div style={{fontSize:'11px',fontWeight:700,color:'#3b82f6',marginBottom:'7px'}}>Net: <span style={{fontFamily:MONO}}>{fmt(pb.otResult.net)}</span></div>
                <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'6px'}}>
                  {pTierHours.t133>0&&<div style={{marginBottom:'6px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--ink)'}}><span>{pTierHours.t133}h @ 1.33x</span><span style={{fontFamily:MONO}}>{fmt(pTierGross.t133)}</span></div>
                    <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'1px'}}>{renderDatePills(pTierDates.t133,'var(--muted)')}</div>
                  </div>}
                  {pTierHours.t150>0&&<div style={{marginBottom:'6px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--ink)'}}><span>{pTierHours.t150}h @ 1.5x</span><span style={{fontFamily:MONO}}>{fmt(pTierGross.t150)}</span></div>
                    <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'1px'}}>{renderDatePills(pTierDates.t150,'var(--muted)')}</div>
                  </div>}
                  {pTierHours.t200>0&&<div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--ink)'}}><span>{pTierHours.t200}h @ 2.0x</span><span style={{fontFamily:MONO}}>{fmt(pTierGross.t200)}</span></div>
                    <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'1px'}}>{renderDatePills(pTierDates.t200,'var(--muted)')}</div>
                  </div>}
                </div>
              </div>
              <div style={{background:'var(--surface)',borderRadius:'13px',padding:'13px',border:'1px solid var(--border-2)'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-amber-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'}}>PA</div>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)',marginBottom:'1px'}}>Gross: <span style={{fontFamily:MONO}}>{fmt(pb.pa)}</span></div>
                <div style={{fontSize:'11px',fontWeight:700,color:'#d97706',marginBottom:'7px'}}>Net: <span style={{fontFamily:MONO}}>{fmt(pb.paResult.net)}</span></div>
                <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'6px'}}>
                  {ppa1>0&&<div style={{marginBottom:'6px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)'}}><span>PA1 × {ppa1}</span><span style={{fontFamily:MONO}}>{fmt(pPaGross.PA1)}</span></div>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#b45309',marginTop:'1px'}}>{renderDatePills(pPaDates.PA1,'#b45309')}</div>
                  </div>}
                  {ppa2>0&&<div style={{marginBottom:'6px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)'}}><span>PA2 × {ppa2}</span><span style={{fontFamily:MONO}}>{fmt(pPaGross.PA2)}</span></div>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#b45309',marginTop:'1px'}}>{renderDatePills(pPaDates.PA2,'#b45309')}</div>
                  </div>}
                  {ppa3>0&&<div>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',fontWeight:700,color:'var(--text-amber-deep)'}}><span>PA3 × {ppa3}</span><span style={{fontFamily:MONO}}>{fmt(pPaGross.PA3)}</span></div>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#b45309',marginTop:'1px'}}>{renderDatePills(pPaDates.PA3,'#b45309')}</div>
                  </div>}
                  {ppa1===0&&ppa2===0&&ppa3===0&&<div style={{fontSize:'12px',fontWeight:700,color:'#b45309'}}>None this period</div>}
                </div>
              </div>
            </div>
            <div onClick={()=>setTab('graph')} style={{background:'var(--tint-purple)',borderRadius:'13px',padding:'11px',border:'1px solid var(--border-2)',cursor:'pointer',marginTop:'9px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'5px'}}><Ico n="clock" s={11} c="#7c3aed"/><div style={{fontSize:'10px',fontWeight:900,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em'}}>TOIL</div></div>
              <div style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-purple-deep)',marginBottom:'6px'}}>{fmtHM(pToilWorked)}h worked → {fmtHM(pToilBanked)}h banked</div>
              <div style={{fontSize:'11px',fontWeight:700,color:'#8b5cf6'}}>See TOIL Tab</div>
            </div>

            {(() => {
              const g = carmsOutstanding.groups.find(g=>g.periodIdx===cIdx);
              if (!g) return null;
              return (
                <div onClick={ev=>{ ev.stopPropagation(); setTab('carms'); setPulsePeriodIdx(cIdx); }} className="nav-add-pulse" style={{background:'var(--tint-amber)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'18px',marginTop:'9px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                    <Ico n="clock" s={14} c="#d97706"/>
                    <span style={{fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}>CARMS &amp; MetHR Awaiting Submission</span>
                  </div>
                  <span style={{fontFamily:MONO,fontSize:'19px',fontWeight:600,color:'#d97706'}}>{fmtGBP(g.periodTotal)}</span>
                </div>
              );
            })()}

            <div style={{...S.card,marginTop:'9px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'6px 0',borderBottom:'1px solid var(--border-2)'}}>
                <div style={{width:'30px',height:'30px',borderRadius:'13px',background:'var(--tint-blue)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="cash" s={15} c="var(--text-navy)"/></div>
                <div style={{flex:1,fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>Gross</div>
                <div style={{fontFamily:MONO,fontSize:'19px',fontWeight:600,color:'var(--text-navy)'}}>{fmt(pb.combinedGross)}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'6px 0'}}>
                <div style={{width:'30px',height:'30px',borderRadius:'13px',background:'var(--tint-green)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="cash" s={15} c="#059669"/></div>
                <div style={{flex:1,fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>Net</div>
                <div style={{fontFamily:MONO,fontSize:'19px',fontWeight:600,color:'#059669'}}>{fmt(pb.combinedNet)}</div>
              </div>
            </div>
            {renderFYTotalsCard()}
          </>
        );
      })()}
      </>
      )}
    </div>
  );
}
