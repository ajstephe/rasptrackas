import { useRef } from 'react';
import { fmtGBP, fmtD } from '../lib/format.js';
import { Ico } from './Icons.jsx';
import { useCountUp } from '../lib/useCountUp.js';
import { SegSlider } from './SegSlider.jsx';
import { useMountTransition } from '../lib/useMountTransition.js';

// ─── CARMS & PA Outstanding tab ──────────────────────────────────────────────
// Rebuilt onto the same "ledger" idiom as the Dashboard: a navy statement
// header (eyebrow, one big mono total, brass divider) instead of three
// separate translucent stat tiles, then hairline rows with icon chips
// instead of a boxed dark card. Behaviour (filters, refs, pulse-scroll,
// claim numbering, edit-on-tap) is unchanged from the original extraction.
export function TabCarms({ MONO, BRASS, isWide, carmsOutstanding, carmsFilter, setCarmsFilter, periodGroupRefs, pulsePeriodIdx, startEdit, setFocusCarmsToggle, carmsClaimNumbers, animClass='fi',
  carmsSelectMode, toggleCarmsSelectMode, carmsSelected, toggleCarmsClaim, toggleCarmsGroup, openCarmsBulkConfirm,
}) {
  // Small tinted icon-chip, shared by every OT/PA/TOIL row below —
  // replaces the old flat colour text pill so a claim's category reads
  // the same way the rest of the app (Dashboard, Summary) marks one:
  // an icon in a tinted circle, not a coloured block of text.
  const catChip = (kind, size=26) => {
    const map = {
      ot:   { n:'clock', bg:'var(--tint-blue)',   c:'#2563eb' },
      pa:   { n:'cash',  bg:'var(--tint-amber)',  c:'#f59e0b' },
      toil: { n:'moon',  bg:'var(--tint-purple)', c:'#7c3aed' },
    }[kind];
    return <div style={{width:size+'px',height:size+'px',borderRadius:'9px',background:map.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n={map.n} s={Math.round(size*0.5)} c={map.c} w={2}/></div>;
  };

  // Counts up/down instead of jumping whenever the outstanding total
  // changes — e.g. marking a claim as submitted on Log Overtime.
  const animatedTotal = useCountUp(carmsOutstanding.totalAmount);

  // Selected count/total for the bulk action bar — looked up against the
  // same carmsOutstanding data every row already renders from, using
  // whichever of {ot,pa} was actually showing (and therefore selectable)
  // on that row at the moment it was picked.
  const selectedIds = Object.keys(carmsSelected||{});
  const selectedTotal = (() => {
    if (selectedIds.length===0) return 0;
    const byId = new Map();
    carmsOutstanding.groups.forEach(g=>g.items.forEach(it=>byId.set(it.entry.id, it)));
    let total = 0;
    selectedIds.forEach(id=>{
      const it = byId.get(id);
      const markers = carmsSelected[id];
      if (!it || !markers) return;
      if (markers.ot) total += it.otAmt;
      if (markers.pa) total += it.paAmt;
    });
    return total;
  })();

  // ── bulk action bar mirrors its own entrance on the way out ─────────────
  // Same useMountTransition trick as App.jsx's overlays: deselecting the
  // last claim (or cancelling select mode) used to cut this bar away
  // instantly; now it keeps rendering for one more beat so .sheet-pop's
  // "-out" class can slide it back down instead. selectedIds/selectedTotal
  // themselves drop to 0 the instant that happens, so barCount/barTotal
  // freeze at their last real value (via the ref below) for that tail.
  const barOpen = carmsSelectMode && selectedIds.length>0;
  const barMounted = useMountTransition(barOpen, 240);
  const lastBarRef = useRef({ count:selectedIds.length, total:selectedTotal });
  if (barOpen) lastBarRef.current = { count:selectedIds.length, total:selectedTotal };
  const { count:barCount, total:barTotal } = lastBarRef.current;

  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:'0 0 18px',letterSpacing:'-0.5px'}}>CARMS &amp; PA Outstanding</h2>

      <div style={{background:'var(--surface)',borderRadius:'18px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',overflow:'hidden'}}>

        {/* ── navy statement header ── */}
        <div style={{background:'var(--navy)',padding:'22px 20px',position:'relative',overflow:'hidden'}}>
          <div style={{fontFamily:MONO,fontSize:'10px',fontWeight:900,letterSpacing:'0.06em',textTransform:'uppercase',color:'#c9a35f',marginBottom:'10px'}}>Outstanding</div>
          <div style={{fontFamily:MONO,fontSize:'28px',fontWeight:600,color:'#fff',letterSpacing:'-0.02em',marginBottom:'9px'}}>{fmtGBP(animatedTotal)}</div>
          <div style={{width:'38px',height:'3px',background:BRASS,borderRadius:'2px',marginBottom:'12px'}}/>
          <div style={{fontSize:'11px',color:'#93c5fd',fontWeight:600,lineHeight:1.5}}>Spacing out your overtime for a steadier payday, or quietly dodging the taxman as £100k creeps closer — either way, good thinking. This is everything still sitting unclaimed in CARMS and PA, so nothing gets left behind.</div>
        </div>

        {/* ── OT / PA / Claims — hairline rows, icon chips, the same
             template the Dashboard uses for its own ledger rows ── */}
        <div style={{padding:'2px 20px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'13px 0',borderBottom:'1px solid var(--border-2)'}}>
            {catChip('ot', 32)}
            <div style={{flex:1,fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>OT Outstanding</div>
            <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(carmsOutstanding.totalOtAmount)}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'13px 0',borderBottom:'1px solid var(--border-2)'}}>
            {catChip('pa', 32)}
            <div style={{flex:1,fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>PA Outstanding</div>
            <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(carmsOutstanding.totalPaAmount)}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'11px',padding:'13px 0'}}>
            <div style={{width:'32px',height:'32px',borderRadius:'13px',background:'var(--tint-brass)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="checklist" s={16} c={BRASS}/></div>
            <div style={{flex:1,fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>Claims</div>
            <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:'var(--ink)'}}>{carmsOutstanding.totalClaims}</div>
          </div>
        </div>

        {carmsOutstanding.groups.length===0 ? (
          <div style={{textAlign:'center',padding:'22px 10px 26px'}}>
            <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'var(--tint-brass)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
              <Ico n="check" s={20} c={BRASS} w={2.3}/>
            </div>
            <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)',marginBottom:'3px'}}>All caught up</div>
            <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:600}}>Every logged claim has been marked as submitted</div>
          </div>
        ) : (
          <div style={{padding:'0 20px 18px'}}>
            <div style={{background:'var(--tint-amber)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'10px 12px',fontSize:'11px',color:'var(--text-amber-deep)',lineHeight:1.5,margin:'10px 0 14px'}}>
              This {fmtGBP(carmsOutstanding.totalAmount)} isn't in your Total Gross YTD yet — it only counts once it's been marked as submitted on the Log Overtime screen.
            </div>

            <SegSlider activeKey={carmsFilter} trackStyle={{display:'flex',gap:'6px',marginBottom:'10px'}} indicatorStyle={{background:BRASS,borderRadius:'10px'}}>
              {[{id:'all',lbl:'All'},{id:'ot',lbl:'Overtime'},{id:'pa',lbl:'PA'},{id:'toil',lbl:'TOIL'}].map(f=>(
                <div key={f.id} data-seg-key={f.id} onClick={()=>setCarmsFilter(f.id)} className="tap-row" style={{position:'relative',zIndex:1,flex:1,textAlign:'center',padding:'8px 4px',borderRadius:'10px',fontSize:'11px',fontWeight:800,cursor:'pointer',background:'transparent',color:carmsFilter===f.id?'#fff':'var(--muted)',border:carmsFilter===f.id?'none':'1px solid var(--border-2)'}}>{f.lbl}</div>
              ))}
            </SegSlider>
            <div style={{display:'flex',alignItems:'center',justifyContent:'flex-start',marginBottom:'14px'}}>
              <button onClick={toggleCarmsSelectMode} className="tap-row" style={{fontSize:'13px',fontWeight:900,color:'#2563eb',cursor:'pointer',padding:'9px 16px',background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'10px',fontFamily:'inherit'}}>{carmsSelectMode?'Cancel':'Select Multiple Entries'}</button>
            </div>

            {(()=>{
              const matchesFilter = it => {
                if (carmsFilter==='ot') return it.otOutstanding;
                if (carmsFilter==='pa') return it.paOutstanding;
                if (carmsFilter==='toil') return it.toilOutstanding;
                return true;
              };
              const anyVisible = carmsOutstanding.groups.some(g=>g.items.some(matchesFilter));
              // Something's outstanding overall (we're already past the
              // groups.length===0 branch above) but nothing matches THIS
              // filter — without this, the list below just silently
              // renders nothing, which reads as a bug rather than "there's
              // simply no PA outstanding right now."
              if (!anyVisible) {
                const filterLbl = carmsFilter==='ot'?'Overtime':carmsFilter==='pa'?'PA':'TOIL';
                return (
                  <div style={{textAlign:'center',padding:'20px 10px 24px'}}>
                    <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'var(--tint-brass)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
                      <Ico n="check" s={18} c={BRASS} w={2.3}/>
                    </div>
                    <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)',marginBottom:'3px'}}>Nothing outstanding for {filterLbl}</div>
                    <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:600}}>Other categories still have claims — switch filters above to see them</div>
                  </div>
                );
              }
              return carmsOutstanding.groups.map(g=>{
              const visibleItems = g.items.filter(matchesFilter);
              if (visibleItems.length===0) return null;
              const visibleTotalLabel = (() => {
                if (carmsFilter==='toil') return `${visibleItems.reduce((s,it)=>s+it.toilHrs,0).toFixed(1)}h`;
                const total = visibleItems.reduce((s,it)=>{
                  if (carmsFilter==='ot') return s+it.otAmt;
                  if (carmsFilter==='pa') return s+it.paAmt;
                  return s+it.amount;
                },0);
                return fmtGBP(total);
              })();
              return (
                <div key={g.periodIdx} ref={el=>periodGroupRefs.current[g.periodIdx]=el} className={pulsePeriodIdx===g.periodIdx?'carms-pulse':''} style={{marginBottom:'14px',borderRadius:'14px',border:pulsePeriodIdx===g.periodIdx?'2px solid #2563eb':'2px solid transparent'}}>
                  {/* "select all in this period" — required(it) is the same
                      {ot,pa} shape each row itself computes for its own
                      selection, so this only reads as fully-checked once
                      every individual OT and PA line in the group is
                      actually selected, not just once every entry has *a*
                      marker on it (an entry selected for PA only no longer
                      counts as "done" if it also has OT outstanding here). ── */}
                  {(()=>{
                    // Only the keys this row actually has outstanding under
                    // the current filter are included at all (never an
                    // explicit false) — toggleCarmsGroup merges these into
                    // whatever's already selected for that entry, so a key
                    // this group toggle isn't concerned with (e.g. an OT
                    // claim already selected independently while looking at
                    // the PA filter) is left alone rather than clobbered.
                    const required = it => {
                      const r = {};
                      if (it.otOutstanding && carmsFilter!=='pa' && carmsFilter!=='toil') r.ot = true;
                      if (it.paOutstanding && carmsFilter!=='ot' && carmsFilter!=='toil') r.pa = true;
                      return r;
                    };
                    const isDone = it => {
                      const req = required(it);
                      const sel = carmsSelected[it.entry.id] || {};
                      return (!req.ot || sel.ot) && (!req.pa || sel.pa);
                    };
                    const allDone = visibleItems.every(isDone);
                    return (
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 4px',fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.6px',borderBottom:'1px solid var(--border-2)'}}>
                    {/* disabled rather than a plain non-interactive <span>
                        outside select mode — same visible row either way,
                        but a real button that's genuinely inert (out of
                        tab order, announced as disabled) instead of a div
                        whose click handler quietly disappears */}
                    <button
                      disabled={!carmsSelectMode}
                      onClick={carmsSelectMode?()=>{
                        const rows = visibleItems.map(it=>({ id: it.entry.id, markers: required(it) }));
                        toggleCarmsGroup(rows);
                      }:undefined}
                      style={{display:'flex',alignItems:'center',gap:'8px',cursor:carmsSelectMode?'pointer':'default',background:'none',border:'none',padding:0,color:'inherit',font:'inherit',textTransform:'inherit',letterSpacing:'inherit'}}>
                      {carmsSelectMode&&(
                        <span style={{width:'15px',height:'15px',borderRadius:'50%',border:`1.5px solid ${allDone?BRASS:'var(--quiet)'}`,background:allDone?BRASS:'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                          {allDone&&<Ico n="check" s={9} c="#fff" w={3}/>}
                        </span>
                      )}
                      <span>{g.period.short} · {g.period.month} · {fmtD(g.period.start)} – {fmtD(g.period.end)}</span>
                    </button>
                    <span style={{fontFamily:MONO,color:BRASS}}>{visibleTotalLabel}</span>
                  </div>
                    );
                  })()}
                  <div style={{background:'var(--surface-2)',borderRadius:'12px',padding:'4px 12px'}}>
                    {visibleItems.map((it,i)=>{
                      const goToEntry = () => {
                        startEdit(it.entry);
                        setFocusCarmsToggle(true);
                      };
                      const showOt = it.otOutstanding && carmsFilter!=='pa' && carmsFilter!=='toil';
                      const showPa = it.paOutstanding && carmsFilter!=='ot' && carmsFilter!=='toil';
                      const showToil = it.toilOutstanding && carmsFilter!=='ot' && carmsFilter!=='pa';
                      // Overtime and TOIL are the same submission — TOIL only
                      // banks once the underlying OT is submitted, so whenever
                      // both are outstanding on one entry they share a single
                      // numbered row rather than each claiming their own number.
                      // A day showing TOIL on its own (the dedicated TOIL filter
                      // tab, where showOt is always false) still gets its own row.
                      const mergeOtToil = showOt && showToil;
                      // OT and PA go to different systems (CARMS vs MetHR) on
                      // different schedules, so each gets its own ring and its
                      // own toggle rather than one shared selection for the
                      // whole entry — selecting one no longer forces the other
                      // along with it. TOIL never gets its own key: it only
                      // ever banks as a side effect of the OT submission
                      // (there's no separate "TOIL submitted" flag in the data
                      // at all), so the merged OT+TOIL line and the standalone
                      // TOIL-filter line both toggle the same 'ot' marker.
                      const otSelected = !!carmsSelected[it.entry.id]?.ot;
                      const paSelected = !!carmsSelected[it.entry.id]?.pa;
                      const anySelected = otSelected || paSelected;
                      const ring = (on) => carmsSelectMode&&(
                        <span style={{width:'19px',height:'19px',borderRadius:'50%',border:`1.5px solid ${on?BRASS:'var(--quiet)'}`,background:on?BRASS:'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                          {on&&<Ico n="check" s={11} c="#fff" w={3}/>}
                        </span>
                      );
                      // Can't be a real <button> — it contains the four
                      // toggle buttons above whenever select mode is active
                      // (a <button> may not itself contain other
                      // interactive content per HTML5). role="button" +
                      // tabIndex + Enter/Space is the standard alternative;
                      // both drop away entirely in select mode, when this
                      // row's own click handler is disabled anyway and the
                      // toggles above are the real interactive elements.
                      return (
                        <div key={it.entry.id} role={carmsSelectMode?undefined:'button'} tabIndex={carmsSelectMode?undefined:0} onClick={carmsSelectMode?undefined:goToEntry} onKeyDown={carmsSelectMode?undefined:(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); goToEntry(); } }} className="claim-in tap-row" style={{display:'flex',alignItems:'flex-start',gap:'10px',paddingTop:isWide?'12px':'10px',paddingBottom:isWide?'12px':'10px',borderBottom:'1px solid var(--border-2)',cursor:carmsSelectMode?'default':'pointer',animationDelay:(Math.min(i,6)*55)+'ms',background:anySelected?'rgba(184,130,63,0.07)':'transparent',margin:anySelected?'0 -10px':0,paddingLeft:anySelected?'10px':0,paddingRight:anySelected?'10px':0,borderRadius:anySelected?'8px':0}}>
                          <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:700,color:'#2563eb',textDecoration:'underline',marginBottom:'6px'}}>
                            {it.entry.reason||'Shift'} — {new Date(it.entry.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
                          </div>
                          {mergeOtToil&&(
                            <button disabled={!carmsSelectMode} onClick={carmsSelectMode?()=>toggleCarmsClaim(it.entry.id,'ot'):undefined} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',width:'100%',background:'none',border:'none',textAlign:'left',fontFamily:'inherit',cursor:carmsSelectMode?'pointer':'default'}}>
                              {ring(otSelected)}
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-ot')}</span>
                              <div style={{display:'flex',alignItems:'center',gap:'4px',flexShrink:0}}>
                                {catChip('ot')}
                                {catChip('toil')}
                              </div>
                              <span style={{fontSize:isWide?'13px':'11.5px',fontWeight:700,color:'var(--ink)'}}>Overtime <span style={{color:'var(--quiet)',fontWeight:600}}>+ TOIL</span></span>
                              <div style={{marginLeft:'auto',textAlign:'right'}}>
                                <div style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706'}}>{fmtGBP(it.otAmt)}</div>
                                <div style={{fontFamily:MONO,fontSize:isWide?'12px':'10.5px',fontWeight:700,color:'#7c3aed'}}>+ {it.toilHrs.toFixed(1)}h TOIL</div>
                              </div>
                            </button>
                          )}
                          {showOt&&!mergeOtToil&&(
                            <button disabled={!carmsSelectMode} onClick={carmsSelectMode?()=>toggleCarmsClaim(it.entry.id,'ot'):undefined} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',width:'100%',background:'none',border:'none',textAlign:'left',fontFamily:'inherit',cursor:carmsSelectMode?'pointer':'default'}}>
                              {ring(otSelected)}
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-ot')}</span>
                              {catChip('ot')}
                              <span style={{fontSize:isWide?'13px':'11.5px',fontWeight:700,color:'var(--ink)'}}>Overtime</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.otAmt)}</span>
                            </button>
                          )}
                          {showPa&&(
                            <button disabled={!carmsSelectMode} onClick={carmsSelectMode?()=>toggleCarmsClaim(it.entry.id,'pa'):undefined} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',width:'100%',background:'none',border:'none',textAlign:'left',fontFamily:'inherit',cursor:carmsSelectMode?'pointer':'default'}}>
                              {ring(paSelected)}
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-pa')}</span>
                              {catChip('pa')}
                              <span style={{fontSize:isWide?'13px':'11.5px',fontWeight:700,color:'var(--ink)'}}>PA</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.paAmt)}</span>
                            </button>
                          )}
                          {showToil&&!mergeOtToil&&(
                            <button disabled={!carmsSelectMode} onClick={carmsSelectMode?()=>toggleCarmsClaim(it.entry.id,'ot'):undefined} style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',width:'100%',background:'none',border:'none',textAlign:'left',fontFamily:'inherit',cursor:carmsSelectMode?'pointer':'default'}}>
                              {ring(otSelected)}
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-toil')}</span>
                              {catChip('toil')}
                              <span style={{fontSize:isWide?'13px':'11.5px',fontWeight:700,color:'var(--ink)'}}>TOIL</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'14.5px':'12.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{it.toilHrs.toFixed(1)}h</span>
                            </button>
                          )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              });
            })()}
          </div>
        )}
      </div>

      {/* ── bulk action bar — only present while there's something to act
           on, same "floats just above the bottom nav" placement as Log
           Overtime's own sticky preview banner. That 88px only clears
           the mobile bottom nav — desktop has no bottom nav (it's a
           fixed left sidebar instead), so this used to stick with a big
           dead gap reserved under it for nothing. Matches Log Overtime's
           own preview banner: sticky only applies on mobile, desktop
           just renders it in normal flow at the end of the list. ── */}
      {barMounted && (
        <div className={'sheet-pop'+(barOpen?'':' pop-out')} style={{...(!isWide?{position:'sticky',bottom:'calc(88px + env(safe-area-inset-bottom))'}:{}),zIndex:24,marginTop:'11px',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'15px',padding:'12px 14px',boxShadow:'0 10px 24px rgba(15,39,68,0.16)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
            <div style={{fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}>{barCount} selected</div>
            <div style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:600,color:BRASS}}>{fmtGBP(barTotal)}</div>
          </div>
          <button onClick={openCarmsBulkConfirm} style={{width:'100%',background:BRASS,border:'none',borderRadius:'11px',padding:'12px',fontWeight:800,fontSize:'12.5px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Mark as Submitted</button>
        </div>
      )}
    </div>
  );
}
