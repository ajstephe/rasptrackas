import { fmtGBP, fmtHM, fmtD } from '../lib/format.js';
import { Ico, FireExitIcon } from './Icons.jsx';
import { useCountUp } from '../lib/useCountUp.js';

// ─── Home (dashboard) tab ────────────────────────────────────────────────────
// Extracted verbatim from App.jsx's tab==='dashboard' IIFE — no behaviour
// change. renderMonthlyChart, S and the various setters/refs all come in as
// props rather than being closed over directly.
export function TabDashboard({
  isWide, settings, setTab, totals, taxForecast, currPeriodIdx, toilLedger, carmsOutstanding,
  salaryBreakdownExpanded, setSalaryBreakdownExpanded,
  scrollToTaxImpact, setTaxImpactExpanded,
  skipBreakdownReset, setBreakdownView, setCalPeriodIdx,
  renderMonthlyChart, S, MONO, BRASS, animClass='fi',
  session, setSignOutConfirmOpen,
}) {
  // The two headline mono figures count up/down when they change instead
  // of jumping straight to the new value — logging a shift, editing one,
  // or a settings change that shifts the tax calc all land as a felt
  // change in the number, not a silent swap.
  const pb = currPeriodIdx>=0 ? totals.periodBreakdown[currPeriodIdx] : null;
  const animatedNet = useCountUp(pb ? pb.combinedNet : 0);
  const animatedGrossYTD = useCountUp(settings.rank&&settings.service ? totals.combinedGrossYTD : 0);

  // ── Net-pay hero row ──────────────────────────────────────────────
  // Replaces the old cramped "Gross & Net" mini-columns with the one
  // figure people actually open the app to check — net pay this
  // period — given real size, a delta vs last period, and a trend
  // line. Gross doesn't disappear, just demotes to a small caption.
  // Deliberately NOT touching the masthead's own headline (Total
  // Gross YTD stays there — that's the tax-band-awareness number,
  // a different job). All of it comes from totals.periodBreakdown,
  // which already carries every period's combinedNet in order —
  // no new calculation, just reading neighbouring entries.
  const netHeroRow = (compact) => {
    const prevPb = currPeriodIdx>0  ? totals.periodBreakdown[currPeriodIdx-1] : null;
    const delta  = (pb&&prevPb) ? (pb.combinedNet - prevPb.combinedNet) : null;
    const sparkFrom = Math.max(0, currPeriodIdx - 5);
    const sparkVals = currPeriodIdx>=0 ? totals.periodBreakdown.slice(sparkFrom, currPeriodIdx+1).map(p=>p.combinedNet) : [];
    const sparkMin = sparkVals.length ? Math.min(...sparkVals) : 0;
    const sparkMax = sparkVals.length ? Math.max(...sparkVals) : 1;
    const sparkRange = sparkMax - sparkMin || 1;
    const W = compact ? 120 : 140, H = 26, PAD = 3;
    const pts = sparkVals.map((v,i)=>{
      const x = sparkVals.length>1 ? (i/(sparkVals.length-1))*W : W;
      const y = PAD + (1 - (v-sparkMin)/sparkRange) * (H - PAD*2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return (
      <div style={{padding:compact?'14px 0':'16px 0',borderBottom:'1px solid var(--border-2)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom:'2px'}}>
          <div style={{display:'flex',alignItems:'center',gap:compact?'10px':'12px'}}>
            <div style={{background:'var(--tint-green-2)',padding:compact?'8px':'9px',borderRadius:compact?'10px':'11px',flexShrink:0}}><Ico n="cash" s={compact?16:17} c="#15803d"/></div>
            {/* Matches the plain-text header style every other row in this
                card uses (Current Pay Period / TOIL Balance / CARMS &
                MetHR Outstanding, below) — this was the one header still
                set as a small uppercase mono eyebrow instead, which read
                as a different kind of label sitting in the same list. */}
            <span style={{fontSize:compact?'12px':'13px',fontWeight:700,color:'var(--ink)'}}>Net Pay · This Period</span>
          </div>
          <span style={{fontFamily:MONO,fontSize:compact?'10px':'10.5px',fontWeight:600,color:'var(--quiet)'}}>Gross {pb?fmtGBP(pb.combinedGross):'£0.00'}</span>
        </div>
        <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:'12px',paddingLeft:compact?'42px':'46px'}}>
          <div>
            <div style={{fontFamily:MONO,fontSize:compact?'22px':'25px',fontWeight:700,color:'var(--ink)',letterSpacing:'-0.01em',lineHeight:1.1}}>{fmtGBP(animatedNet)}</div>
            {/* Tapping the trend pill jumps straight to the period it's
                actually comparing against (currPeriodIdx-1, not the
                current one) — same drill-down instinct as every other
                tap-to-go-deeper spot on this tab, applied to the one
                figure here that was previously just decorative. */}
            {delta!=null&&(
              <button onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx-1); setTab('months'); }} className="tap-row" style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10px',fontWeight:600,color:delta>=0?'#059669':'var(--text-red-deep)',background:delta>=0?'var(--tint-green)':'var(--tint-red)',padding:'2px 6px 2px 8px',borderRadius:'20px',marginTop:'4px',border:'none',cursor:'pointer',fontFamily:'inherit',touchAction:'manipulation'}}>
                <span style={{fontFamily:MONO}}>{delta>=0?'▲':'▼'} {fmtGBP(Math.abs(delta))} vs last period</span>
                <Ico n="cR" s={9} c="currentColor" w={2.5}/>
              </button>
            )}
          </div>
          {pts.length>1&&(
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{flexShrink:0,marginBottom:'2px'}}>
              <polyline points={pts.join(' ')} fill="none" stroke={BRASS} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx={pts[pts.length-1].split(',')[0]} cy={pts[pts.length-1].split(',')[1]} r="3" fill={BRASS}/>
            </svg>
          )}
        </div>
      </div>
    );
  };

  const salaryBreakdownCard = (
    <div style={S.card}>
      {/* Desktop starts (and stays) expanded — there's nothing to toggle
          there, so disabled rather than a plain div: same look, but
          genuinely inert (out of tab order, no click handler at all)
          instead of a div whose onClick quietly did nothing on that
          layout anyway. The accordion body used to need its own
          stopPropagation to stop a click inside it from bubbling up to
          this row's own toggle; now that the toggle lives on this button
          alone (a sibling of the body, not an ancestor of it), a click
          inside the body was never going to reach it in the first place. */}
      <button disabled={isWide} onClick={()=>setSalaryBreakdownExpanded(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',cursor:isWide?'default':'pointer'}}>
        <div style={{display:'flex',alignItems:'center',gap:'11px'}}>
          <div style={{background:'var(--tint-brass)',padding:isWide?'10px':'8.5px',borderRadius:isWide?'12px':'13px',flexShrink:0}}><Ico n="bar" s={isWide?17:24} c={BRASS}/></div>
          <div>
            <div style={{fontWeight:900,fontSize:'10px',color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Salary Breakdown &amp; Overtime Forecast</div>
            <div style={{fontSize:'10.5px',color:'var(--quiet)',marginTop:'1px'}}>Base, allowances, overtime, full-year projection</div>
          </div>
        </div>
        {!isWide&&<span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',flexShrink:0}}>{salaryBreakdownExpanded?'Tap to Close':'Tap to expand'}</span>}
      </button>

      {salaryBreakdownExpanded&&(
        <div className="accordion-in" style={{cursor:'default'}}>
          {/* breakdown rows — London Weighting/Allowance shown as YTD out of full year */}
          <div style={{borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px',display:'flex',flexDirection:'column',gap:'6px'}}>
            {[
              ['Base Salary (YTD)', totals.salaryYTD, null],
              ['London Weighting', settings.rank&&settings.service ? totals.lwYTD : null, totals.lwAnnualTotal],
              ['London Allowance', settings.rank&&settings.service ? totals.laYTD : null, totals.laAnnualTotal],
            ].map(([label,val,fullYear])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>{label}</span>
                <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:val==null?'var(--quiet)':'var(--ink)'}}>
                  {val==null
                    ? 'Set rank & pay point'
                    : fullYear!=null
                      ? <>{fmtGBP(val)}<span style={{color:'var(--quiet)'}}> / {fmtGBP(fullYear)}</span></>
                      : fmtGBP(val)}
                </span>
              </div>
            ))}
            {[
              ['Overtime', totals.totalOTGross, totals.totalOTNet],
              ['PA',       totals.totalPAGross, totals.totalPANet],
            ].map(([label,gross,net])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>{label}</span>
                <span style={{fontFamily:MONO,fontSize:'12px',fontWeight:600,color:'var(--ink)'}}>{fmtGBP(gross)}<span style={{color:'#059669'}}> ({fmtGBP(net)})</span></span>
              </div>
            ))}
            <div style={{fontSize:'9.5px',fontWeight:600,color:'var(--quiet)',textAlign:'right',marginTop:'2px'}}>Figures in brackets, e.g. <span style={{color:'#059669'}}>(£xx.xx)</span>, are net</div>
          </div>

          {/* ── Gross Salary (Actual) ──
               Plots the pension-adjusted taxable figure, not raw gross —
               the £100k/Personal-Allowance taper is assessed against pay
               net of pension (a "net pay arrangement" takes it off before
               tax), exactly what the Tax & 100K+ Calculator this button
               links to already does. Using raw combinedGrossYTD here used
               to let this gauge disagree with the Calculator right next
               to it — showing PA as already tapered, or the wrong rate
               band, whenever pension (~13% of pensionable pay) was enough
               to matter near a threshold. totals.taxableGrossYTD is the
               exact same figure the Calculator's own YTD side reads. ── */}
          {(()=>{
            const taxableYTD = totals.taxableGrossYTD;
            const over100k = taxableYTD > 100000;
            const paNow = over100k ? Math.max(0, 12570 - Math.floor((taxableYTD-100000)/2)) : 12570;
            const scaleMax = Math.max(125140, taxableYTD*1.05);
            const pct = v => Math.max(0, Math.min(100, (v/scaleMax)*100));
            const barColor = taxableYTD>=100000 ? '#ef4444' : taxableYTD>=50270 ? '#f59e0b' : '#059669';
            const statusText = taxableYTD>=125140 ? '+£125k — No PA' : taxableYTD>=100000 ? '+£100k — PA tapering' : taxableYTD>=50270 ? 'Higher rate' : 'Basic rate';
            const markers = [
              { key:'pa',  value: paNow,  label: paNow===0 ? 'PA £0' : over100k ? `PA £${(paNow/1000).toFixed(1)}k` : 'PA £12.6k' },
              { key:'hr',  value: 50270,  label: '£50.3k' },
              { key:'100', value: 100000, label: '£100k' },
              { key:'125', value: 125140, label: '£125.1k' },
            ];
            return (
              <button onClick={()=>{scrollToTaxImpact.current=true;setTaxImpactExpanded(true);setTab('settings');}} className="tap-row" style={{display:'block',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px',cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'3px'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross Salary (Actual)</div>
                  <div style={{fontSize:'10px',fontWeight:800,color:barColor}}>{statusText}</div>
                </div>
                <div style={{fontSize:'9.5px',fontWeight:600,color:'var(--quiet)',marginBottom:'19px'}}>After pension — same figure as the Tax &amp; 100K+ Calculator</div>
                <div style={{position:'relative',marginBottom:'16px'}}>
                  <div style={{background:'var(--border)',borderRadius:'2px',height:'10px',overflow:'hidden',position:'relative'}}>
                    <div style={{width:`${pct(taxableYTD)}%`,height:'100%',background:barColor,transition:'width 0.3s, background 0.3s'}}/>
                  </div>
                  {markers.map(m=>(
                    <div key={m.key} style={{position:'absolute',left:`${pct(m.value)}%`,top:'-2px',width:'2px',height:'14px',background:'var(--border)',transform:'translateX(-1px)'}}>
                      <div style={{position:'absolute',top:'17px',left:'50%',transform:'translateX(-50%)',fontSize:'8px',fontWeight:800,color:'var(--muted)',whiteSpace:'nowrap'}}>{m.label}</div>
                    </div>
                  ))}
                  <div style={{position:'absolute',left:`${pct(taxableYTD)}%`,top:'-5px',width:'3px',height:'20px',background:barColor,transform:'translateX(-1.5px)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}/>
                  <div style={{position:'absolute',left:`${pct(taxableYTD)}%`,top:'-19px',transform:'translateX(-50%)',fontSize:'10px',fontWeight:900,color:barColor,whiteSpace:'nowrap'}}>£{(taxableYTD/1000).toFixed(1)}k</div>
                </div>
              </button>
            );
          })()}

          {/* ── Gross Salary (Forecast) — full-year projection at your current
               overtime pace. Same pension-adjustment reasoning as the Actual
               gauge above: taxForecast.taxableGrossF is the exact figure the
               Tax & 100K+ Calculator's own Forecast side assesses the £100k
               taper against, already computed once in App.jsx's taxForecast
               memo rather than redone here. ── */}
          {(()=>{
            const taxableF = taxForecast ? taxForecast.taxableGrossF : totals.projectedAnnualGross;
            const over100k = taxableF > 100000;
            const paNow = over100k ? Math.max(0, 12570 - Math.floor((taxableF-100000)/2)) : 12570;
            const scaleMax = Math.max(125140, taxableF*1.05);
            const pct = v => Math.max(0, Math.min(100, (v/scaleMax)*100));
            const barColor = taxableF>=100000 ? '#ef4444' : taxableF>=50270 ? '#f59e0b' : '#059669';
            const statusText = taxableF>=125140 ? '+£125k — No PA' : taxableF>=100000 ? '+£100k — PA tapering' : taxableF>=50270 ? 'Higher rate' : 'Basic rate';
            const markers = [
              { key:'pa',  value: paNow,  label: paNow===0 ? 'PA £0' : over100k ? `PA £${(paNow/1000).toFixed(1)}k` : 'PA £12.6k' },
              { key:'hr',  value: 50270,  label: '£50.3k' },
              { key:'100', value: 100000, label: '£100k' },
              { key:'125', value: 125140, label: '£125.1k' },
            ];
            return (
              <button onClick={()=>{scrollToTaxImpact.current=true;setTaxImpactExpanded(true);setTab('settings');}} className="tap-row" style={{display:'block',width:'100%',background:'none',border:'none',padding:0,textAlign:'left',fontFamily:'inherit',borderTop:'1px solid var(--border-2)',marginTop:'14px',paddingTop:'12px',cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'3px'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross Salary (Forecast)</div>
                  <div style={{fontSize:'10px',fontWeight:800,color:barColor}}>{statusText}</div>
                </div>
                <div style={{fontSize:'9.5px',fontWeight:600,color:'var(--quiet)',marginBottom:'19px'}}>Forecast based on your overtime submissions, after pension</div>
                <div style={{position:'relative',marginBottom:'16px'}}>
                  <div style={{background:'var(--border)',borderRadius:'2px',height:'10px',overflow:'hidden',position:'relative'}}>
                    <div style={{width:`${pct(taxableF)}%`,height:'100%',background:barColor,transition:'width 0.3s, background 0.3s'}}/>
                  </div>
                  {markers.map(m=>(
                    <div key={m.key} style={{position:'absolute',left:`${pct(m.value)}%`,top:'-2px',width:'2px',height:'14px',background:'var(--border)',transform:'translateX(-1px)'}}>
                      <div style={{position:'absolute',top:'17px',left:'50%',transform:'translateX(-50%)',fontSize:'8px',fontWeight:800,color:'var(--muted)',whiteSpace:'nowrap'}}>{m.label}</div>
                    </div>
                  ))}
                  <div style={{position:'absolute',left:`${pct(taxableF)}%`,top:'-5px',width:'3px',height:'20px',background:barColor,transform:'translateX(-1.5px)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}/>
                  <div style={{position:'absolute',left:`${pct(taxableF)}%`,top:'-19px',transform:'translateX(-50%)',fontSize:'10px',fontWeight:900,color:barColor,whiteSpace:'nowrap'}}>£{(taxableF/1000).toFixed(1)}k</div>
                </div>
              </button>
            );
          })()}

          {/* ── Monthly Gross vs Net — expands and collapses
               together with the rest of the card now, rather than
               needing its own separate toggle. A clearly visible
               divider (not just the usual faint hairline) marks
               where the gauge bars end and the chart begins,
               since on a wide desktop card the two sections sat
               close enough to read as one continuous block. ── */}
          <div style={{borderTop:'2px solid var(--border)',marginTop:'22px',paddingTop:'20px'}}>
            <div style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>Monthly OT Gross/Net</div>
            {/* Desktop passes wide=true so renderMonthlyChart
                itself uses a wider internal coordinate system
                (W=700 vs 330) — the box then just renders that
                wider chart at 100% width with its normal (equal
                X/Y scale) aspect-ratio sizing, so it spans the
                full card width without stretching the line
                weight or text the way forcing a mismatched
                height did. */}
            <div style={{maxWidth:'100%',margin:'0 auto'}}>
              {renderMonthlyChart(false, false, isWide)}
            </div>
            <div style={{display:'flex',justifyContent:'center',gap:'18px',marginTop:'8px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'13px',height:'2.5px',background:'#059669',borderRadius:'2px'}}/><span style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross</span></div>
              <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'13px',height:'2.5px',background:'#ef4444',borderRadius:'2px'}}/><span style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Net</span></div>
            </div>
            <div style={{textAlign:'center',marginTop:'6px',fontSize:'9px',color:'var(--quiet)'}}>Tap any point for that period's figure</div>
          </div>
        </div>
      )}
    </div>
  );

  return (
  <div className={animClass} style={{padding:'14px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
    {!settings.rank&&(
      <div className="setup-pulse-urgent" style={{background:'var(--tint-red)',border:'1.5px solid var(--border-2)',borderRadius:'13px',padding:'13px 14px',marginBottom:'12px',display:'flex',gap:'11px',alignItems:'flex-start'}}>
        <Ico n="uPlus" s={19} c="#dc2626"/>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,color:'var(--text-red-deep)',fontSize:'13px',marginBottom:'3px'}}>Setup Required</div>
          <div style={{color:'var(--text-red-deep)',fontSize:'12px',marginBottom:'8px'}}>Configure your rank and pay in More..</div>
          <button onClick={()=>setTab('settings')} style={{background:'var(--surface-red-mid)',border:'none',borderRadius:'8px',padding:'5px 11px',fontWeight:900,fontSize:'11px',color:'var(--text-red-deep)',cursor:'pointer',fontFamily:'inherit'}}>Go to More.. →</button>
        </div>
      </div>
    )}

    {isWide ? (<>
    {/* ── "One statement" layout (ledger redesign) — the hero,
         Current Period, Gross & Net, TOIL Balance and CARMS teaser
         that used to each be their own bordered/shadowed card are
         now hairline-divided rows inside a single sheet, so the
         page reads as one document rather than a pile of widgets.
         Money/hours figures use IBM Plex Mono (tabular) instead of
         the body face, and the one wayfinding accent throughout is
         brass (BRASS) — colour stays reserved for real state
         (green/red) elsewhere. Salary Breakdown keeps its own card
         below (it has real internal complexity — an expand toggle,
         a gauge — not worth the risk of restructuring here) but its
         icon chip is recoloured to match. See the "Ledger Redesign"
         mockup this implements; git branch ledger-redesign is the
         undo path if this doesn't land well. ── */}
    <div style={{background:'var(--surface)',borderRadius:'18px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',overflow:'hidden',marginBottom:'16px'}}>
      <div style={{background:'var(--navy)',padding:'22px 26px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',right:'-14px',top:'-14px',width:'72px',height:'72px',background:'rgba(255,255,255,0.04)',borderRadius:'50%'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'14px'}}>
          {/* fontWeight:700, not 900 — IBM Plex Mono has no 900 ("Black")
              cut at all, so a 900 request here was silently rendering as
              700 anyway (confirmed by rasterizing both and diffing pixels:
              zero difference). This just makes the code say what is
              actually on screen. */}
          <div style={{fontFamily:MONO,fontSize:'10px',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#c9a35f'}}>Statement</div>
          {totals.curr&&<div style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:'#7c93b3'}}>{totals.curr.month} · {fmtD(totals.curr.start)}–{fmtD(totals.curr.end)}</div>}
        </div>
        <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Total Gross YTD</div>
        <div style={{fontFamily:MONO,fontSize:'32px',fontWeight:600,color:'#fff',letterSpacing:'-0.5px',lineHeight:1.15,marginBottom:'9px'}}>
          {settings.rank&&settings.service ? fmtGBP(animatedGrossYTD) : '—'}
        </div>
        <div style={{width:'44px',height:'3px',background:BRASS,borderRadius:'2px',marginBottom:'9px'}}/>
        <div style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:'#7c93b3',marginBottom:carmsOutstanding.totalAmount>0?'12px':0}}>
          {settings.rank&&settings.service
            ? `${Math.round(totals.taxYearDaysElapsed)} days into ${totals.taxYearStart.split('-')[0]}/${(parseInt(totals.taxYearStart.split('-')[0])+1).toString().slice(-2)} tax year`
            : 'Set your rank & pay point in More..'}
        </div>
        {carmsOutstanding.totalAmount>0&&(
          <button onClick={()=>setTab('carms')} className="tap-row" style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',fontWeight:800,color:'#fbbf24',cursor:'pointer',background:'none',border:'none',padding:0,fontFamily:'inherit'}}>
            <Ico n="clock" s={11} c="#fbbf24"/>+{fmtGBP(carmsOutstanding.totalAmount)} not yet submitted to CARMS
          </button>
        )}
      </div>

      <div style={{padding:'4px 26px'}}>
        {totals.curr&&(
          <button onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); setTab('months'); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'16px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:'1px',borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <div style={{background:'var(--tint-teal)',padding:'9px',borderRadius:'13px',flexShrink:0}}><Ico n="cal" s={17} c="#0d9488"/></div>
              <div style={{fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>Current Pay Period</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'14px',fontWeight:900,color:'var(--ink)'}}>{totals.curr.month}</div>
              <div style={{fontFamily:MONO,fontSize:'10px',fontWeight:600,color:'var(--quiet)',marginTop:'1px'}}>{fmtD(totals.curr.start)} – {fmtD(totals.curr.end)}</div>
            </div>
          </button>
        )}
        {netHeroRow(false)}
        <button onClick={()=>setTab('graph')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'16px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:carmsOutstanding.totalClaims>0?'1px':0,borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
          <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
            <div style={{background:toilLedger.balance<0?'var(--tint-red)':'var(--tint-purple)',padding:'9px',borderRadius:'11px',flexShrink:0}}><Ico n="clock" s={17} c={toilLedger.balance<0?'var(--text-red-deep)':'#7c3aed'}/></div>
            <div style={{fontSize:'13px',fontWeight:700,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>TOIL Balance{toilLedger.balance<0?' — overdrawn':''}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>{fmtHM(toilLedger.balance)} h</div>
            <div style={{fontFamily:MONO,fontSize:'10px',fontWeight:600,color:toilLedger.balance<0?'#dc2626':'var(--quiet)',marginTop:'1px'}}>≈ {(toilLedger.balance/8).toFixed(1)} days at 8h/day</div>
          </div>
        </button>
        {carmsOutstanding.totalClaims>0&&(
          <button onClick={()=>setTab('carms')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'16px 0',cursor:'pointer',background:'none',border:'none',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <div style={{background:'var(--tint-amber)',padding:'9px',borderRadius:'13px',flexShrink:0}}><Ico n="checklist" s={17} c={BRASS}/></div>
              <div>
                <div style={{fontSize:'13px',fontWeight:700,color:'var(--ink)'}}>CARMS &amp; MetHR Outstanding</div>
                <div style={{fontSize:'10.5px',color:'var(--quiet)',fontWeight:600,marginTop:'1px'}}>{carmsOutstanding.totalClaims} claim{carmsOutstanding.totalClaims!==1?'s':''} · {carmsOutstanding.periodCount} period{carmsOutstanding.periodCount!==1?'s':''}</div>
              </div>
            </div>
            <div style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:BRASS}}>{fmtGBP(carmsOutstanding.totalAmount)}</div>
          </button>
        )}
      </div>
    </div>

    {settings.rank&&settings.service&&salaryBreakdownCard}
    </>) : (<>
    {/* ── Mobile "one statement" layout — same idea as desktop: a
         full-bleed navy masthead the ledger rows grow directly out
         of, instead of a separate floating hero card sitting above
         disconnected stat tiles. Salary Breakdown keeps its own
         card below, same reasoning as desktop. ── */}
    <div style={{background:'var(--surface)',borderRadius:'18px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',overflow:'hidden',marginBottom:'10px'}}>
      <div style={{background:'var(--navy)',padding:'20px 18px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',right:'-14px',top:'-14px',width:'72px',height:'72px',background:'rgba(255,255,255,0.04)',borderRadius:'50%'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'12px'}}>
          {/* fontWeight:700, not 900 — IBM Plex Mono has no 900 ("Black")
              cut at all, so a 900 request here was silently rendering as
              700 anyway (confirmed by rasterizing both and diffing pixels:
              zero difference). This just makes the code say what is
              actually on screen. */}
          <div style={{fontFamily:MONO,fontSize:'10px',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#c9a35f'}}>Statement</div>
          {totals.curr&&<div style={{fontFamily:MONO,fontSize:'9.5px',fontWeight:600,color:'#7c93b3'}}>{totals.curr.month}</div>}
        </div>
        <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'}}>Total Gross YTD</div>
        <div style={{fontFamily:MONO,fontSize:'27px',fontWeight:600,color:'#fff',letterSpacing:'-0.5px',lineHeight:1.15,marginBottom:'8px'}}>
          {settings.rank&&settings.service ? fmtGBP(animatedGrossYTD) : '—'}
        </div>
        <div style={{width:'38px',height:'3px',background:BRASS,borderRadius:'2px',marginBottom:'8px'}}/>
        <div style={{fontFamily:MONO,fontSize:'9.5px',fontWeight:600,color:'#7c93b3',marginBottom:carmsOutstanding.totalAmount>0?'10px':0}}>
          {settings.rank&&settings.service
            ? `${Math.round(totals.taxYearDaysElapsed)} days into ${totals.taxYearStart.split('-')[0]}/${(parseInt(totals.taxYearStart.split('-')[0])+1).toString().slice(-2)} tax year`
            : 'Set your rank & pay point in More..'}
        </div>
        {carmsOutstanding.totalAmount>0&&(
          <button onClick={()=>setTab('carms')} className="tap-row" style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',fontWeight:800,color:'#fbbf24',cursor:'pointer',background:'none',border:'none',padding:0,fontFamily:'inherit'}}>
            <Ico n="clock" s={11} c="#fbbf24"/>+{fmtGBP(carmsOutstanding.totalAmount)} not yet submitted to CARMS
          </button>
        )}
      </div>

      <div style={{padding:'2px 18px'}}>
        {totals.curr&&(
          <button onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); setTab('months'); }} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'14px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:'1px',borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{background:'var(--tint-teal)',padding:'8px',borderRadius:'13px',flexShrink:0}}><Ico n="cal" s={16} c="#0d9488"/></div>
              <div style={{fontSize:'12px',fontWeight:700,color:'var(--ink)'}}>Current period</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'13px',fontWeight:900,color:'var(--ink)'}}>{totals.curr.month}</div>
              <div style={{fontFamily:MONO,fontSize:'9px',fontWeight:600,color:'var(--quiet)',marginTop:'1px'}}>{fmtD(totals.curr.start)}–{fmtD(totals.curr.end)}</div>
            </div>
          </button>
        )}
        {netHeroRow(true)}
        <button onClick={()=>setTab('graph')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'14px 0',cursor:'pointer',background:'none',border:'none',borderBottomWidth:carmsOutstanding.totalClaims>0?'1px':0,borderBottomStyle:'solid',borderBottomColor:'var(--border-2)',textAlign:'left',fontFamily:'inherit'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{background:toilLedger.balance<0?'var(--tint-red)':'var(--tint-purple)',padding:'8px',borderRadius:'10px',flexShrink:0}}><Ico n="clock" s={16} c={toilLedger.balance<0?'var(--text-red-deep)':'#7c3aed'}/></div>
            <div style={{fontSize:'12px',fontWeight:700,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>TOIL Balance{toilLedger.balance<0?' — overdrawn':''}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:toilLedger.balance<0?'var(--text-red-deep)':'var(--ink)'}}>{fmtHM(toilLedger.balance)} h</div>
            <div style={{fontFamily:MONO,fontSize:'9px',fontWeight:600,color:toilLedger.balance<0?'#dc2626':'var(--quiet)',marginTop:'1px'}}>≈ {(toilLedger.balance/8).toFixed(1)}d at 8h/day</div>
          </div>
        </button>
        {carmsOutstanding.totalClaims>0&&(
          <button onClick={()=>setTab('carms')} className="tap-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'14px 0',cursor:'pointer',background:'none',border:'none',textAlign:'left',fontFamily:'inherit'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{background:'var(--tint-amber)',padding:'8px',borderRadius:'13px',flexShrink:0}}><Ico n="checklist" s={16} c={BRASS}/></div>
              <div>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--ink)'}}>CARMS &amp; MetHR Outstanding</div>
                <div style={{fontSize:'9.5px',color:'var(--quiet)',fontWeight:600,marginTop:'1px'}}>{carmsOutstanding.totalClaims} claim{carmsOutstanding.totalClaims!==1?'s':''} · {carmsOutstanding.periodCount} period{carmsOutstanding.periodCount!==1?'s':''}</div>
              </div>
            </div>
            <div style={{fontFamily:MONO,fontSize:'13px',fontWeight:600,color:BRASS}}>{fmtGBP(carmsOutstanding.totalAmount)}</div>
          </button>
        )}
      </div>
    </div>

    {settings.rank&&settings.service&&salaryBreakdownCard}

    {/* Mobile-only — a low-key way to sign out from Home itself, instead
        of only reachable from the bottom of More... Deliberately a small
        icon pill rather than a full box: this is a dashboard people
        check often, not an actions screen, so it shouldn't compete with
        the real content above it. */}
    {session&&(
      <div style={{display:'flex',justifyContent:'center',marginTop:'14px'}}>
        <button onClick={()=>setSignOutConfirmOpen(true)} style={{display:'flex',alignItems:'center',gap:'7px',background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'20px',padding:'8px 14px',cursor:'pointer',fontFamily:'inherit'}}>
          <FireExitIcon size={15} color="#059669"/>
          <span style={{fontWeight:700,fontSize:'12px',color:'#059669'}}>Sign out</span>
        </button>
      </div>
    )}
    </>)}

    <div style={{fontSize:'10.5px',color:'var(--text-red-deep)',textAlign:'center',lineHeight:1.5,padding:'8px 12px 0'}}>For guidance only. Always verify amounts against your payslip.</div>
  </div>
  );
}
