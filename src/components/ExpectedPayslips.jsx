import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { useEscapeToClose } from '../lib/useEscapeToClose.js';
import { useBackButtonCloses } from '../lib/useBackButtonCloses.js';
import { fmtGBP, payLabel, shiftSpan } from '../lib/format.js';
import { deductionFor } from '../lib/deductions.js';
import { localDateStr } from '../lib/payPeriods.js';
import { Ico } from './Icons.jsx';
import { TaxCodeEditor } from './TaxCodeEditor.jsx';

// More › Pay & tax: what each month's payslip should show, laid out like the
// Met's Pay Advice, from the same payroll run as everything else (salary and
// allowances at the pay date's rates, claimed overtime and PA, pension, PAYE on
// the month's tax code, NI, and the person's own monthly deductions).
const pct = r => `${(r * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// The month chips and that month's Pay Advice: shared by the card in More
// and the pop-up opened from Home.
function PayslipPanel({ months, pick, setPick, settings, saveSett, S, MONO, BRASS, isWide }) {
  const pb = months[pick];
  const today = localDateStr();
  const [codeOpen, setCodeOpen] = useState(false);

  const fs = isWide ? '14px' : '12.5px';
  const row = (label, amount, tone) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: isWide ? '6px 0' : '3px 0', fontSize: fs, color: 'var(--ink)', borderBottom: isWide ? '1px dashed var(--border-2)' : 'none' }}>
      <span style={{ minWidth: 0 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontWeight: 600, whiteSpace: 'nowrap', color: tone || 'var(--ink)' }}>{fmtGBP(amount)}</span>
    </div>
  );
  const head = t => <div style={{ fontSize: isWide ? '11.5px' : '10px', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: isWide ? '0 0 6px' : '2px 0 4px' }}>{t}</div>;
  const total = (label, amount, tone) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: isWide ? '10px 18px' : '7px 12px', borderTop: '1px solid var(--border-2)', fontWeight: 900, fontSize: isWide ? '15px' : '13px', color: tone || 'var(--ink)', background: isWide ? 'var(--surface-2)' : 'transparent' }}>
      <span>{label}</span><span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtGBP(amount)}</span>
    </div>
  );

  let slip = null;
  // A month paid by a previous force (More › Config › moved forces): that
  // force's payslip, not one this app can work out.
  if (pb && pb.prevForce) slip = (
    <div style={{ background: 'var(--surface-2)', borderRadius: '14px', padding: '16px 18px', fontSize: '13px', fontWeight: 600, color: 'var(--muted)', lineHeight: 1.5 }}>
      <b style={{ color: 'var(--ink)' }}>Paid by your previous force.</b> Its pay and tax for this tax year are on your P45 (More › Config › I moved forces this tax year), and count towards your tax from your first payslip here.
    </div>
  );
  else if (pb) {
    const lap = pb.laParts || { la1: 0, la2: 0, laVar: pb.la };
    const payments = [
      ['Basic salary', pb.salary], ['London Allowance 1', lap.la1], ['London Allowance 2', lap.la2],
      ['London Allowance Variable', lap.laVar], ['London Weighting', pb.lw],
      ['Overtime', pb.ot || 0], ['Protection Allowance', pb.pa || 0],
    ];
    const totalPay = pb.monthGross;
    const own = (Array.isArray(settings?.deductions) ? settings.deductions : [])
      .map(d => [d.name || 'Deduction', deductionFor(d, pb.month), d.when === 'before'])
      .filter(([, a]) => a > 0.005);
    const deductions = [
      [`Pension (${pct(pb.pensionRate || 0)})`, pb.periodPension],
      ['PAYE income tax', pb.monthTax],
      ['National Insurance', pb.monthNI],
      ...own.map(([n, a, pre]) => [pre ? `${n} (before tax)` : n, a]),
    ].sort(([a], [b]) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' }));   // A–Z, as on a Met payslip
    const totalDed = deductions.reduce((s, [, a]) => s + a, 0);
    const net = totalPay - totalDed;
    const i = months.indexOf(pb);
    const niToDate = months.slice(0, i + 1).reduce((s, x) => s + (x.monthNI || 0), 0);
    const paid = pb.payDate <= today;
    const tile = (label, amount, tone, big) => (
      <div style={{ background: big ? 'var(--tint-green)' : 'var(--surface-2)', borderRadius: '14px', padding: '14px 18px', border: big ? '1px solid var(--border-2)' : 'none' }}>
        <div style={{ fontSize: '11px', fontWeight: 900, color: big ? 'var(--text-green-deep)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ fontFamily: MONO, fontSize: big ? '28px' : '22px', fontWeight: 700, color: tone || 'var(--ink)', marginTop: '4px' }}>{fmtGBP(amount)}</div>
      </div>
    );
    // Still on the default 1257L and never confirmed: most people are, but a
    // different code on the real payslip (e.g. 1271L) puts the tax out every
    // month, so ask once. "Mine is 1257L" or saving a code answers it.
    const askCode = !!saveSett && !settings?.taxCode && !settings?.taxCodeChecked;
    const answered = s => saveSett({ ...s, taxCodeChecked: true });
    const codeNudge = askCode && (
      <div style={{ background: 'var(--tint-amber)', borderRadius: '12px', padding: isWide ? '12px 16px' : '10px 12px', marginTop: isWide ? '14px' : '10px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <Ico n="warn" s={16} c="var(--text-amber-deep)"/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isWide ? '13.5px' : '12.5px', fontWeight: 900, color: 'var(--text-amber-deep)' }}>Is your tax code 1257L?</div>
            <div style={{ fontSize: isWide ? '12.5px' : '11.5px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45, marginTop: '2px' }}>This payslip uses 1257L, the standard code. Check the Tax Code box on your real payslip: if it's different, the tax here will be out.</div>
            {!codeOpen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '9px' }}>
                <button type="button" onClick={() => setCodeOpen(true)} style={{ background: BRASS, color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontFamily: 'inherit', fontWeight: 900, fontSize: '12.5px', cursor: 'pointer' }}>Mine's different</button>
                <button type="button" onClick={() => answered(settings)} style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 14px', fontFamily: 'inherit', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>Yes, it's 1257L</button>
              </div>
            )}
          </div>
        </div>
        {codeOpen && (
          <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '12px', marginTop: '10px' }}>
            <TaxCodeEditor bare settings={settings} saveSett={answered} S={S} BRASS={BRASS}/>
          </div>
        )}
      </div>
    );
    const wideSlip = (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px', marginBottom: '16px' }}>
          {tile('Total payments', totalPay)}
          {tile('Total deductions', totalDed, 'var(--text-red-deep)')}
          {tile('Net pay', net, 'var(--text-green-deep)', true)}
        </div>
        <div style={{ border: '1.5px solid var(--ink)', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1.5px solid var(--ink)' }}>
            <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>Pay Advice <span style={{ fontWeight: 700, color: 'var(--quiet)', fontSize: '13px' }}>· expected</span></div>
            <span style={{ fontSize: '11.5px', fontWeight: 900, padding: '4px 10px', borderRadius: '999px', background: paid ? 'var(--tint-green)' : 'var(--tint-amber)', color: paid ? 'var(--text-green-deep)' : 'var(--text-amber-deep)' }}>{paid ? 'Paid' : 'Not paid yet'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '12px', padding: '12px 18px', borderBottom: '1.5px solid var(--ink)', background: 'var(--surface-2)' }}>
            {[['Date paid', fmtDay(pb.payDate)], ['Tax code', pb.taxCode || '1257L'], ['Pay month', payLabel(pb.month)], ['Shifts', shiftSpan(pb.start, pb.end).replace(/^Shifts /, '')]].map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginTop: '2px' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ borderRight: '1.5px solid var(--ink)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 18px 8px', flex: 1 }}>{head('Payments & allowances')}{payments.map(([l, a]) => row(l, a))}</div>
              {total('Total payments', totalPay)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 18px 8px', flex: 1 }}>{head('Deductions')}{deductions.map(([l, a]) => row(l, a, 'var(--text-red-deep)'))}</div>
              {total('Total deductions', totalDed, 'var(--text-red-deep)')}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: '1.5px solid var(--ink)', background: 'var(--tint-green)', fontWeight: 900, fontSize: '18px', color: 'var(--text-green-deep)' }}>
            <span>Net pay</span><span style={{ fontFamily: MONO }}>{fmtGBP(net)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '12px', padding: '12px 18px', borderTop: '1px solid var(--border-2)' }}>
            {[['Taxable pay to date', Math.floor(pb.cumAfter || 0)], ['Tax to date', pb.taxToDate || 0], ['NI to date', niToDate]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--quiet)' }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>{fmtGBP(v)}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--quiet)', lineHeight: 1.5, marginTop: '10px', fontWeight: 600 }}>
          {paid ? '' : 'Not paid yet: overtime and PA show what’s been claimed for this month so far. '}
          Worked out by the app from your rank, pay point, claims, tax code and deductions. A guide only: check it against your real payslip.
        </div>
        {codeNudge}
      </>
    );
    slip = isWide ? wideSlip : (
      <>
        <div style={{ border: '1.5px solid var(--ink)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', padding: '10px 12px', borderBottom: '1.5px solid var(--ink)', background: 'var(--surface-2)' }}>
            {[['Date paid', fmtDay(pb.payDate)], ['Tax code', pb.taxCode || '1257L'], ['Pay month', payLabel(pb.month)], ['Shifts', shiftSpan(pb.start, pb.end).replace(/^Shifts /, '')]].map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink)' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 12px 4px' }}>{head('Payments & allowances')}{payments.map(([l, a]) => row(l, a))}</div>
          {total('Total payments', totalPay)}
          <div style={{ padding: '8px 12px 4px' }}>{head('Deductions')}{deductions.map(([l, a]) => row(l, a, 'var(--text-red-deep)'))}</div>
          {total('Total deductions', totalDed, 'var(--text-red-deep)')}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderTop: '1.5px solid var(--ink)', background: 'var(--tint-green)', fontWeight: 900, fontSize: '15px', color: 'var(--text-green-deep)' }}>
            <span>Net pay</span><span style={{ fontFamily: MONO }}>{fmtGBP(net)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '6px', padding: '8px 12px', borderTop: '1px solid var(--border-2)' }}>
            {[['Taxable pay to date', Math.floor(pb.cumAfter || 0)], ['Tax to date', pb.taxToDate || 0], ['NI to date', niToDate]].map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--quiet)', lineHeight: 1.25 }}>{k}</div>
                <div style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>{fmtGBP(v)}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: '10.5px', color: 'var(--quiet)', lineHeight: 1.45, marginTop: '8px', fontWeight: 600 }}>
          {paid ? '' : 'Not paid yet: overtime and PA show what’s been claimed for this month so far. '}
          Worked out by the app from your rank, pay point, claims, tax code and deductions. A guide only: check it against your real payslip.
        </div>
        {codeNudge}
      </>
    );
  }

  return (
    <div style={{ maxWidth: isWide ? '980px' : '560px', margin: isWide ? '0 auto' : 0 }}>
      <div role="tablist" aria-label="Pay month" style={{ ...(isWide ? { display: 'flex', flexWrap: 'wrap' } : { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }), gap: isWide ? '6px' : '5px', marginBottom: isWide ? '16px' : '12px', ...(isWide ? { background: 'var(--surface-2)', borderRadius: '14px', padding: '5px', justifyContent: 'space-between' } : null) }}>
        {months.map((m, k) => (
          <button key={m.month} type="button" role="tab" aria-selected={k === pick} onClick={() => setPick(k)}
            style={{ border: 'none', borderRadius: isWide ? '10px' : '999px', padding: isWide ? '9px 0' : '6px 0', flex: isWide ? '1 1 0' : '0 0 auto', fontFamily: 'inherit', fontSize: isWide ? '13.5px' : '12px', fontWeight: 800, cursor: 'pointer', background: k === pick ? BRASS : (isWide ? 'transparent' : 'var(--surface-2)'), color: k === pick ? '#fff' : 'var(--quiet)' }}>
            {m.month.split(' ')[0].slice(0, 3)}
          </button>
        ))}
      </div>
      {slip}
    </div>
  );
}

const startPick = idx => Math.max(0, Math.min(11, idx >= 0 ? idx : 0));

export function ExpectedPayslips({ payYear, settings, saveSett, currPeriodIdx, S, MONO, BRASS, isWide, alwaysOpen }) {
  const [open, setOpen] = useState(false);
  const months = Array.isArray(payYear) ? payYear : [];
  const [pick, setPick] = useState(() => startPick(currPeriodIdx));
  // More › Expected payslips: the page is the card, so no header to tap.
  if (alwaysOpen) return (
    <div style={S.card}>
      {months.length ? <PayslipPanel months={months} pick={pick} setPick={setPick} settings={settings} saveSett={saveSett} S={S} MONO={MONO} BRASS={BRASS} isWide={isWide}/>
        : <div style={{ fontSize: '12.5px', color: 'var(--quiet)' }}>Set your rank and pay point to see your payslips.</div>}
    </div>
  );
  return (
    <div style={{ ...S.card, ...(isWide && open ? { gridColumn: '1 / -1' } : null) }}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="tap-row"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', marginBottom: open ? '12px' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ background: 'var(--tint-green)', padding: isWide ? '11px' : '9px', borderRadius: '13px' }}><Ico n="cash" s={isWide ? 21 : 17} c="#059669"/></div>
          <div><div style={{ fontWeight: 900, fontSize: '14px', color: 'var(--ink)' }}>Expected payslips</div><div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--quiet)', marginTop: '2px' }}>What each month's payslip should show</div></div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'transform 0.35s cubic-bezier(.65,0,.35,1)', transform: open ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (months.length ? (
        <PayslipPanel months={months} pick={pick} setPick={setPick} settings={settings} saveSett={saveSett} S={S} MONO={MONO} BRASS={BRASS} isWide={isWide}/>
      ) : <div style={{ fontSize: '12.5px', color: 'var(--quiet)' }}>Set your rank and pay point in Config to see your payslips.</div>)}
    </div>
  );
}

// Home › Overview: the same Pay Advice in a pop-up over the page, opened on
// a given month, with ‹ › and the month chips to move between months.
export function PayslipModal({ payYear, settings, saveSett, S, startIdx, onClose, MONO, BRASS, isWide }) {
  const months = Array.isArray(payYear) ? payYear : [];
  const [pick, setPick] = useState(() => startPick(startIdx));
  const boxRef = useRef(null);
  useFocusTrap(true, boxRef);
  useEscapeToClose(true, onClose, { top: true });
  useBackButtonCloses(true, onClose, { top: true });
  const step = d => setPick(k => Math.max(0, Math.min(months.length - 1, k + d)));
  const nav = (d, label, glyph) => (
    <button type="button" aria-label={label} disabled={d < 0 ? pick === 0 : pick === months.length - 1} onClick={() => step(d)}
      style={{ background: 'var(--surface-2)', border: 'none', borderRadius: '10px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink)', fontSize: '18px', fontWeight: 800, opacity: (d < 0 ? pick === 0 : pick === months.length - 1) ? 0.35 : 1 }}>{glyph}</button>
  );
  if (!months.length) return null;
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', fontFamily: 'var(--app-font)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Expected payslip"
        style={{ background: 'var(--surface)', borderRadius: '18px', width: '100%', maxWidth: isWide ? '1040px' : '560px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px', borderBottom: '1px solid var(--border-2)', flexShrink: 0 }}>
          <Ico n="cash" s={18} c="#059669"/>
          <span style={{ fontSize: '15.5px', fontWeight: 900, color: 'var(--ink)', flex: 1 }}>Expected payslip</span>
          {nav(-1, 'Previous month', '‹')}{nav(1, 'Next month', '›')}
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'var(--surface-2)', border: 'none', borderRadius: '10px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ico n="x" s={14} c="var(--muted)"/></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 16px 18px' }}>
          <PayslipPanel months={months} pick={pick} setPick={setPick} settings={settings} saveSett={saveSett} S={S} MONO={MONO} BRASS={BRASS} isWide={isWide}/>
        </div>
      </div>
    </div>,
    document.body
  );
}
