import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CURRENT_FY_YEAR, generateFYPeriods, localDateStr } from '../lib/payPeriods.js';
import { PAY_RATES } from '../lib/payRates.js';
import { fmtGBP } from '../lib/format.js';
import { Ico, FireExitIcon } from './Icons.jsx';
import { PrivacyNotice } from './PrivacyNotice.jsx';
import { SegSlider } from './SegSlider.jsx';
import { useMountTransition } from '../lib/useMountTransition.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// Matches the mobile theme row's track side padding, so arrow stops line
// up the same way the row's two ends do.
const THEME_ROW_PAD = 6;
const THEME_OPTIONS = [['system','Auto'],['light','Light'],['dark','Dark'],['corporate','Corporate'],['professional','Pro'],['midnight','Midnight'],['flagship','Flagship'],['heritage','Heritage'],['heather','Heather']];

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
  savedBadge, themeMode, setTheme, pillShadow,
  configExpanded, setConfigExpanded, configShown, configSetupIncomplete,
  justCompletedSetup, setJustCompletedSetup,
  setupPopupRequested, setSetupPopupRequested,
  taxImpactExpanded, setTaxImpactExpanded, taxImpactCardRef,
  taxCalcActualDetailOpen, setTaxCalcActualDetailOpen,
  taxCalcForecastDetailOpen, setTaxCalcForecastDetailOpen,
  financialYearsExpanded, setFinancialYearsExpanded,
  exportDataExpanded, setExportDataExpanded,
  dataManagementExpanded, setDataManagementExpanded,
  settings, saveSett, totals, taxView, entries, currPeriodIdx,
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
  const [privacyNoticeOpen, setPrivacyNoticeOpen] = useState(false);
  // Pay scales table in Config: just your own rank around your pay point
  // until "Show all pay scales" is tapped.
  const [showAllScales, setShowAllScales] = useState(false);
  // A change of rank or pay point once you're set up: held here until you
  // say when it took effect, so earlier shifts and paydays keep the rates
  // they were actually paid at (see payPointOn in lib/payRates.js).
  const [pendingPay, setPendingPay] = useState(null); // { rank, service }
  const [pendingFrom, setPendingFrom] = useState(localDateStr());
  const setUp = !!(settings.rank && settings.service);
  const payHistoryOf = s => (Array.isArray(s.payHistory) && s.payHistory.length) ? s.payHistory : [{ from:'', rank:s.rank, service:s.service }];
  const confirmPayChange = (asCorrection) => {
    if (!pendingPay?.service) return;
    if (asCorrection) {
      // A correction: this was always the right pay point.
      const { payHistory, ...rest } = settings;
      const hist = payHistoryOf(settings);
      const fixed = hist.length>1 ? hist.slice(0,-1).concat([{ ...hist[hist.length-1], rank:pendingPay.rank, service:pendingPay.service }]) : null;
      saveSett(fixed ? { ...rest, rank:pendingPay.rank, service:pendingPay.service, payHistory:fixed } : { ...rest, rank:pendingPay.rank, service:pendingPay.service });
    } else {
      const from = pendingFrom || localDateStr();
      const hist = payHistoryOf(settings).filter(x => (x.from||'') < from);
      const base = hist.length ? hist : [{ from:'', rank:settings.rank, service:settings.service }];
      const payHistory = [...base, { from, rank:pendingPay.rank, service:pendingPay.service }];
      // The pay point shown everywhere is the latest one.
      const latest = [...payHistory].sort((a,b)=>(a.from||'').localeCompare(b.from||'')).pop();
      saveSett({ ...settings, rank:latest.rank, service:latest.service, payHistory });
    }
    setPendingPay(null); setPendingFrom(localDateStr());
  };
  const undoLastPayChange = () => {
    const hist = payHistoryOf(settings);
    if (hist.length<2) return;
    const kept = hist.slice(0,-1);
    const latest = kept[kept.length-1];
    const { payHistory, ...rest } = settings;
    saveSett(kept.length>1 ? { ...rest, rank:latest.rank, service:latest.service, payHistory:kept } : { ...rest, rank:latest.rank, service:latest.service });
  };
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
  // setupPopupRequested (see goToConfigSetup in App.jsx) is the one
  // deliberate exception to configSetupIncomplete always keeping this
  // inline (see the showInline/showModal split further down): someone who
  // explicitly followed a "Setup Required" prompt asked to be taken
  // straight to this, so it pops out immediately rather than making them
  // spot and tap the inline card themselves.
  const configModalOpen = isWide && ((configExpanded && !configSetupIncomplete) || setupPopupRequested);
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
  // Focus management for the five popovers above (see useFocusTrap.js) —
  // the inline "are you sure" panels further down (Wipe Data, Delete
  // Account, Change Password) are deliberately left out of this: they're
  // non-modal expanding panels within an already-open card, same pattern
  // as Summary's inline delete confirm, not a screen-covering overlay of
  // their own — trapping Tab inside one nested inside an already-trapped
  // popover would fight that outer trap rather than layer with it.
  const configModalTrapRef = useRef(null); useFocusTrap(configModalOpen, configModalTrapRef);
  const taxModalTrapRef = useRef(null); useFocusTrap(taxModalOpen, taxModalTrapRef);
  const fyModalTrapRef = useRef(null); useFocusTrap(fyModalOpen, fyModalTrapRef);
  const exportModalTrapRef = useRef(null); useFocusTrap(exportModalOpen, exportModalTrapRef);
  const dataModalTrapRef = useRef(null); useFocusTrap(dataModalOpen, dataModalTrapRef);
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

  // ── mobile Appearance row: an arrow + edge fade whenever themes sit
  // off-screen, since a phone only fits about five of the nine. ──
  const themeRowRef = useRef(null);
  const [themeRowEdges, setThemeRowEdges] = useState({ start:true, end:true });
  const updateThemeRowEdges = () => {
    const el = themeRowRef.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setThemeRowEdges(prev => (prev.start===start && prev.end===end) ? prev : { start, end });
  };
  const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (isWide) return;
    const el = themeRowRef.current;
    if (!el) return;
    updateThemeRowEdges();
    // Watching the track as well as the scroller: each theme has its own
    // font, so picking one changes the row's content width without the
    // scroller itself resizing — the arrows went stale without this.
    const ro = new ResizeObserver(updateThemeRowEdges);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [isWide]);
  // Keep the chosen theme fully in view — on opening Settings (a theme from
  // past the edge, e.g. Flagship, would otherwise start hidden) and after
  // each pick, once the new theme's font has changed the row's widths.
  const themeRevealedRef = useRef(false);
  useEffect(() => {
    if (isWide) return;
    const el = themeRowRef.current;
    if (!el) return;
    const smooth = themeRevealedRef.current && !reduceMotion();
    themeRevealedRef.current = true;
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      const btn = el.querySelector(`[data-seg-key="${themeMode}"]`);
      if (!btn) return;
      const pad = THEME_ROW_PAD, left = btn.offsetLeft - pad, right = btn.offsetLeft + btn.offsetWidth + pad;
      const max = el.scrollWidth - el.clientWidth;
      let target = null;
      if (left < el.scrollLeft) target = left;
      else if (right > el.scrollLeft + el.clientWidth) target = right - el.clientWidth;
      if (target !== null) {
        // A theme whose font makes the row a few px wider would otherwise
        // leave it sitting a sliver off either end — stay on the end when
        // the chosen theme is still fully visible there.
        if (target < 2*pad && btn.offsetLeft + btn.offsetWidth <= el.clientWidth) target = 0;
        if (target > max - 2*pad && btn.offsetLeft >= max) target = max;
        el.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
      }
      updateThemeRowEdges();
    };
    // One frame later so App has applied the new data-theme (a parent's
    // effects run after this child's), then again once its font loads.
    const raf = requestAnimationFrame(() => {
      void el.offsetWidth;
      reveal();
      document.fonts?.ready?.then(reveal);
    });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [themeMode, isWide]);
  // Pages by whole themes rather than a fixed distance, which used to stop
  // part-way through one: › brings the first theme cut off on the right to
  // the left edge, ‹ brings the one cut off on the left to the right edge.
  // pad matches the track's own side padding, so every stop lines up the
  // same way the row's two ends do.
  // The arrows step through a fixed set of stops worked out from the row
  // itself: each stop starts with the first theme the previous one cut
  // off, so every theme is fully visible at some stop and ‹ retraces
  // exactly the stops › went through. (Skipping ahead to the end instead,
  // tried earlier, could jump clean past a theme.)
  const themeRowStops = (el) => {
    const items = [...el.querySelectorAll('[data-seg-key]')];
    const max = el.scrollWidth - el.clientWidth;
    const stops = [0];
    let s = 0;
    while (s < max - 1) {
      const next = items.find(b => b.offsetLeft + b.offsetWidth > s + el.clientWidth + 1);
      const t = next ? Math.min(next.offsetLeft - THEME_ROW_PAD, max) : max;
      s = t > s + 1 ? t : max;
      stops.push(s);
    }
    return stops;
  };
  const scrollThemeRow = (dir) => {
    const el = themeRowRef.current;
    if (!el) return;
    const stops = themeRowStops(el), cur = el.scrollLeft;
    const target = dir > 0
      ? (stops.find(s => s > cur + 1) ?? stops[stops.length-1])
      : (stops.slice().reverse().find(s => s < cur - 1) ?? 0);
    el.scrollTo({ left: target, behavior: reduceMotion()?'auto':'smooth' });
  };
  const themeIndicator = {background:BRASS,borderRadius:'9px',boxShadow:`0 4px 11px ${pillShadow}`};
  const themeButtons = THEME_OPTIONS.map(([v,lbl])=>(
    <button key={v} data-seg-key={v} onClick={()=>setTheme(v)} style={{position:'relative',zIndex:1,flexShrink:0,whiteSpace:'nowrap',padding:'6px 12px',borderRadius:'9px',border:'none',fontFamily:'inherit',fontWeight:900,fontSize:'12px',cursor:'pointer',background:'transparent',color:themeMode===v?'#fff':'var(--muted)'}}>{lbl}</button>
  ));

  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:0,letterSpacing:'-0.5px'}}>More..</h2>
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
            <div style={{fontWeight:900,fontSize:'13px',color:'var(--ink)'}}>Themes</div>
            <div style={{fontSize:'10px',color:'var(--quiet)',marginTop:'1px'}}>Light, dark, or a different look entirely</div>
          </div>
        </div>
        {/* Pro is short for Professional Light —
            the sliding pill (SegSlider) measures each segment's own
            offsetLeft/offsetWidth to animate between them, which only works
            for a single non-wrapping row. Eight options no longer fit at
            equal width on a narrow phone, so segments size to their own
            label (flexShrink:0) instead of splitting the row evenly, and
            the track scrolls horizontally rather than wrapping — SegSlider's
            offsetLeft/offsetWidth measurements are unaffected by scroll
            position, so the pill still lands correctly either way. */}
        {isWide ? (
          <SegSlider activeKey={themeMode} trackStyle={{display:'flex',gap:'6px',overflowX:'auto',padding:'3px 1px'}} indicatorStyle={themeIndicator}>{themeButtons}</SegSlider>
        ) : (
          <>
            {/* Arrows sit in their own slots either side of the row, not on
                top of it — overlaid, they covered the next theme along, so a
                tap on its visible half scrolled instead of selecting. At an
                end they dim and disable rather than vanish, so the row never
                shifts sideways. The scroller wraps SegSlider (rather than
                being its track) so it can be measured and scrolled from
                here; paddingBottom gives the pill's shadow room, since a
                scroller clips everything outside its box. */}
            <style>{'.theme-row::-webkit-scrollbar{display:none}'}</style>
            {(()=>{
              const arrow = (edge, icon, label, dir) => {
                const off = themeRowEdges[edge];
                return (
                  <button type="button" aria-label={label} disabled={off} onClick={()=>scrollThemeRow(dir)} style={{flexShrink:0,width:'28px',height:'28px',borderRadius:'50%',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--muted)',boxShadow:off?'none':'0 2px 6px rgba(15,39,68,0.14)',display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:off?'default':'pointer',opacity:off?0.35:1,transition:'opacity .2s,box-shadow .2s',touchAction:'manipulation'}}>
                    <Ico n={icon} s={13} w={2.6}/>
                  </button>
                );
              };
              const fade = (edge, side) => (
                <div aria-hidden="true" style={{position:'absolute',top:0,bottom:0,[side]:0,zIndex:2,width:'22px',pointerEvents:'none',background:`linear-gradient(to ${side==='left'?'right':'left'}, var(--surface), rgba(var(--surface-rgb),0))`,opacity:themeRowEdges[edge]?0:1,transition:'opacity .2s'}}/>
              );
              return (
                <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                  {arrow('start','cL','Show earlier themes',-1)}
                  <div style={{position:'relative',flex:1,minWidth:0}}>
                    <div ref={themeRowRef} onScroll={updateThemeRowEdges} className="theme-row" style={{overflowX:'auto',scrollbarWidth:'none',paddingBottom:'12px',marginBottom:'-12px'}}>
                      <SegSlider activeKey={themeMode} trackStyle={{display:'flex',gap:'6px',padding:'3px 6px',width:'max-content'}} indicatorStyle={themeIndicator}>{themeButtons}</SegSlider>
                    </div>
                    {fade('start','left')}
                    {fade('end','right')}
                  </div>
                  {arrow('end','cR','Show more themes',1)}
                </div>
              );
            })()}
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--quiet)',marginTop:'7px'}}>{THEME_OPTIONS.length} themes · swipe or use the arrows to see them all</div>
          </>
        )}
      </div>

      <div style={isWide?{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}:undefined}>

      {/* ── Section labels — pure grouping, no functional change. On
           desktop each spans the full width of the 2-column grid so the
           cards under it read as one group. ── */}
      <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',padding:isWide?'6px 4px 0':'2px 4px 6px',...(isWide?{gridColumn:'1 / -1'}:{})}}>Pay &amp; tax</div>

      {/* ── Configuration — now a single collapsible unit like the
           other cards, except it forces itself open for as long as
           rank/pay point setup is incomplete (see configShown above)
           — that part was never meant to be hideable. ── */}
      {(()=>{
        const cardHeader = (
          <button disabled={configSetupIncomplete} onClick={configSetupIncomplete?undefined:()=>{ if(isWide){setTaxImpactExpanded(false);setFinancialYearsExpanded(false);setExportDataExpanded(false);setDataManagementExpanded(false);} setJustCompletedSetup(false); setSetupPopupRequested(false); setConfigExpanded(v=>!v); }} className={configSetupIncomplete?'':'tap-row'} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',cursor:configSetupIncomplete?'default':'pointer',marginBottom:(configShown&&(!isWide||configSetupIncomplete||justCompletedSetup))?'13px':0}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{background:'var(--tint-blue)',padding:isWide?'11px':'9px',borderRadius:'13px'}}><Ico n="cog" s={isWide?21:17} c="#2563eb"/></div>
              <div><div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Config, Rates &amp; Payscales</div><div style={{fontSize:'11px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>Rank, pay point, rates</div></div>
            </div>
            {!configSetupIncomplete && (
              <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:configShown?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
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
          {/* setup-pulse-urgent is back on this wrapper — pulled off it
              entirely during the "why does picking Rank jump back and
              close Pay Point" investigation, on suspicion the animation
              itself was force-closing the native <select> popup. It
              wasn't: the real causes turned out to be a render-timing
              remount, an involuntary desktop modal pop-out, an
              unconditional push on mount, and a stale out-of-order
              realtime echo — all in App.jsx's sync/render logic, nothing
              here. Safe to restore. Still deliberately using the
              transform-free urgentPulse (opacity + box-shadow only, see
              its keyframes) rather than the original scale() version —
              animating transform on a native <select>'s ancestor is a
              real, separate risk on some browsers regardless of whether
              it was ever the actual cause here, so no reason to bring
              that part back too. */}
          <div className={!settings.rank?'setup-pulse-urgent':''} style={{borderRadius:'13px',position:'relative'}}>
            <select style={{...S.sel,paddingRight:'36px',border: !settings.rank ? '2px solid #dc2626' : '1px solid var(--border-2)',fontWeight: !settings.rank ? 900 : 700}} value={pendingPay ? pendingPay.rank : settings.rank} onChange={e=>{
              const r=e.target.value;
              if (setUp) {
                // Once set up, a change waits for its "from" date below.
                if (!r || (r===settings.rank)) return setPendingPay(null);
                return setPendingPay({ rank:r, service:'' });
              }
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
        {/* Gated on PAY_RATES[settings.rank] actually existing, not just
            settings.rank being truthy — a rank string that's no longer a
            valid key (synced down from before a pay-scale rename, or from
            an old backup) used to still pass this check and then crash on
            Object.keys(PAY_RATES[settings.rank]) below. Now it just
            behaves like no rank is set, matching how App.jsx's own two
            rate lookups already treat this defensively. */}
        {PAY_RATES[pendingPay ? pendingPay.rank : settings.rank]&&(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px'}}>
              <label style={{...S.lbl,marginBottom:0}}>Pay Point</label>
              {!settings.service&&<span style={{fontSize:'10px',fontWeight:900,color:'#dc2626',background:'var(--tint-red)',padding:'2px 7px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.06em'}}>Now this</span>}
            </div>
            {/* Same restoration, same reasoning, as Rank's wrapper above. */}
            <div className={!settings.service?'setup-pulse-urgent':''} style={{borderRadius:'13px',position:'relative'}}>
              <select style={{...S.sel,paddingRight:'36px',border: !settings.service ? '2px solid #dc2626' : '1px solid var(--border-2)',fontWeight: !settings.service ? 900 : 700}} value={pendingPay ? pendingPay.service : settings.service} onChange={e=>{
                const v = e.target.value;
                if (setUp) {
                  const r = pendingPay ? pendingPay.rank : settings.rank;
                  if (r===settings.rank && v===settings.service) return setPendingPay(null);
                  return setPendingPay({ rank:r, service:v });
                }
                saveSett({...settings,service:v});
              }}>
                <option value="">Select pay point...</option>
                {Object.keys(PAY_RATES[pendingPay ? pendingPay.rank : settings.rank]).map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              <div style={{position:'absolute',right:'13px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',display:'flex'}}><Ico n="cD" s={13} c="var(--quiet)" w={2.5}/></div>
            </div>
          </div>
        )}
        {pendingPay && (
          <div style={{marginTop:'12px',background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px 13px'}}>
            {pendingPay.service ? (<>
              <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)',marginBottom:'3px'}}>When did {pendingPay.service} start?</div>
              <div style={{fontSize:'11.5px',fontWeight:600,color:'var(--muted)',lineHeight:1.5,marginBottom:'9px'}}>Shifts and paydays before this date keep {settings.service}'s rates.</div>
              <input type="date" value={pendingFrom} onChange={e=>setPendingFrom(e.target.value)} style={{...S.inp,marginBottom:'9px'}}/>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                <button onClick={()=>confirmPayChange(false)} style={{flex:'1 1 140px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'10px',padding:'10px',fontWeight:800,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>Save change</button>
                <button onClick={()=>setPendingPay(null)} style={{flex:'0 0 auto',background:'var(--surface)',color:'var(--muted)',border:'1px solid var(--border)',borderRadius:'10px',padding:'10px 14px',fontWeight:800,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              </div>
              <button onClick={()=>confirmPayChange(true)} style={{background:'none',border:'none',padding:'9px 0 0',fontSize:'11.5px',fontWeight:700,color:'#2563eb',textDecoration:'underline',cursor:'pointer',fontFamily:'inherit'}}>It was always {pendingPay.service} — correct it for every date</button>
            </>) : (
              <div style={{fontSize:'12px',fontWeight:700,color:'var(--muted)'}}>Now choose the new pay point. <button onClick={()=>setPendingPay(null)} style={{background:'none',border:'none',padding:0,color:'#2563eb',fontWeight:800,cursor:'pointer',fontFamily:'inherit',textDecoration:'underline',fontSize:'12px'}}>Cancel</button></div>
            )}
          </div>
        )}
        {!pendingPay && Array.isArray(settings.payHistory) && settings.payHistory.length>1 && (
          <div style={{marginTop:'12px',fontSize:'11.5px',fontWeight:600,color:'var(--muted)',lineHeight:1.6}}>
            {[...settings.payHistory].sort((a,b)=>(a.from||'').localeCompare(b.from||'')).map((h,i,arr)=>{
              const next = arr[i+1];
              const d = x => new Date(x+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
              return <div key={i}><b style={{color:'var(--ink)'}}>{h.service}</b>{h.from?` from ${d(h.from)}`:''}{next?` until ${d(new Date(new Date(next.from+'T12:00:00').getTime()-86400000).toISOString().slice(0,10))}`:''}</div>;
            })}
            <button onClick={undoLastPayChange} style={{background:'none',border:'none',padding:'4px 0 0',fontSize:'11.5px',fontWeight:700,color:'#2563eb',textDecoration:'underline',cursor:'pointer',fontFamily:'inherit'}}>Undo the last change</button>
          </div>
        )}
        <div style={{display:'flex',alignItems:'center',gap:'8px',borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px'}}>
          <div style={{background:'var(--tint-blue)',padding:'9px',borderRadius:'13px'}}><Ico n="clock" s={17} c="#2563eb"/></div>
          <span style={{fontWeight:900,fontSize:'13px',color:'var(--ink)'}}>Hourly Rates & Payscales</span>
        </div>

        {/* Same defensive gate as the Pay Point block above — checks the
            lookup actually resolves rather than just that both strings are
            non-empty, so an invalid rank/service pair can't reach the
            unguarded PAY_RATES[rank][service] below. */}
        {PAY_RATES[settings.rank]?.[settings.service]&&(()=>{
          const svcData = PAY_RATES[settings.rank][settings.service];
          return (
            <div style={{borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'14px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                {[['Pre 1 Sep 2026','pre','var(--muted)','var(--surface-2)'],['From 1 Sep 2026','post','#2563eb','var(--surface)']].map(([label,key,col,bg])=>(
                  <div key={key} style={{background:bg,borderRadius:'12px',padding:'12px',border:key==='post'?'1.5px solid var(--border-2)':'1px solid var(--border-2)'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:col,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>{label}</div>
                    {['Base','1.33×','1.5×','2×'].map((lbl,i)=>(
                      <div key={lbl} style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                        <span style={{fontSize:'10px',fontWeight:700,color:'var(--muted)'}}>{lbl}</span>
                        <span style={{fontSize:'10px',fontWeight:900,color:key==='post'?'var(--text-navy)':'var(--muted)'}}>£{(svcData[key][['base','r133','r150','r200'][i]]||0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{borderTop:'1px solid var(--border-2)',marginTop:'16px',paddingTop:'14px'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'10px'}}>Published pay scales</div>
                {/* With a rank and pay point set, show that rank only, your own
                    row highlighted plus the pay points either side; "Show all
                    pay scales" brings back both full tables. */}
                {(()=>{
                  const mine = settings.rank && settings.service && PAY_RATES[settings.rank]?.[settings.service];
                  const ranks = (mine && !showAllScales) ? [settings.rank] : ['Constable','Sergeant'];
                  const visiblePoints = rank => {
                    const pts = Object.keys(PAY_RATES[rank]);
                    if (!mine || showAllScales || rank!==settings.rank) return pts;
                    const i = pts.indexOf(settings.service);
                    return pts.slice(Math.max(0,i-1), i+2);
                  };
                  return (<>
                {ranks.map(rank=>(
                  <div key={rank} style={{marginBottom: rank==='Constable' && ranks.length>1 ? '16px' : 0}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:'var(--text-navy)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'}}>{rank}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr',gap:0,alignItems:'center'}}>
                      <div style={{fontSize:'8px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',paddingBottom:'5px',borderBottom:'1px solid var(--border-2)'}}>Pay Point</div>
                      <div style={{fontSize:'8px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid var(--border-2)'}}>Pre-Sept</div>
                      <div style={{fontSize:'8px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid var(--border-2)'}}>Post-Sept</div>
                      {visiblePoints(rank).map(point=>{
                        const data = PAY_RATES[rank][point];
                        const me = rank===settings.rank && point===settings.service;
                        const cell = {fontSize:'11px',padding:'6px 8px',background:me?'var(--tint-brass)':'transparent'};
                        return (
                        <div key={point} style={{display:'contents'}}>
                          <div style={{...cell,fontWeight:me?900:700,color:'var(--ink)',boxShadow:me?`inset 3px 0 0 ${BRASS}`:'none',paddingLeft:me?'11px':'8px'}}>{point}{me&&<span style={{fontWeight:700,color:'var(--muted)'}}> · you</span>}</div>
                          <div style={{...cell,fontWeight:700,color:'var(--muted)',textAlign:'right'}}>£{data.salary.pre.toLocaleString('en-GB')}</div>
                          <div style={{...cell,fontWeight:900,color:'var(--text-navy)',textAlign:'right'}}>£{data.salary.post.toLocaleString('en-GB')}</div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {mine&&(
                  <button type="button" onClick={()=>setShowAllScales(v=>!v)} style={{display:'block',width:'100%',marginTop:'10px',background:'none',border:'none',padding:'6px',fontSize:'12.5px',fontWeight:800,color:BRASS,cursor:'pointer',fontFamily:'inherit'}}>{showAllScales?'Show fewer':'Show all pay scales'}</button>
                )}
                  </>);
                })()}
                <div style={{marginTop:'12px',fontSize:'9px',fontWeight:600,color:'var(--quiet)',lineHeight:1.5}}>Excludes London Weighting (£3,150 pre-Sept / £3,260 post-Sept) and London Allowance (£6,588), which are added separately.</div>
              </div>
            </div>
          );
        })()}
        </>
        );
        // Desktop: only the genuinely user-toggled open state pops out as
        // a modal — the forced-open-while-setup-incomplete case (and the
        // one-render-longer justCompletedSetup tail right after it
        // finishes, from App.jsx) both stay inline even on desktop: landing
        // here organically (the More.. nav item, say) with setup still
        // incomplete is a first-run nudge, not something tapped open, so
        // it shouldn't hijack into a popup on its own. setupPopupRequested
        // is the deliberate exception — that flag only ever gets set by an
        // explicit "Setup Required" prompt (see goToConfigSetup in
        // App.jsx), so a popup is exactly what was asked for, and it stays
        // a popup through justCompletedSetup too rather than snapping back
        // to inline the instant Pay Point gets picked — the same "don't
        // yank it away right as they finish" reasoning justCompletedSetup
        // itself exists for, just applied to the popup instead of the
        // inline card since that's the surface it was actually shown on.
        // setupPopupRequested only ever suppresses the inline card on
        // desktop, where showModal picks it up instead — on mobile the
        // popup never exists at all (showModal is isWide-gated below), so
        // this card has to keep showing inline there regardless of the
        // flag, or "Go to More.." from a Setup Required prompt would leave
        // a mobile visitor looking at neither.
        const showInline = configShown && (!isWide || configSetupIncomplete || justCompletedSetup) && !(setupPopupRequested && isWide);
        const showModal = isWide && (configExpanded && !configSetupIncomplete && !justCompletedSetup || setupPopupRequested);
        if (showModal) configModalContentRef.current = <>{cardHeader}<div style={{marginTop:'13px'}}>{cardBody}</div></>;
        return (
          <>
            <div style={S.card}>
              {cardHeader}
              {showInline && cardBody ? <div className="accordion-in">{cardBody}</div> : null}
            </div>
            {configModalMounted && contentWrapRef.current && createPortal(
              <div ref={configModalTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Config, Rates & Payscales" className={'modal-pop'+(showModal?'':' pop-out')} style={modalBoxStyle(S.card)}>{configModalContentRef.current}</div>,
              contentWrapRef.current
            )}
          </>
        );
      })()}

      {/* ── Tax & 100K+ Calculator — Actual (YTD) and Forecast (full year), side by side ── */}
      {settings.rank&&settings.service&&taxView&&(()=>{
        // Both columns come straight from the monthly payslips (see taxView
        // in App.jsx): Actual = the paydays so far this tax year, Forecast =
        // all twelve. Tax and NI are worked out the way payroll does; the
        // £100k taper isn't applied in the month, so its extra tax is shown
        // on its own as what's likely to be collected later.
        const A = taxView.actual, F = taxView.forecast;
        const ytd = A.gross, proj = F.gross;
        const overA = A.over, overF = F.over;
        const pensionA = { amount:A.pension, rate:A.pensionRate }, pensionF = { amount:F.pension, rate:F.pensionRate };
        const pensionablePayA = A.pensionable, pensionablePayF = F.pensionable;
        const taxableYTD = A.taxable, taxableGrossF = F.taxable;
        const annualisedFromYTD = A.runRate;
        const paRemainingA = A.allowanceLeft, paRemainingF = F.allowanceLeft;
        const paLostProRatedA = A.allowanceLostSoFar, paLostF = F.allowanceLostSoFar;
        const extraTaxA = A.extraTax, extraTaxF = F.extraTax;
        const breakdownA = A.breakdown, breakdownF = F.breakdown;
        const niA = A.ni, niF = F.ni, netA = A.net, netF = F.net;

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
              <div><div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Tax & 100K+ Calculator</div><div style={{fontSize:'11px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>Your tax band and the £100k taper</div></div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:taxImpactExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
        );
        const cardBody = taxImpactExpanded&&(
              <>
                <div style={{display:'flex',alignItems:'flex-start',gap:'8px',marginBottom:'13px'}}>
                  <Ico n="shield" s={13} c="#94a3b8"/>
                  <span style={{fontSize:'11px',fontWeight:600,color:'var(--muted)',lineHeight:1.5}}>Worked out the way payroll does: tax code 1257L, month by month, with NI on each month's pay. Above £100k payroll keeps giving you the full tax-free allowance; Extra Tax is what's likely to be collected later.</span>
                </div>
                <button onClick={()=>setTaxPrintOpen(true)} style={{width:'100%',marginBottom:'13px',background:BRASS,color:'#fff',border:'none',borderRadius:'11px',padding:'11px',fontWeight:800,fontSize:'13px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'7px'}}><Ico n="dl" s={14} c="#fff"/> Print or save as PDF</button>
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
                    <div style={{fontSize:'10.5px',fontWeight:800,color:overA?'#dc2626':'#059669',marginTop:'8px',textAlign:'center'}}>{taxCalcActualDetailOpen?'Showing full breakdown below':'Full breakdown ›'}</div>
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
                    <div style={{fontSize:'10.5px',fontWeight:800,color:overF?'#dc2626':'#059669',marginTop:'8px',textAlign:'center'}}>{taxCalcForecastDetailOpen?'Showing full breakdown below':'Full breakdown ›'}</div>
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
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Tax-free pay <span style={{color:'var(--quiet)',fontWeight:600}}>(1257L, {A.months} month{A.months!==1?'s':''})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'#059669'}}>{fmtGBP(breakdownA.freePay)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Basic Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(20% on {fmtGBP(breakdownA.basicAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownA.basicTax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Higher Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(40% on {fmtGBP(breakdownA.higherAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownA.higherTax)}</span></div>
                      {breakdownA.additionalAmt>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Additional Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(45% on {fmtGBP(breakdownA.additionalAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownA.additionalTax)}</span></div>}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-red-deep)'}}>Total Income Tax (YTD)</span>
                      <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--text-red-deep)'}}>{fmtGBP(breakdownA.totalTax)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--surface-2)',borderRadius:'11px',padding:'10px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>National Insurance (YTD) <span style={{color:'var(--quiet)',fontWeight:600}}>(each month's pay)</span></span>
                      <span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(niA)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-green-deep)'}}>Net pay (YTD)</span>
                      <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-green-deep)'}}>{fmtGBP(netA)}</span>
                    </div>
                    <div style={{fontSize:'9px',color:'var(--quiet)',lineHeight:1.5,marginTop:'8px'}}>Your payslips so far this tax year — paydays already paid, not a projection. Pension tier comes from each month's pay rate.</div>
                  </div>
                )}

                {taxCalcForecastDetailOpen&&(
                  <div style={{borderTop:'2px solid var(--border-2)',marginTop:'12px',paddingTop:'12px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                      <div style={{fontWeight:900,fontSize:'12px',color:'var(--ink)'}}>Full Calculation — Forecast</div>
                      <span onClick={()=>setTaxCalcForecastDetailOpen(false)} style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',cursor:'pointer'}}>Show less</span>
                    </div>
                    <div style={{background:'var(--surface-2)',borderRadius:'11px',padding:'12px 14px',marginBottom:'10px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Gross (full year)</span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(proj)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)',background:'var(--tint-blue)',margin:'0 -14px',paddingLeft:'14px',paddingRight:'14px'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--text-blue-deep)'}}>Pension Contribution <span style={{color:'#3b82f6',fontWeight:600}}>({(pensionF.rate*100).toFixed(2)}% of {fmtGBP(pensionablePayF)} pensionable pay)</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--text-blue-deep)'}}>−{fmtGBP(pensionF.amount)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>= Taxable Gross</span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(taxableGrossF)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Tax-free pay <span style={{color:'var(--quiet)',fontWeight:600}}>(1257L, 12 months)</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'#059669'}}>{fmtGBP(breakdownF.freePay)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border-2)'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Basic Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(20% on {fmtGBP(breakdownF.basicAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownF.basicTax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:breakdownF.additionalAmt>0?'1px solid var(--border-2)':'none'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Higher Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(40% on {fmtGBP(breakdownF.higherAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownF.higherTax)}</span></div>
                      {breakdownF.additionalAmt>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'7px 0'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>Additional Rate <span style={{color:'var(--quiet)',fontWeight:600}}>(45% on {fmtGBP(breakdownF.additionalAmt)})</span></span><span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(breakdownF.additionalTax)}</span></div>}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-red-deep)'}}>Total Income Tax</span>
                      <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--text-red-deep)'}}>{fmtGBP(breakdownF.totalTax)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--surface-2)',borderRadius:'11px',padding:'10px 14px',marginBottom:'8px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:700,color:'var(--muted)'}}>National Insurance <span style={{color:'var(--quiet)',fontWeight:600}}>(each month's pay)</span></span>
                      <span style={{fontFamily:MONO,fontSize:'11.5px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(niF)}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px'}}>
                      <span style={{fontSize:'11.5px',fontWeight:800,color:'var(--text-green-deep)'}}>Net pay (full year)</span>
                      <span style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:'var(--text-green-deep)'}}>{fmtGBP(netF)}</span>
                    </div>
                    <div style={{fontSize:'9px',color:'var(--quiet)',lineHeight:1.5,marginTop:'8px'}}>All twelve payslips: salary as known, overtime and PA at your pace so far. Pension tier comes from each month's pay rate.</div>
                  </div>
                )}

                <div style={{fontSize:'9.5px',color:'var(--quiet)',lineHeight:1.5,marginTop:'10px'}}>Based on your pay rates for each payday this tax year. Pension figures follow the 2015 Police Pension Scheme (England & Wales) rates from 1 April 2026. Please check anything you rely on, and if need be, consult an accountant, HMRC or your pension provider.</div>
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
            {printRow('Tax-free pay (1257L)', fmtGBP(pa))}
            {printRow(`Basic Rate (20% on ${fmtGBP(breakdown.basicAmt)})`, fmtGBP(breakdown.basicTax))}
            {printRow(`Higher Rate (40% on ${fmtGBP(breakdown.higherAmt)})`, fmtGBP(breakdown.higherTax))}
            {breakdown.additionalAmt>0 && printRow(`Additional Rate (45% on ${fmtGBP(breakdown.additionalAmt)})`, fmtGBP(breakdown.additionalTax))}
            {printRow('Total Income Tax', fmtGBP(breakdown.totalTax), {bold:true})}
            {printRow('National Insurance', fmtGBP(ni))}
            {printRow('Net pay', fmtGBP(net), {bold:true, noBorder:true})}
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
              <div ref={taxModalTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Tax & 100K+ Calculator" className={'modal-pop'+(taxModalOpen?'':' pop-out')} style={modalBoxStyle(S.card)}>{taxModalContentRef.current}</div>,
              contentWrapRef.current
            )}
            {taxPrintOpen && createPortal(
              <div className="payslip-print-area" style={{position:'fixed',inset:0,background:'#fff',zIndex:80,overflowY:'auto',padding:'20px'}}>
                <div className="no-print" style={{display:'flex',gap:'8px',marginBottom:'18px',maxWidth:'640px',margin:'0 auto 18px'}}>
                  <button onClick={()=>setTaxPrintOpen(false)} aria-label="Back" style={{background:'#f1f5f9',border:'none',borderRadius:'11px',padding:'12px 16px',fontWeight:800,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',color:'#0f172a'}}><Ico n="back" s={13} c="#0f172a"/></button>
                  <button onClick={()=>window.print()} style={{flex:1,background:BRASS,color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:800,fontSize:'13px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'7px'}}><Ico n="dl" s={14} c="#fff"/> Print or save as PDF</button>
                </div>
                <div className="payslip-print-doc" style={{maxWidth:'640px',margin:'0 auto',background:'#fff'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'}}>
                    <div style={{fontSize:'20px',fontWeight:900,color:'#0f172a'}}>Tax &amp; 100K+ Calculator</div>
                    <div style={{fontSize:'11px',color:'#64748b',fontWeight:600}}>Generated {new Date().toLocaleDateString('en-GB')}</div>
                  </div>
                  <div style={{fontSize:'11px',color:'#64748b',marginBottom:'22px',lineHeight:1.5}}>Tax and National Insurance worked out the way payroll does (tax code 1257L, month by month). Pension figures follow the 2015 Police Pension Scheme (England &amp; Wales) rates effective 1 April 2026. Estimates only — please consult an accountant, HMRC, or your pension provider for anything you intend to rely on.</div>
                  {printSection('Actual — Year to Date', overA, ytd, pensionA.amount, pensionA.rate, pensionablePayA, taxableYTD, breakdownA.freePay, breakdownA, niA, netA, extraTaxA, paRemainingA)}
                  {printSection('Forecast — Full Year', overF, proj, pensionF.amount, pensionF.rate, pensionablePayF, taxableGrossF, breakdownF.freePay, breakdownF, niF, netF, extraTaxF, paRemainingF)}
                </div>
              </div>,
              document.body
            )}
          </>
        );
      })()}

      <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',padding:isWide?'6px 4px 0':'8px 4px 6px',...(isWide?{gridColumn:'1 / -1'}:{})}}>Data</div>

      {/* ── Financial Years — generated calendar, every past year with data is browsable ── */}
      {(()=>{
        const cardHeader = (
          <button onClick={()=>{ if(isWide){setConfigExpanded(false);setTaxImpactExpanded(false);setExportDataExpanded(false);setDataManagementExpanded(false);} setFinancialYearsExpanded(v=>!v); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',marginBottom:(financialYearsExpanded&&!isWide)?'11px':0,cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{background:'var(--tint-blue)',padding:isWide?'11px':'9px',borderRadius:'13px'}}><Ico n="cal" s={isWide?21:17} c="#2563eb"/></div>
              <div><div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Archived Financial Years</div><div style={{fontSize:'11px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>Past tax years</div></div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:financialYearsExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
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
                      ? <span style={{fontSize:'8px',fontWeight:900,textTransform:'uppercase',letterSpacing:'1px',padding:'2px 7px',borderRadius:'20px',background:BRASS,color:'#fff'}}>Current</span>
                      : <Ico n="cR" s={14} c="#94a3b8"/>}
                  </div>
                );
              })}
              {yearsWithData.length===0&&<div style={{fontSize:'10.5px',color:'var(--quiet)',textAlign:'center',padding:'6px 0'}}>Past years will appear here once you have entries from before this financial year.</div>}
            </div>
            <div style={{fontSize:'9.5px',color:'var(--quiet)',textAlign:'center',marginTop:'10px',lineHeight:1.5}}>Dates follow your pay pattern (4-5-4 weeks, 52 weeks a year). The cloud keeps this year and the last 3; your device keeps everything.</div>
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
              <div ref={fyModalTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Archived Financial Years" className={'modal-pop'+(fyModalOpen?'':' pop-out')} style={modalBoxStyle(S.card)}>{fyModalContentRef.current}</div>,
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
              <div><div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Financial Reports &amp; Export</div><div style={{fontSize:'11px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>Payslip, year summary, PDF or spreadsheet</div></div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:exportDataExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
        );
        const cardBody = exportDataExpanded&&(
          <>
            <button onClick={()=>{setExportFormat(null);setPayslipMode('period');setPayslipPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0);setPayslipFYYear(CURRENT_FY_YEAR);setPayslipModalOpen(true);}} disabled={entries.length===0} style={{width:'100%',padding:'12px',background: entries.length===0 ? 'var(--chip-bg)' : BRASS,border:'none',borderRadius:'11px',color: entries.length===0 ? 'var(--quiet)' : '#fff',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor: entries.length===0 ? 'default' : 'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'7px'}}><Ico n="share" s={14} c={entries.length===0?'var(--quiet)':'#fff'}/> Export to PDF or spreadsheet</button>
            {entries.length===0&&<div style={{fontSize:'10px',color:'var(--quiet)',textAlign:'center',marginTop:'8px',fontWeight:600}}>Log a shift first to enable export</div>}
            <div style={{fontSize:'9.5px',color:'var(--quiet)',textAlign:'center',marginTop:'8px',lineHeight:1.5}}>The cloud keeps this year and the last 3; your device keeps everything.</div>
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
              <div ref={exportModalTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Financial Reports & Export" className={'modal-pop'+(exportModalOpen?'':' pop-out')} style={modalBoxStyle(S.card)}>{exportModalContentRef.current}</div>,
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
              <div><div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Account &amp; Data Management</div><div style={{fontSize:'11px',fontWeight:600,color:'var(--quiet)',marginTop:'2px'}}>Sign-in, backup, restore, wipe data</div></div>
            </div>
            <span style={{display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{transition:'transform 0.35s cubic-bezier(.65,0,.35,1)',transform:dataManagementExpanded?'rotate(180deg)':'rotate(0deg)'}}><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>
        );
        const cardBody = dataManagementExpanded&&(
          <div style={{background:'var(--surface-2)',borderRadius:'13px',padding:'13px'}}>
            {session&&<div style={{fontSize:'12px',color:'var(--ink)',fontWeight:700,marginBottom:'11px'}}>Signed in as {session.user?.email}</div>}

            {session&&(
              <div style={{marginBottom:'11px'}}>
                {!changePwMounted ? (
                  <button onClick={()=>setChangePwOpen(true)} style={{width:'100%',padding:'10px',background:'var(--surface)',border:'1.5px solid var(--border)',borderRadius:'11px',color:'var(--ink)',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="lock" s={13} c="var(--muted)"/> Change password</button>
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
                      <button onClick={handleChangePassword} disabled={changingPw} style={{flex:1,padding:'9px',background:BRASS,border:'none',borderRadius:'9px',color:'#fff',fontWeight:800,fontSize:'12.5px',fontFamily:'inherit',cursor:changingPw?'not-allowed':'pointer',opacity:changingPw?0.7:1}}>{changingPw?'Saving…':'Save new password'}</button>
                      <button onClick={()=>{ setChangePwOpen(false); setNewPw(''); setNewPw2(''); setChangePwError(''); }} disabled={changingPw} style={{flex:1,padding:'9px',background:'transparent',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--muted)',fontWeight:700,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Backup and Restore each say what they do; Wipe all data sits
                apart at the bottom with a sentence on what it removes. The
                actions and their confirmations are unchanged. */}
            <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'11px',lineHeight:1.5}}>{session?'Your data syncs to the cloud automatically. A backup is an extra copy saved to this device.':'Your data is stored on this device. A backup is a copy saved as a file you can keep.'}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'14px'}}>
              <div>
                <button onClick={handleExport} className={pulseBackupBtn?'backup-pulse':''} style={{width:'100%',padding:'10px',background:BRASS,border:'none',borderRadius:'11px',color:'#fff',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="dl" s={13} c="#fff"/> Backup</button>
                <div style={{fontSize:'10.5px',color:'var(--quiet)',textAlign:'center',marginTop:'4px'}}>Save a copy as a file</div>
              </div>
              <div>
                <button onClick={()=>setRestoreConfirmOpen(true)} style={{width:'100%',padding:'10px',background:'var(--surface)',border:'1.5px solid var(--border)',borderRadius:'11px',color:'var(--ink)',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="ul" s={13} c="var(--muted)"/> Restore</button>
                <div style={{fontSize:'10.5px',color:'var(--quiet)',textAlign:'center',marginTop:'4px'}}>Load a saved copy</div>
              </div>
              <input type="file" ref={fileRef} style={{display:'none'}} accept=".json" onChange={handleImport}/>
            </div>

            <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'12px'}}>
              {!wipeMounted
                ?<>
                  <div style={{fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}>Start again</div>
                  <div style={{fontSize:'11.5px',color:'var(--muted)',lineHeight:1.45,margin:'2px 0 9px'}}>{session?'Removes every shift, all TOIL, and your rank and pay point, from this device and the cloud.':'Removes every shift, all TOIL, and your rank and pay point from this device.'} You'll be asked to confirm.</div>
                  <button onClick={()=>setWipeConf(true)} style={{width:'100%',padding:'10px',background:'transparent',border:'1.5px solid var(--surface-red-mid)',borderRadius:'11px',color:'var(--text-red-deep)',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="trash" s={13} c="#b91c1c"/> Wipe all data</button>
                </>
                :<div className={'alert-pop'+(wipeConf?'':' pop-out')} style={{background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px'}}>
                    <div style={{textAlign:'center',color:'var(--text-red-deep)',fontWeight:700,fontSize:'12px',marginBottom:'9px',lineHeight:1.4}}>Are you absolutely sure?<br/><span style={{fontSize:'10px',fontWeight:400,color:'#dc2626'}}>{session ? 'Deletes every logged shift and all TOIL data — on this device and in the cloud. ' : 'Deletes every logged shift and all TOIL data on this device. '}This cannot be undone unless you have downloaded a backup file to your device.</span></div>
                    <div style={{display:'flex',gap:'6px'}}>
                      <button onClick={handleWipe} disabled={wipingData} style={{flex:1,padding:'9px',background:'#dc2626',border:'none',borderRadius:'9px',color:'#fff',fontWeight:800,fontSize:'12.5px',fontFamily:'inherit',cursor:wipingData?'not-allowed':'pointer',opacity:wipingData?0.7:1}}>{wipingData?'Wiping…':'Yes, wipe everything'}</button>
                      <button onClick={()=>setWipeConf(false)} disabled={wipingData} style={{flex:1,padding:'9px',background:'transparent',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--muted)',fontWeight:700,fontSize:'12px',fontFamily:'inherit',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
              }
            </div>

            {session&&(
              <div style={{borderTop:'1px solid var(--border-2)',marginTop:'11px',paddingTop:'11px'}}>
                {!deleteAcctMounted ? (
                  <button onClick={()=>setDeleteAcctConf(true)} style={{width:'100%',padding:'10px',background:'transparent',border:'1.5px solid var(--surface-red-mid)',borderRadius:'11px',color:'var(--text-red-deep)',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="trash" s={13} c="#b91c1c"/> Delete account</button>
                ) : (
                  <div className={'alert-pop'+(deleteAcctConf?'':' pop-out')} style={{background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px'}}>
                    <div style={{fontSize:'11.5px',color:'var(--text-red-deep)',lineHeight:1.5,fontWeight:700,marginBottom:'10px'}}>This permanently deletes your account and email registration, and all data stored in the cloud under it. Data already on this device isn't touched. Your email becomes available for a brand new account afterwards. This can't be undone.</div>
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
              <div ref={dataModalTrapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Account & Data Management" className={'modal-pop'+(dataModalOpen?'':' pop-out')} style={modalBoxStyle(acctBase)}>{dataModalContentRef.current}</div>,
              contentWrapRef.current
            )}
          </>
        );
      })()}

      <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',padding:isWide?'6px 4px 0':'8px 4px 6px',...(isWide?{gridColumn:'1 / -1'}:{})}}>Support</div>

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

      {/* ── Privacy Notice — read-only here (the sign-up screen is where the
           actual consent checkbox lives); this is just so an existing
           officer can come back and re-read what they agreed to. ── */}
      <div style={S.card}>
        <button onClick={()=>setPrivacyNoticeOpen(true)} style={{display:'flex',alignItems:'center',gap:'12px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',cursor:'pointer'}}>
          <div style={{background:'var(--tint-blue)',padding:isWide?'13px':'11px',borderRadius:'13px',flexShrink:0}}><Ico n="shield" s={isWide?23:19} c="#2563eb"/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:'14px',color:'var(--ink)'}}>Privacy Notice</div>
            <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:700,marginTop:'2px'}}>What's collected, and why</div>
          </div>
          <Ico n="cR" s={16} c="#94a3b8"/>
        </button>
      </div>
      {privacyNoticeOpen && <PrivacyNotice onClose={()=>setPrivacyNoticeOpen(false)}/>}
      </div>

      {/* ── Backdrop for the desktop popup cards above — click
           anywhere outside the open card to close it. Only one card
           can be open in modal form at a time (each card's onClick
           closes the other four first), so closing all five here is
           equivalent to closing whichever one is actually open.
           Portalled to contentWrapRef, same reasoning as the popup
           cards themselves (see modalBoxStyle above). ── */}
      {anyModalMounted && contentWrapRef.current && createPortal(
        <div onClick={()=>{ setConfigExpanded(false); setSetupPopupRequested(false); setTaxImpactExpanded(false); setFinancialYearsExpanded(false); setExportDataExpanded(false); setDataManagementExpanded(false); }} className={anyModalOpen?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',zIndex:55}}/>,
        contentWrapRef.current
      )}
    </div>
  );
}
