import { useRef, useState, useEffect } from 'react';
import { fmtGBP, fmtD } from '../lib/format.js';
import { Ico } from './Icons.jsx';
import { useCountUp } from '../lib/useCountUp.js';
import { SegSlider } from './SegSlider.jsx';
import { useMountTransition } from '../lib/useMountTransition.js';
import { countSelectedClaims } from '../lib/carms.js';

// ─── CARMS & PA Outstanding tab — "Table View" ───────────────────────────────
// Desktop gets a real sortable table (click Date/Amount to reorder, a
// checkbox on every row from the start, a hover "Mark submitted" quick
// action) instead of the old single narrow column of cards. Mobile keeps
// the period-grouped list it always had, but each row now carries the same
// always-visible checkbox and quick-submit action as desktop — no "Select
// Multiple Entries" mode to enter first, on either platform.
export function TabCarms({ MONO, BRASS, isWide, carmsOutstanding, carmsFilter, setCarmsFilter, periodGroupRefs, pulsePeriodIdx, startEdit, setFocusCarmsToggle, carmsClaimNumbers, animClass='fi',
  carmsSelected, toggleCarmsClaim, toggleCarmsGroup, selectCarmsClaim, openCarmsBulkConfirm,
}) {
  // Small tinted icon-chip, used by the mobile list's rows — an icon in a
  // tinted circle, matching how the rest of the app (Dashboard, Summary)
  // marks a claim's category.
  const catChip = (kind, size=26) => {
    const map = {
      ot:   { n:'clock', bg:'var(--tint-blue)',   c:'#2563eb' },
      pa:   { n:'cash',  bg:'var(--tint-amber)',  c:'#f59e0b' },
      toil: { n:'moon',  bg:'var(--tint-purple)', c:'#7c3aed' },
    }[kind];
    return <div style={{width:size+'px',height:size+'px',borderRadius:'9px',background:map.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Ico n={map.n} s={Math.round(size*0.5)} c={map.c} w={2}/></div>;
  };

  // Same tinted-pill treatment for the desktop table's Type column — icon
  // plus label in one badge instead of a bare chip, since the table has
  // room for the word itself (an entry's actual PA tier, e.g. "PA2", is
  // more useful here than the generic "PA" the old cards showed).
  const typeBadge = (row) => {
    const kind = row.kind==='ot+toil' ? 'ot' : row.kind;
    const map = {
      ot:   { n:'clock', bg:'var(--tint-blue)',   c:'#2563eb' },
      pa:   { n:'cash',  bg:'var(--tint-amber)',  c:'#f59e0b' },
      toil: { n:'moon',  bg:'var(--tint-purple)', c:'#7c3aed' },
    }[kind];
    return (
      <span style={{display:'inline-flex',alignItems:'center',gap:'5px',fontSize:'10.5px',fontWeight:800,padding:'3px 8px',borderRadius:'7px',background:map.bg,color:map.c,whiteSpace:'nowrap'}}>
        <Ico n={map.n} s={11} c={map.c} w={2.2}/>{row.typeLabel}
      </span>
    );
  };

  // Real checkbox, always visible — the one interactive element shared by
  // every row on both platforms, replacing the old select-mode-only ring.
  const Checkbox = ({ checked, onClick, size=18 }) => (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onClick} className="tap-anchor"
      style={{width:size+'px',height:size+'px',borderRadius:'6px',border:`1.5px solid ${checked?BRASS:'var(--border)'}`,background:checked?BRASS:'var(--surface)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',padding:0,cursor:'pointer',touchAction:'manipulation'}}>
      {checked && <Ico n="check" s={Math.round(size*0.62)} c="#fff" w={3}/>}
    </button>
  );

  // Counts up/down instead of jumping whenever the outstanding total
  // changes — e.g. marking a claim as submitted on Log Overtime.
  const animatedTotal = useCountUp(carmsOutstanding.totalAmount);

  // Selected count/total for the bulk action bar — looked up against the
  // same carmsOutstanding data every row already renders from, using
  // whichever of {ot,pa} was actually showing (and therefore selectable)
  // on that row at the moment it was picked. carmsSelected is keyed by
  // entry id, but one entry can carry both an outstanding OT and PA claim
  // (toggleCarmsClaim toggles them independently), so Object.keys(...)
  // .length would undercount — this sums both markers instead.
  const selectedIds = Object.keys(carmsSelected||{});
  const selectedClaimCount = countSelectedClaims(carmsSelected);
  const selectedTotal = (() => {
    if (selectedIds.length===0) return 0;
    const byId = new Map();
    carmsOutstanding.groups.forEach(g=>g.items.forEach(it=>byId.set(it.entry.id, it)));
    let total = 0;
    selectedIds.forEach(id=>{
      const it = byId.get(id);
      const markers = carmsSelected[id];
      if (!it || !markers) return;
      if (markers.ot) total += it.otAmt;
      if (markers.pa) total += it.paAmt;
    });
    return total;
  })();

  // ── bulk action bar mirrors its own entrance on the way out ─────────────
  const barOpen = selectedIds.length>0;
  const barMounted = useMountTransition(barOpen, 240);
  const lastBarRef = useRef({ count:selectedClaimCount, total:selectedTotal });
  if (barOpen) lastBarRef.current = { count:selectedClaimCount, total:selectedTotal };
  const { count:barCount, total:barTotal } = lastBarRef.current;

  // ── sort — Date (newest first) by default, or Amount, shared by the
  // desktop table's clickable column headers and the mobile list's single
  // "Sort: Date/Amount" pill ──────────────────────────────────────────────
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  // Jumping here from a period's "Awaiting submission" panel in Summary
  // only makes sense in date order, where that period's rows sit together
  // as one contiguous block — force back to it so the scroll target (the
  // first row of that period) actually means something.
  useEffect(()=>{ if(pulsePeriodIdx!=null){ setSortKey('date'); setSortDir('desc'); } },[pulsePeriodIdx]);
  const toggleSort = (key) => {
    if (sortKey===key) setSortDir(d=>d==='desc'?'asc':'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sortRows = (rows) => rows.slice().sort((a,b)=>{
    const cmp = sortKey==='amount' ? (a.amount-b.amount) : (a.date<b.date?-1:a.date>b.date?1:0);
    return sortDir==='asc' ? cmp : -cmp;
  });

  const matchesFilter = it => {
    if (carmsFilter==='ot') return it.otOutstanding;
    if (carmsFilter==='pa') return it.paOutstanding;
    if (carmsFilter==='toil') return it.toilOutstanding;
    return true;
  };

  // One item (one logged entry) can carry up to three separate claims —
  // Overtime, PA, and TOIL — each toggled and submitted independently
  // (TOIL shares the same 'ot' toggle as Overtime, since it only ever
  // banks as a side effect of that same CARMS submission, so it's never
  // its own selectable claim outside the dedicated TOIL filter). Flattened
  // here into one row per claim so the table/list can sort and select them
  // individually.
  const flattenItem = (it, periodIdx) => {
    const rows = [];
    const showOt = it.otOutstanding && carmsFilter!=='pa' && carmsFilter!=='toil';
    const showPa = it.paOutstanding && carmsFilter!=='ot' && carmsFilter!=='toil';
    const showToil = it.toilOutstanding && carmsFilter!=='ot' && carmsFilter!=='pa';
    const mergeOtToil = showOt && showToil;
    if (showOt) {
      rows.push({
        id: it.entry.id+'-ot', entry: it.entry, entryId: it.entry.id, claimKey:'ot', kind: mergeOtToil?'ot+toil':'ot',
        date: it.entry.date, reason: it.entry.reason||'Shift', periodIdx,
        typeLabel: mergeOtToil?'Overtime + TOIL':'Overtime',
        amount: it.otAmt, amountDisplay: fmtGBP(it.otAmt), toilHrs: mergeOtToil?it.toilHrs:0,
        claimNo: carmsClaimNumbers.get(it.entry.id+'-ot'),
      });
    }
    if (showPa) {
      rows.push({
        id: it.entry.id+'-pa', entry: it.entry, entryId: it.entry.id, claimKey:'pa', kind:'pa',
        date: it.entry.date, reason: it.entry.reason||'Shift', periodIdx,
        typeLabel: it.entry.paRate||'PA',
        amount: it.paAmt, amountDisplay: fmtGBP(it.paAmt), toilHrs: 0,
        claimNo: carmsClaimNumbers.get(it.entry.id+'-pa'),
      });
    }
    if (showToil && !mergeOtToil) {
      rows.push({
        id: it.entry.id+'-toil', entry: it.entry, entryId: it.entry.id, claimKey:'ot', kind:'toil',
        date: it.entry.date, reason: it.entry.reason||'Shift', periodIdx,
        typeLabel: 'TOIL',
        amount: it.toilHrs, amountDisplay: `${it.toilHrs.toFixed(1)}h`, toilHrs: it.toilHrs,
        claimNo: carmsClaimNumbers.get(it.entry.id+'-toil'),
      });
    }
    return rows;
  };

  const goToEntry = (entry) => { startEdit(entry); setFocusCarmsToggle(true); };

  // "Select all" — every row's *required* markers (whichever of ot/pa that
  // row's own filter context says actually applies) must already be set,
  // not just that the entry has any marker at all, otherwise a row
  // selected for PA only would read as "done" here even with its own OT
  // still outstanding.
  const required = it => {
    const r = {};
    if (it.otOutstanding && carmsFilter!=='pa' && carmsFilter!=='toil') r.ot = true;
    if (it.paOutstanding && carmsFilter!=='ot' && carmsFilter!=='toil') r.pa = true;
    return r;
  };
  const isDone = it => {
    const req = required(it);
    const sel = carmsSelected[it.entry.id] || {};
    return (!req.ot || sel.ot) && (!req.pa || sel.pa);
  };

  const anyOutstanding = carmsOutstanding.groups.length>0;
  const anyVisible = carmsOutstanding.groups.some(g=>g.items.some(matchesFilter));

  const filterSeg = (compact) => (
    <SegSlider activeKey={carmsFilter} trackStyle={{display:'flex',gap:compact?'4px':'6px',flex:1}} indicatorStyle={{background:BRASS,borderRadius:compact?'8px':'10px'}}>
      {[{id:'all',lbl:'All'},{id:'ot',lbl:compact?'OT':'Overtime'},{id:'pa',lbl:'PA'},{id:'toil',lbl:'TOIL'}].map(f=>(
        <div key={f.id} data-seg-key={f.id} onClick={()=>setCarmsFilter(f.id)} className="tap-row" style={{position:'relative',zIndex:1,flex:1,textAlign:'center',padding:compact?'6px 3px':'8px 4px',borderRadius:compact?'8px':'10px',fontSize:compact?'9.5px':'11px',fontWeight:800,cursor:'pointer',background:'transparent',color:carmsFilter===f.id?'#fff':'var(--muted)',border:carmsFilter===f.id?'none':'1px solid var(--border-2)'}}>{f.lbl}</div>
      ))}
    </SegSlider>
  );

  const emptyState = (title, sub) => (
    <div style={{textAlign:'center',padding:'22px 10px 26px'}}>
      <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'var(--tint-brass)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px'}}>
        <Ico n="check" s={20} c={BRASS} w={2.3}/>
      </div>
      <div style={{fontSize:'13px',fontWeight:800,color:'var(--ink)',marginBottom:'3px'}}>{title}</div>
      <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:600}}>{sub}</div>
    </div>
  );

  // ── desktop: one flat, sortable table across every period ───────────────
  const renderDesktopTable = () => {
    const visibleItemsAll = carmsOutstanding.groups.flatMap(g=>g.items.filter(matchesFilter).map(it=>({ it, periodIdx:g.periodIdx })));
    const flatRows = sortRows(visibleItemsAll.flatMap(({it,periodIdx})=>flattenItem(it,periodIdx)));
    const allDone = visibleItemsAll.length>0 && visibleItemsAll.every(({it})=>isDone(it));
    const toggleSelectAll = () => {
      const byEntry = new Map();
      visibleItemsAll.forEach(({it})=>byEntry.set(it.entry.id, required(it)));
      const rows = Array.from(byEntry, ([id,markers])=>({id,markers}));
      toggleCarmsGroup(rows);
    };
    const periodMonthByIdx = new Map(carmsOutstanding.groups.map(g=>[g.periodIdx, g.period.month]));
    const thStyle = {textAlign:'left',fontSize:'9.5px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--quiet)',padding:'10px 12px',borderBottom:'1px solid var(--border-2)',background:'var(--surface-2)',userSelect:'none'};
    const tdStyle = {padding:'10px 12px',fontSize:'12px',fontWeight:700,color:'var(--ink)',verticalAlign:'top'};
    const seenPeriods = new Set();

    return (
      <div style={{background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'14px',overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
        <style>{`.awaits-table tr:last-child td{border-bottom:none;}.awaits-quick{opacity:0;transition:opacity .12s ease;}.awaits-tr:hover .awaits-quick{opacity:1;}`}</style>
        <table className="awaits-table" style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}><Checkbox checked={allDone} onClick={toggleSelectAll} size={16}/></th>
              <th style={{...thStyle,cursor:'pointer'}} onClick={()=>toggleSort('date')}>Date {sortKey==='date'&&(sortDir==='desc'?'▾':'▴')}</th>
              <th style={thStyle}>Shift / Reason</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Period</th>
              <th style={{...thStyle,textAlign:'right',cursor:'pointer'}} onClick={()=>toggleSort('amount')}>Amount {sortKey==='amount'&&(sortDir==='desc'?'▾':'▴')}</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map(row=>{
              const selected = !!carmsSelected[row.entryId]?.[row.claimKey];
              const isFirstOfPeriod = !seenPeriods.has(row.periodIdx);
              if (isFirstOfPeriod) seenPeriods.add(row.periodIdx);
              return (
                <tr key={row.id}
                  ref={el=>{ if(isFirstOfPeriod) periodGroupRefs.current[row.periodIdx]=el; }}
                  className={'awaits-tr'+(pulsePeriodIdx===row.periodIdx?' carms-pulse':'')}
                  onClick={()=>goToEntry(row.entry)}
                  style={{cursor:'pointer',background:selected?'rgba(184,130,63,0.07)':'transparent'}}>
                  <td style={{...tdStyle,borderBottom:'1px solid var(--border-2)'}} onClick={e=>e.stopPropagation()}><Checkbox checked={selected} onClick={()=>toggleCarmsClaim(row.entryId,row.claimKey)} size={16}/></td>
                  <td style={{...tdStyle,borderBottom:'1px solid var(--border-2)',whiteSpace:'nowrap'}}>
                    {row.claimNo!=null&&<span style={{fontFamily:MONO,fontSize:'9.5px',fontWeight:800,color:'var(--quiet)',marginRight:'6px'}}>#{row.claimNo}</span>}
                    {fmtD(row.date)}
                  </td>
                  <td style={{...tdStyle,borderBottom:'1px solid var(--border-2)'}}>{row.reason}</td>
                  <td style={{...tdStyle,borderBottom:'1px solid var(--border-2)'}}>{typeBadge(row)}</td>
                  <td style={{...tdStyle,borderBottom:'1px solid var(--border-2)',color:'var(--quiet)',fontWeight:700,whiteSpace:'nowrap'}}>{periodMonthByIdx.get(row.periodIdx)}</td>
                  <td style={{...tdStyle,borderBottom:'1px solid var(--border-2)',fontFamily:MONO,textAlign:'right',whiteSpace:'nowrap'}}>
                    {row.amountDisplay}
                    {row.kind==='ot+toil'&&<div style={{fontSize:'10px',fontWeight:700,color:'#7c3aed',marginTop:'2px'}}>+ {row.toilHrs.toFixed(1)}h TOIL</div>}
                  </td>
                  <td style={{...tdStyle,borderBottom:'1px solid var(--border-2)',textAlign:'right'}}>
                    <button className="awaits-quick" onClick={e=>{ e.stopPropagation(); selectCarmsClaim(row.entryId,row.claimKey); openCarmsBulkConfirm(); }}
                      style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10px',fontWeight:800,color:'var(--text-green-deep)',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'7px',padding:'4px 9px',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',touchAction:'manipulation'}}>
                      <Ico n="check" s={10} c="var(--text-green-deep)" w={3}/> Mark submitted
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ── mobile: period-grouped dense list, same grouping/pulse container as
  // before, redesigned rows (checkbox + icon chip + always-visible quick
  // submit instead of hover, since hover doesn't exist on a phone) ────────
  const renderMobileList = () => carmsOutstanding.groups.map(g=>{
    const visibleItems = g.items.filter(matchesFilter);
    if (visibleItems.length===0) return null;
    const groupTotalLabel = (() => {
      if (carmsFilter==='toil') return `${visibleItems.reduce((s,it)=>s+it.toilHrs,0).toFixed(1)}h`;
      const total = visibleItems.reduce((s,it)=>{
        if (carmsFilter==='ot') return s+it.otAmt;
        if (carmsFilter==='pa') return s+it.paAmt;
        return s+it.amount;
      },0);
      return fmtGBP(total);
    })();
    const rows = sortRows(visibleItems.flatMap(it=>flattenItem(it, g.periodIdx)));
    return (
      <div key={g.periodIdx} ref={el=>periodGroupRefs.current[g.periodIdx]=el} className={pulsePeriodIdx===g.periodIdx?'carms-pulse':''} style={{marginBottom:'14px',borderRadius:'14px',border:pulsePeriodIdx===g.periodIdx?'2px solid #2563eb':'2px solid transparent'}}>
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 4px',fontSize:'12.5px',fontWeight:800,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.6px',borderBottom:'1px solid var(--border-2)'}}>
          <span>{g.period.short} · {g.period.month} · {fmtD(g.period.start)} – {fmtD(g.period.end)}</span>
          <span style={{fontFamily:MONO,color:BRASS}}>{groupTotalLabel}</span>
        </div>
        <div style={{padding:'10px 0 2px'}}>
          {rows.map((row,i)=>{
            const selected = !!carmsSelected[row.entryId]?.[row.claimKey];
            return (
              <div key={row.id} className="claim-in tap-row" onClick={()=>goToEntry(row.entry)} style={{display:'flex',alignItems:'center',gap:'9px',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'9px 10px',marginBottom:'7px',cursor:'pointer',touchAction:'manipulation',userSelect:'none',WebkitUserSelect:'none',animationDelay:(Math.min(i,6)*55)+'ms',background:selected?'rgba(184,130,63,0.07)':'var(--surface)'}}>
                <span onClick={e=>e.stopPropagation()}><Checkbox checked={selected} onClick={()=>toggleCarmsClaim(row.entryId,row.claimKey)} size={18}/></span>
                {catChip(row.kind==='ot+toil'?'ot':row.kind, 26)}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'12px',fontWeight:700,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{row.reason}</div>
                  <div style={{fontSize:'9.5px',color:'var(--quiet)',marginTop:'1px'}}>{row.typeLabel} · {new Date(row.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'5px',flexShrink:0}}>
                  <div style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--ink)'}}>{row.amountDisplay}</div>
                  {row.kind==='ot+toil'&&<div style={{fontFamily:MONO,fontSize:'9px',fontWeight:700,color:'#7c3aed'}}>+{row.toilHrs.toFixed(1)}h TOIL</div>}
                  <button onClick={e=>{ e.stopPropagation(); selectCarmsClaim(row.entryId,row.claimKey); openCarmsBulkConfirm(); }}
                    style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'8.5px',fontWeight:800,color:'var(--text-green-deep)',background:'var(--tint-green)',border:'1px solid var(--border-2)',borderRadius:'6px',padding:'3px 6px',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',touchAction:'manipulation'}}>
                    <Ico n="check" s={8} c="var(--text-green-deep)" w={3}/> Submit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  return (
    <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
      <h2 style={{fontSize:'19px',fontWeight:900,color:'var(--ink)',margin:'0 0 18px',letterSpacing:'-0.5px'}}>CARMS &amp; PA Awaiting Submission</h2>

      {/* ── navy statement header ── */}
      <div style={{background:'var(--navy)',borderRadius:'18px',padding:'22px 20px',position:'relative',overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
        <div style={{fontFamily:MONO,fontSize:'10px',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#c9a35f',marginBottom:'10px'}}>Outstanding</div>
        <div style={{fontFamily:MONO,fontSize:'28px',fontWeight:600,color:'#fff',letterSpacing:'-0.02em',marginBottom:'9px'}}>{fmtGBP(animatedTotal)}</div>
        <div style={{width:'38px',height:'3px',background:BRASS,borderRadius:'2px',marginBottom:'12px'}}/>
        <div style={{fontSize:'11px',color:'#93c5fd',fontWeight:600,lineHeight:1.5}}>Spacing out your overtime for a steadier payday, or quietly dodging the taxman as £100k creeps closer — either way, good thinking. This is everything still sitting unclaimed in CARMS and PA, so nothing gets left behind.</div>
      </div>

      {!anyOutstanding ? (
        emptyState('All caught up', 'Every logged claim has been marked as submitted')
      ) : (
        <div style={{marginTop:'14px'}}>
          {/* ── condensed OT / PA / Claims strip — one line, not three
               repeating hairline rows ── */}
          <div style={{display:'flex',gap:'18px',alignItems:'baseline',flexWrap:'wrap',margin:'2px 2px 12px'}}>
            <span style={{fontFamily:MONO,fontSize:'20px',fontWeight:600,color:'var(--ink)'}}>{carmsOutstanding.totalClaims}</span>
            <span style={{fontSize:'10.5px',color:'var(--quiet)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.04em'}}>Claim{carmsOutstanding.totalClaims!==1?'s':''} outstanding</span>
            <span style={{color:'var(--border)'}}>|</span>
            <span style={{fontSize:'10.5px',color:'var(--quiet)',fontWeight:700}}>OT <span style={{fontFamily:MONO,color:'var(--ink)'}}>{fmtGBP(carmsOutstanding.totalOtAmount)}</span></span>
            <span style={{fontSize:'10.5px',color:'var(--quiet)',fontWeight:700}}>PA <span style={{fontFamily:MONO,color:'var(--ink)'}}>{fmtGBP(carmsOutstanding.totalPaAmount)}</span></span>
          </div>

          <div style={{background:'var(--tint-amber)',border:'1px solid var(--border-2)',borderRadius:'12px',padding:'9px 12px',fontSize:'11px',color:'var(--text-amber-deep)',lineHeight:1.5,marginBottom:'14px'}}>
            This {fmtGBP(carmsOutstanding.totalAmount)} isn't in your Total Gross YTD yet — it only counts once it's been marked as submitted on the Log Overtime screen.
          </div>

          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'14px'}}>
            {filterSeg(!isWide)}
            {!isWide&&(
              <button onClick={()=>toggleSort(sortKey==='date'?'amount':'date')} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'9.5px',fontWeight:800,color:'var(--quiet)',background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:'8px',padding:'6px 9px',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',touchAction:'manipulation'}}>
                {sortKey==='date'?'Date':'Amount'} <Ico n="cD" s={9} c="var(--quiet)" w={2.5}/>
              </button>
            )}
          </div>

          {!anyVisible ? (
            emptyState(`Nothing outstanding for ${carmsFilter==='ot'?'Overtime':carmsFilter==='pa'?'PA':'TOIL'}`, 'Other categories still have claims — switch filters above to see them')
          ) : (
            isWide ? renderDesktopTable() : renderMobileList()
          )}
        </div>
      )}

      {/* ── bulk action bar — only present while there's something to act
           on, floats just above the bottom nav on mobile; desktop has no
           bottom nav (fixed left sidebar instead), so it just sits in
           normal flow there. ── */}
      {barMounted && (
        <div className={'sheet-pop'+(barOpen?'':' pop-out')} style={{...(!isWide?{position:'sticky',bottom:'calc(88px + env(safe-area-inset-bottom))'}:{}),zIndex:24,marginTop:'11px',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'15px',padding:'12px 14px',boxShadow:'0 10px 24px rgba(15,39,68,0.16)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
            <div style={{fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}>{barCount} selected</div>
            <div style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:600,color:BRASS}}>{fmtGBP(barTotal)}</div>
          </div>
          <button onClick={openCarmsBulkConfirm} style={{width:'100%',background:BRASS,border:'none',borderRadius:'11px',padding:'12px',fontWeight:800,fontSize:'12.5px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Mark as Submitted</button>
        </div>
      )}
    </div>
  );
}
