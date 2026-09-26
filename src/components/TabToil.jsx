import { useState } from 'react';
import { fmtHrs } from '../lib/format.js';
import { Ico } from './Icons.jsx';
import { useCountUp } from '../lib/useCountUp.js';

// ─── TOIL tab ────────────────────────────────────────────────────────────────
// Balance, a "Record TOIL taken" form, then the ledger — newest entry first,
// one column, each row showing the balance after it. Desktop sets the
// ledger out as a table. Everything it needs comes in as props rather than
// closing over App()'s state directly.
export function TabToil({ isWide, S, MONO, toilLedger, toilTakenForm, setToilTakenForm, addToilTaken, deleteToilTaken, animClass='fi' }) {
  // Counts up/down instead of jumping whenever the balance changes —
  // logging a TOIL shift or recording hours taken in the form below.
  const animatedBalance = useCountUp(toilLedger.balance);
  // Removing a "taken" row asks first, same as every other delete in the
  // app; deleteToilTaken also offers an Undo toast afterwards (App.jsx).
  const [confirmDelId, setConfirmDelId] = useState(null);
  const overdrawn = toilLedger.balance < 0;
  const days = toilLedger.balance / 8;
  const rows = [...toilLedger.rows].reverse();

  const lbl = {display:'block',fontSize:'9.5px',fontWeight:900,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--quiet)',marginBottom:'4px'};
  const field = {...S.inp,padding:'9px 10px',width:'100%',boxSizing:'border-box'};
  const setQuick = h => setToilTakenForm({...toilTakenForm, hours:String(h), minutes:'00'});
  const quickOn = h => String(toilTakenForm.hours)===String(h) && (toilTakenForm.minutes||'00')==='00';

  const balanceCard = (
    <div style={{background:overdrawn?'var(--tint-red)':'var(--tint-purple)',border:'1.5px solid var(--border-2)',borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',justifyContent:'center',marginBottom:isWide?0:'12px'}}>
      <div style={{fontSize:'10px',fontWeight:900,color:overdrawn?'#dc2626':'var(--tag-purple)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'4px'}}>TOIL balance{overdrawn?' · overdrawn':''}</div>
      <div style={{fontFamily:MONO,fontSize:'27px',fontWeight:600,color:overdrawn?'var(--text-red-deep)':'var(--text-purple-deep)'}}>{fmtHrs(animatedBalance)}</div>
      <div style={{fontSize:'11.5px',fontWeight:700,color:overdrawn?'#dc2626':'#7c3aed',marginTop:'2px'}}>About {Math.abs(days).toFixed(1)} {Math.abs(days).toFixed(1)==='1.0'?'day':'days'}{overdrawn?' overdrawn':''} at 8h a day</div>
    </div>
  );

  const takenForm = (
    <div style={{...S.card,marginBottom:isWide?0:'12px',display:'flex',flexDirection:'column',gap:'9px'}}>
      <div style={{...S.lbl,fontSize:'11px'}}>Record TOIL taken</div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.8fr)',gap:'8px'}}>
        <label style={{minWidth:0}}><span style={lbl}>Date</span>
          <input type="date" style={field} value={toilTakenForm.date} onChange={e=>setToilTakenForm({...toilTakenForm,date:e.target.value})}/>
        </label>
        <label style={{minWidth:0}}><span style={lbl}>Hours</span>
          <input type="number" min="0" step="1" inputMode="numeric" placeholder="0" style={{...field,textAlign:'center'}} value={toilTakenForm.hours} onChange={e=>setToilTakenForm({...toilTakenForm,hours:e.target.value})}/>
        </label>
        <label style={{minWidth:0}}><span style={lbl}>Minutes</span>
          <span style={{position:'relative',display:'block'}}>
            <select style={{...field,padding:'9px 20px 9px 8px',textAlign:'center',appearance:'none'}} value={toilTakenForm.minutes} onChange={e=>setToilTakenForm({...toilTakenForm,minutes:e.target.value})}>
              <option value="00">00</option>
              <option value="15">15</option>
              <option value="30">30</option>
              <option value="45">45</option>
            </select>
            <span style={{position:'absolute',right:'6px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={11} c="var(--quiet)" w={2.5}/></span>
          </span>
        </label>
      </div>
      {/* Shortcuts for the two amounts people take most — they only fill
          the Hours/Minutes boxes above, which stay editable. */}
      <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
        {[[4,'Half day · 4h'],[8,'Full day · 8h']].map(([h,t])=>(
          <button key={h} type="button" aria-pressed={quickOn(h)} onClick={()=>setQuick(h)} style={{border:quickOn(h)?'1.5px solid #7c3aed':'1.5px solid transparent',background:'var(--tint-purple)',color:'var(--tag-purple)',borderRadius:'9px',padding:'6px 10px',fontWeight:800,fontSize:'11.5px',fontFamily:'inherit',cursor:'pointer'}}>{t}</button>
        ))}
      </div>
      <input type="text" aria-label="Note" placeholder="Note (optional), e.g. half day, appointment" style={field} value={toilTakenForm.note} onChange={e=>setToilTakenForm({...toilTakenForm,note:e.target.value})}/>
      <button onClick={addToilTaken} style={{width:'100%',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:900,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>Record TOIL taken</button>
    </div>
  );

  const removeCtl = l => l.type!=='taken' ? null : (confirmDelId===l.rawId ? (
    <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>
      <span style={{fontSize:'10.5px',fontWeight:700,color:'#dc2626'}}>Remove?</span>
      <button onClick={()=>{ setConfirmDelId(null); deleteToilTaken(l.rawId); }} aria-label="Confirm remove" style={{background:'#dc2626',border:'none',borderRadius:'7px',padding:'3px 8px',color:'#fff',fontWeight:900,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>Yes</button>
      <button onClick={()=>setConfirmDelId(null)} aria-label="Cancel remove" style={{background:'var(--surface)',border:'1.5px solid var(--border-2)',borderRadius:'7px',padding:'3px 8px',color:'var(--muted)',fontWeight:900,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>No</button>
    </span>
  ) : (
    <button onClick={()=>setConfirmDelId(l.rawId)} aria-label="Remove this TOIL taken entry" style={{display:'inline-flex',alignItems:'center',gap:'3px',background:'none',border:'none',padding:0,color:'#dc2626',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:'pointer'}}>
      <Ico n="trash" s={10} c="#dc2626"/> Remove
    </button>
  ));
  const shortDate = d => new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const change = l => <span style={{color:l.type==='earned'?'#059669':'#dc2626'}}>{l.hours>=0?'+':''}{fmtHrs(l.hours)}</span>;
  const sub = l => l.type==='earned' ? (l.detail||'Banked from a shift') : (l.note==='TOIL taken' ? '' : 'TOIL taken');

  const key = (
    <div style={{display:'flex',gap:'16px',fontSize:'11px',color:'var(--muted)',fontWeight:700,margin:'4px 2px 8px'}}>
      <span style={{display:'flex',alignItems:'center',gap:'6px'}}><span style={{width:'9px',height:'9px',borderRadius:'3px',background:'#059669'}}/>Banked from a shift</span>
      <span style={{display:'flex',alignItems:'center',gap:'6px'}}><span style={{width:'9px',height:'9px',borderRadius:'3px',background:'#dc2626'}}/>TOIL taken</span>
    </div>
  );

  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',marginBottom:'14px',letterSpacing:'-0.5px'}}>TOIL</h2>

      {isWide ? (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.3fr',gap:'16px',alignItems:'stretch',marginBottom:'16px'}}>{balanceCard}{takenForm}</div>
      ) : (<>{balanceCard}{takenForm}</>)}

      <div style={{...S.lbl,fontSize:'11px',margin:'6px 2px 2px'}}>Ledger · newest first</div>
      {key}
      {rows.length===0 ? (
        <div style={{textAlign:'center',padding:'22px 10px 26px'}}>
          <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'var(--tint-purple)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
            <Ico n="moon" s={19} c="#7c3aed" w={2}/>
          </div>
          <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)',marginBottom:'3px'}}>No TOIL activity yet</div>
          <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:600}}>Log a shift as TOIL or Mix, or record TOIL taken above</div>
        </div>
      ) : isWide ? (
        <div style={{...S.card,padding:0,overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
            <thead><tr>
              {['Date','What','Change','Balance',''].map((h,i)=>(
                <th key={i} style={{fontSize:'9.5px',fontWeight:900,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--quiet)',textAlign:i===2||i===3?'right':'left',padding:'11px 14px',borderBottom:'1px solid var(--border)'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(l=>(
                <tr key={l.id} style={{borderBottom:'1px solid var(--border-2)'}}>
                  <td style={{padding:'10px 14px',fontFamily:MONO,fontSize:'12px',color:'var(--muted)',whiteSpace:'nowrap'}}>{shortDate(l.date)}</td>
                  <td style={{padding:'10px 14px'}}><span style={{fontWeight:800,color:'var(--ink)'}}>{l.note}</span> {sub(l)&&<span style={{color:'var(--quiet)',fontSize:'12px'}}>· {sub(l)}</span>}</td>
                  <td style={{padding:'10px 14px',fontFamily:MONO,fontWeight:700,textAlign:'right',whiteSpace:'nowrap'}}>{change(l)}</td>
                  <td style={{padding:'10px 14px',fontFamily:MONO,fontWeight:700,textAlign:'right',whiteSpace:'nowrap',color:l.balanceAfter<0?'var(--text-red-deep)':'var(--ink)'}}>{fmtHrs(l.balanceAfter)}</td>
                  <td style={{padding:'10px 14px',textAlign:'right',whiteSpace:'nowrap'}}>{removeCtl(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{...S.card,padding:0}}>
          {rows.map((l,i)=>(
            <div key={l.id} style={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr) auto',columnGap:'12px',rowGap:'2px',alignItems:'center',padding:'12px 14px',borderTop:i?'1px solid var(--border-2)':'none'}}>
              <span style={{fontFamily:MONO,fontSize:'11px',color:'var(--muted)',whiteSpace:'nowrap'}}>{shortDate(l.date)}</span>
              <span style={{fontSize:'13.5px',fontWeight:800,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.note}</span>
              <span style={{fontFamily:MONO,fontSize:'14px',fontWeight:700,textAlign:'right'}}>{change(l)}</span>
              <span/>
              <span style={{fontSize:'11px',color:'var(--quiet)',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>{sub(l)}{removeCtl(l)}</span>
              <span style={{fontFamily:MONO,fontSize:'10.5px',color:'var(--quiet)',textAlign:'right',whiteSpace:'nowrap'}}>bal {fmtHrs(l.balanceAfter)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
