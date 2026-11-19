import { useState } from 'react';
import { fmtGBP } from '../lib/format.js';
import { getUKTaxYearStart, localDateStr } from '../lib/payPeriods.js';
import { Ico } from './Icons.jsx';

// More › Config › "I moved forces this tax year": off for almost everyone.
// Switched on, it takes three boxes copied from the P45 (Leaving date, Total
// pay to date, Total tax to date) and saves settings.forceMove; see
// lib/forceMove.js for what the pay figures do with them. Switching it off
// removes them.
const num = t => { const n = parseFloat(String(t).replace(/[£,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN; };
const fmtDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function ForceMoveEditor({ settings, saveSett, S, BRASS, MONO }) {
  // A P45 only counts in the tax year of its leaving date: from the next
  // 6 April the switch shows as off, ready for anyone who moves again.
  const thisTaxYear = getUKTaxYearStart(localDateStr());
  const saved = settings.forceMove && settings.forceMove.on && settings.forceMove.leaving && getUKTaxYearStart(settings.forceMove.leaving) === thisTaxYear ? settings.forceMove : null;
  const [open, setOpen] = useState(false);       // the switch on, nothing saved yet (or editing)
  const [leaving, setLeaving] = useState('');
  const [pay, setPay] = useState('');
  const [tax, setTax] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const on = !!saved || open;

  const startEdit = () => { setLeaving(saved ? saved.leaving : ''); setPay(saved ? String(saved.pay) : ''); setTax(saved ? String(saved.tax) : ''); setOpen(true); setJustSaved(false); };
  const toggle = () => {
    if (on) { if (saved) { const { forceMove, ...rest } = settings; saveSett(rest); } setOpen(false); setJustSaved(false); }
    else startEdit();
  };
  const p = num(pay), t = num(tax);
  const leavingOk = !leaving || getUKTaxYearStart(leaving) === thisTaxYear;
  const errors = [
    !leavingOk && 'The leaving date needs to be in this tax year (from 6 April)',
    pay.trim() && Number.isNaN(p) && 'Total pay to date needs to be an amount, e.g. 27,500.00',
    tax.trim() && Number.isNaN(t) && 'Total tax to date needs to be an amount, e.g. 4,800.00',
    !Number.isNaN(p) && !Number.isNaN(t) && pay.trim() && tax.trim() && t > p && 'Total tax to date can’t be more than total pay to date',
  ].filter(Boolean);
  const canSave = /^\d{4}-\d{2}-\d{2}$/.test(leaving) && pay.trim() && tax.trim() && !errors.length;
  const save = () => {
    if (!canSave) return;
    const { p45Later, ...rest } = settings;   // the setup reminder is done with
    saveSett({ ...rest, forceMove: { on: true, leaving, pay: p, tax: t } });
    setOpen(false); setJustSaved(true);
  };

  const help = { fontSize: '11.5px', color: 'var(--quiet)', lineHeight: 1.45, fontWeight: 600 };
  const fl = { fontSize: '11px', fontWeight: 800, color: 'var(--muted)', marginBottom: '5px' };
  const inp = { ...S.inp, width: '100%', boxSizing: 'border-box', fontSize: '16px', fontWeight: 800 };

  return (
    <div style={{ borderTop: '1px solid var(--border-2)', marginTop: '14px', paddingTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--ink)' }}>I moved forces this tax year</div>
          <div style={{ ...help, marginTop: '3px' }}>Only if you joined from another force since 6 April</div>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label="I moved forces this tax year" onClick={toggle}
          style={{ flex: '0 0 auto', width: '46px', height: '28px', borderRadius: '14px', border: 'none', padding: 0, cursor: 'pointer', position: 'relative', background: on ? BRASS : 'var(--chip-bg)', transition: 'background 0.2s' }}>
          <span style={{ position: 'absolute', top: '3px', left: on ? '21px' : '3px', width: '22px', height: '22px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}/>
        </button>
      </div>

      {saved && !open && (
        <div style={{ marginTop: '10px', background: 'var(--surface-2)', borderRadius: '11px', padding: '11px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)' }}>From your P45 · left {fmtDate(saved.leaving)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginTop: '5px', fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>
            <span>Pay <span style={{ fontFamily: MONO }}>{fmtGBP(saved.pay)}</span></span>
            <span>Tax <span style={{ fontFamily: MONO }}>{fmtGBP(saved.tax)}</span></span>
          </div>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--muted)', marginTop: '4px' }}>Pay months up to then show as your previous force's.</div>
          <button type="button" onClick={startEdit} style={{ background: 'none', border: 'none', padding: 0, marginTop: '8px', fontSize: '12px', fontWeight: 800, color: BRASS, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
        </div>
      )}

      {open && (
        <div style={{ borderTop: '1px solid var(--border-2)', marginTop: '12px', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={help}>Copy these three boxes from the P45 your old force gave you.</div>
          <label><div style={fl}>Leaving date</div>
            <input type="date" aria-label="Leaving date" value={leaving} onChange={e => setLeaving(e.target.value)} style={inp}/></label>
          <label><div style={fl}>Total pay to date</div>
            <input inputMode="decimal" aria-label="Total pay to date" placeholder="£0.00" value={pay} onChange={e => setPay(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} style={{ ...inp, fontFamily: MONO }}/></label>
          <label><div style={fl}>Total tax to date</div>
            <input inputMode="decimal" aria-label="Total tax to date" placeholder="£0.00" value={tax} onChange={e => setTax(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} style={{ ...inp, fontFamily: MONO }}/></label>
          {errors.length > 0 && <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-red-deep)', lineHeight: 1.45 }}>{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={() => setOpen(false)} style={{ flex: '0 0 auto', background: 'transparent', border: '1px solid var(--border)', borderRadius: '11px', padding: '11px 16px', fontFamily: 'inherit', fontWeight: 800, fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={save} disabled={!canSave} style={{ flex: 1, background: canSave ? BRASS : 'var(--chip-bg)', border: 'none', borderRadius: '11px', padding: '11px', fontFamily: 'inherit', fontWeight: 900, fontSize: '13.5px', color: canSave ? '#fff' : 'var(--quiet)', cursor: canSave ? 'pointer' : 'default' }}>Save P45</button>
          </div>
        </div>
      )}
      {justSaved && !open && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: 'var(--text-green-deep)', marginTop: '10px' }}><Ico n="check" s={14} c="var(--text-green-deep)"/>Saved. Your pay figures are updated.</div>
      )}
    </div>
  );
}
