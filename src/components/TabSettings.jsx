import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CURRENT_FY_YEAR, generateFYPeriods } from '../lib/payPeriods.js';
import { PAY_RATES } from '../lib/payRates.js';
import { calcUKIncomeTax, calcUKIncomeTaxNoTaper, computeTaxBandBreakdown, calcPensionContribution } from '../lib/tax.js';
import { fmtGBP } from '../lib/format.js';
import { Ico, FireExitIcon } from './Icons.jsx';
import { SegSlider } from './SegSlider.jsx';
import { useMountTransition } from '../lib/useMountTransition.js';

// ─── More.. (settings) tab ───────────────────────────────────────────────────
// Extracted verbatim from App.jsx's tab==='settings' block — no behaviour
// change. Five largely-independent accordion cards (Config/Rates, Tax
// Calculator, Archived Financial Years, Financial Reports & Export,
// Account & Data Management) that each pop out into a desktop modal via
// createPortal + modalBoxStyle, plus Sign Out / Help & thanks. Kept as one
// component rather than five separate files since every card's header
// closes its four siblings on open (they're mutually referential, not
// independent) — splitting further would just mean passing all five
// setters into each piece anyway.
export function TabSettings({
  isWide, S, MONO, BRASS,
  savedBadge, themeMode, setTheme,
  configExpanded, setConfigExpanded, configShown, configSetupIncomplete,
  taxImpactExpanded, setTaxImpactExpanded, taxImpactCardRef,
  taxCalcActualDetailOpen, setTaxCalcActualDetailOpen,
  taxCalcForecastDetailOpen, setTaxCalcForecastDetailOpen,
  financialYearsExpanded, setFinancialYearsExpanded,
  exportDataExpanded, setExportDataExpanded,
  dataManagementExpanded, setDataManagementExpanded,
  settings, saveSett, totals, taxForecast, entries, currPeriodIdx,
  setExportFormat, setPayslipMode, setPayslipPeriodIdx, setPayslipFYYear, setPayslipModalOpen,
  session, handleExport, pulseBackupBtn, setRestoreConfirmOpen, fileRef, handleImport,
  wipeConf, setWipeConf, handleWipe, wipingData,
  deleteAcctConf, setDeleteAcctConf, deleteAcctTyped, setDeleteAcctTyped, handleDeleteAccount, deletingAcct,
  changePwOpen, setChangePwOpen, newPw, setNewPw, newPw2, setNewPw2, handleChangePassword, changingPw, changePwError, setChangePwError,
  setSignOutConfirmOpen,
  contentWrapRef, modalBoxStyle,
  yearsWithData, setArchiveExpandedPeriod, setFySummaryPrintMode, setFySummaryYear,
  animClass='fi',
}) {
  // Mirrored exit for the two destructive confirm cards below (Wipe All
  // Data, Delete Account) — same useMountTransition trick as App.jsx's
  // overlays: cancelling one of these used to hard-cut it away instantly
  // despite it popping in with .alert-pop; these are arguably the two
  // highest-stakes confirmations in the whole app, so it's worth them
  // settling back down rather than just vanishing. Called unconditionally
  // here at the top rather than inside the accordion's own IIFE further
  // down, so hook order never depends on what that render happens to do.
  const wipeMounted = useMountTransition(wipeConf, 220);
  const deleteAcctMounted = useMountTransition(deleteAcctConf, 220);
  const changePwMounted = useMountTransition(changePwOpen, 220);

  // The Tax & 100K+ Calculator card below lives inside a
  // settings.rank&&settings.service&&(()=>{...})() IIFE — conditionally
  // invoked, so any hook declared inside it would violate the Rules of
  // Hooks the moment that condition is ever false on some render (the
  // same reasoning already documented above for the five modal-mount
  // hooks). Declared here, unconditionally, for that reason.
  const [taxPrintOpen, setTaxPrintOpen] = useState(false);

  // Same mirrored-exit treatment for the five desktop popover cards below
  // (Config/Rates, Tax Calculator, Financial Years, Export, Account & Data
  // Management) and their shared backdrop — these still hard-cut on close
  // today. The "desktop popovers already get modal-pop" note by
  // accordion-in's own definition is about that accordion's entrance-only
  // asymmetry specifically; it was never a considered call for modal-pop
  // itself, so there's no reason left to leave this one unfixed.
  const configModalOpen = isWide && configExpanded && !configSetupIncomplete;
  const taxModalOpen = isWide && taxImpactExpanded;
  const fyModalOpen = isWide && financialYearsExpanded;
  const exportModalOpen = isWide && exportDataExpanded;
  const dataModalOpen = isWide && dataManagementExpanded;
  const configModalMounted = useMountTransition(configModalOpen, 220);
  const taxModalMounted = useMountTransition(taxModalOpen, 220);
  const fyModalMounted = useMountTransition(fyModalOpen, 220);
  const exportModalMounted = useMountTransition(exportModalOpen, 220);
  const dataModalMounted = useMountTransition(dataModalOpen, 220);
  const anyModalOpen = configModalOpen || taxModalOpen || fyModalOpen || exportModalOpen || dataModalOpen;
  const anyModalMounted = configModalMounted || taxModalMounted || fyModalMounted || exportModalMounted || dataModalMounted;
  // Each card's own cardHeader/cardBody depend on its *Expanded flag, which
  // flips false the instant the card closes — same render the mount stays
  // true for its 220ms exit tail. Without freezing the actual rendered
  // content here, the popover would go blank (cardBody turning false)
  // while it's still visibly scaling/fading out. Refs rather than another
  // useMountTransition-style hook since what needs freezing is the whole
  // JSX node, not a boolean.
  const configModalContentRef = useRef(null);
  const taxModalContentRef = useRef(null);
  const fyModalContentRef = useRef(null);
  const exportModalContentRef = useRef(null);
  const dataModalContentRef = useRef(null);
  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:0,letterSpacing:'-0.5px'}}>Settings &amp; More</h2>
        {savedBadge&&<div style={{display:'flex',alignItems:'center',gap:'5px',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'9px',padding:'4px 9px'}}><Ico n="check" s={12} c="#059669"/><span style={{fontSize:'11px',fontWeight:900,color:'var(--text-green-deep)'}}>Saved</span></div>}
        {/* Mobile-only — same low-key icon pill as the Home screen's
            sign-out button, duplicated here on the title line (right
            aligned) since this tab no longer carries its own sign-out
            box further down. */}
        {!isWide && session&&(
          <button onClick={()=>setSignOutConfirmOpen(true)} style={{display:'flex',alignItems:'center',gap:'7px',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'20px',padding:'8px 14px',cursor:'pointer',fontFamily:'inherit'}}>
            <FireExitIcon size={15} color="#059669"/>
            <span style={{fontWeight:700,fontSize:'12px',color:'#059669'}}>Sign out</span>
          </button>
        )}
      </div>

      {/* ── Desktop: the six settings sections below reflow into a
           2-column grid instead of one long vertical stack. Each
           card still expands independently — a taller expanded card
           just makes its own grid row taller, same as any 2-up
           layout. Mobile is untouched (grid only turns on at isWide). ── */}
      {/* ── Want to say thanks — its own full-width card, same shape
           as Appearance below, sitting above it. One shared card for
           both mobile and desktop now (it used to be split: folded
           into the Help & Suggestions box on mobile, and a separate
           card further down the grid on desktop). ── */}
      <div style={{...S.card,marginBottom:'12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
          <Ico n="coffee" s={16} c="#d97706"/>
          <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Want to say thanks?</div>
        </div>
        <div style={{fontSize:'11.5px',color:'var(--muted)',fontWeight:600,lineHeight:1.6}}>
          A lot of late nights, caffeine, and swearing went into building and hosting this. If it's making your life easier and you'd like to say thanks, you can{' '}
          <a href="https://settleup.starlingbank.com/adam-stephens-2b95aa" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb',fontWeight:800,textDecoration:'underline'}}>Buy me a coffee</a> (via Starling Bank).
        </div>
        <div style={{fontSize:'11.5px',color:'var(--muted)',fontWeight:600,marginTop:'8px'}}>Cheers for the support!</div>
      </div>

      {/* ── Appearance — not an accordion like the rest of this tab;
           a 3-way choice doesn't need to hide behind a "tap to
           expand". Sits outside the grid on desktop too, full-width,
           since a 2-up grid cell would leave it looking cramped next
           to a tall accordion. ── */}
      <div style={{...S.card,padding:'13px 16px',marginBottom:'12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'9px',marginBottom:'9px'}}>
          <div style={{background:'var(--tint-amber)',padding:'6px',borderRadius:'11px',flexShrink:0}}><Ico n="sun" s={14} c={BRASS}/></div>
          <div>
            <div style={{fontWeight:900,fontSize:'13px',color:'var(--ink)'}}>Appearance</div>
            <div style={{fontSize:'10px',color:'var(--quiet)',marginTop:'1px'}}>Light, dark, or match your device</div>
          </div>
        </div>
        <SegSlider activeKey={themeMode} trackStyle={{display:'flex',gap:'6px'}} indicatorStyle={{background:BRASS,borderRadius:'9px',boxShadow:'0 4px 11px rgba(184,130,63,0.35)'}}>
          {[['system','Auto'],['light','Light'],['dark','Dark']].map(([v,lbl])=>(
            <button key={v} data-seg-key={v} onClick={()=>setTheme(v)} style={{position:'relative',zIndex:1,flex:1,padding:'6px 4px',borderRadius:'9px',border:'none',fontFamily:'inherit',fontWeight:900,fontSize:'12px',cursor:'pointer',background:'transparent',color:themeMode===v?'#fff':'var(--muted)'}}>{lbl}</button>
          ))}
        </SegSlider>
      </div>

      <div style={isWide?{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}:undefined}>

      {/* ── Mobile-only section labels — pure grouping, no functional
           change: the cards underneath are the exact same accordions
           either way. Desktop's 2-column grid doesn't get these,
           since a full-width label would just look like a stray
           orphaned grid cell there. ── */}
      {!isWide && <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'2px 4px 6px'}}>Pay &amp; Tax</div>}

      {/* ── Configuration — now a single collapsible unit like the
           other cards, except it forces itself open for as long as
           rank/pay point setup is incomplete (see configShown above)
           — that part was never meant to be hideable. ── */}
      {(()=>{
        const cardHeader = (
          <button disabled={configSetupIncomplete} onClick={configSetupIncomplete?undefined:()=>{ if(isWide){setTaxImpactExpanded(false);setFinancialYearsExpanded(false);setExportDataExpanded(false);setDataManagementExpanded(false);} setConfigExpanded(v=>!v); }} className={configSetupIncomplete?'':'tap-row'} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',cursor:configSetupIncomplete?'default':'pointer',marginBottom:(configShown&&(!isWide||configSetupIncomplete))?'13px':0}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{background:'var(--tint-blue)',padding:isWide?'11px':'9px',borderRadius:'13px'}}><Ico n="cog" s={isWide?21:17} c="#2563eb"/></div>
              <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Config, Rates &amp; Payscales</div>
            </div>
            {!configSetupIncomplete && (
              <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
                {!isWide&&<span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline'}}>{configShown?'Tap to Close':'Tap to expand'}</span>}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:configShown?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            )}
          </button>
        );
        const cardBody = configShown && (
        <>
        <div style={{marginBottom:'13px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px'}}>
            <label style={{...S.lbl,marginBottom:0}}>Rank</label>
            {!settings.rank&&<span style={{fontSize:'10px',fontWeight:900,color:'#dc2626',background:'var(--tint-red)',padding:'2px 7px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.06em'}}>Start here</span>}
          </div>
          <div className={!settings.rank?'setup-pulse-urgent':''} style={{borderRadius:'13px',position:'relative'}}>
            <select style={{...S.sel,paddingRight:'36px',border: !settings.rank ? '2px solid #dc2626' : '1px solid var(--border-2)',fontWeight: !settings.rank ? 900 : 700}} value={settings.rank} onChange={e=>{
              const r=e.target.value;
              if(!r) return saveSett({...settings,rank:'',service:''});
              saveSett({...settings,rank:r,service:''});
            }}>
              <option value="">Select Rank...</option>
              {Object.keys(PAY_RATES).map(k=><option key={k} value={k}>{k}</option>)}
            </select>
            {/* appearance:'none' above strips the native dropdown arrow for
                custom styling — nothing was ever drawn in to replace it, so
                this looked like a plain text box with no hint it opens a
                list. pointer-events:'none' so it doesn't steal the select's
                own click target. */}
            <div style={{position:'absolute',right:'13px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={13} c="var(--quiet)" w={2.5}/></div>
          </div>
        </div>
        {settings.rank&&(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px'}}>
              <label style={{...S.lbl,marginBottom:0}}>Pay Point</label>
              {!settings.service&&<span style={{fontSize:'10px',fontWeight:900,color:'#dc2626',background:'var(--tint-red)',padding:'2px 7px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.06em'}}>Now this</span>}
            </div>
            <div className={!settings.service?'setup-pulse-urgent':''} style={{borderRadius:'13px',position:'relative'}}>
              <select style={{...S.sel,paddingRight:'36px',border: !settings.service ? '2px solid #dc2626' : '1px solid var(--border-2)',fontWeight: !settings.service ? 900 : 700}} value={settings.service} onChange={e=>saveSett({...settings,service:e.target.value})}>
                <option value="">Select pay point...</option>
                {Object.keys(PAY_RATES[settings.rank]).map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{position:'absolute',right:'13px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={13} c="var(--quiet)" w={2.5}/></div>
            </div>
          </div>
        )}
        <div style={{display:'flex',alignItems:'center',gap:'8px',borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px'}}>
          <div style={{background:'var(--tint-blue)',padding:'9px',borderRadius:'13px'}}><Ico n="clock" s={17} c="#2563eb"/></div>
          <span style={{fontWeight:900,fontSize:'13px',color:'var(--ink)'}}>Hourly Rates & Payscales</span>
        </div>

        {settings.rank&&settings.service&&(()=>{
          const svcData = PAY_RATES[settings.rank][settings.service];
          return (
            <div style={{borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'14px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                {[['Pre 1 Sep 2026','pre','var(--muted)','var(--surface-2)'],['From 1 Sep 2026','post','#2563eb','var(--surface)']].map(([label,key,col,bg])=>(
                  <div key={key} style={{background:bg,borderRadius:'12px',padding:'12px',border:key==='post'?'1.5px solid var(--border-2)':'1px solid var(--border-2)'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:col,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>{label}</div>
                    {['Base','1.33x','1.5x','2.0x'].map((lbl,i)=>(
                      <div key={lbl} style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                        <span style={{fontSize:'10px',fontWeight:700,color:'var(--muted)'}}>{lbl}</span>
                        <span style={{fontSize:'10px',fontWeight:900,color:key==='post'?'var(--text-navy)':'var(--muted)'}}>£{(svcData[key][['base','r133','r150','r200'][i]]||0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{borderTop:'1px solid var(--border-2)',marginTop:'16px',paddingTop:'14px'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'10px'}}>Published Pay Scales</div>
                {['Constable','Sergeant'].map(rank=>(
                  <div key={rank} style={{marginBottom: rank==='Constable' ? '16px' : 0}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-navy)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'}}>{rank}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr',gap:'2px 8px',alignItems:'center'}}>
                      <div style={{fontSize:'8px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',paddingBottom:'5px',borderBottom:'1px solid var(--border-2)'}}>Pay Point</div>
                      <div style={{fontSize:'8px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid var(--border-2)'}}>Pre-Sept</div>
                      <div style={{fontSize:'8px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid var(--border-2)'}}>Post-Sept</div>
                      {Object.entries(PAY_RATES[rank]).map(([point,data])=>(
                        <div key={point} style={{display:'contents'}}>
                          <div style={{fontSize:'11px',fontWeight:700,color:'var(--ink)',padding:'5px 0'}}>{point}</div>
                          <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textAlign:'right',padding:'5px 0'}}>£{data.salary.pre.toLocaleString('en-GB')}</div>
                          <div style={{fontSize:'11px',fontWeight:900,color:'var(--text-navy)',textAlign:'right',padding:'5px 0'}}>£{data.salary.post.toLocaleString('en-GB')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{marginTop:'12px',fontSize:'9px',fontWeight:600,color:'var(--quiet)',lineHeight:1.5}}>Excludes London Weighting (£3,150 pre-Sept / £3,260 post-Sept) and London Allowance (£6,588), which are added separately.</div>
              </div>
            </div>
          );
        })()}
        </>
        );
        // Desktop: only the genuinely user-toggled open state pops
        // out as a modal — the forced-open-while-setup-incomplete
        // case stays inline even on desktop (it's a first-run nudge,
        // not something tapped open, so it shouldn't hijack into a
        // popup the moment you land on this tab).
        const showInline = configShown && (!isWide || configSetupIncomplete);
        const showModal = isWide && configExpanded && !configSetupIncomplete;
        if (showModal) configModalContentRef.current = <>{cardHeader}<div style={{marginTop:'13px'}}>{cardBody}</div></>;
        return (
          <>
            <div style={S.card}>
              {cardHeader}
              {showInline && cardBody ? <div className="accordion-in">{cardBody}</div> : null}
            </div>
            {configModalMounted && contentWrapRef.current && createPortal(
              <div className={'modal-pop'+(showModal?'':' pop-out')} style={modalBoxStyle(S.card)}>{configModalContentRef.current}</div>,
              contentWrapRef.current
            )}
          </>
        );
      })()}

      {/* ── Tax & 100K+ Calculator — Actual (YTD) and Forecast (full year), side by side ── */}
      {settings.rank&&settings.service&&(()=>{
        const proj = totals.projectedAnnualGross;
        const ytd  = totals.combinedGrossYTD;
        const taxYearFraction = Math.max(1/365, Math.min(1, totals.taxYearDaysElapsed/365));

        // Pension contributions come off pay BEFORE income tax is worked
        // out (a "net pay arrangement"), which is why they reduce the
        // taxable figure — and therefore the £100k assessment itself —
        // but never touch National Insurance. Pensionable pay is basic
        // salary + London Weighting only; London Allowance and all
        // overtime/PA are non-pensionable, so they play no part here.
        const pensionablePayA = totals.salaryYTD + totals.lwYTD;
        const pensionA = calcPensionContribution(pensionablePayA, taxYearFraction);

        // Forecast — full year, matches how the rest of the app already
        // treats projections (yearFraction = 1). Sourced from the
        // shared taxForecast memo (see its own definition above)
        // rather than computed inline here.
        const { pensionablePayF, pensionF, taxableGrossF, overF, paLostF, paRemainingF, extraTaxF, breakdownF, niF, netF } = taxForecast;

        // Actual — year to date, same principle: taxable (post-pension)
        // YTD figure drives the taper assessment. Personal Allowance is
        // always an annual concept, so the taper is still judged on the
        // annualised run-rate; but the amount of that annual allowance
        // genuinely "used up" by money already banked is the pro-rated
        // slice.
        const taxableYTD = Math.max(0, ytd - pensionA.amount);
        const annualisedFromYTD = taxableYTD / taxYearFraction;
        const overA = annualisedFromYTD > 100000;
        const paLostAnnualA = overA ? Math.min(12570, Math.floor((annualisedFromYTD-100000)/2)) : 0;
        const paRemainingA = 12570 - paLostAnnualA;
        const paLostProRatedA = paLostAnnualA * taxYearFraction;
        const extraTaxA = overA ? (calcUKIncomeTax(taxableYTD, taxYearFraction) - calcUKIncomeTaxNoTaper(taxableYTD, taxYearFraction)) : 0;
        const breakdownA = computeTaxBandBreakdown(taxableYTD, taxYearFraction);
        const niA = totals.ytdNI; // reuse the real, period-summed figure rather than a lump estimate — unaffected by pension
        const netA = ytd - pensionA.amount - breakdownA.totalTax - niA;

        const over = overA || overF; // header icon reflects risk from either view

        const col = (label, value) => (
          <div style={{background:'var(--surface-2)',borderRadius:'11px',padding:'10px',textAlign:'center'}}>
            <div style={{fontSize:'9px',fontWeight:700,color:'var(--quiet)',marginBottom:'3px'}}>{label}</div>
            <div style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--ink)'}}>{value}</div>
          </div>
        );

        const cardHeader = (
          <button onClick={()=>{ if(isWide){setConfigExpanded(false);setFinancialYearsExpanded(false);setExportDataExpanded(false);setDataManagementExpanded(false);} setTaxImpactExpanded(v=>!v); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',marginBottom:(taxImpactExpanded&&!isWide)?'12px':0,cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{background:over?'var(--tint-red)':'var(--tint-green)',padding:isWide?'11px':'9px',borderRadius:'11px'}}><Ico n="calc" s={isWide?21:17} c={over?'#dc2626':'#059669'}/></div>
              <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Tax & 100K+ Calculator</div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              {!isWide&&<span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline'}}>{taxImpactExpanded?'Tap to Close':'Tap to expand'}</span>}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:taxImpactExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
        );
        const cardBody = taxImpactExpanded&&(
              <>
                <div style={{display:'flex',alignItems:'flex-start',gap:'8px',marginBottom:'13px'}}>
                  <Ico n="shield" s={13} c="#94a3b8"/>
                  <span style={{fontSize:'11px',fontWeight:600,color:'var(--muted)',lineHeight:1.5}}>Tax is calculated automatically using real UK income tax bands, applied cumulatively across your salary, allowances and overtime — no manual rate needed.</span>
                </div>
                <button onClick={()=>setTaxPrintOpen(true)} style={{width:'100%',marginBottom:'13px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'10px',padding:'10px',fontWeight:900,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',textTransform:'uppercase',letterSpacing:'0.06em'}}><Ico n="dl" s={13} c="#fff"/> Print / Save as PDF</button>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:overA?'#dc2626':'#059669',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',background:overA?'var(--tint-red)':'var(--tint-green)',borderRadius:'8px',padding:'5px 0'}}>Actual (YTD)</div>
                  <div style={{fontSize:'10px',fontWeight:900,color:overF?'#dc2626':'#059669',textTransform:'uppercase',letterSpacing:'0.06em',textAlign:'center',background:overF?'var(--tint-red)':'var(--tint-green)',borderRadius:'8px',padding:'5px 0'}}>Forecast</div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                  {col('Gross', fmtGBP(ytd))}
                  {col('Gross', fmtGBP(proj))}
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                  <div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'10px',textAlign:'center'}}>
                    <div style={{fontSize:'9px',fontWeight:700,color:'#2563eb',marginBottom:'3px'}}>Pension ({(pensionA.rate*100).toFixed(2)}%)</div>
                    <div style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--text-blue-deep)'}}>−{fmtGBP(pensionA.amount)}</div>
                  </div>
                  <div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'10px',textAlign:'center'}}>
                    <div style={{fontSize:'9px',fontWeight:700,color:'#2563eb',marginBottom:'3px'}}>Pension ({(pensionF.rate*100).toFixed(2)}%)</div>
                    <div style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--text-blue-deep)'}}>−{fmtGBP(pensionF.amount)}</div>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                  {col('Personal Allowance Remaining', fmtGBP(paRemainingA))}
                  {col('Personal Allowance Remaining', fmtGBP(paRemainingF))}
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                  <div style={{background:overA?'var(--tint-red)':'var(--tint-green)',border:`1px solid ${overA?'var(--border-2)':'var(--border-2)'}`,borderRadius:'11px',padding:'11px 10px',textAlign:'center'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:overA?'var(--text-red-deep)':'var(--text-green-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'3px'}}>Extra Tax</div>
                    <div style={{fontFamily:MONO,fontSize:'16px',fontWeight:600,color:overA?'var(--text-red-deep)':'var(--text-green-deep)'}}>{fmtGBP(extraTaxA)}</div>
                  </div>
                  <div style={{background:overF?'var(--tint-red)':'var(--tint-green)',border:`1px solid ${overF?'var(--border-2)':'var(--border-2)'}`,borderRadius:'11px',padding:'11px 10px',textAlign:'center'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:overF?'var(--text-red-deep)':'var(--text-green-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'3px'}}>Extra Tax</div>
                    <div style={{fontFamily:MONO,fontSize:'16px',fontWeight:600,color:overF?'var(--text-red-deep)':'var(--text-green-deep)'}}>{fmtGBP(extraTaxF)}</div>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  <button onClick={()=>{ setTaxCalcActualDetailOpen(v=>!v); setTaxCalcForecastDetailOpen(false); }} style={{background:overA?'var(--tint-red)':'var(--tint-green)',border:`1px solid ${overA?'var(--border-2)':'var(--border-2)'}`,borderRadius:'11px',padding:'10px',width:'100%',textAlign:'left',fontFamily:'inherit',cursor:'pointer'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:overA?'var(--text-red-deep)':'var(--text-green-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>Calculations</div>
                    {overA ? (
                      <div style={{fontSize:'9.5px',color:'var(--text-red-deep)',lineHeight:1.7}}>
                        Run-rate: {fmtGBP(annualisedFromYTD)}/yr<br/>
                        {fmtGBP(annualisedFromYTD-100000)} over £100k<br/>
                        → {fmtGBP(paLostProRatedA)} allowance used so far<br/>
                        → at {((extraTaxA/paLostProRatedA)*100).toFixed(1)}% = {fmtGBP(extraTaxA)}
                      </div>
                    ) : (
                      <div style={{fontSize:'9.5px',color:'var(--text-green-deep)',lineHeight:1.7}}>Under £100k so far this year (after pension) — no allowance used yet.</div>
                    )}
                    <div style={{fontSize:'8.5px',fontWeight:800,color:overA?'#dc2626':'#059669',textDecoration:'underline',marginTop:'8px',textAlign:'center'}}>{taxCalcActualDetailOpen?'Showing full breakdown below':'Tap to see full breakdown'}</div>
                  </button>
                  <button onClick={()=>{ setTaxCalcForecastDetailOpen(v=>!v); setTaxCalcActualDetailOpen(false); }} style={{background:overF?'var(--tint-red)':'var(--tint-green)',border:`1px solid ${overF?'var(--border-2)':'var(--border-2)'}`,borderRadius:'11px',padding:'10px',width:'100%',textAlign:'left',fontFamily:'inherit',cursor:'pointer'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:overF?'var(--text-red-deep)':'var(--text-green-deep)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>Calculations</div>
                    {overF ? (
                      <div style={{fontSize:'9.5px',color:'var(--text-red-deep)',lineHeight:1.7}}>
                        {fmtGBP(taxableGrossF)} taxable (after pension)<br/>
                        {fmtGBP(taxableGrossF-100000)} over £100k<br/>
                        → {fmtGBP(paLostF)} allowance lost<br/>
                        → at {((extraTaxF/paLostF)*100).toFixed(1)}% = {fmtGBP(extraTaxF)}
                      </div>
                    ) : (
                      <div style={{fontSize:'9.5px',color:'var(--text-green-deep)',lineHeight:1.7}}>Projected to stay under £100k (after pension) — {fmtGBP(100000-taxableGrossF)} of headroom at this pace.</div>
                    )}
                    <div style={{fontSize:'8.5px',fontWeight:800,color:overF?'#dc2626':'#059669',textDecoration:'underline',marginTop:'8px',textAlign:'center'}}>{taxCalcForecastDetailOpen?'Showing full breakdown below':'Tap to see full breakdown'}</div>
                  </button>
                </div>

                {taxCalcActualDetailOpen&&(
                  <div style={{borderTop:'2px solid var(--border-2)',marginTop:'12px',paddingTop:'12px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                      <div style={{fontWeight:900,fontSize:'12px',color:'var(--ink)'}}>Full Calculation — Actual (YTD)</div>
                      <span onClick={()=>setTaxCalcActualDetailOpen(false)} style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',cursor:'pointer'}}>Show less</span>
                    </div>
                    <div style={{background:'var(--surface-2)',borderRadius:'11px',padding:'12px 14px',marginBottom:'10px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Gross (YTD)</span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(ytd)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)',background:'var(--tint-blue)',margin:'0 -14px',paddingLeft:'14px',paddingRight:'14px'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--text-blue-deep)'}}>Pension Contribution <span style={{color:'#3b82f6',fontWeight:600}}>({(pensionA.rate*100).toFixed(2)}% of {fmtGBP(pensionablePayA)} pensionable pay)</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--text-blue-deep)'}}>−{fmtGBP(pensionA.amount)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>= Taxable Gross (YTD)</span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(taxableYTD)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Personal Allowance <span style={{color:'var(--quiet)',fontWeight:600}}>(0%, pro-rated)</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'#059669'}}>{fmtGBP(breakdownA.pa)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Basic Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(20% on {fmtGBP(breakdownA.basicAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownA.basicTax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Higher Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(40% on {fmtGBP(breakdownA.higherAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownA.higherTax)}</span></div>
                      {breakdownA.additionalAmt>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Additional Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(45% on {fmtGBP(breakdownA.additionalAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownA.additionalTax)}</span></div>}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-red-deep)'}}>Total Income Tax (YTD)</span>
                      <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--text-red-deep)'}}>{fmtGBP(breakdownA.totalTax)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--surface-2)',borderRadius:'11px',padding:'10px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>National Insurance (YTD) <span style={{color:'var(--quiet)',fontWeight:600}}>(on full gross)</span></span>
                      <span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(niA)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-green-deep)'}}>Estimated Net (YTD)</span>
                      <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-green-deep)'}}>{fmtGBP(netA)}</span>
                    </div>
                    <div style={{fontSize:'9px',color:'var(--quiet)',lineHeight:1.5,marginTop:'8px'}}>What's owed on money genuinely banked so far — not a projection. Pension tier is estimated from your current pay rate, not last scheme year's actual earnings, which is what the real rule technically uses.</div>
                  </div>
                )}

                {taxCalcForecastDetailOpen&&(
                  <div style={{borderTop:'2px solid var(--border-2)',marginTop:'12px',paddingTop:'12px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                      <div style={{fontWeight:900,fontSize:'12px',color:'var(--ink)'}}>Full Calculation — Forecast</div>
                      <span onClick={()=>setTaxCalcForecastDetailOpen(false)} style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',cursor:'pointer'}}>Show less</span>
                    </div>
                    <div style={{background:'var(--surface-2)',borderRadius:'11px',padding:'12px 14px',marginBottom:'10px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Gross (projected annual)</span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(proj)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)',background:'var(--tint-blue)',margin:'0 -14px',paddingLeft:'14px',paddingRight:'14px'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--text-blue-deep)'}}>Pension Contribution <span style={{color:'#3b82f6',fontWeight:600}}>({(pensionF.rate*100).toFixed(2)}% of {fmtGBP(pensionablePayF)} pensionable pay)</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--text-blue-deep)'}}>−{fmtGBP(pensionF.amount)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>= Taxable Gross</span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(taxableGrossF)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Personal Allowance <span style={{color:'var(--quiet)',fontWeight:600}}>(0%)</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'#059669'}}>{fmtGBP(breakdownF.pa)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Basic Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(20% on {fmtGBP(breakdownF.basicAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownF.basicTax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:breakdownF.additionalAmt>0?'1px solid var(--border-2)':'none'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Higher Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(40% on {fmtGBP(breakdownF.higherAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownF.higherTax)}</span></div>
                      {breakdownF.additionalAmt>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'7px 0'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Additional Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(45% on {fmtGBP(breakdownF.additionalAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownF.additionalTax)}</span></div>}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-red-deep)'}}>Total Income Tax</span>
                      <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--text-red-deep)'}}>{fmtGBP(breakdownF.totalTax)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--surface-2)',borderRadius:'11px',padding:'10px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>National Insurance <span style={{color:'var(--quiet)',fontWeight:600}}>(est., on full gross)</span></span>
                      <span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(niF)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-green-deep)'}}>Estimated Net Pay</span>
                      <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-green-deep)'}}>{fmtGBP(netF)}</span>
                    </div>
                    <div style={{fontSize:'9px',color:'var(--quiet)',lineHeight:1.5,marginTop:'8px'}}>The full income tax and NI computation for the whole year, not just the extra caused by crossing £100k. Pension tier is estimated from your current pay rate, not last scheme year's actual earnings, which is what the real rule technically uses.</div>
                  </div>
                )}

                <div style={{fontSize:'9.5px',color:'var(--quiet)',lineHeight:1.5,marginTop:'10px'}}>Based on your current pay rate projected across the tax year. Pension figures follow the 2015 Police Pension Scheme (England & Wales) rates effective 1 April 2026. Please do your own due diligence and if needs be consult an accountant/HMRC or your pension provider.</div>
              </>
            );
        if (taxModalOpen) taxModalContentRef.current = <>{cardHeader}<div style={{marginTop:'12px'}}>{cardBody}</div></>;

        // Printable summary — same underlying numbers as the on-screen
        // breakdown above, laid out for a full printed page instead of a
        // compact card. Portaled straight to document.body (bypassing
        // <main>'s own no-print) rather than nested inside this component's
        // usual tree, so it's the only thing left visible once the global
        // @media print rule hides everything else.
        const printRow = (label, value, opts={}) => (
          <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom: opts.noBorder?'none':'1px solid #e2e8f0'}}>
            <span style={{fontSize:'13px',fontWeight:opts.bold?800:600,color:opts.bold?'#0f172a':'#475569'}}>{label}</span>
            <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:opts.bold?'#0f172a':'#0f172a'}}>{value}</span>
          </div>
        );
        const printSection = (title, over, gross, pension, pensionRate, pensionablePay, taxable, pa, breakdown, ni, net, extraTax, paRemaining) => (
          <div style={{marginBottom:'28px',pageBreakInside:'avoid'}}>
            <div style={{fontSize:'15px',fontWeight:800,color:'#0f172a',marginBottom:'10px',borderBottom:'2px solid #0f172a',paddingBottom:'6px'}}>{title}</div>
            {printRow('Gross', fmtGBP(gross))}
            {printRow(`Pension Contribution (${(pensionRate*100).toFixed(2)}% of ${fmtGBP(pensionablePay)} pensionable pay)`, '−'+fmtGBP(pension))}
            {printRow('Taxable Gross', fmtGBP(taxable))}
            {printRow('Personal Allowance', fmtGBP(pa))}
            {printRow(`Basic Rate (20% on ${fmtGBP(breakdown.basicAmt)})`, fmtGBP(breakdown.basicTax))}
            {printRow(`Higher Rate (40% on ${fmtGBP(breakdown.higherAmt)})`, fmtGBP(breakdown.higherTax))}
            {breakdown.additionalAmt>0 && printRow(`Additional Rate (45% on ${fmtGBP(breakdown.additionalAmt)})`, fmtGBP(breakdown.additionalTax))}
            {printRow('Total Income Tax', fmtGBP(breakdown.totalTax), {bold:true})}
            {printRow('National Insurance', fmtGBP(ni))}
            {printRow('Estimated Net Pay', fmtGBP(net), {bold:true, noBorder:true})}
            <div style={{marginTop:'12px',fontSize:'12px',color: over?'#dc2626':'#059669',fontWeight:700}}>
              {over
                ? `Over the £100k taper threshold — ${fmtGBP(extraTax)} extra tax from ${fmtGBP(paRemaining===12570?0:12570-paRemaining)} of Personal Allowance lost, ${fmtGBP(paRemaining)} remaining.`
                : `Under the £100k taper threshold — full £${paRemaining.toLocaleString()} Personal Allowance retained.`}
            </div>
          </div>
        );

        return (
          <>
            <div ref={taxImpactCardRef} style={S.card}>
              {cardHeader}
              {!isWide && cardBody ? <div className="accordion-in">{cardBody}</div> : null}
            </div>
            {taxModalMounted && contentWrapRef.current && createPortal(
              <div className={'modal-pop'+(taxModalOpen?'':' pop-out')} style={modalBoxStyle(S.card)}>{taxModalContentRef.current}</div>,
              contentWrapRef.current
            )}
            {taxPrintOpen && createPortal(
              <div className="payslip-print-area" style={{position:'fixed',inset:0,background:'#fff',zIndex:80,overflowY:'auto',padding:'20px'}}>
                <div className="no-print" style={{display:'flex',gap:'8px',marginBottom:'18px',maxWidth:'640px',margin:'0 auto 18px'}}>
                  <button onClick={()=>setTaxPrintOpen(false)} aria-label="Back" style={{background:'#f1f5f9',border:'none',borderRadius:'11px',padding:'12px 16px',fontWeight:800,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',color:'#0f172a'}}><Ico n="back" s={13} c="#0f172a"/></button>
                  <button onClick={()=>window.print()} style={{flex:1,background:'#2563eb',color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="dl" s={13} c="#fff"/> Print / Save as PDF</button>
                </div>
                <div className="payslip-print-doc" style={{maxWidth:'640px',margin:'0 auto',background:'#fff'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'}}>
                    <div style={{fontSize:'20px',fontWeight:900,color:'#0f172a'}}>Tax &amp; £100k Calculator</div>
                    <div style={{fontSize:'11px',color:'#64748b',fontWeight:600}}>Generated {new Date().toLocaleDateString('en-GB')}</div>
                  </div>
                  <div style={{fontSize:'11px',color:'#64748b',marginBottom:'22px',lineHeight:1.5}}>UK income tax and National Insurance, calculated cumulatively across salary, allowances and overtime. Pension figures follow the 2015 Police Pension Scheme (England &amp; Wales) rates effective 1 April 2026. Estimates only — please consult an accountant, HMRC, or your pension provider for anything you intend to rely on.</div>
                  {printSection('Actual — Year to Date', overA, ytd, pensionA.amount, pensionA.rate, pensionablePayA, taxableYTD, breakdownA.pa, breakdownA, niA, netA, extraTaxA, paRemainingA)}
                  {printSection('Forecast — Full Year', overF, proj, pensionF.amount, pensionF.rate, pensionablePayF, taxableGrossF, breakdownF.pa, breakdownF, niF, netF, extraTaxF, paRemainingF)}
                </div>
              </div>,
              document.body
            )}
          </>
        );
      })()}

      {!isWide && <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'8px 4px 6px'}}>Data</div>}

      {/* ── Financial Years — generated calendar, every past year with data is browsable ── */}
      {(()=>{
        const cardHeader = (
          <button onClick={()=>{ if(isWide){setConfigExpanded(false);setTaxImpactExpanded(false);setExportDataExpanded(false);setDataManagementExpanded(false);} setFinancialYearsExpanded(v=>!v); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',marginBottom:(financialYearsExpanded&&!isWide)?'11px':0,cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{background:'var(--tint-blue)',padding:isWide?'11px':'9px',borderRadius:'13px'}}><Ico n="cal" s={isWide?21:17} c="#2563eb"/></div>
              <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Archived Financial Years</div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              {!isWide&&<span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline'}}>{financialYearsExpanded?'Tap to Close':'Tap to expand'}</span>}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:financialYearsExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
        );
        const cardBody = financialYearsExpanded&&(
          <>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {[CURRENT_FY_YEAR, ...yearsWithData].map(y=>{
                const yPeriods = generateFYPeriods(y);
                const isCurrent = y===CURRENT_FY_YEAR;
                const label = `${y} / ${(y+1).toString().slice(-2)}`;
                return (
                  <div key={y} onClick={()=>{ if(!isCurrent){ setArchiveExpandedPeriod(null); setFySummaryPrintMode(false); setFySummaryYear(y); } }} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'12px',background:isCurrent?'var(--tint-blue)':'var(--surface-2)',border:isCurrent?'2px solid #2563eb':'1px solid var(--border-2)',cursor:isCurrent?'default':'pointer'}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:'13px',color:'var(--ink)'}}>{label}</div>
                      <div style={{fontSize:'10px',color:'var(--quiet)',marginTop:'1px'}}>{yPeriods[0].month} – {yPeriods[11].month}</div>
                    </div>
                    {isCurrent
                      ? <span style={{fontSize:'8px',fontWeight:900,textTransform:'uppercase',letterSpacing:'1px',padding:'2px 7px',borderRadius:'20px',background:'#2563eb',color:'#fff'}}>Current</span>
                      : <Ico n="cR" s={14} c="#94a3b8"/>}
                  </div>
                );
              })}
              {yearsWithData.length===0&&<div style={{fontSize:'10.5px',color:'var(--quiet)',textAlign:'center',padding:'6px 0'}}>Past years will appear here once you have entries from before this financial year.</div>}
            </div>
            <div style={{fontSize:'9.5px',color:'var(--quiet)',textAlign:'center',marginTop:'10px',lineHeight:1.5}}>Dates are generated from your confirmed pay pattern (4-4-5 weeks, 52 weeks/year). Archived data is only retained for 4 years.</div>
          </>
        );
        if (fyModalOpen) fyModalContentRef.current = <>{cardHeader}<div style={{marginTop:'11px'}}>{cardBody}</div></>;
        return (
          <>
            <div style={S.card}>
              {cardHeader}
              {!isWide && cardBody ? <div className="accordion-in">{cardBody}</div> : null}
            </div>
            {fyModalMounted && contentWrapRef.current && createPortal(
              <div className={'modal-pop'+(fyModalOpen?'':' pop-out')} style={modalBoxStyle(S.card)}>{fyModalContentRef.current}</div>,
              contentWrapRef.current
            )}
          </>
        );
      })()}

      {/* ── Export to spreadsheet — separate from backup ── */}
      {(()=>{
        const cardHeader = (
          <button onClick={()=>{ if(isWide){setConfigExpanded(false);setTaxImpactExpanded(false);setFinancialYearsExpanded(false);setDataManagementExpanded(false);} setExportDataExpanded(v=>!v); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',marginBottom:(exportDataExpanded&&!isWide)?'11px':0,cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{background:'var(--tint-amber)',padding:isWide?'11px':'9px',borderRadius:'13px'}}><Ico n="share" s={isWide?21:17} c="#d97706"/></div>
              <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Financial Reports &amp; Export</div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              {!isWide&&<span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline'}}>{exportDataExpanded?'Tap to Close':'Tap to expand'}</span>}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:exportDataExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
        );
        const cardBody = exportDataExpanded&&(
          <>
            <button onClick={()=>{setExportFormat(null);setPayslipMode('period');setPayslipPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0);setPayslipFYYear(CURRENT_FY_YEAR);setPayslipModalOpen(true);}} disabled={entries.length===0} style={{width:'100%',padding:'12px',background: entries.length===0 ? 'var(--chip-bg)' : '#2563eb',border:'none',borderRadius:'11px',color: entries.length===0 ? 'var(--quiet)' : '#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor: entries.length===0 ? 'default' : 'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',textTransform:'uppercase',letterSpacing:'0.06em',boxShadow: entries.length===0 ? 'none' : '0 4px 14px rgba(37,99,235,0.3)'}}><Ico n="share" s={13} c={entries.length===0?'var(--quiet)':'#fff'}/> Export to PDF or Spreadsheet</button>
            {entries.length===0&&<div style={{fontSize:'10px',color:'var(--quiet)',textAlign:'center',marginTop:'8px',fontWeight:600}}>Log a shift first to enable export</div>}
            <div style={{fontSize:'9.5px',color:'var(--quiet)',textAlign:'center',marginTop:'8px',lineHeight:1.5}}>Archived data is only retained for 4 years.</div>
          </>
        );
        if (exportModalOpen) exportModalContentRef.current = <>{cardHeader}<div style={{marginTop:'11px'}}>{cardBody}</div></>;
        return (
          <>
            <div style={S.card}>
              {cardHeader}
              {!isWide && cardBody ? <div className="accordion-in">{cardBody}</div> : null}
            </div>
            {exportModalMounted && contentWrapRef.current && createPortal(
              <div className={'modal-pop'+(exportModalOpen?'':' pop-out')} style={modalBoxStyle(S.card)}>{exportModalContentRef.current}</div>,
              contentWrapRef.current
            )}
          </>
        );
      })()}

      {/* ── Account & Data Management — merged into one card, keeping
           Data Management's dark styling throughout (including the
           Delete Account section, restyled from its old light-card
           look to match the same dark-theme conventions Wipe All
           Data's own confirm flow already uses). One shared expand
           toggle now, not two. ── */}
      {(()=>{
        const acctBase = {background:'var(--surface)',borderRadius:'18px',padding:'19px',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',border:'1px solid var(--border-2)',marginBottom:'10px',position:'relative',overflow:'hidden'};
        const cardHeader = (
          <button onClick={()=>{ if(isWide){setConfigExpanded(false);setTaxImpactExpanded(false);setFinancialYearsExpanded(false);setExportDataExpanded(false);} setDataManagementExpanded(v=>!v); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',cursor:'pointer',marginBottom:(dataManagementExpanded&&!isWide)?'13px':0}}>
            <div style={{display:'flex',alignItems:'center',gap:'11px'}}>
              <div style={{background:'var(--tint-blue)',padding:'11px',borderRadius:'13px'}}><Ico n="user" s={21} c="#2563eb"/></div>
              <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Account &amp; Data Management</div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              {!isWide&&<span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline'}}>{dataManagementExpanded?'Tap to Close':'Tap to expand'}</span>}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:dataManagementExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
        );
        const cardBody = dataManagementExpanded&&(
          <div style={{background:'var(--surface-2)',borderRadius:'13px',padding:'13px'}}>
            {session&&<div style={{fontSize:'12px',color:'var(--ink)',fontWeight:700,marginBottom:'11px'}}>Signed in as {session.user?.email}</div>}

            {session&&(
              <div style={{marginBottom:'11px'}}>
                {!changePwMounted ? (
                  <button onClick={()=>setChangePwOpen(true)} style={{width:'100%',padding:'10px',background:'var(--chip-bg)',border:'1px solid var(--border)',borderRadius:'13px',color:'var(--ink)',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'0.06em'}}><Ico n="lock" s={12} c="var(--muted)"/> Change Password</button>
                ) : (
                  <div className={'alert-pop'+(changePwOpen?'':' pop-out')} style={{background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px'}}>
                    <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.5,fontWeight:600,marginBottom:'10px'}}>Choose a new password for your account.</div>
                    <input
                      type="password" placeholder="New password (at least 8 characters)" autoComplete="new-password"
                      value={newPw} onChange={e=>setNewPw(e.target.value)}
                      style={{width:'100%',background:'var(--surface-2)',border:'1px solid var(--border)',padding:'10px 12px',borderRadius:'10px',fontWeight:700,fontSize:'14px',fontFamily:'inherit',boxSizing:'border-box',color:'var(--ink)',marginBottom:'8px'}}
                    />
                    <input
                      type="password" placeholder="Confirm new password" autoComplete="new-password"
                      value={newPw2} onChange={e=>setNewPw2(e.target.value)}
                      style={{width:'100%',background:'var(--surface-2)',border:'1px solid var(--border)',padding:'10px 12px',borderRadius:'10px',fontWeight:700,fontSize:'14px',fontFamily:'inherit',boxSizing:'border-box',color:'var(--ink)',marginBottom:'8px'}}
                    />
                    {changePwError && <div style={{fontSize:'11.5px',color:'#dc2626',fontWeight:700,marginBottom:'8px'}}>{changePwError}</div>}
                    <div style={{display:'flex',gap:'6px'}}>
                      <button onClick={handleChangePassword} disabled={changingPw} style={{flex:1,padding:'9px',background:'#2563eb',border:'none',borderRadius:'8px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:changingPw?'not-allowed':'pointer',textTransform:'uppercase',letterSpacing:'0.06em',opacity:changingPw?0.7:1}}>{changingPw?'Saving…':'Save New Password'}</button>
                      <button onClick={()=>{ setChangePwOpen(false); setNewPw(''); setNewPw2(''); setChangePwError(''); }} disabled={changingPw} style={{flex:1,padding:'9px',background:'transparent',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--muted)',fontWeight:700,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'11px',lineHeight:1.5}}>Data is automatically synced and backed up to a secure cloud. To create a hard downloadable backup, select BACKUP. To restore from a previous hard copy, select RESTORE.</div>
            <div style={{display:'flex',gap:'6px',marginBottom:'11px'}}>
              <button onClick={handleExport} className={pulseBackupBtn?'backup-pulse':''} style={{flex:1,padding:'10px',background:'#2563eb',border:'none',borderRadius:'10px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'0.06em'}}><Ico n="dl" s={12} c="#fff"/> Backup</button>
              <button onClick={()=>setRestoreConfirmOpen(true)} style={{flex:1,padding:'10px',background:'var(--chip-bg)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--muted)',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'0.06em'}}><Ico n="ul" s={12} c="#475569"/> Restore</button>
              <input type="file" ref={fileRef} style={{display:'none'}} accept=".json" onChange={handleImport}/>
            </div>

            <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'11px'}}>
              {!wipeMounted
                ?<button onClick={()=>setWipeConf(true)} style={{width:'100%',padding:'10px',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',color:'var(--text-red-deep)',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'0.06em'}}><Ico n="trash" s={12} c="#b91c1c"/> Wipe All Data</button>
                :<div className={'alert-pop'+(wipeConf?'':' pop-out')} style={{background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px'}}>
                    <div style={{textAlign:'center',color:'var(--text-red-deep)',fontWeight:700,fontSize:'12px',marginBottom:'9px',lineHeight:1.4}}>Are you absolutely sure?<br/><span style={{fontSize:'10px',fontWeight:400,color:'#dc2626'}}>{session ? 'Deletes every logged shift and all TOIL data — on this device and in the cloud. ' : 'Deletes every logged shift and all TOIL data on this device. '}This cannot be undone unless you have downloaded a backup file to your device.</span></div>
                    <div style={{display:'flex',gap:'6px'}}>
                      <button onClick={handleWipe} disabled={wipingData} style={{flex:1,padding:'9px',background:'#dc2626',border:'none',borderRadius:'8px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:wipingData?'not-allowed':'pointer',textTransform:'uppercase',letterSpacing:'0.06em',opacity:wipingData?0.7:1}}>{wipingData?'Wiping…':'Yes, Delete'}</button>
                      <button onClick={()=>setWipeConf(false)} disabled={wipingData} style={{flex:1,padding:'9px',background:'transparent',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--muted)',fontWeight:700,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
              }
            </div>

            {session&&(
              <div style={{borderTop:'1px solid var(--border-2)',marginTop:'11px',paddingTop:'11px'}}>
                {!deleteAcctMounted ? (
                  <button onClick={()=>setDeleteAcctConf(true)} style={{width:'100%',padding:'10px',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',color:'var(--text-red-deep)',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'0.06em'}}><Ico n="trash" s={12} c="#b91c1c"/> Delete Account</button>
                ) : (
                  <div className={'alert-pop'+(deleteAcctConf?'':' pop-out')} style={{background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px'}}>
                    <div style={{fontSize:'11.5px',color:'var(--text-red-deep)',lineHeight:1.5,fontWeight:700,marginBottom:'10px'}}>This permanently deletes your account and email registration, and all data stored in the cloud under it. Data already on this device isn't touched. Your email becomes available for a brand new account afterward. This can't be undone.</div>
                    <div style={{fontSize:'10px',color:'#dc2626',fontWeight:900,marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.06em'}}>Type your email to confirm: {session.user?.email}</div>
                    <input
                      value={deleteAcctTyped}
                      onChange={e=>setDeleteAcctTyped(e.target.value)}
                      placeholder={session.user?.email}
                      style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',padding:'10px 12px',borderRadius:'10px',fontWeight:700,fontSize:'14px',fontFamily:'inherit',boxSizing:'border-box',color:'var(--ink)',marginBottom:'10px'}}
                    />
                    <div style={{display:'flex',gap:'6px'}}>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteAcctTyped !== session.user?.email || deletingAcct}
                        style={{flex:1,padding:'9px',background:(deleteAcctTyped===session.user?.email)?'#dc2626':'#fca5a5',border:'none',borderRadius:'8px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:(deleteAcctTyped===session.user?.email)?'pointer':'not-allowed',textTransform:'uppercase',letterSpacing:'0.06em'}}
                      >{deletingAcct?'Deleting…':'Delete Permanently'}</button>
                      <button onClick={()=>{ setDeleteAcctConf(false); setDeleteAcctTyped(''); }} style={{flex:1,padding:'9px',background:'transparent',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--muted)',fontWeight:700,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
        if (dataModalOpen) dataModalContentRef.current = <>{cardHeader}<div style={{marginTop:'13px'}}>{cardBody}</div></>;
        return (
          <>
            <div style={acctBase}>
              {cardHeader}
              {!isWide && cardBody ? <div className="accordion-in">{cardBody}</div> : null}
            </div>
            {dataModalMounted && contentWrapRef.current && createPortal(
              <div className={'modal-pop'+(dataModalOpen?'':' pop-out')} style={modalBoxStyle(acctBase)}>{dataModalContentRef.current}</div>,
              contentWrapRef.current
            )}
          </>
        );
      })()}

      {!isWide && <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'8px 4px 6px'}}>Support</div>}

      {/* ── Help & suggestions ── */}
      <div style={S.card}>
        <a href="mailto:ajstephe@me.com?subject=Overtime%20Tracker%20—%20Feedback" style={{display:'flex',alignItems:'center',gap:'12px',textDecoration:'none',cursor:'pointer'}}>
          <div style={{background:'var(--tint-blue)',padding:isWide?'13px':'11px',borderRadius:'13px',flexShrink:0}}><Ico n="mail" s={isWide?23:19} c="#2563eb"/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Help & Suggestions</div>
            <div style={{fontSize:'11px',color:'#3b82f6',fontWeight:700,marginTop:'2px'}}>ajstephe@me.com</div>
          </div>
          <Ico n="cR" s={16} c="#94a3b8"/>
        </a>
      </div>
      </div>

      {/* ── Backdrop for the desktop popup cards above — click
           anywhere outside the open card to close it. Only one card
           can be open in modal form at a time (each card's onClick
           closes the other four first), so closing all five here is
           equivalent to closing whichever one is actually open.
           Portalled to contentWrapRef, same reasoning as the popup
           cards themselves (see modalBoxStyle above). ── */}
      {anyModalMounted && contentWrapRef.current && createPortal(
        <div onClick={()=>{ setConfigExpanded(false); setTaxImpactExpanded(false); setFinancialYearsExpanded(false); setExportDataExpanded(false); setDataManagementExpanded(false); }} className={anyModalOpen?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',zIndex:55}}/>,
        contentWrapRef.current
      )}
    </div>
  );
}
