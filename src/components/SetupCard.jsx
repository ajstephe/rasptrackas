import { PAY_RATES } from '../lib/payRates.js';
import { Ico } from './Icons.jsx';

// The one place a new person sets their rank and pay point, shown on Home
// and in Log Overtime until both are chosen. Once they are, Home keeps a
// short "you're set up" version with a button to log the first shift.
export const isSetUp = settings => !!(settings?.rank && settings?.service && PAY_RATES[settings.rank]?.[settings.service]);

export function SetupCard({ settings, saveSett, S, BRASS, hasEntries, onLogShift, where = 'home' }) {
  const done = isSetUp(settings);
  if (done && (hasEntries || where !== 'home')) return null;

  const rank = PAY_RATES[settings?.rank] ? settings.rank : '';
  const points = rank ? Object.keys(PAY_RATES[rank]) : [];
  const card = { background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:'16px', padding:'16px', marginBottom:'12px', boxShadow:`inset 3px 0 0 ${BRASS}` };
  const lbl = { display:'block', fontSize:'11px', fontWeight:900, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' };
  const chevron = <div style={{position:'absolute',right:'13px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={13} c="var(--quiet)" w={2.5}/></div>;

  if (done) {
    return (
      <div style={card}>
        <div style={{fontSize:'15px',fontWeight:900,color:'var(--ink)',marginBottom:'3px'}}>You're set up</div>
        <div style={{fontSize:'12.5px',color:'var(--muted)',lineHeight:1.5,marginBottom:'12px'}}>{settings.rank}, {settings.service}. You can change this any time in More.. › Config, rates &amp; payscales.</div>
        <button type="button" onClick={onLogShift} style={{width:'100%',padding:'12px',background:BRASS,border:'none',borderRadius:'11px',color:'#fff',fontWeight:800,fontSize:'13.5px',fontFamily:'inherit',cursor:'pointer'}}>Log your first shift</button>
      </div>
    );
  }

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
            <select id={`setup-rank-${where}`} style={{...S.sel,paddingRight:'36px'}} value={rank} onChange={e=>{
              const r = e.target.value;
              saveSett({ ...settings, rank:r, service:'' });
            }}>
              <option value="">Choose your rank</option>
              {Object.keys(PAY_RATES).map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            {chevron}
          </div>
        </div>
        <div>
          <label htmlFor={`setup-pp-${where}`} style={lbl}>Pay point</label>
          <div style={{position:'relative'}}>
            <select id={`setup-pp-${where}`} disabled={!rank} style={{...S.sel,paddingRight:'36px',opacity:rank?1:0.55,cursor:rank?'pointer':'not-allowed'}} value={rank ? (settings.service||'') : ''} onChange={e=>saveSett({ ...settings, service:e.target.value })}>
              <option value="">{rank ? 'Choose your pay point' : 'Choose your rank first'}</option>
              {points.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            {chevron}
          </div>
          <div style={{fontSize:'11.5px',color:'var(--muted)',marginTop:'6px',lineHeight:1.45}}>It's on your payslip, e.g. "{rank==='Sergeant' ? 'SGT 3' : 'PC 4'}".</div>
        </div>
      </div>
    </div>
  );
}
