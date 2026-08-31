import { useEffect, useRef, useState } from 'react';
import { Ico } from './Icons.jsx';
import { useBackButtonCloses } from '../lib/useBackButtonCloses.js';
import { useMountTransition } from '../lib/useMountTransition.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// ─── Time wheel picker ───────────────────────────────────────────────────────
// Replaces the old pair of native HH/MM <select> boxes — the one control left
// that still looked like a plain web form, and the one that hardcoded light
// colours regardless of theme. Same "HH:MM" string in/out as before, so
// nothing downstream (shift calcs, TOIL, previews) changes; this only swaps
// what tapping the field feels like.
const HOURS = Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
const MINUTES = ['00','15','30','45'];
const ITEM_H = 44;
const VISIBLE = 5;
const PAD_H = ITEM_H * Math.floor(VISIBLE/2);

function WheelColumn({ values, selected, onSettle, brass, mono }) {
  const colRef = useRef(null);
  const [centerIdx, setCenterIdx] = useState(Math.max(0, values.indexOf(selected)));
  const settleTimer = useRef(null);
  const rafId = useRef(null);

  // Snap to the incoming value once, when the sheet opens — after that the
  // user's own scrolling drives centerIdx, so this deliberately doesn't
  // re-run on every `selected` change (that would fight live scrolling).
  useEffect(() => {
    const idx = Math.max(0, values.indexOf(selected));
    if (colRef.current) colRef.current.scrollTop = idx * ITEM_H;
    setCenterIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scroll-snap-type:mandatory (the old approach) forces the browser to
  // fight for a snap point on every single scroll frame, which caps how
  // much momentum a flick can carry through — a real iOS wheel does the
  // opposite: momentum runs completely free, and only clicks into the
  // nearest slot once it's actually finished moving. Dropping CSS snap
  // entirely and doing that final settle ourselves, once scrolling has
  // gone quiet, gets both the quicker flick-through and a crisp landing.
  // The native scroll event can fire far more often than the screen
  // actually repaints (well above 60/sec during a fast flick), and every
  // firing was triggering its own React re-render of every visible row —
  // work the browser never gets to show before the next one supersedes
  // it. Capping the state update to once per animation frame (still
  // reads the live scrollTop each time, so nothing lags behind the
  // finger) cuts that down to only renders that can actually be painted.
  const handleScroll = () => {
    if (rafId.current == null) {
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const idx = Math.round(colRef.current.scrollTop / ITEM_H);
        setCenterIdx(Math.max(0, Math.min(values.length - 1, idx)));
      });
    }
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const idx = Math.round(colRef.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      onSettle(values[clamped]);
      colRef.current?.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' });
    }, 90);
  };

  const jumpTo = (idx) => {
    colRef.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  };

  return (
    <div ref={colRef} onScroll={handleScroll} className="time-wheel-col" style={{width:'68px',height:ITEM_H*VISIBLE+'px',overflowY:'scroll',overscrollBehavior:'contain',WebkitOverflowScrolling:'touch',willChange:'scroll-position',position:'relative'}}>
      <div style={{height:PAD_H+'px'}}/>
      {values.map((v,i)=>{
        const dist = Math.abs(i-centerIdx);
        return (
          // A shorter transition than before (was 0.15s) — centerIdx now
          // updates every animation frame during an active scroll, so a
          // long transition was permanently chasing a moving target
          // instead of ever catching up; short enough to still soften the
          // very final settle, without visibly lagging behind a flick.
          <div key={v} onClick={()=>jumpTo(i)} style={{height:ITEM_H+'px',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:mono,fontSize:'19px',cursor:'pointer',userSelect:'none',transition:'opacity 0.08s,font-weight 0.08s,color 0.08s',opacity:dist===0?1:dist===1?0.7:0.35,fontWeight:dist===0?800:600,color:dist===0?brass:'var(--quiet)'}}>{v}</div>
        );
      })}
      <div style={{height:PAD_H+'px'}}/>
    </div>
  );
}

// MONO defaults to the app's own mono stack (matches App.jsx's own constant)
// rather than requiring every caller to pass it — same shape as the BRASS
// default just below. TabLogOvertime, the only current caller, does pass its
// own MONO prop through, so this default only matters for a future caller
// that doesn't.
export function TimeSelect({ value, onChange, label, BRASS='#b8823f', MONO="'IBM Plex Mono',monospace" }) {
  const [open, setOpen] = useState(false);
  const [h,m] = value ? value.split(':') : ['',''];

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key==='Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useBackButtonCloses(open, () => setOpen(false));
  const mounted = useMountTransition(open, 220);
  const trapRef = useRef(null);
  useFocusTrap(open, trapRef);

  return (
    <>
      <button type="button" onClick={()=>setOpen(true)} style={{width:'100%',boxSizing:'border-box',height:'42px',display:'flex',alignItems:'center',gap:'8px',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'10px',padding:'0 12px',fontFamily:MONO,fontWeight:700,fontSize:'15px',color:'var(--ink)',cursor:'pointer'}}>
        <Ico n="clock" s={14} c="var(--quiet)"/>
        {value ? `${h}:${m}` : <span style={{color:'var(--quiet)',fontWeight:600,fontSize:'13px',fontFamily:'inherit'}}>Set time</span>}
      </button>

      {mounted && (
        <div onClick={()=>setOpen(false)} className={open?'ov-in':'ov-out'} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:70}}>
          <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label ? `Set ${label} time` : 'Set time'} onClick={ev=>ev.stopPropagation()} className={'alert-pop'+(open?'':' pop-out')} style={{background:'var(--surface)',borderRadius:'18px',boxShadow:'0 24px 64px rgba(0,0,0,0.28)',border:'1px solid var(--border)',padding:'20px 20px 18px',width:'260px',maxWidth:'calc(100vw - 32px)',boxSizing:'border-box'}}>
            <div style={{fontSize:'10px',fontWeight:900,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--muted)',textAlign:'center',marginBottom:'14px'}}>{label ? `Set ${label} Time` : 'Set Time'}</div>
            <div style={{position:'relative',display:'flex',justifyContent:'center',alignItems:'center',gap:'8px'}}>
              <div style={{position:'absolute',left:0,right:0,top:ITEM_H*2+'px',height:ITEM_H+'px',background:'rgba(184,130,63,0.16)',borderTop:`1.5px solid ${BRASS}`,borderBottom:`1.5px solid ${BRASS}`,borderRadius:'8px',pointerEvents:'none'}}/>
              <WheelColumn values={HOURS} selected={h||'00'} onSettle={nh=>onChange(`${nh}:${m||'00'}`)} brass={BRASS} mono={MONO}/>
              <span style={{fontWeight:900,fontSize:'19px',color:'var(--quiet)'}}>:</span>
              <WheelColumn values={MINUTES} selected={MINUTES.includes(m)?m:'00'} onSettle={nm=>onChange(`${h||'00'}:${nm}`)} brass={BRASS} mono={MONO}/>
            </div>
            <button type="button" onClick={()=>setOpen(false)} style={{marginTop:'14px',width:'100%',background:'var(--chip-bg)',border:'none',borderRadius:'10px',padding:'10px',fontWeight:800,fontSize:'12.5px',color:'var(--ink)',cursor:'pointer',fontFamily:'inherit'}}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
