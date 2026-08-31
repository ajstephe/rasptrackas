import { fmt, fmtHM, fmtGBP } from '../lib/format.js';
import { toMinutesOfDay, shiftDurationMinutes, generateShiftTimesLine } from '../lib/shiftTimes.js';
import { getRates, PA_LABELS, PA_RATES, RATE_TIER_MULT } from '../lib/payRates.js';
import { useCountUp } from '../lib/useCountUp.js';
import { Ico } from './Icons.jsx';
import { TimeSelect } from './TimeSelect.jsx';
import { SegSlider } from './SegSlider.jsx';

// ─── Log Overtime tab ────────────────────────────────────────────────────────
// Extracted verbatim from App.jsx's tab==='add' block — no behaviour change.
// The densest of the six tabs (live shift-time/rate/TOIL preview logic), so
// everything it touches comes in as an explicit prop rather than trying to
// bundle it into one opaque object.
export function TabLogOvertime({
  editing, setEditing, setTab, settings, isWide, S, MONO, BRASS,
  form, setForm, todayStr, notesRef, effectiveTier, preview, handleSave, justSaved,
  carmsToggleRef, focusCarmsToggle, setDatePickerMonth, setDatePickerFor,
  syncShiftTimesIntoForm, animClass='fi',
}) {
  // Every other headline money figure in the app (Net pay, Gross YTD, TOIL
  // balance, CARMS outstanding) counts up rather than jumping when it
  // changes — this preview was the one exception. Shorter duration than
  // those (400ms vs 700ms) since this one can change on every keystroke
  // while actively filling the form in, not just once per data refresh.
  const animatedPreviewGross = useCountUp(preview.gross, 400);
  const animatedPreviewNet = useCountUp(preview.net, 400);
  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:isWide?'14px':'calc(160px + env(safe-area-inset-bottom))'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'18px'}}>
        {editing&&<button onClick={()=>{setEditing(null);setTab('months');}} aria-label="Cancel editing" style={{background:'var(--chip-bg)',border:'none',borderRadius:'10px',padding:'8px',cursor:'pointer',display:'flex'}}><Ico n="back" s={16}/></button>}
        <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:0,letterSpacing:'-0.5px'}}>{editing?'Edit Record':'Log Overtime'}</h2>
      </div>

      {!settings.rank||!settings.service ? (
        /* ── blocked until rank & pay point are configured — no figures can be entered until then ── */
        <div style={{background:'var(--tint-red)',border:'1.5px solid var(--border-2)',borderRadius:'18px',padding:'26px 20px',textAlign:'center'}}>
          <div style={{width:'52px',height:'52px',borderRadius:'50%',background:'var(--tint-red)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
            <Ico n="uPlus" s={24} c="#dc2626"/>
          </div>
          <div style={{fontWeight:900,fontSize:'15px',color:'var(--text-red-deep)',marginBottom:'6px'}}>Setup Required</div>
          <div style={{fontSize:'12px',color:'var(--text-red-deep)',lineHeight:1.6,marginBottom:'16px'}}>You need to select your rank and pay point in More.. before you can log overtime. This ensures your pay is calculated correctly from the start.</div>
          <button onClick={()=>setTab('settings')} style={{background:'#dc2626',border:'none',borderRadius:'11px',padding:'12px 22px',fontWeight:900,fontSize:'12px',color:'#fff',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(220,38,38,0.3)'}}>Go to More.. →</button>
        </div>
      ) : (
      <>
      {/* date + duty + notes */}
      <div style={S.card}>
        {isWide ? (
          <div style={{display:'flex',gap:'12px',marginBottom:'13px'}}>
            <div style={{flex:'0 0 calc(50% - 6px)',minWidth:0}}>
              <label style={{...S.lbl,color:'var(--ink)'}}>Date</label>
              <button onClick={()=>{ setDatePickerMonth((form.date||todayStr).slice(0,7)); setDatePickerFor('shift'); }} style={{...S.inp,display:'block',boxSizing:'border-box',width:'100%',height:'46px',textAlign:'left',cursor:'pointer',fontFamily:'inherit'}}>
                {new Date((form.date||todayStr)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
              </button>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <label style={{...S.lbl,color:'var(--ink)'}}>Duty / Reason</label>
              <input type="text" placeholder="e.g. MPL7XX, PXX" style={{...S.inp,width:'100%',boxSizing:'border-box'}} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>
            </div>
          </div>
        ) : (
          <>
            <div style={{marginBottom:'13px'}}>
              <label style={{...S.lbl,color:'var(--ink)'}}>Date</label>
              <input type="date" style={{...S.inp,display:'block',boxSizing:'border-box',height:'46px'}} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
            </div>
            <div style={{marginBottom:'13px'}}><label style={{...S.lbl,color:'var(--ink)'}}>Duty / Reason</label><input type="text" placeholder="e.g. MPL7XX, PXX" style={S.inp} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></div>
          </>
        )}

        {(()=>{
          // Desktop-only: Rostered/Actual (or, in manual-entry mode,
          // a short explainer in its place) sits beside the rate
          // section + Protection Allowance instead of everything
          // stacking full-width one after another. Off on mobile.
          const showTwoCol = isWide;

          // Manual Override — auto-calculated shift times/rate is now
          // the default; flip this on to fall back to the classic
          // free-entry hours grid instead.
          const rosteredActualBlock = (
            <div style={{marginBottom:showTwoCol?0:'13px',display:'flex',flexDirection:'column',flex:showTwoCol?1:'none'}}>
              <div style={{display:'flex',flexDirection:showTwoCol?'column':'row',alignItems:showTwoCol?'flex-start':'center',justifyContent:showTwoCol?'flex-start':'space-between',gap:showTwoCol?'8px':0,background:'var(--tint-blue)',border:'1.5px solid var(--border-2)',borderRadius:'13px',padding:'12px 13px'}}>
                <div style={{fontSize:'14px',fontWeight:900,color:'var(--text-navy)'}}>Rostered CARM Shift / Actual Shift</div>
                <button role="switch" aria-checked={!form.recordShiftTimes} onClick={()=>{
                    const switchingToManual = form.recordShiftTimes; // currently auto → about to go manual
                    setForm(f=>syncShiftTimesIntoForm({...f, recordShiftTimes:!switchingToManual, otRateTier: !switchingToManual && !f.otRateTier ? 'hours133' : f.otRateTier}));
                  }} style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',padding:0,fontFamily:'inherit',cursor:'pointer',flexShrink:0}}>
                  <span style={{fontSize:'9px',fontWeight:600,color:'var(--muted)'}}>Input Hours Manually</span>
                  <div style={{width:'32px',height:'18px',borderRadius:'10px',position:'relative',flexShrink:0,transition:'background 0.2s cubic-bezier(.4,0,.2,1)',background:!form.recordShiftTimes?'#2563eb':'var(--border)'}}>
                    <div style={{width:'14px',height:'14px',borderRadius:'50%',background:'#fff',position:'absolute',top:'2px',transition:'left 0.2s cubic-bezier(.4,0,.2,1)',left:!form.recordShiftTimes?'16px':'2px',boxShadow:'0 1px 2px rgba(0,0,0,0.3)'}}/>
                  </div>
                </button>
              </div>

              {form.recordShiftTimes&&(
                <div style={{background:'var(--tint-blue)',border:'1.5px solid var(--border-2)',borderTop:'none',borderRadius:'0 0 13px 13px',marginTop:'-13px',padding:'15px 13px 13px',flex:showTwoCol?1:'none',display:'flex',flexDirection:'column',justifyContent:form.dutyType==='rdw'?'center':'flex-start'}}>
                  <div style={{height:'2px'}}/>

                  {/* Normal Duty vs Rest Day Working (RDW) — on RDW there's no
                      roster to compare against, so the whole shift is overtime */}
                  <SegSlider activeKey={form.dutyType==='rdw'?'rdw':'normal'} trackStyle={{display:'flex',gap:'6px',background:'var(--tint-blue-2)',borderRadius:'13px',padding:'3px',marginBottom:'13px'}} indicatorStyle={{background:'#fff',borderRadius:'9px',boxShadow:'0 2px 6px rgba(37,99,235,0.25)'}}>
                    <button data-seg-key="normal" onClick={()=>setForm(f=>syncShiftTimesIntoForm({...f,dutyType:'normal'}))} style={{position:'relative',zIndex:1,flex:1,border:'none',background:'transparent',padding:'8px 4px',borderRadius:'9px',fontFamily:'inherit',fontWeight:800,fontSize:'11px',color:'#2563eb',cursor:'pointer'}}>Normal Duty</button>
                    <button data-seg-key="rdw" onClick={()=>setForm(f=>syncShiftTimesIntoForm({...f,dutyType:'rdw',rosteredStart:'',rosteredEnd:''}))} style={{position:'relative',zIndex:1,flex:1,border:'none',background:'transparent',padding:'8px 4px',borderRadius:'9px',fontFamily:'inherit',fontWeight:800,fontSize:'11px',color:'#2563eb',cursor:'pointer'}}>Rest Day Working (RDW)</button>
                  </SegSlider>

                  {form.dutyType!=='rdw' && (
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px'}}>
                        <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#2563eb'}}/>
                        <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Rostered CARM Shift</div>
                      </div>
                      <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'5px'}}>Quick presets</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'5px',marginBottom:'12px'}}>
                        {[['07:00','15:00'],['07:00','19:00'],['08:00','20:00'],['13:00','23:00']].map(([start,end])=>{
                          const isSelected = form.rosteredStart===start && form.rosteredEnd===end;
                          return (
                            <button key={start+end} onClick={()=>setForm(f=>syncShiftTimesIntoForm(isSelected ? {...f,rosteredStart:'',rosteredEnd:''} : {...f,rosteredStart:start,rosteredEnd:end}))} style={{padding:'7px 2px',borderRadius:'9px',border:isSelected?'1.5px solid #2563eb':'1px solid var(--border-2)',background:isSelected?'var(--tint-blue)':'var(--surface)',color:isSelected?'#2563eb':'var(--muted)',fontWeight:800,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',whiteSpace:'nowrap'}}>
                              {start.replace(':','')}–{end.replace(':','')}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'18px',marginBottom:'5px'}}>
                        <div><label style={{...S.lbl,marginBottom:'5px'}}>Start</label>
                          <TimeSelect value={form.rosteredStart} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,rosteredStart:v}))} label="Rostered Start" BRASS={BRASS}/>
                        </div>
                        <div><label style={{...S.lbl,marginBottom:'5px'}}>End</label>
                          <TimeSelect value={form.rosteredEnd} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,rosteredEnd:v}))} label="Rostered End" BRASS={BRASS}/>
                        </div>
                      </div>
                      {form.rosteredStart&&form.rosteredEnd&&toMinutesOfDay(form.rosteredEnd)<=toMinutesOfDay(form.rosteredStart)&&(
                        <div style={{fontSize:'9.5px',fontWeight:700,color:'#2563eb',marginBottom:'12px'}}>↷ Ends the next day</div>
                      )}
                    </>
                  )}

                  {form.dutyType!=='rdw' && (
                    <div style={{height:'1px',background:'var(--border)',margin:'14px 0'}}/>
                  )}

                  <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px'}}>
                    <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#2563eb'}}/>
                    <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Actual Shift Worked</div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'18px'}}>
                    <div><label style={{...S.lbl,marginBottom:'5px'}}>Start</label>
                      <TimeSelect value={form.actualStart} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,actualStart:v}))} label="Actual Start" BRASS={BRASS}/>
                    </div>
                    <div><label style={{...S.lbl,marginBottom:'5px'}}>End</label>
                      <TimeSelect value={form.actualEnd} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,actualEnd:v}))} label="Actual End" BRASS={BRASS}/>
                    </div>
                  </div>
                  {form.actualStart&&form.actualEnd&&toMinutesOfDay(form.actualEnd)<=toMinutesOfDay(form.actualStart)&&(
                    <div style={{fontSize:'9.5px',fontWeight:700,color:'#2563eb',marginTop:'7px'}}>↷ Ends the next day</div>
                  )}
                  {form.dutyType==='rdw' && (
                    <div style={{fontSize:'9.5px',fontWeight:600,color:'#3b82f6',marginTop:'10px',lineHeight:1.5}}>On a Rest Day Working (RDW) shift, the whole shift counts as overtime at the rate you select below — no rostered comparison needed.</div>
                  )}
                </div>
              )}

              {/* Manual entry mode has no Rostered/Actual times to show
                  — on mobile that just means nothing renders here, same
                  as before. On desktop, where this box now always sits
                  beside the rate section, an empty box would leave an
                  odd gap next to it, so it shows a short explainer
                  instead, centred to fill the stretched height. */}
              {!form.recordShiftTimes && showTwoCol && (
                <div style={{background:'var(--tint-blue)',border:'1.5px solid var(--border-2)',borderTop:'none',borderRadius:'0 0 13px 13px',marginTop:'-13px',padding:'15px 13px 13px',flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
                  <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'var(--tint-blue-2)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'12px'}}><Ico n="edit" s={20} c="#2563eb"/></div>
                  <div style={{fontWeight:900,fontSize:'13.5px',color:'var(--text-navy)',marginBottom:'6px'}}>Manual Entry</div>
                  <div style={{fontSize:'10.5px',color:'#3b82f6',fontWeight:600,lineHeight:1.6,maxWidth:'260px'}}>Recording overtime hours directly against each rate tier instead of comparing rostered vs actual shift times. Switch back if this shift fits a single tier.</div>
                </div>
              )}
            </div>
          );

          const notesBlock = (
            <div style={{marginBottom:'13px'}}><label style={{...S.lbl,color:'var(--ink)'}}>Notes</label><textarea ref={notesRef} rows="4" placeholder="Shift notes or incident details..." style={{...S.ta,lineHeight:1.5}} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}
              onFocus={e=>{
                // Cursor lands on the blank line left after the auto-generated
                // shift-times summary — but only on the person's own tap into
                // the box, never forced automatically (that pops the keyboard
                // up and blocks the screen right after picking a time).
                const line = generateShiftTimesLine(form);
                if (line) {
                  const pos = line.length+2;
                  const target = e.target;
                  setTimeout(()=>{ try{ target.setSelectionRange(pos,pos); }catch(_){} },0);
                }
              }}/></div>
          );

          const otRateBlock = (()=>{
            const formRates = getRates(settings.rank, settings.service, form.date||todayStr);

            if (!form.recordShiftTimes) {
              // classic manual entry — unchanged, still the fallback for
              // shifts that genuinely span more than one rate tier
              return (
                <div style={{background:'var(--tint-blue)',border:'1.5px solid var(--border-2)',borderRadius:'13px',padding:'14px 13px'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-blue-deep)',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',marginBottom:'4px'}}>Overtime Hours</div>
                  <div style={{fontSize:'9px',fontWeight:600,color:'var(--muted)',textAlign:'center',marginBottom:'13px'}}>Record only the hours worked on overtime — not your whole shift</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'9px'}}>
                    {['hours133','hours150','hours200'].map((h,i)=>(
                      <div key={h} style={{textAlign:'center'}}>
                        <label style={{...S.lbl,color:'#3b82f6',textAlign:'center',display:'block'}}>{[1.33,1.5,2.0][i]}x</label>
                        <input type="number" step="0.25" inputMode="decimal" placeholder="0" style={{...S.inp,textAlign:'center',fontWeight:900,background:'var(--surface)',fontSize:'17px',padding:'11px 6px'}} value={form[h]} onChange={e=>setForm({...form,[h]:e.target.value})}/>
                        <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:700,marginTop:'4px'}}>£{(formRates[['r133','r150','r200'][i]]||0).toFixed(2)}/hr</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            // Record Shift Times is on — one rate for the whole shift,
            // hours calculated from rostered/actual times (still editable,
            // for a recall the times themselves don't capture).
            const tier = form.otRateTier || 'hours133';
            const otHours = parseFloat(form[tier])||0;
            const basisReady = form.dutyType==='rdw' ? !!(form.actualStart&&form.actualEnd) : !!(form.rosteredStart&&form.rosteredEnd&&form.actualStart&&form.actualEnd);
            let basisText = 'Set your shift times above to calculate overtime';
            if (basisReady) {
              const actualDur = shiftDurationMinutes(form.actualStart, form.actualEnd)/60;
              basisText = form.dutyType==='rdw'
                ? `RDW — full ${actualDur.toFixed(2).replace(/\.00$/,'')}h actual shift counts as overtime`
                : `${actualDur.toFixed(1)}h actual − ${(shiftDurationMinutes(form.rosteredStart,form.rosteredEnd)/60).toFixed(1)}h rostered = ${otHours.toFixed(2).replace(/\.00$/,'')}h overtime`;
            }

            return (
              <div style={{background:'var(--tint-blue)',border:'1.5px solid var(--border-2)',borderRadius:'13px',padding:'12px 13px'}}>
                <div className="hint-pulse" style={{fontSize:'10px',fontWeight:900,color:'var(--text-blue-deep)',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',marginBottom:'9px'}}>Select O/T Rate for this Shift</div>
                <SegSlider activeKey={tier} trackStyle={{display:'flex',gap:'6px',marginBottom:'9px'}} indicatorStyle={{background:BRASS,borderRadius:'10px',boxShadow:'0 4px 11px rgba(184,130,63,0.35)'}}>
                  {['hours133','hours150','hours200'].map((h,i)=>(
                    <button key={h} data-seg-key={h} onClick={()=>setForm(f=>{
                      if (f.otRateTier===h) return f;
                      const val = f.otRateTier ? f[f.otRateTier] : '';
                      return {...f, otRateTier:h, hours133:'', hours150:'', hours200:'', [h]:val};
                    })} style={{position:'relative',zIndex:1,flex:1,padding:'8px 4px',borderRadius:'10px',border:'none',fontFamily:'inherit',fontWeight:900,fontSize:'12px',cursor:'pointer',background:'transparent',color:tier===h?'#fff':'var(--muted)'}}>{[1.33,1.5,2.0][i]}x</button>
                  ))}
                </SegSlider>
                <div style={{background:'var(--surface)',borderRadius:'10px',padding:'9px',textAlign:'center'}}>
                  <label style={{...S.lbl,marginBottom:'4px',display:'block'}}>Overtime Hours</label>
                  <input type="number" step="0.25" inputMode="decimal" style={{width:'100%',boxSizing:'border-box',textAlign:'center',fontWeight:600,fontSize:'17px',border:'none',background:'transparent',fontFamily:MONO,color:'var(--ink)'}}
                    value={form[tier]}
                    onChange={e=>setForm({...form, otAuto:false, [tier]:e.target.value})}/>
                  {form.otAuto
                    ? <span style={{display:'inline-block',fontSize:'8px',fontWeight:800,padding:'2px 6px',borderRadius:'6px',marginTop:'4px',background:'var(--tint-green-2)',color:'var(--text-green-deep)'}}>auto-calculated</span>
                    : <span onClick={()=>setForm({...form, otAuto:true})} style={{display:'inline-block',fontSize:'8px',fontWeight:800,padding:'2px 6px',borderRadius:'6px',marginTop:'4px',background:'var(--tint-amber-2)',color:'var(--text-amber-deep)',cursor:'pointer'}}>edited — tap to reset</span>}
                </div>
                <div style={{fontSize:'9px',color:'var(--muted)',textAlign:'center',marginTop:'6px',lineHeight:1.4}}>{basisText}</div>
              </div>
            );
          })();

          // Take As — Pay / TOIL / Mix — shown whenever there's a single clear
          // rate to bank TOIL against, whether that's from auto-calc
          // (form.otRateTier) or manual entry (exactly one tier box filled in)
          const takeAsBlock = effectiveTier && (parseFloat(form[effectiveTier])||0) > 0 && (()=>{
            const tier = effectiveTier;
            const total = parseFloat(form[tier])||0;
            const toilH = Math.min(total, parseFloat(form.toilHours)||0);
            const payH = Math.max(0, total-toilH);
            return (
              <div style={{background:'#6d28d9',border:'none',borderRadius:'13px',padding:'14px 13px',marginTop:showTwoCol?0:'13px'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'#fff',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',marginBottom:'13px'}}>Take Overtime As</div>
                <SegSlider activeKey={form.takeAs} trackStyle={{display:'flex',gap:'6px',background:'rgba(0,0,0,0.18)',borderRadius:'11px',padding:'3px'}} indicatorStyle={{background:'#fff',borderRadius:'9px',boxShadow:'0 2px 6px rgba(0,0,0,0.25)'}}>
                  {[['pay','Pay','var(--text-blue-deep)'],['toil','TOIL','#6d28d9'],['mix','Mix','var(--muted)']].map(([m,lbl,col])=>(
                    <button key={m} data-seg-key={m} onClick={()=>setForm(f=>{
                      const t = parseFloat(f[tier])||0;
                      const th = m==='pay' ? 0 : m==='toil' ? t : (parseFloat(f.toilHours)||0);
                      return {...f, takeAs:m, toilHours: th?String(th):'0'};
                    })} style={{position:'relative',zIndex:1,flex:1,border:'none',background:'transparent',padding:'8px 4px',borderRadius:'9px',fontFamily:'inherit',fontWeight:800,fontSize:'11px',color:form.takeAs===m?col:'rgba(255,255,255,0.8)',cursor:'pointer'}}>{lbl}</button>
                  ))}
                </SegSlider>
                {form.takeAs==='mix' && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginTop:'12px'}}>
                    <div style={{background:'var(--tint-blue)',borderRadius:'13px',padding:'10px',textAlign:'center'}}>
                      <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-blue-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>Pay Hours</div>
                      <input type="number" step="0.25" inputMode="decimal" style={{width:'100%',boxSizing:'border-box',textAlign:'center',fontWeight:900,fontSize:'17px',border:'none',background:'var(--surface)',borderRadius:'8px',padding:'7px',fontFamily:'inherit',color:'var(--ink)'}}
                        value={payH.toFixed(2).replace(/\.00$/,'')}
                        onChange={e=>{ let v=parseFloat(e.target.value); if(isNaN(v))v=0; v=Math.max(0,Math.min(total,v)); setForm({...form, toilHours:String(total-v)}); }}/>
                    </div>
                    <div style={{background:'var(--tint-purple)',borderRadius:'13px',padding:'10px',textAlign:'center'}}>
                      <div style={{fontSize:'10px',fontWeight:900,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>TOIL Hours</div>
                      <input type="number" step="0.25" inputMode="decimal" style={{width:'100%',boxSizing:'border-box',textAlign:'center',fontWeight:900,fontSize:'17px',border:'none',background:'var(--surface)',borderRadius:'8px',padding:'7px',fontFamily:'inherit',color:'var(--ink)'}}
                        value={toilH.toFixed(2).replace(/\.00$/,'')}
                        onChange={e=>{ let v=parseFloat(e.target.value); if(isNaN(v))v=0; v=Math.max(0,Math.min(total,v)); setForm({...form, toilHours:String(v)}); }}/>
                    </div>
                  </div>
                )}
                {toilH>0 && (
                  <div style={{marginTop:'12px',background:'var(--tint-purple)',borderRadius:'13px',padding:'10px 13px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:'#6d28d9'}}>{fmtHM(toilH)}h worked @ {RATE_TIER_MULT[tier]}x</span>
                    <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-purple-deep)'}}>{fmtHM(toilH*RATE_TIER_MULT[tier])}h banked</span>
                  </div>
                )}
              </div>
            );
          })();

          const paBlock = (
            <div style={{...S.card,background:'var(--tint-amber)',border:'1px solid var(--border-2)',marginBottom:showTwoCol?0:'10px',flex:showTwoCol?1:'none',display:'flex',flexDirection:'column',justifyContent:'center'}}>
              <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-amber-deep)',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',marginBottom:'13px'}}>Protection Allowance</div>
              <SegSlider activeKey={form.paRate} trackStyle={{display:'flex',gap:'6px'}} indicatorStyle={{background:BRASS,borderRadius:'11px',boxShadow:'0 4px 11px rgba(184,130,63,0.35)'}}>
                {['None','PA1','PA2','PA3'].map(pa=>(
                  <button key={pa} data-seg-key={pa} onClick={()=>setForm({...form,paRate:pa,paSubmitted:(form.paRate==='None'&&pa!=='None')?false:form.paSubmitted})} style={{position:'relative',zIndex:1,flex:1,paddingTop:'9px',paddingBottom:'9px',borderRadius:'11px',border:'none',fontFamily:'inherit',cursor:'pointer',transition:'color 0.14s',background:'transparent',color:form.paRate===pa?'#fff':'#b45309',display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                    <span style={{fontSize:'12px',fontWeight:900}}>{pa}</span>
                    <span style={{fontSize:'9px',fontWeight:700,opacity:form.paRate===pa?0.85:0.55}}>{PA_LABELS[pa]}</span>
                  </button>
                ))}
              </SegSlider>
            </div>
          );

          return showTwoCol ? (
            <>
              <div style={{display:'grid',gridTemplateColumns:'400px 1fr',gap:'20px',alignItems:'stretch',marginBottom:'13px'}}>
                {rosteredActualBlock}
                <div style={{display:'flex',flexDirection:'column',gap:'13px'}}>
                  {otRateBlock}
                  {takeAsBlock}
                  {paBlock}
                </div>
              </div>
              {notesBlock}
            </>
          ) : (
            <>
              {rosteredActualBlock}
              {notesBlock}
              {otRateBlock}
              {takeAsBlock}
              {/* ── Protection Allowance — merged into this same card on
                   mobile instead of sitting in its own separate card
                   right below (still its own two-column card on
                   desktop, inside showTwoCol above). Same PA1/2/3
                   picker, same amber styling, just one fewer card to
                   scroll past. ── */}
              <div style={{borderTop:'1px solid var(--border-2)',marginTop:'13px',paddingTop:'13px'}}>
                <div style={{background:'var(--tint-amber)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'13px'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-amber-deep)',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',marginBottom:'13px'}}>Protection Allowance</div>
                  {/* Same SegSlider every other segmented control in the app
                      uses (Duty Type, O/T Rate, Take As, desktop's own PA
                      picker) — this mobile-merged card used to be the one
                      exception, hand-rolling an instant background swap
                      instead of the sliding brass pill. */}
                  <SegSlider activeKey={form.paRate} trackStyle={{display:'flex',gap:'6px'}} indicatorStyle={{background:BRASS,borderRadius:'11px',boxShadow:'0 4px 11px rgba(184,130,63,0.35)'}}>
                    {['None','PA1','PA2','PA3'].map(pa=>(
                      <button key={pa} data-seg-key={pa} onClick={()=>setForm({...form,paRate:pa,paSubmitted:(form.paRate==='None'&&pa!=='None')?false:form.paSubmitted})} style={{position:'relative',zIndex:1,flex:1,paddingTop:'9px',paddingBottom:'9px',borderRadius:'11px',border:'none',fontFamily:'inherit',cursor:'pointer',transition:'color 0.14s',background:'transparent',color:form.paRate===pa?'#fff':'#b45309',display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                        <span style={{fontSize:'12px',fontWeight:900}}>{pa}</span>
                        <span style={{fontSize:'9px',fontWeight:700,opacity:form.paRate===pa?0.85:0.55}}>{PA_LABELS[pa]}</span>
                      </button>
                    ))}
                  </SegSlider>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* CARMS Submission — independent of logging the shift itself.
          Both default to false via blankForm; editing an existing
          entry reflects whatever it's already set to. PA toggle only
          shown when there's actually a PA rate selected, since
          otherwise there's nothing to track for that part. */}
      <div ref={carmsToggleRef} className={focusCarmsToggle?'carms-pulse':''} style={{...S.card,marginBottom:'11px',border:focusCarmsToggle?'2px solid #2563eb':'1px solid var(--border-2)'}}>
        <div style={{fontWeight:900,fontSize:'15px',color:'var(--ink)',marginBottom:'2px'}}>CARMS Submission</div>
        <div style={{fontSize:'10.5px',color:'var(--quiet)',fontWeight:600,marginBottom:'4px'}}>Toggle when Overtime and/or PA claims have been submitted on the relevant system.</div>
        {(()=>{
          const hasOTHours = (parseFloat(form.hours133)||0) + (parseFloat(form.hours150)||0) + (parseFloat(form.hours200)||0) > 0;
          return (
        <div style={{padding:'11px 0',borderBottom:'1px solid var(--border-2)',opacity:hasOTHours?1:0.45}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>Overtime submitted on CARMS</div>
            </div>
                <button role="switch" aria-checked={hasOTHours&&form.otSubmitted} disabled={!hasOTHours} onClick={()=>{
                  if (form.otSubmitted) { setForm({...form,otSubmitted:false}); return; }
                  setDatePickerMonth(todayStr.slice(0,7));
                  setDatePickerFor('ot');
                }} style={{width:'42px',height:'24px',borderRadius:'14px',position:'relative',border:'none',padding:0,cursor:hasOTHours?'pointer':'default',flexShrink:0,background:(hasOTHours&&form.otSubmitted)?'#059669':'var(--border)',transition:'background 0.15s cubic-bezier(.4,0,.2,1)'}}>
                  <div style={{width:'18px',height:'18px',borderRadius:'50%',background:'#fff',position:'absolute',top:'3px',left:(hasOTHours&&form.otSubmitted)?'21px':'3px',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.15s cubic-bezier(.4,0,.2,1)'}}/>
                </button>
          </div>
          {form.otSubmitted&&(
            <div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'10px',marginTop:'9px'}}>
              <div style={{fontSize:'10px',fontWeight:900,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'5px'}}>Date submitted</div>
              {isWide ? (
                <button onClick={()=>{ setDatePickerMonth((form.otSubmittedDate||todayStr).slice(0,7)); setDatePickerFor('ot'); }} style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'var(--ink)',textAlign:'left',cursor:'pointer'}}>
                  {new Date((form.otSubmittedDate||todayStr)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
                </button>
              ) : (
                <input type="date" value={form.otSubmittedDate||todayStr} onChange={e=>setForm({...form,otSubmittedDate:e.target.value})} style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'var(--ink)'}}/>
              )}
            </div>
          )}
        </div>
          );
        })()}
        <div style={{padding:'11px 0',opacity:form.paRate==='None'?0.45:1}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>PA Submitted on MetHR</div>
              <div style={{fontFamily:MONO,fontSize:'10px',color:'var(--quiet)',fontWeight:600,marginTop:'1px'}}>{form.paRate==='None' ? 'No PA rate selected for this shift' : `${form.paRate} — ${fmtGBP(PA_RATES[form.paRate]||0)}`}</div>
            </div>
            <button role="switch" aria-checked={form.paRate!=='None'&&form.paSubmitted} disabled={form.paRate==='None'} onClick={()=>{
              if (form.paSubmitted) { setForm({...form,paSubmitted:false}); return; }
              setDatePickerMonth(todayStr.slice(0,7));
              setDatePickerFor('pa');
            }} style={{width:'42px',height:'24px',borderRadius:'14px',position:'relative',border:'none',padding:0,cursor:form.paRate==='None'?'default':'pointer',flexShrink:0,background:(form.paRate!=='None'&&form.paSubmitted)?'#059669':'var(--border)',transition:'background 0.15s cubic-bezier(.4,0,.2,1)'}}>
              <div style={{width:'18px',height:'18px',borderRadius:'50%',background:'#fff',position:'absolute',top:'3px',left:(form.paRate!=='None'&&form.paSubmitted)?'21px':'3px',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.15s cubic-bezier(.4,0,.2,1)'}}/>
            </button>
          </div>
          {form.paRate!=='None'&&form.paSubmitted&&(
            <div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'10px',marginTop:'9px'}}>
              <div style={{fontSize:'10px',fontWeight:900,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'5px'}}>Date submitted</div>
              {isWide ? (
                <button onClick={()=>{ setDatePickerMonth((form.paSubmittedDate||todayStr).slice(0,7)); setDatePickerFor('pa'); }} style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'var(--ink)',textAlign:'left',cursor:'pointer'}}>
                  {new Date((form.paSubmittedDate||todayStr)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
                </button>
              ) : (
                <input type="date" value={form.paSubmittedDate||todayStr} onChange={e=>setForm({...form,paSubmittedDate:e.target.value})} style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'var(--ink)'}}/>
              )}
            </div>
          )}
        </div>
        <div style={{fontSize:'10.5px',color:'var(--quiet)',lineHeight:1.5,marginTop:'4px'}}>Toggles default to <b>off</b> when you log a new shift — you're recording that you worked it, not that you've claimed it on the relevant systems.</div>
      </div>

      {/* live preview — pinned just above the floating Save button on
           mobile (via position:sticky within the scrollable form
           area) once you've scrolled far enough to reach it, instead
           of only being visible if you happen to have scrolled back
           up to where it naturally sits. Desktop is unaffected — its
           Save button is already in-flow at the end of the form. ── */}
      {preview.has&&(
        <div style={{background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)',borderRadius:'15px',padding:'14px 18px',marginBottom:'11px',...(!isWide?{position:'sticky',bottom:'calc(88px + env(safe-area-inset-bottom))',zIndex:24,boxShadow:'0 10px 24px rgba(15,39,68,0.35)'}:{})}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: preview.toilBanked>0?'10px':0}}>
            <div style={{fontSize:'15px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1px'}}>This Shift</div>
            <div style={{display:'flex',gap:'18px',alignItems:'center'}}>
              <div style={{textAlign:'right'}}><div style={{fontSize:'14px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.5px'}}>Gross</div><div style={{fontSize:'23px',fontWeight:900,color:'#fff'}}>{fmt(animatedPreviewGross)}</div></div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'14px',fontWeight:900,color:'#6ee7b7',textTransform:'uppercase',letterSpacing:'0.5px'}}>Net</div>
                <div style={{fontSize:'23px',fontWeight:900,color:'#34d399'}}>{fmt(animatedPreviewNet)}</div>
              </div>
            </div>
          </div>
          {preview.toilBanked>0&&(
            <div style={{borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
              <Ico n="clock" s={11} c="#c4b5fd"/>
              <span style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:'#c4b5fd'}}>+ {fmtHM(preview.toilBanked)}h TOIL banked (not included in Gross/Net above)</span>
            </div>
          )}
        </div>
      )}

      {/* in-flow save button — desktop only. Same handler, same look
           as the floating mobile version below, just placed at the
           natural end of the form instead of fixed over the content,
           since there's no bottom nav here for it to need to float
           above. Sits outside the preview's own conditional so it
           always shows once rank/pay point are set, whether or not
           a preview happens to be showing. */}
      {isWide&&(
        <button onClick={handleSave} disabled={justSaved} className={justSaved?'save-pulse':''} style={{width:'100%',background:justSaved?'#059669':'#dc2626',color:'#fff',boxShadow:justSaved?'0 4px 20px rgba(5,150,105,0.5)':'0 4px 20px rgba(220,38,38,0.5)',padding:'17px',borderRadius:'16px',border:'none',fontWeight:900,fontSize:'15px',fontFamily:'inherit',cursor:justSaved?'default':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'9px',letterSpacing:'-0.2px',marginTop:'18px',transition:'background 0.3s'}}>
          <Ico n={justSaved?'check':'save'} s={18} c="#fff"/>
          {justSaved?'Saved':(editing?'Update Record':'Save Record')}
        </button>
      )}
      </>
      )}
    </div>
  );
}
