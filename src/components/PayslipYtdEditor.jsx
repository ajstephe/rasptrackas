import { useState } from 'react';
import { PAY_PERIODS, localDateStr } from '../lib/payPeriods.js';
import { payDateOf } from '../lib/payroll.js';
import { fmtGBP } from '../lib/format.js';
import { Ico } from './Icons.jsx';

// More › Config: the This Emp lines of the "Year to Date Totals" box on a
// real payslip, stored as settings.payslipYtd = { month, taxable, tax }.
// For someone who moved forces this tax year the Prev Emp lines are the
// P45 entered under "I moved forces this tax year" (lib/forceMove.js), so
// they aren't typed here. lib/payroll.js runPayYear takes that month's tax
// from these figures and carries on from them for the months after.
// Without them the app assumes this year's pay every month since April,
// which is wrong for anyone who joined, was promoted or changed tax code
// part-way through.
const num = t => { if (!String(t).trim()) return 0; const n = parseFloat(String(t).replace(/[£,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; };
const KEYS = [
  ['taxable', 'Taxable Pay This Emp'],
  ['tax', 'Tax Paid This Emp'],
];

export function PayslipYtdEditor({ settings, saveSett, S, BRASS, MONO }) {
  const saved = settings.payslipYtd && PAY_PERIODS.some(p => p.month === settings.payslipYtd.month) ? settings.payslipYtd : null;
  // Payslips come out a few days before payday, so months paid in the next
  // fortnight are offered too.
  const soonStr = localDateStr(new Date(Date.now() + 14 * 864e5));
  const months = PAY_PERIODS.filter(p => payDateOf(p) <= soonStr);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState('');
  const [vals, setVals] = useState({});
  const [justSaved, setJustSaved] = useState(false);

  const start = () => {
    setMonth(saved ? saved.month : (months[months.length - 1]?.month || ''));
    setVals(saved ? { taxable: String(saved.taxable), tax: String(saved.tax) } : {});
    setOpen(true); setJustSaved(false);
  };
  const v = Object.fromEntries(KEYS.map(([k]) => [k, num(vals[k] || '')]));
  const errors = KEYS.filter(([k]) => Number.isNaN(v[k])).map(([, l]) => `${l} needs to be an amount, e.g. 10,369.49`);
  const missing = KEYS.some(([k]) => !String(vals[k] || '').trim());
  if (!errors.length && v.tax > v.taxable) errors.push('Tax paid can’t be more than taxable pay');
  const canSave = month && !missing && !errors.length;
  const save = () => {
    if (!canSave) return;
    saveSett({ ...settings, payslipYtd: { month, taxable: v.taxable, tax: v.tax } });
    setOpen(false); setJustSaved(true);
  };
  const remove = () => { const { payslipYtd, ...rest } = settings; saveSett(rest); setJustSaved(false); };

  const lbl = { fontSize: '10px', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px' };
  const help = { fontSize: '11.5px', color: 'var(--quiet)', lineHeight: 1.45, fontWeight: 600, marginTop: '7px' };
  const short = m => m ? m.split(' ')[0] : '';
  const moved = !!(settings.forceMove && settings.forceMove.on);
  const field = ([k, label]) => (
    <label key={k} style={{ flex: '1 1 150px', minWidth: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', marginBottom: '5px' }}>{label}</div>
      <input inputMode="decimal" aria-label={label} placeholder="£0.00" value={vals[k] || ''} onChange={e => { const t = e.target.value; setVals(x => ({ ...x, [k]: t })); setJustSaved(false); }}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
        style={{ ...S.inp, width: '100%', boxSizing: 'border-box', fontSize: '16px', fontWeight: 800, fontFamily: MONO }}/>
    </label>
  );
  const row = (label, a, b) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12.5px', fontWeight: 700, color: 'var(--muted)', padding: '2px 0' }}>
      <span>{label}</span><span style={{ fontFamily: MONO, color: 'var(--ink)', fontWeight: 800 }}>{fmtGBP(a)}{b ? <span style={{ color: 'var(--quiet)', fontWeight: 600 }}> + {fmtGBP(b)} P45</span> : null}</span>
    </div>
  );

  return (
    <div style={{ borderTop: '1px solid var(--border-2)', marginTop: '14px', paddingTop: '14px' }}>
      <div style={lbl}>Year to date totals</div>
      <div style={{ ...help, marginTop: 0 }}>
        Copy the <b>Year to Date Totals</b> box from your latest payslip so the app's PAYE matches payroll. Worth doing if you joined, were promoted or changed tax code part-way through the year.
      </div>

      {!open && saved && (
        <div style={{ marginTop: '10px', background: 'var(--surface-2)', borderRadius: '11px', padding: '11px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', marginBottom: '4px' }}>From your {short(saved.month)} payslip</div>
          {row('Taxable Pay This Emp', saved.taxable, moved ? settings.forceMove.pay : 0)}
          {row('Tax Paid This Emp', saved.tax, moved ? settings.forceMove.tax : 0)}
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
              {months.map(p => <option key={p.month} value={p.month}>{short(p.month)} pay</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>{KEYS.map(field)}</div>
          {moved && <div style={{ ...help, marginTop: 0, background: 'var(--surface-2)', borderRadius: '11px', padding: '9px 11px' }}>Prev Emp lines: taken from your <b>P45</b> above, so there's nothing more to type.</div>}
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
