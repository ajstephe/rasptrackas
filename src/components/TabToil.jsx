import { fmtHM } from '../lib/format.js';
import { Ico } from './Icons.jsx';

// ─── TOIL tab ────────────────────────────────────────────────────────────────
// Extracted verbatim from App.jsx's tab==='graph' block — no behaviour change,
// just given its own file. Everything it needs comes in as props rather than
// closing over App()'s state directly.
export function TabToil({ isWide, S, MONO, toilLedger, toilTakenForm, setToilTakenForm, addToilTaken, deleteToilTaken }) {
  return (
    <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',marginBottom:'14px',letterSpacing:'-0.5px'}}>TOIL</h2>

      {isWide ? (
      /* Desktop: Balance and Redeem sit side by side — both are
          naturally compact, so the extra width is better spent
          putting them next to each other than stacking full-width
          the way mobile has to. ── */
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.3fr',gap:'16px',alignItems:'stretch',marginBottom:'14px'}}>
      <div style={{background:toilLedger.balance<0?'var(--tint-red)':'var(--tint-purple)',border:toilLedger.balance<0?'1.5px solid var(--border-2)':'1.5px solid var(--border-2)',borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
        <div style={{fontSize:'11px',fontWeight:900,color:toilLedger.balance<0?'#dc2626':'#6d28d9',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>TOIL Balance{toilLedger.balance<0?' — Overdrawn':''}</div>
        <div style={{fontFamily:MONO,fontSize:'25px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--text-purple-deep)'}}>{fmtHM(toilLedger.balance)} h</div>
        <div style={{fontSize:'11px',fontWeight:700,color:toilLedger.balance<0?'#dc2626':'#7c3aed',marginTop:'2px'}}>≈ {(toilLedger.balance/8).toFixed(1)} days at 8h/day</div>
      </div>

      <div style={{...S.card,background:'var(--surface)',border:'1.5px solid var(--border-2)'}}>
        <div style={{...S.lbl,fontSize:'11px',marginBottom:'8px'}}>Redeem TOIL</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 52px 80px',gap:'8px',marginBottom:'8px'}}>
          <input type="date" style={{...S.inp,padding:'8px'}} value={toilTakenForm.date} onChange={e=>setToilTakenForm({...toilTakenForm,date:e.target.value})}/>
          <input type="number" min="0" step="1" placeholder="Hrs" style={{...S.inp,padding:'8px',textAlign:'center'}} value={toilTakenForm.hours} onChange={e=>setToilTakenForm({...toilTakenForm,hours:e.target.value})}/>
          <select style={{...S.inp,padding:'8px 4px',textAlign:'center',appearance:'none'}} value={toilTakenForm.minutes} onChange={e=>setToilTakenForm({...toilTakenForm,minutes:e.target.value})}>
            <option value="00">00m</option>
            <option value="15">15m</option>
            <option value="30">30m</option>
            <option value="45">45m</option>
          </select>
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
          <div style={{fontSize:'11px',fontWeight:900,color:toilLedger.balance<0?'#dc2626':'#6d28d9',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>TOIL Balance{toilLedger.balance<0?' — Overdrawn':''}</div>
          <div style={{fontFamily:MONO,fontSize:'25px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--text-purple-deep)'}}>{fmtHM(toilLedger.balance)} h</div>
          <div style={{fontSize:'11px',fontWeight:700,color:toilLedger.balance<0?'#dc2626':'#7c3aed',marginTop:'2px'}}>≈ {(toilLedger.balance/8).toFixed(1)} days at 8h/day</div>
        </div>

        <div style={{borderTop:'1px solid var(--border-2)',marginTop:'16px',paddingTop:'14px'}}>
          <div style={{...S.lbl,fontSize:'11px',marginBottom:'8px'}}>Redeem TOIL</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 52px 80px',gap:'8px',marginBottom:'8px'}}>
            <input type="date" style={{...S.inp,padding:'8px'}} value={toilTakenForm.date} onChange={e=>setToilTakenForm({...toilTakenForm,date:e.target.value})}/>
            <input type="number" min="0" step="1" placeholder="Hrs" style={{...S.inp,padding:'8px',textAlign:'center'}} value={toilTakenForm.hours} onChange={e=>setToilTakenForm({...toilTakenForm,hours:e.target.value})}/>
            <select style={{...S.inp,padding:'8px 4px',textAlign:'center',appearance:'none'}} value={toilTakenForm.minutes} onChange={e=>setToilTakenForm({...toilTakenForm,minutes:e.target.value})}>
              <option value="00">00m</option>
              <option value="15">15m</option>
              <option value="30">30m</option>
              <option value="45">45m</option>
            </select>
          </div>
          <input type="text" placeholder="Note (optional) — e.g. half day, appointment" style={{...S.inp,padding:'8px',marginBottom:'8px'}} value={toilTakenForm.note} onChange={e=>setToilTakenForm({...toilTakenForm,note:e.target.value})}/>
          <button onClick={addToilTaken} style={{width:'100%',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',padding:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>Redeem TOIL</button>
        </div>
      </div>
      )}

      <div style={{...S.lbl,fontSize:'11px',margin:'14px 0 8px'}}>Ledger</div>
      <div style={{fontSize:'11.5px',fontWeight:600,color:'var(--quiet)',lineHeight:1.5,marginBottom:'10px'}}>Green entries post automatically whenever you log a shift as TOIL or Mix. Red entries result when you redeem TOIL in the box above.</div>
      {toilLedger.rows.length===0 ? (
        <div style={{fontSize:'14px',color:'var(--quiet)',textAlign:'center',padding:'20px'}}>No TOIL activity yet</div>
      ) : (
      <div style={isWide?{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}:undefined}>
      {toilLedger.rows.map(l=>(
        <div key={l.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 12px',marginBottom:isWide?0:'8px',borderRadius:'11px',gap:'10px',background:l.type==='earned'?'var(--tint-green)':'var(--tint-red)',border:l.type==='earned'?'1px solid var(--border-2)':'1px solid var(--border-2)'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'13.5px',fontWeight:700,color:'var(--muted)'}}>{l.note}</div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px'}}>
              <span style={{fontSize:'11.5px',color:'var(--quiet)'}}>{new Date(l.date+'T12:00:00').toLocaleDateString('en-GB')}</span>
              {l.type==='taken'&&(
                <button onClick={()=>deleteToilTaken(l.rawId)} style={{flexShrink:0,display:'flex',alignItems:'center',gap:'3px',background:'var(--surface)',border:'1.5px solid var(--border-2)',borderRadius:'7px',padding:'3px 7px',color:'#dc2626',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:'pointer'}}>
                  <Ico n="trash" s={10} c="#dc2626"/> Remove
                </button>
              )}
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
