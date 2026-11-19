import { useState } from 'react';
import { fmtGBP, payLabel, shiftSpan } from '../lib/format.js';
import { deductionFor } from '../lib/deductions.js';
import { localDateStr } from '../lib/payPeriods.js';
import { Ico } from './Icons.jsx';

// More › Pay & tax: what each month's payslip should show, laid out like the
// Met's Pay Advice, from the same payroll run as everything else (salary and
// allowances at the pay date's rates, claimed overtime and PA, pension, PAYE on
// the month's tax code, NI, and the person's own monthly deductions).
const pct = r => `${(r * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ExpectedPayslips({ payYear, settings, currPeriodIdx, S, MONO, BRASS, isWide }) {
  const [open, setOpen] = useState(false);
  const months = Array.isArray(payYear) ? payYear : [];
  const [pick, setPick] = useState(() => Math.max(0, Math.min(11, currPeriodIdx >= 0 ? currPeriodIdx : 0)));
  const pb = months[pick];
  const today = localDateStr();

  const row = (label, amount, tone) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '3px 0', fontSize: '12.5px', color: 'var(--ink)' }}>
      <span style={{ minWidth: 0 }}>{label}</span>
      <span style={{ fontFamily: MONO, fontWeight: 600, whiteSpace: 'nowrap', color: tone || 'var(--ink)' }}>{fmtGBP(amount)}</span>
    </div>
  );
  const head = t => <div style={{ fontSize: '10px', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '2px 0 4px' }}>{t}</div>;
  const total = (label, amount, tone) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderTop: '1px solid var(--border-2)', fontWeight: 900, fontSize: '13px', color: tone || 'var(--ink)' }}>
      <span>{label}</span><span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtGBP(amount)}</span>
    </div>
  );

  let slip = null;
  if (pb) {
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
    ];
    const totalDed = deductions.reduce((s, [, a]) => s + a, 0);
    const net = totalPay - totalDed;
    const i = months.indexOf(pb);
    const niToDate = months.slice(0, i + 1).reduce((s, x) => s + (x.monthNI || 0), 0);
    const paid = pb.payDate <= today;
    slip = (
      <>
        <div style={{ border: '1.5px solid var(--ink)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', padding: '10px 12px', borderBottom: '1.5px solid var(--ink)', background: 'var(--surface-2)' }}>
            {[['Date paid', fmtDay(pb.payDate)], ['Tax code', pb.taxCode || '1257L Cumulative'], ['Pay month', payLabel(pb.month)], ['Shifts', shiftSpan(pb.start, pb.end).replace(/^Shifts /, '')]].map(([k, v]) => (
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
      </>
    );
  }

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
        <div style={{ maxWidth: '560px', margin: isWide ? '0 auto' : 0 }}>
          <div role="tablist" aria-label="Pay month" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
            {months.map((m, k) => (
              <button key={m.month} type="button" role="tab" aria-selected={k === pick} onClick={() => setPick(k)}
                style={{ border: 'none', borderRadius: '999px', padding: '6px 10px', fontFamily: 'inherit', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: k === pick ? BRASS : 'var(--surface-2)', color: k === pick ? '#fff' : 'var(--quiet)' }}>
                {m.month.split(' ')[0].slice(0, 3)}
              </button>
            ))}
          </div>
          {slip}
        </div>
      ) : <div style={{ fontSize: '12.5px', color: 'var(--quiet)' }}>Set your rank and pay point in Config to see your payslips.</div>)}
    </div>
  );
}
