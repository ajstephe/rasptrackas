const TIME_HOURS = Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
const TIME_MINUTES = ['00','15','30','45'];

// Two small selects (hour, then minute) rather than one 96-option list —
// picking "21" then "45" is much faster than scrolling to find "21:45".
// Combines back into the same "HH:MM" string the rest of the app expects,
// so nothing downstream needs to know the UI is split.
export function TimeSelect({ value, onChange }) {
  const [h,m] = value ? value.split(':') : ['',''];
  const selStyle = {flex:1,background:'#fff',border:'1px solid #dbeafe',padding:'9px 6px',borderRadius:'10px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',color:'#0f172a',height:'42px'};
  return (
    <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
      <select style={selStyle} value={h} onChange={e=>{
        const newH = e.target.value;
        onChange(newH ? `${newH}:${m||'00'}` : (m ? `00:${m}` : ''));
      }}>
        <option value="">HH</option>
        {TIME_HOURS.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <span style={{fontWeight:900,fontSize:'15px',color:'#94a3b8',flexShrink:0}}>:</span>
      <select style={selStyle} value={m} onChange={e=>{
        const newM = e.target.value;
        onChange(h ? `${h}:${newM||'00'}` : (newM ? `00:${newM}` : ''));
      }}>
        <option value="">MM</option>
        {TIME_MINUTES.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}
