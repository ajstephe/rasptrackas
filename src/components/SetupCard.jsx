import { useState } from 'react';
import { AppSelect } from './AppSelect.jsx';
import { DEDUCTION_PRESETS, newDeduction } from '../lib/deductions.js';
import { PAY_RATES } from '../lib/payRates.js';
import { Ico } from './Icons.jsx';

// The one place a new person sets their rank and pay point, shown on Home
// and in Log Overtime until both are chosen, then gone.
export const isSetUp = settings => !!(settings?.rank && settings?.service && PAY_RATES[settings.rank]?.[settings.service]);

export function SetupCard({ settings, saveSett, S, BRASS, where = 'home', setupFlow }) {
  // Deductions typed in during setup, saved only when Finish is tapped.
  const [draft, setDraft] = useState([]);
  const card = { background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:'16px', padding:'16px', marginBottom:'12px', boxShadow:`inset 3px 0 0 ${BRASS}` };
  const done = isSetUp(settings);
  // Once the pay point is in, the same card carries on to an optional third
  // step for monthly deductions, so setup is one box from start to finish.
  if (done && !setupFlow?.ask) return null;

  const rank = PAY_RATES[settings?.rank] ? settings.rank : '';
  const points = rank ? Object.keys(PAY_RATES[rank]) : [];
  const lbl = { display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', fontWeight:900, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' };
  const chevron = <div style={{position:'absolute',right:'13px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={13} c="var(--quiet)" w={2.5}/></div>;
  const step = (n, on) => <span style={{width:'18px',height:'18px',borderRadius:'50%',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'10.5px',fontWeight:900,background:on?BRASS:'var(--surface-2)',color:on?'#fff':'var(--quiet)'}}>{n}</span>;
  const btn = { border:'none', borderRadius:'12px', padding:'12px 16px', fontWeight:800, fontSize:'14px', cursor:'pointer', fontFamily:'inherit', flex:'1 1 140px' };
  // Rows added with "+ Custom" get a name box instead of a fixed label.
  const [customIds, setCustomIds] = useState([]);
  const unused = DEDUCTION_PRESETS.filter(n => !draft.some(d => d.name === n && !customIds.includes(d.id)));
  const addCustom = () => { const d = newDeduction(''); setCustomIds(ids => [...ids, d.id]); setDraft(l => [...l, d]); };
  const finish = () => {
    const keep = draft.filter(d => parseFloat(d.amount) > 0).map(d => ({ ...d, name: d.name.trim() || 'Deduction' }));
    if (keep.length) saveSett({ ...settings, deductions: [...(Array.isArray(settings.deductions) ? settings.deductions : []), ...keep] });
    setupFlow?.answer(false);
  };
  return (
    <div style={card} role="region" aria-label="Set up your pay">
      <div style={{fontSize:'15px',fontWeight:900,color:'var(--ink)',marginBottom:'3px'}}>{where==='home' ? 'Welcome 👋' : 'One quick step first'}</div>
      <div style={{fontSize:'12.5px',color:'var(--muted)',lineHeight:1.5,marginBottom:'14px'}}>
        {where==='home' ? 'A few quick choices so your pay works out right.' : 'Pick your rank and pay point so your overtime is worked out at the right rates.'}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'12px',maxWidth:'720px'}}>
        <div>
          <label htmlFor={`setup-rank-${where}`} style={lbl}>{step(1, !!rank)}Rank</label>
          <div style={{position:'relative'}}>
            <AppSelect aria-label="Rank" id={`setup-rank-${where}`} style={{...S.sel,paddingRight:'36px'}} value={rank} onChange={e=>{
              const r = e.target.value;
              saveSett({ ...settings, rank:r, service:'' });
            }}>
              <option value="">Choose your rank</option>
              {Object.keys(PAY_RATES).map(r=><option key={r} value={r}>{r}</option>)}
            </AppSelect>
            {chevron}
          </div>
        </div>
        <div>
          <label htmlFor={`setup-pp-${where}`} style={lbl}>{step(2, done)}Pay point</label>
          <div style={{position:'relative'}}>
            <AppSelect aria-label="Pay point" id={`setup-pp-${where}`} disabled={!rank} style={{...S.sel,paddingRight:'36px',opacity:rank?1:0.55,cursor:rank?'pointer':'not-allowed'}} value={rank ? (settings.service||'') : ''} onChange={e=>{ saveSett({ ...settings, service:e.target.value }); if (e.target.value) setupFlow?.done(); }}>
              <option value="">{rank ? 'Choose your pay point' : 'Choose your rank first'}</option>
              {points.map(p=><option key={p} value={p}>{p}</option>)}
            </AppSelect>
            {chevron}
          </div>
          <div style={{fontSize:'11.5px',color:'var(--muted)',marginTop:'6px',lineHeight:1.45}}>It's on your payslip, e.g. "{rank==='Sergeant' ? 'SGT 3' : 'PC 4'}".</div>
        </div>
      </div>
      {/* Step 3, optional: monthly deductions, right here in the same box. */}
      <div style={{borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'14px',maxWidth:'720px',opacity:done?1:0.5}}>
        <div style={lbl}>{step(3, done && draft.some(d=>parseFloat(d.amount)>0))}Monthly deductions <span style={{fontWeight:700,textTransform:'none',letterSpacing:0}}>· optional</span></div>
        <div style={{fontSize:'12.5px',color:'var(--muted)',lineHeight:1.5,marginBottom:'10px'}}>
          Things like ATOC, Federation subs, Police Mutual or regular savings. Adding them makes your take-home pay more accurate. You can always add these at a later date.
        </div>
        {done && <>
          {draft.length>0 && <div style={{display:'flex',flexDirection:'column',gap:'6px',marginBottom:'10px'}}>
            {draft.map(d=>(
              <div key={d.id} style={{background:'var(--surface-2)',borderRadius:'12px',padding:'8px 8px 8px 12px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                {customIds.includes(d.id)
                  ? <input aria-label="Deduction name" autoFocus maxLength={40} value={d.name} placeholder="Name, e.g. Gym" onChange={e=>{ const v=e.target.value; setDraft(l=>l.map(x=>x.id===d.id?{...x,name:v}:x)); }} style={{...S.inp,flex:1,minWidth:0,background:'var(--surface)',padding:'9px 10px',fontSize:'16px',fontWeight:700}}/>
                  : <span style={{flex:1,minWidth:0,fontSize:'14px',fontWeight:800,color:'var(--ink)'}}>{d.name}</span>}
                <div style={{position:'relative',flex:'0 0 110px'}}>
                  <span style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',fontWeight:800,color:'var(--quiet)',fontSize:'14px'}}>£</span>
                  <input aria-label={`${d.name||'Deduction'} monthly amount`} inputMode="decimal" autoFocus={!customIds.includes(d.id)} value={d.amount} placeholder="0.00" onChange={e=>{ const v=e.target.value.replace(/[^0-9.]/g,''); if (/^\d{0,6}(\.\d{0,2})?$/.test(v)) setDraft(l=>l.map(x=>x.id===d.id?{...x,amount:v}:x)); }} style={{...S.inp,background:'var(--surface)',padding:'9px 10px 9px 22px',fontSize:'16px',textAlign:'right'}}/>
                </div>
                <button type="button" aria-label={`Remove ${d.name||'deduction'}`} onClick={()=>{ setDraft(l=>l.filter(x=>x.id!==d.id)); setCustomIds(ids=>ids.filter(i=>i!==d.id)); }} style={{background:'none',border:'none',padding:'6px',cursor:'pointer',display:'flex'}}><Ico n="x" s={14} c="var(--quiet)"/></button>
              </div>
              {/* Before tax & NI is for salary sacrifice (Cycle2Work starts there). */}
              <div role="group" aria-label={`${d.name||'Deduction'}: when it comes off`} style={{display:'flex',gap:'4px',marginTop:'6px',marginRight:'34px',background:'var(--surface)',borderRadius:'9px',padding:'3px'}}>
                {[['after','After tax'],['before','Before tax & NI']].map(([k,l])=>(
                  <button key={k} type="button" aria-pressed={d.when===k} onClick={()=>setDraft(list=>list.map(x=>x.id===d.id?{...x,when:k}:x))} style={{flex:1,border:'none',borderRadius:'7px',padding:'5px 4px',fontSize:'11.5px',fontWeight:800,cursor:'pointer',fontFamily:'inherit',background:d.when===k?BRASS:'transparent',color:d.when===k?'#fff':'var(--muted)'}}>{l}</button>
                ))}
              </div>
              </div>
            ))}
          </div>}
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'14px'}}>
            {unused.map(n=><button key={n} type="button" onClick={()=>setDraft(l=>[...l,newDeduction(n)])} style={{background:'var(--chip-bg)',border:'none',borderRadius:'999px',padding:'6px 11px',fontSize:'11.5px',fontWeight:800,color:'var(--ink)',cursor:'pointer',fontFamily:'inherit'}}>+ {n}</button>)}
            <button type="button" onClick={addCustom} style={{background:'transparent',border:'1.5px dashed var(--quiet)',borderRadius:'999px',padding:'5px 11px',fontSize:'11.5px',fontWeight:800,color:'var(--ink)',cursor:'pointer',fontFamily:'inherit'}}>+ Custom</button>
          </div>
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
            <button type="button" onClick={()=>setupFlow?.answer(false)} style={{...btn,background:'var(--surface-2)',color:'var(--ink)'}}>{draft.length?'Skip for now':'Not right now'}</button>
            <button type="button" onClick={finish} style={{...btn,background:BRASS,color:'#fff'}}>Finish setup</button>
          </div>
          <div style={{fontSize:'11px',color:'var(--quiet)',marginTop:'8px'}}>Choose "Before tax &amp; NI" for salary sacrifice, like Cycle2Work. Skipped months and amount changes can be set in More › Monthly deductions.</div>
        </>}
      </div>
    </div>
  );
}
