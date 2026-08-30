import { useEffect, useState } from 'react';
import { Ico } from './Icons.jsx';

// Mirrors the `toasts` prop into local state so a dismissed toast can play
// a short leave transition before it's actually dropped, instead of the
// array filter yanking it out mid-frame. App.jsx's addToast/dismissToast
// timing is untouched — this only smooths what happens once an id leaves
// that array.
function useAnimatedToasts(toasts) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const incomingIds = new Set(toasts.map(t=>t.id));
    setItems(curr => {
      const currIds = new Set(curr.map(it=>it.id));
      const newlyGone = curr.filter(it => !incomingIds.has(it.id) && !it.leaving);
      newlyGone.forEach(it => {
        setTimeout(() => setItems(cur2 => cur2.filter(x=>x.id!==it.id)), 220);
      });
      const kept = curr
        .filter(it => incomingIds.has(it.id) || it.leaving)
        .map(it => incomingIds.has(it.id) ? it : {...it, leaving:true});
      const added = toasts.filter(t=>!currIds.has(t.id)).map(t=>({...t, leaving:false}));
      return [...kept, ...added];
    });
  }, [toasts]);

  return items;
}

export function ToastStack({ toasts, onDismiss }) {
  const items = useAnimatedToasts(toasts);
  return (
    <div style={{position:'absolute',top:'calc(72px + env(safe-area-inset-top))',left:'50%',transform:'translateX(-50%)',zIndex:999,display:'flex',flexDirection:'column',gap:'7px',width:'calc(100% - 24px)',maxWidth:'390px',pointerEvents:'none'}}>
      {items.map(t=>{
        // 'alert' gets an enlarged layout — charcoal with a red accent bar, a
        // bold title, an explanatory line and a full-width action button.
        // Used where the app is redirecting the person rather than just
        // confirming something, so it needs to actually stop them.
        if(t.type==='alert'){
          return (
            <div key={t.id} className={t.leaving?'toast-leave':'toast-enter'} style={{background:'#0f172a',color:'#fff',borderRadius:'16px',padding:'15px 16px 15px 13px',borderLeft:'5px solid #ef4444',boxShadow:'0 6px 26px rgba(15,23,42,0.42)',pointerEvents:'all'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'11px',marginBottom:t.action?'12px':0}}>
                <div style={{background:'rgba(239,68,68,0.22)',borderRadius:'10px',padding:'7px',flexShrink:0,display:'flex'}}>
                  <Ico n="uPlus" s={17} c="#f87171" w={2.5}/>
                </div>
                <div style={{flex:1}}>
                  {t.title&&<div style={{fontSize:'14px',fontWeight:900,marginBottom:'3px'}}>{t.title}</div>}
                  <div style={{fontSize:'12px',fontWeight:600,color:'#cbd5e1',lineHeight:1.45}}>{t.message}</div>
                </div>
                {/* dismiss — purely to get the banner out of the way */}
                <button onClick={()=>onDismiss&&onDismiss(t.id)} aria-label="Dismiss" style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'8px',padding:'6px',cursor:'pointer',flexShrink:0,display:'flex',alignSelf:'flex-start'}}>
                  <Ico n="x" s={14} c="#94a3b8"/>
                </button>
              </div>
              {t.action&&<button onClick={t.action.fn} style={{background:'#ef4444',border:'none',borderRadius:'9px',padding:'10px',color:'#fff',fontWeight:900,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',width:'100%'}}>{t.action.label}</button>}
            </div>
          );
        }
        // Compact toast — frosted glass instead of a solid colour fill (the
        // same rgba(surface,alpha)+blur recipe the nav bar already uses, so
        // this reads as the same material rather than a new one), an
        // icon-in-a-tint-circle instead of a plain icon on solid colour
        // (matching the empty-state/row-icon language used everywhere
        // else), and text on theme tokens instead of hardcoded white.
        const tint = t.type==='undo' ? 'var(--tint-blue-2)' : t.type==='warn' ? 'var(--tint-amber-2)' : 'var(--tint-green-2)';
        const deep = t.type==='undo' ? 'var(--text-blue-deep)' : t.type==='warn' ? 'var(--text-amber-deep)' : 'var(--text-green-deep)';
        return (
          <div key={t.id} className={t.leaving?'toast-leave':'toast-enter'} style={{position:'relative',overflow:'hidden',background:'rgba(var(--surface-rgb),0.82)',backdropFilter:'blur(20px) saturate(1.8)',WebkitBackdropFilter:'blur(20px) saturate(1.8)',border:'1px solid var(--border-2)',borderRadius:'16px',padding:'9px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',boxShadow:'0 12px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',pointerEvents:'all'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',minWidth:0}}>
              <div style={{width:'30px',height:'30px',borderRadius:'50%',background:tint,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Ico n={t.type==='undo'?'undo':t.type==='warn'?'bell':'check'} s={14} c={deep}/>
              </div>
              <span style={{fontSize:'13px',fontWeight:700,color:'var(--ink)',minWidth:0}}>{t.message}</span>
            </div>
            {t.action&&<button onClick={t.action.fn} style={{background:tint,border:'none',borderRadius:'8px',padding:'6px 11px',color:deep,fontWeight:800,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0}}>{t.action.label}</button>}
            {/* countdown — only on actionable toasts (Undo, Reload…), where
                knowing the window's closing actually matters; a plain
                confirmation toast has nothing to act on before it goes, so
                it stays without one. Halts (rather than restarts) once the
                toast starts leaving, so it never plays through the leave
                transition. */}
            {t.action&&!t.leaving&&<div className="toast-bar" style={{position:'absolute',left:0,right:0,bottom:0,height:'2.5px',background:deep,opacity:0.5,transformOrigin:'left','--toast-dur':(t.dur||3500)/1000+'s'}}/>}
          </div>
        );
      })}
    </div>
  );
}
