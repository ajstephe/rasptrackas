import { useEffect, useRef, useState } from 'react';
import { Ico } from './Icons.jsx';
import { useBackButtonCloses } from '../lib/useBackButtonCloses.js';
import { useMountTransition } from '../lib/useMountTransition.js';

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
const MONO = "'IBM Plex Mono',monospace";

function WheelColumn({ values, selected, onSettle, brass }) {
  const colRef = useRef(null);
  const [centerIdx, setCenterIdx] = useState(Math.max(0, values.indexOf(selected)));
  const settleTimer = useRef(null);

  // Snap to the incoming value once, when the sheet opens — after that the
  // user's own scrolling drives centerIdx, so this deliberately doesn't
  // re-run on every `selected` change (that would fight live scrolling).
  useEffect(() => {
    const idx = Math.max(0, values.indexOf(selected));
    if (colRef.current) colRef.current.scrollTop = idx * ITEM_H;
    setCenterIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    const idx = Math.round(colRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    setCenterIdx(clamped);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => onSettle(values[clamped]), 90);
  };

  const jumpTo = (idx) => {
    colRef.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  };

  return (
    <div ref={colRef} onScroll={handleScroll} className="time-wheel-col" style={{width:'68px',height:ITEM_H*VISIBLE+'px',overflowY:'scroll',overscrollBehavior:'contain',scrollSnapType:'y mandatory',position:'relative'}}>
      <div style={{height:PAD_H+'px'}}/>
      {values.map((v,i)=>{
        const dist = Math.abs(i-centerIdx);
        return (
          <div key={v} onClick={()=>jumpTo(i)} style={{height:ITEM_H+'px',display:'flex',alignItems:'center',justifyContent:'center',scrollSnapAlign:'center',fontFamily:MONO,fontSize:'19px',cursor:'pointer',userSelect:'none',transition:'opacity 0.15s,font-weight 0.15s,color 0.15s',opacity:dist===0?1:dist===1?0.7:0.35,fontWeight:dist===0?800:600,color:dist===0?brass:'var(--quiet)'}}>{v}</div>
        );
      })}
      <div style={{height:PAD_H+'px'}}/>
    </div>
  );
}

export function TimeSelect({ value, onChange, label, BRASS='#b8823f' }) {
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

  return (
    <>
      <button type="button" onClick={()=>setOpen(true)} style={{width:'100%',boxSizing:'border-box',height:'42px',display:'flex',alignItems:'center',gap:'8px',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'10px',padding:'0 12px',fontFamily:MONO,fontWeight:700,fontSize:'15px',color:'var(--ink)',cursor:'pointer'}}>
        <Ico n="clock" s={14} c="var(--quiet)"/>
        {value ? `${h}:${m}` : <span style={{color:'var(--quiet)',fontWeight:600,fontSize:'13px',fontFamily:'inherit'}}>Set time</span>}
      </button>

      {mounted && (
        <div onClick={()=>setOpen(false)} className={open?'ov-in':'ov-out'} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:70}}>
          <div onClick={ev=>ev.stopPropagation()} className={'alert-pop'+(open?'':' pop-out')} style={{background:'var(--surface)',borderRadius:'18px',boxShadow:'0 24px 64px rgba(0,0,0,0.28)',border:'1px solid var(--border)',padding:'20px 20px 18px',width:'260px',maxWidth:'calc(100vw - 32px)',boxSizing:'border-box'}}>
            <div style={{fontSize:'10px',fontWeight:900,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--muted)',textAlign:'center',marginBottom:'14px'}}>{label ? `Set ${label} Time` : 'Set Time'}</div>
            <div style={{position:'relative',display:'flex',justifyContent:'center',alignItems:'center',gap:'8px'}}>
              <div style={{position:'absolute',left:0,right:0,top:ITEM_H*2+'px',height:ITEM_H+'px',background:'rgba(184,130,63,0.16)',borderTop:`1.5px solid ${BRASS}`,borderBottom:`1.5px solid ${BRASS}`,borderRadius:'8px',pointerEvents:'none'}}/>
              <WheelColumn values={HOURS} selected={h||'00'} onSettle={nh=>onChange(`${nh}:${m||'00'}`)} brass={BRASS}/>
              <span style={{fontWeight:900,fontSize:'19px',color:'var(--quiet)'}}>:</span>
              <WheelColumn values={MINUTES} selected={MINUTES.includes(m)?m:'00'} onSettle={nm=>onChange(`${h||'00'}:${nm}`)} brass={BRASS}/>
            </div>
            <button type="button" onClick={()=>setOpen(false)} style={{marginTop:'14px',width:'100%',background:'var(--chip-bg)',border:'none',borderRadius:'10px',padding:'10px',fontWeight:800,fontSize:'12.5px',color:'var(--ink)',cursor:'pointer',fontFamily:'inherit'}}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
