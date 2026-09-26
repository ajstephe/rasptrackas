import { useEffect, useState } from 'react';
import { fmt, fmtHrs, fmtGBP } from '../lib/format.js';
import { toMinutesOfDay, shiftDurationMinutes, generateShiftTimesLine } from '../lib/shiftTimes.js';
import { getRates, PA_LABELS, PA_RATES, RATE_TIER_MULT } from '../lib/payRates.js';
import { useCountUp } from '../lib/useCountUp.js';
import { Ico } from './Icons.jsx';
import { TimeSelect } from './TimeSelect.jsx';
import { SegSlider } from './SegSlider.jsx';

const TIERS = [['hours133','1.33×'],['hours150','1.5×'],['hours200','2×']];
const PRESETS = [['07:00','15:00'],['07:00','19:00'],['08:00','20:00'],['13:00','23:00']];
const hm = mins => { const h = Math.floor(mins/60), m = Math.round(mins%60); return `${h}h${m?` ${m}m`:''}`; };

// ─── Log Overtime tab ────────────────────────────────────────────────────────
// Laid out as five numbered steps, top to bottom, in the order people think
// about a shift: when it was, the hours, how it's paid, whether it's already
// been submitted, then notes. Gross/net and Save share one bar that stays on
// screen. Same fields and behaviour as before — only the arrangement changed.
export function TabLogOvertime({
  editing, setEditing, setTab, goToConfigSetup, settings, isWide, S, MONO, BRASS,
  form, setForm, todayStr, notesRef, effectiveTier, preview, handleSave, justSaved,
  carmsToggleRef, focusCarmsToggle, setDatePickerMonth, setDatePickerFor,
  syncShiftTimesIntoForm, animClass='fi',
}) {
  // Every other headline money figure in the app (Net pay, Gross YTD, TOIL
  // balance, CARMS outstanding) counts up rather than jumping when it
  // changes. Shorter duration than those (400ms vs 700ms) since this one can
  // change on every keystroke while actively filling the form in.
  const animatedPreviewGross = useCountUp(preview.gross, 400);
  const animatedPreviewNet = useCountUp(preview.net, 400);

  // Notes stay folded away until wanted — but the shift-times summary the
  // app writes into them (syncShiftTimesIntoForm) counts as wanted, so they
  // open by themselves once times are set. Folds again after each save.
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => { if (justSaved) setNotesOpen(false); }, [justSaved]);

  const dateLabel = d => new Date((d||todayStr)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  // Glow in the theme's own accent (BRASS is each theme's accent hex).
  const pillShadow = `0 3px 9px color-mix(in srgb, ${BRASS} 35%, transparent)`;
  // iOS Safari zooms the page into any focused input under 16px.
  const inputFont = isWide ? '14px' : '16px';

  const step = (n, title, body, opts={}) => (
    <div ref={opts.ref} className={opts.className} style={{...S.card,padding:isWide?'16px 18px':'15px',marginBottom:'12px',...(opts.style||{})}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'4px'}}>
        <span style={{width:'22px',height:'22px',borderRadius:'50%',background:'var(--text-navy)',color:'var(--surface)',fontSize:'11px',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{n}</span>
        <span style={{fontSize:'14px',fontWeight:900,color:'var(--ink)'}}>{title}</span>
        {opts.optional&&<span style={{fontSize:'10.5px',fontWeight:700,color:'var(--quiet)'}}>optional</span>}
      </div>
      {body}
    </div>
  );

  // Label beside the control on desktop, above it on mobile.
  const row = (label, sub, body, opts={}) => (
    <div style={{display:'grid',gridTemplateColumns:isWide?'150px minmax(0,1fr)':'minmax(0,1fr)',gap:isWide?'14px':'7px',alignItems:isWide&&!opts.top?'center':'start',padding:'11px 0',borderBottom:opts.last?'none':'1px solid var(--border-2)'}}>
      <div style={{paddingTop:isWide&&opts.top?'10px':0}}>
        <div style={{fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}>{label}</div>
        {sub&&<div style={{fontSize:'10.5px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>{sub}</div>}
      </div>
      <div style={{minWidth:0}}>{body}</div>
    </div>
  );

  // Every choice uses the same sliding brass pill: sized to its labels on
  // desktop, full width with equal segments on mobile for easy tapping.
  const seg = (activeKey, options, onPick) => (
    <SegSlider activeKey={activeKey} trackStyle={{display:isWide?'inline-flex':'flex',gap:'2px',background:'var(--chip-bg)',borderRadius:'11px',padding:'3px',maxWidth:'100%'}} indicatorStyle={{background:BRASS,borderRadius:'9px',boxShadow:pillShadow}}>
      {options.map(([k,lbl,sub])=>(
        <button key={k} type="button" data-seg-key={k} aria-pressed={activeKey===k} onClick={()=>onPick(k)} style={{position:'relative',zIndex:1,flex:isWide?'0 0 auto':1,minWidth:0,border:'none',background:'transparent',padding:isWide?'8px 14px':'9px 4px',borderRadius:'9px',fontFamily:'inherit',fontWeight:800,fontSize:'12px',color:activeKey===k?'#fff':'var(--muted)',cursor:'pointer',whiteSpace:'nowrap',transition:'color 0.14s'}}>
          {lbl}{sub&&<span style={{display:isWide?'inline':'block',marginLeft:isWide?'5px':0,fontSize:'10px',fontWeight:700,opacity:activeKey===k?0.85:0.6}}>{sub}</span>}
        </button>
      ))}
    </SegSlider>
  );

  // Where each empty time box's picker opens, so the usual shift is one tap
  // on Done: 07:00 for both start times, and the rostered end 8 hours after
  // the rostered start (15:00 if the start isn't set yet). Only applies
  // while the box is empty; a set time always opens on itself.
  const startTimeFor = key => {
    if (key==='rosteredStart' || key==='actualStart') return '07:00';
    if (key==='rosteredEnd') {
      const [h,m] = (form.rosteredStart||'07:00').split(':').map(Number);
      return `${String((h+8)%24).padStart(2,'0')}:${String(m||0).padStart(2,'0')}`;
    }
    return undefined;
  };

  const timePair = (sKey, eKey, sLbl, eLbl) => {
    const s = form[sKey], e = form[eKey];
    const dur = s&&e ? shiftDurationMinutes(s,e) : 0;
    const overnight = s&&e&&toMinutesOfDay(e)<=toMinutesOfDay(s);
    const extras = (dur>0||overnight) && (
      <span style={{display:'inline-flex',gap:'8px',alignItems:'center'}}>
        {dur>0&&<span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>{hm(dur)}</span>}
        {overnight&&<span style={{fontSize:'10.5px',fontWeight:700,color:'#2563eb'}}>↷ Ends the next day</span>}
      </span>
    );
    const box = {flex:isWide?'0 0 120px':1,minWidth:0};
    return (
      <>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={box}><TimeSelect value={s} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,[sKey]:v}))} label={sLbl} startAt={startTimeFor(sKey)} BRASS={BRASS} MONO={MONO}/></div>
          <span style={{fontSize:'12px',fontWeight:700,color:'var(--quiet)'}}>to</span>
          <div style={box}><TimeSelect value={e} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,[eKey]:v}))} label={eLbl} startAt={startTimeFor(eKey)} BRASS={BRASS} MONO={MONO}/></div>
          {isWide&&extras}
        </div>
        {!isWide&&extras&&<div style={{marginTop:'6px'}}>{extras}</div>}
      </>
    );
  };

  // ── step 2: hours ────────────────────────────────────────────────────────
  // "Shift Time Input" is the default; "Enter Hours" is the classic free-entry
  // grid for shifts that span more than one rate tier.
  const setTimesMode = times => {
    if (form.recordShiftTimes===times) return;
    setForm(f=>syncShiftTimesIntoForm({...f, recordShiftTimes:times, otRateTier: times && !f.otRateTier ? 'hours133' : f.otRateTier}));
  };
  // The two options sit in one grey track with a round "OR" badge on the
  // join, so it reads as a choice of one or the other. Each side keeps
  // clear of the badge (the extra padding on the inner edge). On a phone
  // the icon sits above the text so the explanation line has room.
  const modeBtn = (times, title, desc, icon) => {
    const on = form.recordShiftTimes===times;
    const inner = isWide ? '22px' : '18px';
    return (
      <button type="button" role="radio" aria-checked={on} onClick={()=>setTimesMode(times)} style={{flex:1,minWidth:0,display:'flex',flexDirection:isWide?'row':'column',alignItems:isWide?'center':'flex-start',gap:isWide?'9px':'6px',textAlign:'left',border:'none',borderRadius:'9px',padding:isWide?'8px 10px':'9px 8px',[times?'paddingRight':'paddingLeft']:inner,cursor:'pointer',fontFamily:'inherit',background:on?'var(--surface)':'transparent',boxShadow:on?'0 1px 4px rgba(15,39,68,0.14)':'none',transition:'background 0.15s, box-shadow 0.15s'}}>
        <span style={{width:'26px',height:'26px',borderRadius:'8px',background:on?BRASS:'var(--border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n={icon} s={14} c={on?'#fff':'var(--muted)'} w={2.2}/></span>
        <span style={{minWidth:0}}>
          <span style={{display:'block',fontSize:'12.5px',fontWeight:800,color:on?'var(--ink)':'var(--muted)'}}>{title}</span>
          <span style={{display:'block',fontSize:'10.5px',fontWeight:600,color:'var(--quiet)',marginTop:'1px',lineHeight:1.35}}>{desc}</span>
        </span>
      </button>
    );
  };

  const tier = form.otRateTier || 'hours133';
  const formRates = getRates(settings.rank, settings.service, form.date||todayStr);

  const hoursRows = (() => {
    if (!form.recordShiftTimes) {
      const total = TIERS.reduce((s,[k])=>s+(parseFloat(form[k])||0),0);
      return row('Overtime hours','only the extra hours, not the whole shift',(
        <>
          <div style={{display:'grid',gridTemplateColumns:isWide?'repeat(3,minmax(0,120px))':'repeat(3,minmax(0,1fr))',gap:'10px'}}>
            {TIERS.map(([k,lbl],i)=>(
              <label key={k} style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'11px',padding:'8px 10px',display:'block',cursor:'text'}}>
                <span style={{display:'block',fontSize:'11px',fontWeight:900,color:'#2563eb'}}>{lbl}</span>
                <input type="number" step="0.25" inputMode="decimal" placeholder="0" aria-label={`Hours at ${lbl}`} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} style={{width:'100%',border:'none',background:'transparent',fontFamily:MONO,fontWeight:700,fontSize:'17px',color:'var(--ink)',outline:'none',padding:'3px 0'}}/>
                <span style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--quiet)'}}>£{(formRates[['r133','r150','r200'][i]]||0).toFixed(2)}/hr</span>
              </label>
            ))}
          </div>
          <div style={{fontSize:'11px',color:'var(--muted)',fontWeight:600,marginTop:'7px',lineHeight:1.45}}>{total>0?`Total ${hm(total*60)} overtime. `:''}Use this when a shift spans more than one rate.</div>
        </>
      ),{top:true,last:true});
    }

    const rdw = form.dutyType==='rdw';
    const basisReady = rdw ? !!(form.actualStart&&form.actualEnd) : !!(form.rosteredStart&&form.rosteredEnd&&form.actualStart&&form.actualEnd);
    const basis = !basisReady ? 'Set the times above to work out overtime'
      : rdw ? 'Rest day: the whole shift counts'
      : `${hm(shiftDurationMinutes(form.actualStart,form.actualEnd))} worked − ${hm(shiftDurationMinutes(form.rosteredStart,form.rosteredEnd))} rostered =`;
    return (
      <>
        {row('Type of day','',seg(rdw?'rdw':'normal',[['normal','Normal duty'],['rdw','Rest day (RDW)']],k=>
          k==='normal' ? setForm(f=>syncShiftTimesIntoForm({...f,dutyType:'normal'}))
                       : setForm(f=>syncShiftTimesIntoForm({...f,dutyType:'rdw',rosteredStart:'',rosteredEnd:''}))
        ))}
        {!rdw && row('Rostered shift','Shown on CARMS',(
          <>
            <div style={{display:'grid',gridTemplateColumns:isWide?'repeat(4,auto)':'repeat(4,minmax(0,1fr))',justifyContent:'start',gap:'6px',marginBottom:'8px'}}>
              {PRESETS.map(([start,end])=>{
                const on = form.rosteredStart===start && form.rosteredEnd===end;
                return (
                  <button key={start+end} type="button" aria-pressed={on} onClick={()=>setForm(f=>syncShiftTimesIntoForm(on ? {...f,rosteredStart:'',rosteredEnd:''} : {...f,rosteredStart:start,rosteredEnd:end}))} style={{padding:isWide?'5px 10px':'7px 2px',borderRadius:'8px',border:on?'1.5px solid #2563eb':'1px solid var(--border-2)',background:on?'var(--tint-blue)':'var(--surface)',color:on?'#2563eb':'var(--muted)',fontWeight:800,fontSize:'10.5px',fontFamily:'inherit',cursor:'pointer',whiteSpace:'nowrap'}}>
                    {start}–{end}
                  </button>
                );
              })}
            </div>
            {timePair('rosteredStart','rosteredEnd','Rostered Start','Rostered End')}
          </>
        ),{top:true})}
        {row('Actually worked','',(
          <>
            {timePair('actualStart','actualEnd','Actual Start','Actual End')}
            {/* Until both times are in (and nothing's been typed into the
                box by hand), there's no figure to show — a plain hint reads
                better than an empty "h overtime" box with an "auto" badge. */}
            {!basisReady && !String(form[tier]||'').trim() ? (
              <div style={{marginTop:'9px',border:'1.5px dashed var(--border)',borderRadius:'10px',padding:'8px 11px',fontSize:'11.5px',fontWeight:600,color:'var(--muted)'}}>Set the times above and your overtime is worked out here.</div>
            ) : (
            <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',marginTop:'9px',fontSize:'11.5px',fontWeight:600,color:'var(--muted)'}}>
              <span>{basis}</span>
              <label style={{display:'inline-flex',alignItems:'center',gap:'6px',background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'4px 8px 4px 10px'}}>
                <input type="number" step="0.25" inputMode="decimal" aria-label="Overtime hours" value={form[tier]} onChange={e=>setForm({...form, otAuto:false, [tier]:e.target.value})} style={{width:'54px',border:'none',background:'transparent',fontFamily:MONO,fontWeight:700,fontSize:inputFont,color:'var(--ink)',textAlign:'right',outline:'none'}}/>
                <span style={{fontSize:'11px',fontWeight:700,color:'var(--text-blue-deep)'}}>h overtime</span>
              </label>
              {form.otAuto
                ? <span style={{fontSize:'9.5px',fontWeight:800,padding:'2px 7px',borderRadius:'6px',background:'var(--tint-green-2)',color:'var(--text-green-deep)'}}>auto</span>
                : <button type="button" onClick={()=>setForm({...form, otAuto:true})} style={{fontSize:'9.5px',fontWeight:800,padding:'2px 7px',borderRadius:'6px',border:'none',background:'var(--tint-amber-2)',color:'var(--text-amber-deep)',cursor:'pointer',fontFamily:'inherit'}}>edited · reset</button>}
            </div>
            )}
          </>
        ),{top:true,last:true})}
      </>
    );
  })();

  // ── step 3: pay ──────────────────────────────────────────────────────────
  // Take As needs one clear rate to bank TOIL against — the chosen tier in
  // shift-times mode, or the single filled-in box in manual mode.
  const takeTier = effectiveTier && (parseFloat(form[effectiveTier])||0) > 0 ? effectiveTier : null;
  const takeBody = (() => {
    if (!takeTier) {
      const anyHours = TIERS.some(([k])=>(parseFloat(form[k])||0)>0);
      return <div style={{fontSize:'11.5px',fontWeight:600,color:'var(--muted)',lineHeight:1.45}}>{anyHours?'Paid. TOIL is available when all the hours are at one rate.':'Enter your hours first.'}</div>;
    }
    const total = parseFloat(form[takeTier])||0;
    const toilH = Math.min(total, parseFloat(form.toilHours)||0);
    const payH = Math.max(0, total-toilH);
    const splitBox = (label, colour, bg, value, onChange) => (
      <label style={{display:'block',background:bg,borderRadius:'11px',padding:'8px 10px'}}>
        <span style={{display:'block',fontSize:'10px',fontWeight:900,color:colour,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</span>
        <input type="number" step="0.25" inputMode="decimal" value={value} onChange={onChange} style={{width:'100%',border:'none',background:'transparent',fontFamily:MONO,fontWeight:700,fontSize:'17px',color:'var(--ink)',outline:'none',padding:'3px 0'}}/>
      </label>
    );
    return (
      <>
        {seg(form.takeAs,[['pay','Pay'],['toil','TOIL'],['mix','Mix']],m=>setForm(f=>{
          const t = parseFloat(f[takeTier])||0;
          const th = m==='pay' ? 0 : m==='toil' ? t : (parseFloat(f.toilHours)||0);
          return {...f, takeAs:m, toilHours: th?String(th):'0'};
        }))}
        {form.takeAs==='mix' && (
          <div style={{display:'grid',gridTemplateColumns:isWide?'repeat(2,minmax(0,130px))':'1fr 1fr',gap:'10px',marginTop:'10px'}}>
            {splitBox('Pay hours','var(--text-blue-deep)','var(--tint-blue)',payH.toFixed(2).replace(/\.00$/,''),e=>{ let v=parseFloat(e.target.value); if(isNaN(v))v=0; v=Math.max(0,Math.min(total,v)); setForm({...form, toilHours:String(total-v)}); })}
            {splitBox('TOIL hours','var(--tag-purple)','var(--tint-purple)',toilH.toFixed(2).replace(/\.00$/,''),e=>{ let v=parseFloat(e.target.value); if(isNaN(v))v=0; v=Math.max(0,Math.min(total,v)); setForm({...form, toilHours:String(v)}); })}
          </div>
        )}
        {toilH>0 && (
          <div style={{marginTop:'8px',fontFamily:MONO,fontSize:'11px',fontWeight:600,color:'var(--tag-purple)'}}>{fmtHrs(toilH)} to TOIL → {fmtHrs(toilH*RATE_TIER_MULT[takeTier])} banked at {RATE_TIER_MULT[takeTier]}×</div>
        )}
      </>
    );
  })();

  // ── step 4: submitted ────────────────────────────────────────────────────
  const hasOTHours = TIERS.reduce((s,[k])=>s+(parseFloat(form[k])||0),0) > 0;
  const hasPA = form.paRate!=='None';
  const subDate = (field, which) => (
    <div style={{display:'flex',alignItems:isWide?'center':'stretch',flexDirection:isWide?'row':'column',gap:isWide?'10px':'5px',marginTop:'9px'}}>
      <span style={{fontSize:'10px',fontWeight:900,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.06em'}}>Submitted on</span>
      {isWide ? (
        <button type="button" onClick={()=>{ setDatePickerMonth((form[field]||todayStr).slice(0,7)); setDatePickerFor(which); }} style={{display:'flex',alignItems:'center',gap:'8px',background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'8px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'var(--ink)',cursor:'pointer'}}>
          <Ico n="cal" s={14} c="var(--quiet)"/>{dateLabel(form[field])}
        </button>
      ) : (
        <input type="date" value={form[field]||todayStr} onChange={e=>setForm({...form,[field]:e.target.value})} style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',color:'var(--ink)'}}/>
      )}
    </div>
  );
  // Switching one on asks for its submission date first (App's shared date
  // picker sets both the flag and the date); switching off just clears it.
  const subRow = (label, sub, on, enabled, flag, which, dateField, last) => (
    <div style={{padding:'11px 0',borderBottom:last?'none':'1px solid var(--border-2)',opacity:enabled?1:0.5}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'}}>
        <div>
          <div style={{fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}>{label}</div>
          {sub&&<div style={{fontFamily:MONO,fontSize:'10px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>{sub}</div>}
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={!enabled} onClick={()=>{
          if (form[flag]) { setForm({...form,[flag]:false}); return; }
          setDatePickerMonth(todayStr.slice(0,7));
          setDatePickerFor(which);
        }} style={{width:'42px',height:'24px',borderRadius:'14px',position:'relative',border:'none',padding:0,cursor:enabled?'pointer':'default',flexShrink:0,background:on?'#059669':'var(--border)',transition:'background 0.15s cubic-bezier(.4,0,.2,1)'}}>
          <span style={{width:'18px',height:'18px',borderRadius:'50%',background:'#fff',position:'absolute',top:'3px',left:on?'21px':'3px',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.15s cubic-bezier(.4,0,.2,1)'}}/>
        </button>
      </div>
      {on && subDate(dateField, which)}
    </div>
  );

  // ── step 5: notes ────────────────────────────────────────────────────────
  const showNotes = notesOpen || !!(form.comments||'').trim();

  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:isWide?'40px':'calc(100px + env(safe-area-inset-bottom))'}}>
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
          <button onClick={goToConfigSetup} style={{background:'#dc2626',border:'none',borderRadius:'11px',padding:'12px 22px',fontWeight:900,fontSize:'12px',color:'#fff',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(220,38,38,0.3)'}}>Go to More.. →</button>
        </div>
      ) : (
      <>
        {step(1,'When and what',(
          <>
            {row('Date','', isWide ? (
              <button type="button" onClick={()=>{ setDatePickerMonth((form.date||todayStr).slice(0,7)); setDatePickerFor('shift'); }} style={{...S.inp,display:'flex',alignItems:'center',gap:'9px',height:'44px',fontSize:inputFont,textAlign:'left',cursor:'pointer'}}>
                <Ico n="cal" s={15} c="var(--quiet)"/>{dateLabel(form.date)}
              </button>
            ) : (
              <input type="date" style={{...S.inp,display:'block',height:'46px'}} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
            ))}
            {row('Duty / reason','',<input type="text" placeholder="e.g. MPL7XX, PXX" style={{...S.inp,fontSize:inputFont}} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>,{last:true})}
          </>
        ))}

        {step(2,'Your hours',(
          <>
            <div role="radiogroup" aria-label="How to record hours" style={{position:'relative',display:'flex',gap:'3px',background:'var(--chip-bg)',borderRadius:'11px',padding:'3px',margin:'8px 0 2px'}}>
              {modeBtn(true,'Shift Time Input','Rostered vs Worked, auto calculated','clock')}
              {modeBtn(false,'Enter Hours','Manually enter hours','edit')}
              <span aria-hidden="true" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:'26px',height:'26px',borderRadius:'50%',background:'var(--surface)',border:'1.5px solid var(--border)',boxShadow:'0 1px 4px rgba(15,23,42,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',fontWeight:900,letterSpacing:'0.04em',color:'var(--muted)',pointerEvents:'none',zIndex:1}}>OR</span>
            </div>
            {hoursRows}
          </>
        ))}

        {step(3,"How it's paid",(
          <>
            {form.recordShiftTimes && row('Overtime rate','',seg(tier,TIERS,h=>setForm(f=>{
              if (f.otRateTier===h) return f;
              const val = f.otRateTier ? f[f.otRateTier] : '';
              return {...f, otRateTier:h, hours133:'', hours150:'', hours200:'', [h]:val};
            })))}
            {row('Take it as','',takeBody)}
            {row('Protection Allowance','',seg(form.paRate,['None','PA1','PA2','PA3'].map(pa=>[pa,pa,pa==='None'?null:PA_LABELS[pa]]),pa=>
              setForm({...form,paRate:pa,paSubmitted:(form.paRate==='None'&&pa!=='None')?false:form.paSubmitted})
            ),{last:true})}
          </>
        ))}

        {/* carmsToggleRef/focusCarmsToggle: arriving from Awaits Submission
            scrolls here and pulses this card (see App.jsx). */}
        {step(4,'Submitted yet?',(
          <>
            <div style={{fontSize:'11px',color:'var(--muted)',fontWeight:600,lineHeight:1.45,margin:'4px 0 2px'}}>Leave these off if you haven't claimed it yet. It'll wait for you in Awaits Submission.</div>
            {subRow('Overtime submitted on CARMS', hasOTHours?null:'No overtime hours on this shift', hasOTHours&&form.otSubmitted, hasOTHours, 'otSubmitted', 'ot', 'otSubmittedDate', false)}
            {subRow('PA submitted on PSOP', hasPA?`${form.paRate} — ${fmtGBP(PA_RATES[form.paRate]||0)}`:'No PA rate selected for this shift', hasPA&&form.paSubmitted, hasPA, 'paSubmitted', 'pa', 'paSubmittedDate', true)}
          </>
        ),{ref:carmsToggleRef,className:focusCarmsToggle?'carms-pulse':undefined,style:{border:focusCarmsToggle?'2px solid #2563eb':'1px solid var(--border-2)'}})}

        {step(5,'Notes',showNotes ? (
          <textarea ref={notesRef} rows="4" placeholder="Shift notes or incident details..." style={{...S.ta,lineHeight:1.5,marginTop:'8px',fontSize:inputFont}} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}
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
            }}/>
        ) : (
          <button type="button" onClick={()=>{ setNotesOpen(true); setTimeout(()=>notesRef.current?.focus(),0); }} style={{background:'none',border:'none',padding:'4px 0 0',fontFamily:'inherit',fontSize:'12.5px',fontWeight:800,color:'#2563eb',cursor:'pointer'}}>+ Add a note</button>
        ),{optional:true})}

        {/* One bar for the running total and Save, on both desktop and
            mobile — sticky, so it stays in view the whole way down the form.
            On mobile it sits just above the bottom nav. */}
        <div style={{position:'sticky',bottom:isWide?'20px':'calc(84px + env(safe-area-inset-bottom))',zIndex:24,display:'flex',alignItems:'center',gap:isWide?'20px':'12px',background:'var(--savebar, var(--navy))',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'16px',padding:isWide?'12px 14px 12px 20px':'10px 10px 10px 15px',boxShadow:'0 10px 24px rgba(15,39,68,0.3)',marginTop:'4px'}}>
          <div style={{minWidth:0}}>
            <div style={{display:'flex',gap:isWide?'20px':'14px'}}>
              <div>
                <div style={{fontSize:'9.5px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.08em',color:'#93c5fd'}}>Gross</div>
                <div style={{fontFamily:MONO,fontSize:isWide?'20px':'17px',fontWeight:600,color:'#fff'}}>{fmt(animatedPreviewGross)}</div>
              </div>
              <div>
                <div style={{fontSize:'9.5px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.08em',color:'#6ee7b7'}}>Net</div>
                <div style={{fontFamily:MONO,fontSize:isWide?'20px':'17px',fontWeight:600,color:'#34d399'}}>{fmt(animatedPreviewNet)}</div>
              </div>
            </div>
            {preview.toilBanked>0&&(
              <div style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:'#c4b5fd',marginTop:'3px'}}>+ {fmtHrs(preview.toilBanked)} TOIL banked</div>
            )}
          </div>
          <button onClick={handleSave} disabled={justSaved} className={justSaved?'save-pulse':'save-pulse-idle'} style={{marginLeft:'auto',flexShrink:0,background:justSaved?'#059669':BRASS,color:'#fff',boxShadow:justSaved?'0 3px 14px rgba(5,150,105,0.4)':undefined,padding:isWide?'13px 26px':'12px 16px',borderRadius:'12px',border:'none',fontWeight:900,fontSize:isWide?'14px':'13px',fontFamily:'inherit',cursor:justSaved?'default':'pointer',display:'flex',alignItems:'center',gap:'8px',transition:'background 0.3s'}}>
            <Ico n={justSaved?'check':'save'} s={16} c="#fff"/>
            {justSaved?'Saved':(editing?'Update Record':'Save Record')}
          </button>
        </div>
      </>
      )}
    </div>
  );
}
