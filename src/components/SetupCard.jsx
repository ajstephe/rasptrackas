import { AppSelect } from './AppSelect.jsx';
import { PAY_RATES } from '../lib/payRates.js';
import { Ico } from './Icons.jsx';

// The one place a new person sets their rank and pay point, shown on Home
// and in Log Overtime until both are chosen, then gone.
export const isSetUp = settings => !!(settings?.rank && settings?.service && PAY_RATES[settings.rank]?.[settings.service]);

export function SetupCard({ settings, saveSett, S, BRASS, where = 'home', setupFlow }) {
  const card = { background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:'16px', padding:'16px', marginBottom:'12px', boxShadow:`inset 3px 0 0 ${BRASS}` };
  // Straight after the pay point is picked, one more optional question:
  // monthly deductions (Fed subs, ATOC, savings…) so take-home is right
  // from day one. Yes opens the Monthly deductions card; No goes to Home.
  if (isSetUp(settings) && setupFlow?.ask) {
    const btn = { border:'none', borderRadius:'12px', padding:'12px 16px', fontWeight:800, fontSize:'14px', cursor:'pointer', fontFamily:'inherit', flex:'1 1 150px' };
    return (
      <div className="accordion-in" style={card} role="region" aria-label="Monthly deductions">
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
          <div style={{background:'var(--tint-green)',padding:'9px',borderRadius:'12px',display:'flex'}}><Ico n="cash" s={18} c="#059669"/></div>
          <div style={{fontSize:'15px',fontWeight:900,color:'var(--ink)'}}>Do you have monthly deductions?</div>
        </div>
        <div style={{fontSize:'12.5px',color:'var(--muted)',lineHeight:1.5,marginBottom:'14px'}}>
          Things like ATOC, Federation subs, Police Mutual or regular savings. Adding them makes your take-home pay more accurate. You can always add these at a later date.
        </div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button type="button" onClick={()=>setupFlow.answer(false)} style={{...btn,background:'var(--surface-2)',color:'var(--ink)'}}>No thanks</button>
          <button type="button" onClick={()=>setupFlow.answer(true)} style={{...btn,background:BRASS,color:'#fff'}}>Yes, add them</button>
        </div>
      </div>
    );
  }
  if (isSetUp(settings)) return null;

  const rank = PAY_RATES[settings?.rank] ? settings.rank : '';
  const points = rank ? Object.keys(PAY_RATES[rank]) : [];
  const lbl = { display:'block', fontSize:'11px', fontWeight:900, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' };
  const chevron = <div style={{position:'absolute',right:'13px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={13} c="var(--quiet)" w={2.5}/></div>;

  return (
    <div style={card} role="region" aria-label="Set up your pay">
      <div style={{fontSize:'15px',fontWeight:900,color:'var(--ink)',marginBottom:'3px'}}>{where==='home' ? 'Welcome 👋' : 'One quick step first'}</div>
      <div style={{fontSize:'12.5px',color:'var(--muted)',lineHeight:1.5,marginBottom:'14px'}}>
        {where==='home' ? 'Two quick choices so your pay works out right.' : 'Pick your rank and pay point so your overtime is worked out at the right rates.'}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'12px',maxWidth:'720px'}}>
        <div>
          <label htmlFor={`setup-rank-${where}`} style={lbl}>Rank</label>
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
          <label htmlFor={`setup-pp-${where}`} style={lbl}>Pay point</label>
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
    </div>
  );
}
