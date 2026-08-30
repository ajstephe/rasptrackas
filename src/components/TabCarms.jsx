import { fmtGBP, fmtD } from '../lib/format.js';
import { Ico } from './Icons.jsx';
import { useCountUp } from '../lib/useCountUp.js';
import { SegSlider } from './SegSlider.jsx';

// ─── CARMS & PA Outstanding tab ──────────────────────────────────────────────
// Rebuilt onto the same "ledger" idiom as the Dashboard: a navy statement
// header (eyebrow, one big mono total, brass divider) instead of three
// separate translucent stat tiles, then hairline rows with icon chips
// instead of a boxed dark card. Behaviour (filters, refs, pulse-scroll,
// claim numbering, edit-on-tap) is unchanged from the original extraction.
export function TabCarms({ S, MONO, BRASS, isWide, carmsOutstanding, carmsFilter, setCarmsFilter, periodGroupRefs, pulsePeriodIdx, startEdit, setFocusCarmsToggle, carmsClaimNumbers }) {
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

  return (
    <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:'0 0 18px',letterSpacing:'-0.5px'}}>CARMS &amp; PA Outstanding</h2>

      <div style={{background:'var(--surface)',borderRadius:'18px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',overflow:'hidden'}}>

        {/* ── navy statement header ── */}
        <div style={{background:'var(--navy)',padding:'22px 20px',position:'relative',overflow:'hidden'}}>
          <div style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',color:'#c9a35f',marginBottom:'10px'}}>Outstanding</div>
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
            <div style={{width:'32px',height:'32px',borderRadius:'10px',background:'var(--tint-brass)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n="checklist" s={16} c={BRASS}/></div>
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
            <div style={{background:'var(--tint-amber)',border:'1px solid var(--border-2)',borderRadius:'10px',padding:'10px 12px',fontSize:'11px',color:'var(--text-amber-deep)',lineHeight:1.5,margin:'10px 0 14px'}}>
              This {fmtGBP(carmsOutstanding.totalAmount)} isn't in your Total Gross YTD yet — it only counts once it's been marked as submitted on the Log Overtime screen.
            </div>

            <SegSlider activeKey={carmsFilter} trackStyle={{display:'flex',gap:'6px',marginBottom:'14px'}} indicatorStyle={{background:BRASS,borderRadius:'10px'}}>
              {[{id:'all',lbl:'All'},{id:'ot',lbl:'Overtime'},{id:'pa',lbl:'PA'},{id:'toil',lbl:'TOIL'}].map(f=>(
                <div key={f.id} data-seg-key={f.id} onClick={()=>setCarmsFilter(f.id)} className="tap-row" style={{position:'relative',zIndex:1,flex:1,textAlign:'center',padding:'8px 4px',borderRadius:'10px',fontSize:'11px',fontWeight:800,cursor:'pointer',background:'transparent',color:carmsFilter===f.id?'#fff':'var(--muted)',border:carmsFilter===f.id?'none':'1px solid var(--border-2)'}}>{f.lbl}</div>
              ))}
            </SegSlider>

            {carmsOutstanding.groups.map(g=>{
              const visibleItems = g.items.filter(it => {
                if (carmsFilter==='ot') return it.otOutstanding;
                if (carmsFilter==='pa') return it.paOutstanding;
                if (carmsFilter==='toil') return it.toilOutstanding;
                return true;
              });
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
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 4px',fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.6px',borderBottom:'1px solid var(--border-2)'}}>
                    <span>{g.period.short} · {g.period.month} · {fmtD(g.period.start)} – {fmtD(g.period.end)}</span>
                    <span style={{fontFamily:MONO,color:BRASS}}>{visibleTotalLabel}</span>
                  </div>
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
                      return (
                        <div key={it.entry.id} onClick={goToEntry} className="claim-in tap-row" style={{padding:isWide?'12px 0':'10px 0',borderBottom:'1px solid var(--border-2)',cursor:'pointer',animationDelay:(Math.min(i,6)*55)+'ms'}}>
                          <div style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:700,color:'#2563eb',textDecoration:'underline',marginBottom:'6px'}}>
                            {it.entry.reason||'Shift'} — {new Date(it.entry.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
                          </div>
                          {mergeOtToil&&(
                            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0'}}>
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
                            </div>
                          )}
                          {showOt&&!mergeOtToil&&(
                            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0'}}>
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-ot')}</span>
                              {catChip('ot')}
                              <span style={{fontSize:isWide?'13px':'11.5px',fontWeight:700,color:'var(--ink)'}}>Overtime</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.otAmt)}</span>
                            </div>
                          )}
                          {showPa&&(
                            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0'}}>
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-pa')}</span>
                              {catChip('pa')}
                              <span style={{fontSize:isWide?'13px':'11.5px',fontWeight:700,color:'var(--ink)'}}>PA</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.paAmt)}</span>
                            </div>
                          )}
                          {showToil&&!mergeOtToil&&(
                            <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0'}}>
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-toil')}</span>
                              {catChip('toil')}
                              <span style={{fontSize:isWide?'13px':'11.5px',fontWeight:700,color:'var(--ink)'}}>TOIL</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'14.5px':'12.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{it.toilHrs.toFixed(1)}h</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
