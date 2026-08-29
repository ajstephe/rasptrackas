import { Ico } from './Icons.jsx';

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div style={{position:'absolute',top:'72px',left:'50%',transform:'translateX(-50%)',zIndex:999,display:'flex',flexDirection:'column',gap:'7px',width:'calc(100% - 24px)',maxWidth:'390px',pointerEvents:'none'}}>
      {toasts.map(t=>{
        // 'alert' gets an enlarged layout — charcoal with a red accent bar, a
        // bold title, an explanatory line and a full-width action button.
        // Used where the app is redirecting the person rather than just
        // confirming something, so it needs to actually stop them.
        if(t.type==='alert'){
          return (
            <div key={t.id} style={{background:'#0f172a',color:'#fff',borderRadius:'16px',padding:'15px 16px 15px 13px',borderLeft:'5px solid #ef4444',boxShadow:'0 6px 26px rgba(15,23,42,0.42)',animation:'su 0.22s ease',pointerEvents:'all'}}>
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
              {t.action&&<button onClick={t.action.fn} style={{background:'#ef4444',border:'none',borderRadius:'9px',padding:'10px',color:'#fff',fontWeight:900,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'0.5px',width:'100%'}}>{t.action.label}</button>}
            </div>
          );
        }
        return (
          <div key={t.id} style={{background:t.type==='undo'?'#1e3a5f':t.type==='warn'?'#b45309':'#065f46',color:'#fff',borderRadius:'14px',padding:'11px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',boxShadow:'0 4px 20px rgba(0,0,0,0.22)',animation:'su 0.22s ease',pointerEvents:'all'}}>
            <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
              {(t.type==='undo'||t.type==='warn')&&<Ico n={t.type==='undo'?'undo':'bell'} s={15} c="#fff"/>}
              <span style={{fontSize:'13px',fontWeight:700}}>{t.message}</span>
            </div>
            {t.action&&<button onClick={t.action.fn} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:'8px',padding:'4px 10px',color:'#fff',fontWeight:900,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap'}}>{t.action.label}</button>}
          </div>
        );
      })}
    </div>
  );
}
