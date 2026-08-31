import { useState } from 'react';
import { fmtHM } from '../lib/format.js';
import { Ico } from './Icons.jsx';
import { useCountUp } from '../lib/useCountUp.js';

// ─── TOIL tab ────────────────────────────────────────────────────────────────
// Extracted verbatim from App.jsx's tab==='graph' block — no behaviour change,
// just given its own file. Everything it needs comes in as props rather than
// closing over App()'s state directly.
export function TabToil({ isWide, S, MONO, toilLedger, toilTakenForm, setToilTakenForm, addToilTaken, deleteToilTaken, animClass='fi' }) {
  // Counts up/down instead of jumping whenever the balance changes —
  // logging a TOIL shift or redeeming hours in the form below.
  const animatedBalance = useCountUp(toilLedger.balance);
  // Deleting a redemption row used to go straight through on one tap —
  // every other delete in the app (Summary entries, Wipe Data, Delete
  // Account) asks first. deleteToilTaken itself still also offers an Undo
  // toast afterwards (App.jsx), so this is belt-and-braces, not a
  // replacement for it — just bringing this row in line with how
  // destructive taps read everywhere else.
  const [confirmDelId, setConfirmDelId] = useState(null);
  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',marginBottom:'14px',letterSpacing:'-0.5px'}}>TOIL</h2>

      {isWide ? (
      /* Desktop: Balance and Redeem sit side by side — both are
          naturally compact, so the extra width is better spent
          putting them next to each other than stacking full-width
          the way mobile has to. ── */
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.3fr',gap:'16px',alignItems:'stretch',marginBottom:'14px'}}>
      <div style={{background:toilLedger.balance<0?'var(--tint-red)':'var(--tint-purple)',border:toilLedger.balance<0?'1.5px solid var(--border-2)':'1.5px solid var(--border-2)',borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
        <div style={{fontSize:'10px',fontWeight:900,color:toilLedger.balance<0?'#dc2626':'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'4px'}}>TOIL Balance{toilLedger.balance<0?' — Overdrawn':''}</div>
        <div style={{fontFamily:MONO,fontSize:'25px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--text-purple-deep)'}}>{fmtHM(animatedBalance)} h</div>
        <div style={{fontSize:'11px',fontWeight:700,color:toilLedger.balance<0?'#dc2626':'#7c3aed',marginTop:'2px'}}>≈ {(toilLedger.balance/8).toFixed(1)} days at 8h/day</div>
      </div>

      <div style={{...S.card,background:'var(--surface)',border:'1.5px solid var(--border-2)'}}>
        <div style={{...S.lbl,fontSize:'11px',marginBottom:'8px'}}>Redeem TOIL</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 52px 80px',gap:'8px',marginBottom:'8px'}}>
          <input type="date" style={{...S.inp,padding:'8px'}} value={toilTakenForm.date} onChange={e=>setToilTakenForm({...toilTakenForm,date:e.target.value})}/>
          <input type="number" min="0" step="1" placeholder="Hrs" style={{...S.inp,padding:'8px',textAlign:'center'}} value={toilTakenForm.hours} onChange={e=>setToilTakenForm({...toilTakenForm,hours:e.target.value})}/>
          <div style={{position:'relative'}}>
            <select style={{...S.inp,width:'100%',boxSizing:'border-box',padding:'8px 20px 8px 4px',textAlign:'center',appearance:'none'}} value={toilTakenForm.minutes} onChange={e=>setToilTakenForm({...toilTakenForm,minutes:e.target.value})}>
              <option value="00">00m</option>
              <option value="15">15m</option>
              <option value="30">30m</option>
              <option value="45">45m</option>
            </select>
            <div style={{position:'absolute',right:'4px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={11} c="var(--quiet)" w={2.5}/></div>
          </div>
        </div>
        <input type="text" placeholder="Note (optional) — e.g. half day, appointment" style={{...S.inp,padding:'8px',marginBottom:'8px'}} value={toilTakenForm.note} onChange={e=>setToilTakenForm({...toilTakenForm,note:e.target.value})}/>
        <button onClick={addToilTaken} style={{width:'100%',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',padding:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>Redeem TOIL</button>
      </div>
      </div>
      ) : (
      /* Mobile: Balance and Redeem merged into one card instead of
          two stacked boxes — same figures, same redeem form, just a
          divider between them instead of a second card's worth of
          shadow/margin. ── */
      <div style={{...S.card,background:toilLedger.balance<0?'var(--tint-red)':'var(--surface)',border:toilLedger.balance<0?'1.5px solid var(--border-2)':'1px solid var(--border-2)',marginBottom:'14px'}}>
        <div>
          <div style={{fontSize:'10px',fontWeight:900,color:toilLedger.balance<0?'#dc2626':'#6d28d9',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'4px'}}>TOIL Balance{toilLedger.balance<0?' — Overdrawn':''}</div>
          <div style={{fontFamily:MONO,fontSize:'25px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--text-purple-deep)'}}>{fmtHM(animatedBalance)} h</div>
          <div style={{fontSize:'11px',fontWeight:700,color:toilLedger.balance<0?'#dc2626':'#7c3aed',marginTop:'2px'}}>≈ {(toilLedger.balance/8).toFixed(1)} days at 8h/day</div>
        </div>

        <div style={{borderTop:'1px solid var(--border-2)',marginTop:'16px',paddingTop:'14px'}}>
          <div style={{...S.lbl,fontSize:'11px',marginBottom:'8px'}}>Redeem TOIL</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 52px 80px',gap:'8px',marginBottom:'8px'}}>
            <input type="date" style={{...S.inp,padding:'8px'}} value={toilTakenForm.date} onChange={e=>setToilTakenForm({...toilTakenForm,date:e.target.value})}/>
            <input type="number" min="0" step="1" placeholder="Hrs" style={{...S.inp,padding:'8px',textAlign:'center'}} value={toilTakenForm.hours} onChange={e=>setToilTakenForm({...toilTakenForm,hours:e.target.value})}/>
            <div style={{position:'relative'}}>
              <select style={{...S.inp,width:'100%',boxSizing:'border-box',padding:'8px 20px 8px 4px',textAlign:'center',appearance:'none'}} value={toilTakenForm.minutes} onChange={e=>setToilTakenForm({...toilTakenForm,minutes:e.target.value})}>
                <option value="00">00m</option>
                <option value="15">15m</option>
                <option value="30">30m</option>
                <option value="45">45m</option>
              </select>
              <div style={{position:'absolute',right:'4px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={11} c="var(--quiet)" w={2.5}/></div>
            </div>
          </div>
          <input type="text" placeholder="Note (optional) — e.g. half day, appointment" style={{...S.inp,padding:'8px',marginBottom:'8px'}} value={toilTakenForm.note} onChange={e=>setToilTakenForm({...toilTakenForm,note:e.target.value})}/>
          <button onClick={addToilTaken} style={{width:'100%',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',padding:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>Redeem TOIL</button>
        </div>
      </div>
      )}

      <div style={{...S.lbl,fontSize:'11px',margin:'14px 0 8px'}}>Ledger</div>
      <div style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)',lineHeight:1.5,marginBottom:'10px'}}>Green entries post automatically whenever you log a shift as TOIL or Mix. Red entries result when you redeem TOIL in the box above.</div>
      {toilLedger.rows.length===0 ? (
        <div style={{textAlign:'center',padding:'22px 10px 26px'}}>
          <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'var(--tint-purple)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
            <Ico n="moon" s={19} c="#7c3aed" w={2}/>
          </div>
          <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)',marginBottom:'3px'}}>No TOIL activity yet</div>
          <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:600,marginBottom:'14px'}}>Log a TOIL shift or redeem hours above</div>
          {/* The colour legend above (green earns, red redeems) means
              nothing until there's at least one row of each to see it on —
              spelling it out here up front means someone's first-ever
              ledger row doesn't have to be the thing that teaches them
              what colour it is. */}
          <div style={{display:'inline-flex',gap:'16px',fontSize:'10.5px',color:'var(--quiet)',fontWeight:700}}>
            <span style={{display:'flex',alignItems:'center',gap:'5px'}}><span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#059669',flexShrink:0}}/>Banked</span>
            <span style={{display:'flex',alignItems:'center',gap:'5px'}}><span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#dc2626',flexShrink:0}}/>Redeemed</span>
          </div>
        </div>
      ) : (
      <div style={isWide?{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}:undefined}>
      {toilLedger.rows.map((l,i)=>(
        <div key={l.id} className="claim-in" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 12px',marginBottom:isWide?0:'8px',borderRadius:'11px',gap:'10px',background:l.type==='earned'?'var(--tint-green)':'var(--tint-red)',border:l.type==='earned'?'1px solid var(--border-2)':'1px solid var(--border-2)',animationDelay:(Math.min(i,6)*55)+'ms'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'13.5px',fontWeight:700,color:'var(--muted)'}}>{l.note}</div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px'}}>
              <span style={{fontSize:'11.5px',color:'var(--quiet)'}}>{new Date(l.date+'T12:00:00').toLocaleDateString('en-GB')}</span>
              {l.type==='taken'&&(confirmDelId===l.rawId ? (
                <span style={{display:'flex',alignItems:'center',gap:'5px'}}>
                  <span style={{fontSize:'10.5px',fontWeight:700,color:'#dc2626'}}>Remove?</span>
                  <button onClick={()=>{ setConfirmDelId(null); deleteToilTaken(l.rawId); }} aria-label="Confirm remove" style={{flexShrink:0,background:'#dc2626',border:'none',borderRadius:'7px',padding:'3px 8px',color:'#fff',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:'pointer'}}>Yes</button>
                  <button onClick={()=>setConfirmDelId(null)} aria-label="Cancel remove" style={{flexShrink:0,background:'var(--surface)',border:'1.5px solid var(--border-2)',borderRadius:'7px',padding:'3px 8px',color:'var(--muted)',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:'pointer'}}>No</button>
                </span>
              ) : (
                <button onClick={()=>setConfirmDelId(l.rawId)} aria-label="Remove this TOIL redemption" style={{flexShrink:0,display:'flex',alignItems:'center',gap:'3px',background:'var(--surface)',border:'1.5px solid var(--border-2)',borderRadius:'7px',padding:'3px 7px',color:'#dc2626',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:'pointer'}}>
                  <Ico n="trash" s={10} c="#dc2626"/> Remove
                </button>
              ))}
            </div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:l.type==='earned'?'#059669':'#dc2626'}}>{l.hours>=0?'+':''}{fmtHM(l.hours)}h</div>
            <div style={{fontFamily:MONO,fontSize:'10.5px',color:'var(--quiet)'}}>bal: {fmtHM(l.balanceAfter)} h</div>
          </div>
        </div>
      ))}
      </div>
      )}
    </div>
  );
}
