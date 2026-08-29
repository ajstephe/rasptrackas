import { fmtGBP, fmtD } from '../lib/format.js';

// ─── CARMS & PA Outstanding tab ──────────────────────────────────────────────
// Extracted verbatim from App.jsx's tab==='carms' block — no behaviour change.
export function TabCarms({ S, MONO, BRASS, isWide, carmsOutstanding, carmsFilter, setCarmsFilter, periodGroupRefs, pulsePeriodIdx, startEdit, setFocusCarmsToggle, carmsClaimNumbers }) {
  return (
    <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:'0 0 18px',letterSpacing:'-0.5px'}}>CARMS &amp; PA Outstanding</h2>

      <div style={{...S.dark,background:'var(--navy)'}}>
        <div style={{fontSize:'11px',color:'#93c5fd',fontWeight:600,lineHeight:1.5,marginBottom:'14px'}}>Spacing out your overtime for a steadier payday, or quietly dodging the taxman as £100k creeps closer — either way, good thinking. This is everything still sitting unclaimed in CARMS and PA, so nothing gets left behind.</div>
        <div style={{display:'flex',gap:'10px',marginBottom:carmsOutstanding.groups.length?'14px':0}}>
          <div style={{flex:1,background:'rgba(255,255,255,0.08)',borderRadius:'12px',padding:'12px'}}>
            <div style={{fontFamily:MONO,fontSize:'18px',fontWeight:600,color:'#fff'}}>{fmtGBP(carmsOutstanding.totalOtAmount)}</div>
            <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.8px',marginTop:'2px'}}>OT Outstanding</div>
          </div>
          <div style={{flex:1,background:'rgba(255,255,255,0.08)',borderRadius:'12px',padding:'12px'}}>
            <div style={{fontFamily:MONO,fontSize:'18px',fontWeight:600,color:'#fff'}}>{fmtGBP(carmsOutstanding.totalPaAmount)}</div>
            <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.8px',marginTop:'2px'}}>PA Outstanding</div>
          </div>
          <div style={{flex:1,background:'rgba(255,255,255,0.08)',borderRadius:'12px',padding:'12px'}}>
            <div style={{fontFamily:MONO,fontSize:'18px',fontWeight:600,color:'#fff'}}>{carmsOutstanding.totalClaims}</div>
            <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.8px',marginTop:'2px'}}>Claims</div>
          </div>
        </div>

        {carmsOutstanding.groups.length===0 ? (
          <div style={{textAlign:'center',padding:'20px 10px',color:'#93c5fd',fontSize:'13px',fontWeight:700}}>Nothing outstanding — every logged claim has been marked as submitted.</div>
        ) : (
          <>
            <div style={{background:'rgba(217,119,6,0.12)',border:'1px solid #d97706',borderRadius:'10px',padding:'10px 12px',fontSize:'11px',color:'#fde68a',lineHeight:1.5,marginBottom:'14px'}}>
              This {fmtGBP(carmsOutstanding.totalAmount)} isn't in your Total Gross YTD yet — it only counts once it's been marked as submitted on the Log Overtime screen.
            </div>

            <div style={{display:'flex',gap:'6px',marginBottom:'14px'}}>
              {[{id:'all',lbl:'All'},{id:'ot',lbl:'Overtime'},{id:'pa',lbl:'PA'},{id:'toil',lbl:'TOIL'}].map(f=>(
                <div key={f.id} onClick={()=>setCarmsFilter(f.id)} style={{flex:1,textAlign:'center',padding:'8px 4px',borderRadius:'10px',fontSize:'11px',fontWeight:800,cursor:'pointer',background:carmsFilter===f.id?BRASS:'rgba(255,255,255,0.08)',color:carmsFilter===f.id?'#fff':'#93c5fd'}}>{f.lbl}</div>
              ))}
            </div>

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
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 4px',fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.6px'}}>
                    <span>{g.period.short} · {g.period.month} · {fmtD(g.period.start)} – {fmtD(g.period.end)}</span>
                    <span style={{fontFamily:MONO}}>{visibleTotalLabel}</span>
                  </div>
                  <div style={{background:'var(--surface-2)',borderRadius:'12px',padding:'4px 12px'}}>
                    {visibleItems.map(it=>{
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
                        <div key={it.entry.id} onClick={goToEntry} style={{padding:isWide?'12px 0':'10px 0',borderBottom:'1px solid var(--border-2)',cursor:'pointer'}}>
                          <div style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:700,color:'#2563eb',textDecoration:'underline',marginBottom:'6px'}}>
                            {it.entry.reason||'Shift'} — {new Date(it.entry.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
                          </div>
                          {mergeOtToil&&(
                            <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-ot')}</span>
                              <span style={{fontSize:isWide?'12.5px':'10.5px',fontWeight:800,padding:'3px 8px',borderRadius:'10px',border:'1px solid var(--ink)',textTransform:'uppercase',background:'var(--tint-blue)',color:'#2563eb'}}>Overtime</span>
                              <span style={{fontSize:isWide?'12.5px':'10.5px',fontWeight:800,padding:'3px 8px',borderRadius:'10px',border:'1px solid var(--ink)',textTransform:'uppercase',background:'var(--tint-purple)',color:'#7c3aed'}}>TOIL</span>
                              <div style={{marginLeft:'auto',textAlign:'right'}}>
                                <div style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706'}}>{fmtGBP(it.otAmt)}</div>
                                <div style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:700,color:'#7c3aed'}}>+ {it.toilHrs.toFixed(1)}h TOIL</div>
                              </div>
                            </div>
                          )}
                          {showOt&&!mergeOtToil&&(
                            <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-ot')}</span>
                              <span style={{fontSize:isWide?'12.5px':'10.5px',fontWeight:800,padding:'3px 8px',borderRadius:'10px',border:'1px solid var(--ink)',textTransform:'uppercase',background:'var(--tint-blue)',color:'#2563eb'}}>Overtime</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.otAmt)}</span>
                            </div>
                          )}
                          {showPa&&(
                            <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-pa')}</span>
                              <span style={{fontSize:isWide?'12.5px':'10.5px',fontWeight:800,padding:'3px 8px',borderRadius:'10px',border:'1px solid var(--ink)',textTransform:'uppercase',background:'var(--tint-amber)',color:'#f59e0b'}}>PA</span>
                              <span style={{fontFamily:MONO,fontSize:isWide?'13px':'11.5px',fontWeight:600,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.paAmt)}</span>
                            </div>
                          )}
                          {showToil&&!mergeOtToil&&(
                            <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                              <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'var(--muted)',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-toil')}</span>
                              <span style={{fontSize:isWide?'12.5px':'10.5px',fontWeight:800,padding:'3px 8px',borderRadius:'10px',border:'1px solid var(--ink)',textTransform:'uppercase',background:'var(--tint-purple)',color:'#7c3aed'}}>TOIL</span>
                              <span style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'#d97706',marginLeft:'auto'}}>{it.toilHrs.toFixed(1)}h</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
