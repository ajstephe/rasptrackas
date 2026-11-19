import { useState } from 'react';
import { PAY_PERIODS, localDateStr } from '../lib/payPeriods.js';
import { payDateOf } from '../lib/payroll.js';
import { fmtGBP } from '../lib/format.js';
import { Ico } from './Icons.jsx';

// More › Config: "Taxable pay to date" and "Tax to date" copied from a real
// payslip, stored as settings.payslipYtd = { month, taxable, tax }. Without
// them the app assumes this year's pay every month since April, which is
// wrong for anyone who joined, was promoted or changed code part-way
// through. lib/payroll.js runPayYear takes that month's tax from these
// figures and carries on from them for the months after.
const num = t => { const n = parseFloat(String(t).replace(/[£,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; };

export function PayslipYtdEditor({ settings, saveSett, S, BRASS, MONO }) {
  const saved = settings.payslipYtd && PAY_PERIODS.some(p => p.month === settings.payslipYtd.month) ? settings.payslipYtd : null;
  // Payslips come out a few days before payday, so months paid in the next
  // fortnight are offered too.
  const soon = new Date(Date.now() + 14 * 864e5);
  const soonStr = localDateStr(soon);
  const months = PAY_PERIODS.filter(p => payDateOf(p) <= soonStr);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState('');
  const [taxable, setTaxable] = useState('');
  const [tax, setTax] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const start = () => {
    setMonth(saved ? saved.month : (months[months.length - 1]?.month || ''));
    setTaxable(saved ? String(saved.taxable) : '');
    setTax(saved ? String(saved.tax) : '');
    setOpen(true); setJustSaved(false);
  };
  const t1 = num(taxable), t2 = num(tax);
  const errors = [
    taxable.trim() && Number.isNaN(t1) && 'Taxable pay to date needs to be an amount, e.g. 31,250.00',
    tax.trim() && Number.isNaN(t2) && 'Tax to date needs to be an amount, e.g. 5,100.00',
    !Number.isNaN(t1) && !Number.isNaN(t2) && t2 > t1 && 'Tax to date can’t be more than taxable pay to date',
  ].filter(Boolean);
  const canSave = month && taxable.trim() && tax.trim() && !errors.length;
  const save = () => {
    if (!canSave) return;
    saveSett({ ...settings, payslipYtd: { month, taxable: t1, tax: t2 } });
    setOpen(false); setJustSaved(true);
  };
  const remove = () => { const { payslipYtd, ...rest } = settings; saveSett(rest); setJustSaved(false); };

  const lbl = { fontSize: '10px', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px' };
  const help = { fontSize: '11.5px', color: 'var(--quiet)', lineHeight: 1.45, fontWeight: 600, marginTop: '7px' };
  const short = m => PAY_PERIODS.find(p => p.month === m)?.month.split(' ')[0] || m;
  const field = (label, value, set) => (
    <label style={{ flex: '1 1 140px', minWidth: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', marginBottom: '5px' }}>{label}</div>
      <input inputMode="decimal" placeholder="£0.00" value={value} onChange={e => { set(e.target.value); setJustSaved(false); }}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
        style={{ ...S.inp, width: '100%', boxSizing: 'border-box', fontSize: '16px', fontWeight: 800, fontFamily: MONO }}/>
    </label>
  );

  return (
    <div style={{ borderTop: '1px solid var(--border-2)', marginTop: '14px', paddingTop: '14px' }}>
      <div style={lbl}>Pay and tax to date</div>
      <div style={{ ...help, marginTop: 0 }}>
        Copy <b>Taxable pay to date</b> and <b>Tax to date</b> from your latest payslip so the app's PAYE matches payroll. Worth doing if you joined, were promoted or changed tax code part-way through the year.
      </div>

      {!open && saved && (
        <div style={{ marginTop: '10px', background: 'var(--surface-2)', borderRadius: '11px', padding: '11px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)' }}>From your {short(saved.month)} payslip</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginTop: '5px', fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
            <span>Taxable pay <span style={{ fontFamily: MONO }}>{fmtGBP(saved.taxable)}</span></span>
            <span>Tax <span style={{ fontFamily: MONO }}>{fmtGBP(saved.tax)}</span></span>
          </div>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--muted)', marginTop: '4px' }}>{short(saved.month)} onwards is worked out from these.</div>
          <div style={{ display: 'flex', gap: '14px', marginTop: '8px' }}>
            <button type="button" onClick={start} style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 800, color: BRASS, cursor: 'pointer', fontFamily: 'inherit' }}>Update</button>
            <button type="button" onClick={remove} style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 800, color: 'var(--text-red-deep)', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
          </div>
        </div>
      )}
      {!open && !saved && (
        <button type="button" onClick={start} disabled={!months.length}
          style={{ marginTop: '10px', width: '100%', background: 'var(--surface-2)', color: months.length ? 'var(--ink)' : 'var(--quiet)', border: '1px dashed var(--border)', borderRadius: '11px', padding: '11px', fontWeight: 800, fontSize: '13px', cursor: months.length ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {months.length ? 'Add figures from a payslip' : 'No payslips yet this tax year'}
        </button>
      )}
      {open && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', marginBottom: '5px' }}>Payslip for</div>
            <select aria-label="Payslip month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...S.inp, width: 'auto', fontSize: '16px', padding: '9px 12px' }}>
              {months.map(p => <option key={p.month} value={p.month}>{p.month.split(' ')[0]} pay</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {field('Taxable pay to date', taxable, setTaxable)}
            {field('Tax to date', tax, setTax)}
          </div>
          {errors.length > 0 && <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-red-deep)', lineHeight: 1.45 }}>{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={() => setOpen(false)} style={{ flex: '0 0 auto', background: 'transparent', border: '1px solid var(--border)', borderRadius: '11px', padding: '11px 16px', fontFamily: 'inherit', fontWeight: 800, fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={save} disabled={!canSave} style={{ flex: 1, background: canSave ? BRASS : 'var(--chip-bg)', border: 'none', borderRadius: '11px', padding: '11px', fontFamily: 'inherit', fontWeight: 900, fontSize: '13.5px', color: canSave ? '#fff' : 'var(--quiet)', cursor: canSave ? 'pointer' : 'default' }}>Save figures</button>
          </div>
        </div>
      )}
      {justSaved && !open && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: 'var(--text-green-deep)', marginTop: '10px' }}><Ico n="check" s={14} c="var(--text-green-deep)"/>Saved. Your pay figures are updated.</div>
      )}
    </div>
  );
}
