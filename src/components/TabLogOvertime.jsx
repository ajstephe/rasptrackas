import { useEffect, useState } from 'react';
import { fmt, fmtHrs, fmtGBP } from '../lib/format.js';
import { submitWindow, daysUntil, shortDay } from '../lib/deadline.js';
import { toMinutesOfDay, shiftDurationMinutes, generateShiftTimesLine } from '../lib/shiftTimes.js';
import { getRates, PA_LABELS, PA_RATES, RATE_TIER_MULT, RATE_TIER_LABEL } from '../lib/payRates.js';
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
import { SetupCard, isSetUp } from './SetupCard.jsx';
export function TabLogOvertime({
  editing, setEditing, onCancelEdit, saveSett, setTab, goToConfigSetup, settings, isWide, S, MONO, BRASS,
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
  // What's being typed in a Mix split box, kept as text until the box is
  // left, so a half-typed value like "1." isn't snapped back to a number.
  const [mixDraft, setMixDraft] = useState(null); // {k:'pay'|'toil', v:'1.'}
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => { if (justSaved) setNotesOpen(false); }, [justSaved]);

  const planRange = d => { const w=submitWindow(d); if(!w) return ''; if(d===w.by) return `on ${w.byShort}`; const a=shortDay(d), b=w.byShort; const [ad,am]=a.split(' '), [bd,bm]=b.split(' '); return am===bm?`${ad}–${b}`:`${a}–${b}`; };
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
  // on Done or a short scroll: the rostered start at 07:00, the rostered end
  // 8 hours after it, and the actually-worked times on the rostered ones
  // (a late finish is then a couple of notches past the rostered end rather
  // than a scroll up from midnight). A rest day, with no roster, opens its
  // finish 8 hours after its start. Only applies while the box is empty; a
  // set time always opens on itself.
  const plus8 = t => { const [h,m] = t.split(':').map(Number); return `${String((h+8)%24).padStart(2,'0')}:${String(m||0).padStart(2,'0')}`; };
  const startTimeFor = key => {
    if (key==='rosteredStart') return '07:00';
    if (key==='rosteredEnd') return plus8(form.rosteredStart||'07:00');
    if (key==='actualStart') return form.rosteredStart||'07:00';
    if (key==='actualEnd') return form.rosteredEnd || plus8(form.actualStart||form.rosteredStart||'07:00');
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
          <div style={box}><TimeSelect value={s} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,[sKey]:v,...(sKey==='rosteredStart'&&!f.actualStart?{actualStart:v}:{})}))} label={sLbl} startAt={startTimeFor(sKey)} BRASS={BRASS} MONO={MONO}/></div>
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
                <input type="number" min="0" max="24" step="0.25" inputMode="decimal" placeholder="0" aria-label={`Hours at ${lbl}`} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} style={{width:'100%',border:'none',background:'transparent',fontFamily:MONO,fontWeight:700,fontSize:'17px',color:'var(--ink)',outline:'none',padding:'3px 0'}}/>
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
            <div style={isWide?{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'8px'}:{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'6px',marginBottom:'8px'}}>
              {PRESETS.map(([start,end])=>{
                const on = form.rosteredStart===start && form.rosteredEnd===end;
                return (
                  <button key={start+end} type="button" aria-pressed={on} onClick={()=>setForm(f=>syncShiftTimesIntoForm(on ? {...f,rosteredStart:'',rosteredEnd:''} : {...f,rosteredStart:start,rosteredEnd:end,actualStart:f.actualStart||start}))} style={{padding:isWide?'5px 10px':'7px 2px',borderRadius:'8px',border:on?'1.5px solid #2563eb':'1px solid var(--border-2)',background:on?'var(--tint-blue)':'var(--surface)',color:on?'#2563eb':'var(--muted)',fontWeight:800,fontSize:'10.5px',fontFamily:'inherit',cursor:'pointer',whiteSpace:'nowrap'}}>
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
                <input type="number" min="0" max="24" step="0.25" inputMode="decimal" aria-label="Overtime hours" value={form[tier]} onChange={e=>setForm({...form, otAuto:false, [tier]:e.target.value})} style={{width:'54px',border:'none',background:'transparent',fontFamily:MONO,fontWeight:700,fontSize:inputFont,color:'var(--ink)',textAlign:'right',outline:'none'}}/>
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
    // Each box shows the typed text while it's being edited; the other box
    // follows along as soon as the text is a usable number. Leaving the box
    // tidies it up (clamped to the shift's hours).
    const commit = (k, text) => { let v=parseFloat(text); if(isNaN(v)) v=0; v=Math.max(0,Math.min(total,v)); setForm(f=>({...f, toilHours:String(k==='toil'?v:total-v)})); };
    const splitBox = (k, label, colour, bg, shown) => (
      <label style={{display:'block',background:bg,borderRadius:'11px',padding:'8px 10px'}}>
        <span style={{display:'block',fontSize:'10px',fontWeight:900,color:colour,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</span>
        <input type="text" inputMode="decimal" aria-label={label} value={mixDraft&&mixDraft.k===k?mixDraft.v:shown}
          onFocus={e=>{ setMixDraft({k,v:shown}); e.target.select(); }}
          onChange={e=>{ const v=e.target.value.replace(/[^0-9.]/g,'').replace(/(\..*)\./g,'$1'); setMixDraft({k,v}); if(/^\d*\.?\d+$/.test(v)) commit(k,v); }}
          onBlur={()=>{ if(mixDraft&&mixDraft.k===k) commit(k,mixDraft.v); setMixDraft(null); }}
          style={{width:'100%',border:'none',background:'transparent',fontFamily:MONO,fontWeight:700,fontSize:'17px',color:'var(--ink)',outline:'none',padding:'3px 0'}}/>
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
            {splitBox('pay','Pay hours','var(--text-blue-deep)','var(--tint-blue)',String(+payH.toFixed(2)))}
            {splitBox('toil','TOIL hours','var(--tag-purple)','var(--tint-purple)',String(+toilH.toFixed(2)))}
          </div>
        )}
        {toilH>0 && (
          <div style={{marginTop:'8px',fontFamily:MONO,fontSize:'11px',fontWeight:600,color:'var(--tag-purple)'}}>{fmtHrs(toilH)} to TOIL → {fmtHrs(toilH*RATE_TIER_MULT[takeTier])} banked at {RATE_TIER_LABEL[takeTier]}×</div>
        )}
      </>
    );
  })();

  // ── step 4: claim submitted ──────────────────────────────────────────────
  // One slip per claim, saying what goes on which system and how much:
  // overtime (or TOIL) on CARMS, PA on PSOP. "Mark as Submitted" asks for the
  // date in place (today, the shift day, or the shared calendar pop-up for
  // any other date). A planned shift can't be claimed yet, so it gets a note
  // instead of buttons.
  const hasOTHours = TIERS.reduce((s,[k])=>s+(parseFloat(form[k])||0),0) > 0;
  const hasPA = form.paRate!=='None';
  const isPlannedShift = !!form.date && form.date > todayStr;
  const [askFor, setAskFor] = useState(null);   // 'ot' | 'pa' while its date choices are showing
  useEffect(() => { setAskFor(null); }, [editing?.id, justSaved]);
  const shortDate = d => new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}).replace(/\bSep\b/,'Sept');
  const pc = preview.c || {};
  const hoursAt = [['h1','1.33×'],['h2','1.5×'],['h3','2×']].filter(([k])=>(pc[k]||0)>0).map(([k,l])=>`${fmtHrs(pc[k])} at ${l}`).join(' + ');
  const allToil = hasOTHours && (pc.toilH||0)>0 && !(pc.ot>0);
  const otSlip = !hasOTHours ? null : allToil
    ? { kind:'TOIL', what:`TOIL · ${hoursAt} → ${fmtHrs(pc.toilBanked||0)} banked`, amt:fmtHrs(pc.toilBanked||0) }
    : { kind:'Overtime', what:`Overtime · ${hoursAt}${(pc.toilH||0)>0?` (${fmtHrs(pc.toilH)} as TOIL)`:''}`, amt:fmtGBP(pc.ot||0) };
  const paSlip = hasPA ? { kind:'PA', what:`Protection Allowance · ${form.paRate}`, amt:fmtGBP(PA_RATES[form.paRate]||0) } : null;
  const setSubmitted = (which, d) => {
    setForm(f => which==='ot' ? {...f, otSubmitted:true, otSubmittedDate:d} : {...f, paSubmitted:true, paSubmittedDate:d});
    setAskFor(null);
  };
  const linkBtn = {background:'none',border:'none',padding:0,fontFamily:'inherit',fontSize:'11.5px',fontWeight:800,color:BRASS,cursor:'pointer'};
  const chipBtn = {display:'inline-flex',alignItems:'center',gap:'5px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'999px',padding:'6px 11px',fontFamily:'inherit',fontSize:'12px',fontWeight:800,color:'var(--ink)',cursor:'pointer'};
  // Status then button: stacked on a computer (two slips side by side are
  // narrow), side by side on a phone — the same for a live or an idle slip.
  const slipFoot = isWide ? {display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'8px'} : {display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',flexWrap:'wrap'};
  const claimSlip = (which, slip, system) => {
    const flag = which==='ot' ? 'otSubmitted' : 'paSubmitted';
    const dateField = which==='ot' ? 'otSubmittedDate' : 'paSubmittedDate';
    const done = !!form[flag];
    const choices = [[todayStr,'Today']].concat(form.date && form.date!==todayStr ? [[form.date,'Shift day']] : []);
    return (
      <div style={{border:`1.5px solid ${done?'color-mix(in srgb, #059669 55%, transparent)':'var(--border)'}`,borderRadius:'14px',padding:'12px 13px',background:done?'var(--tint-green)':'var(--surface-2)',display:'flex',flexDirection:'column',gap:'6px',minWidth:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'9.5px',fontWeight:900,letterSpacing:'0.08em',padding:'2px 6px',borderRadius:'5px',background:'var(--chip-bg)',color:'var(--text-navy)'}}>{system}</span>
          <span style={{fontFamily:MONO,fontSize:'17px',fontWeight:700,color:'var(--ink)'}}>{slip.amt}</span>
        </div>
        <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)'}}>{slip.what}</div>
        {done ? (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
            <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-green-deep)'}}>✓ Submitted {form[dateField]?shortDate(form[dateField]):''}</span>
            <span style={{display:'inline-flex',gap:'6px',alignItems:'center',color:'var(--quiet)',fontSize:'11px'}}>
              <button type="button" onClick={()=>setAskFor(which)} style={linkBtn}>Change date</button>·
              <button type="button" onClick={()=>{ setForm(f=>({...f,[flag]:false})); setAskFor(null); }} style={linkBtn}>Undo</button>
            </span>
          </div>
        ) : null}
        {askFor===which ? (
          <>
            <div style={{fontSize:'10.5px',fontWeight:900,color:'var(--text-blue-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:'2px'}}>When did you submit it?</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'6px',alignItems:'center'}}>
              {choices.map(([d,l])=>(
                <button key={l} type="button" onClick={()=>setSubmitted(which,d)} style={chipBtn}>{l}<span style={{fontWeight:600,color:'var(--muted)'}}>{shortDate(d)}</span></button>
              ))}
              <button type="button" onClick={()=>{ setDatePickerMonth(((done&&form[dateField])||form.date||todayStr).slice(0,7)); setDatePickerFor(which); setAskFor(null); }} style={chipBtn}><Ico n="cal" s={13} c="var(--quiet)"/>Other date…</button>
              <button type="button" onClick={()=>setAskFor(null)} style={{...linkBtn,marginLeft:'4px'}}>Cancel</button>
            </div>
          </>
        ) : !done ? (
          <div style={slipFoot}>
            <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11.5px',fontWeight:800,color:'var(--ink)'}}><span style={{width:'8px',height:'8px',borderRadius:'50%',background:'#dc2626'}}/>Not submitted</span>
            <button type="button" onClick={()=>setAskFor(which)} style={{display:'inline-flex',alignItems:'center',gap:'5px',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'10px',padding:'8px 12px',fontFamily:'inherit',fontSize:'12.5px',fontWeight:800,color:'var(--text-green-deep)',cursor:'pointer',whiteSpace:'nowrap'}}><Ico n="check" s={11} c="var(--text-green-deep)" w={3}/>Mark submitted</button>
          </div>
        ) : null}
      </div>
    );
  };
  // A slip with nothing on it yet (no hours, no PA, or a shift still to
  // come) keeps its place and size, so box 4 looks the same either way.
  const idleSlip = (system, amt, what, note) => (
    <div style={{border:'1.5px dashed var(--border)',borderRadius:'14px',padding:'12px 13px',background:'var(--surface-2)',display:'flex',flexDirection:'column',gap:'6px',minWidth:0}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}}>
        <span style={{fontSize:'9.5px',fontWeight:900,letterSpacing:'0.08em',padding:'2px 6px',borderRadius:'5px',background:'var(--chip-bg)',color:'var(--quiet)'}}>{system}</span>
        <span style={{fontFamily:MONO,fontSize:'17px',fontWeight:700,color:'var(--quiet)'}}>{amt}</span>
      </div>
      <div style={{fontSize:'13px',fontWeight:800,color:'var(--quiet)'}}>{what}</div>
      <div style={slipFoot}>
        <span style={{fontSize:'11.5px',fontWeight:700,color:'var(--quiet)'}}>{note}</span>
        <button type="button" disabled style={{background:'transparent',border:'1px dashed var(--border)',borderRadius:'10px',padding:'8px 12px',fontFamily:'inherit',fontSize:'12.5px',fontWeight:800,color:'var(--quiet)',cursor:'default',whiteSpace:'nowrap',opacity:0.7}}>Mark submitted</button>
      </div>
    </div>
  );
  const claimWhat = [otSlip&&otSlip.kind, paSlip&&'PA'].filter(Boolean).join(' or ') || 'Overtime or PA';

  // ── step 5: notes ────────────────────────────────────────────────────────
  const showNotes = notesOpen || !!(form.comments||'').trim();

  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:isWide?'40px':'calc(100px + env(safe-area-inset-bottom))'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'18px'}}>
        {editing&&<button onClick={onCancelEdit} aria-label="Cancel editing" style={{background:'var(--chip-bg)',border:'none',borderRadius:'10px',padding:'8px',cursor:'pointer',display:'flex'}}><Ico n="back" s={16}/></button>}
        <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:0,letterSpacing:'-0.5px'}}>{editing?'Edit shift':'Log Overtime'}</h2>
      </div>

      {!isSetUp(settings) ? (
        <SetupCard where="log" settings={settings} saveSett={saveSett} S={S} BRASS={BRASS}/>
      ) : (
      <>
        {/* A computer has room for the form in two columns: when and the
            hours on the left, pay, claim and notes on the right. */}
        <div className={isWide?'split-log':undefined}><div>
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
              {modeBtn(true,'Shift time input','Rostered vs Worked, auto calculated','clock')}
              {modeBtn(false,'Enter hours','Manually enter hours','edit')}
              <span aria-hidden="true" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:'26px',height:'26px',borderRadius:'50%',background:'var(--surface)',border:'1.5px solid var(--border)',boxShadow:'0 1px 4px rgba(15,23,42,0.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',fontWeight:900,letterSpacing:'0.04em',color:'var(--muted)',pointerEvents:'none',zIndex:1}}>OR</span>
            </div>
            {hoursRows}
          </>
        ))}

        </div><div>
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
        {step(4,'Claim submitted yet?',(
          <>
            <div style={{fontSize:'11.5px',color:'var(--muted)',fontWeight:600,lineHeight:1.45,margin:'4px 0 2px'}}>{claimWhat} not submitted waits in <b style={{color:'var(--ink)'}}>Awaits Submission</b>. Already submitted it? Mark it below.</div>
            {/* Both slips always show — Overtime on CARMS and PA on PSOP —
                so this box keeps one size; one with nothing to claim yet sits
                greyed out until there is. A planned shift's slips wait until
                it's been worked. */}
            <div style={{display:'grid',gridTemplateColumns:isWide?'repeat(2,minmax(0,1fr))':'1fr',gap:'10px',marginTop:'10px'}}>
              {otSlip && !isPlannedShift ? claimSlip('ot', otSlip, 'CARMS')
                : idleSlip('CARMS', otSlip ? otSlip.amt : '—', otSlip ? otSlip.what : 'Overtime', isPlannedShift && otSlip ? `Planned · submit ${planRange(form.date)} for ${submitWindow(form.date)?.month||'its pay month'}` : 'Add hours above')}
              {paSlip && !isPlannedShift ? claimSlip('pa', paSlip, 'PSOP')
                : idleSlip('PSOP', paSlip ? paSlip.amt : '—', paSlip ? paSlip.what : 'Protection Allowance', isPlannedShift && paSlip ? `Planned · submit ${planRange(form.date)} for ${submitWindow(form.date)?.month||'its pay month'}` : 'No PA chosen')}
            </div>
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
          <button type="button" onClick={()=>{ setNotesOpen(true); setTimeout(()=>notesRef.current?.focus(),0); }} style={{background:'none',border:'none',padding:'4px 0 0',fontFamily:'inherit',fontSize:'12.5px',fontWeight:800,color:BRASS,cursor:'pointer'}}>+ Add a note</button>
        ),{optional:true})}
        </div></div>

        {/* One bar for the running total and Save, on both desktop and
            mobile — sticky, so it stays in view the whole way down the form.
            On mobile it sits just above the bottom nav. */}
        <div style={{position:'sticky',bottom:isWide?'20px':'calc(84px + env(safe-area-inset-bottom))',zIndex:24,display:'flex',alignItems:'center',gap:isWide?'20px':'12px',background:'var(--savebar, var(--navy))',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'16px',padding:isWide?'12px 14px 12px 20px':'10px 10px 10px 15px',boxShadow:'0 10px 24px rgba(15,39,68,0.3)',marginTop:'4px'}}>
          <div style={{minWidth:0}}>
            <div style={{display:'flex',gap:isWide?'20px':'14px'}}>
              <div>
                <div style={{fontSize:'10px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.07em',color:'#93c5fd'}}>Gross</div>
                <div style={{fontFamily:MONO,fontSize:isWide?'20px':'17px',fontWeight:600,color:'#fff'}}>{fmt(animatedPreviewGross)}</div>
              </div>
              <div>
                <div style={{fontSize:'10px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.07em',color:'#6ee7b7'}}>Net</div>
                <div style={{fontFamily:MONO,fontSize:isWide?'20px':'17px',fontWeight:600,color:'#34d399'}}>{fmt(animatedPreviewNet)}</div>
              </div>
            </div>
            {preview.toilBanked>0&&(
              <div style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:'#c4b5fd',marginTop:'3px'}}>+{fmtHrs(preview.toilBanked)} TOIL banked</div>
            )}
          </div>
          <button onClick={handleSave} disabled={justSaved} className={justSaved?'save-pulse':'save-pulse-idle'} style={{marginLeft:'auto',flexShrink:0,background:justSaved?'#059669':`var(--save-bg, ${BRASS})`,color:justSaved?'#fff':'var(--save-ink, #fff)',boxShadow:justSaved?'0 3px 14px rgba(5,150,105,0.4)':undefined,padding:isWide?'13px 26px':'12px 16px',borderRadius:'12px',border:'none',fontWeight:900,fontSize:isWide?'14px':'13px',fontFamily:'inherit',cursor:justSaved?'default':'pointer',display:'flex',alignItems:'center',gap:'8px',transition:'background 0.3s'}}>
            <Ico n={justSaved?'check':'save'} s={16}/>
            {justSaved?'Saved':(editing?'Update shift':'Save shift')}
          </button>
        </div>
      </>
      )}
    </div>
  );
}
