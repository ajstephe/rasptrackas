import { useState } from 'react';
import { parseTaxCode, DEFAULT_TAX_CODE } from '../lib/tax.js';
import { PAY_PERIODS, localDateStr } from '../lib/payPeriods.js';
import { Ico } from './Icons.jsx';

// More › Config: the tax code on the payslip, and any changes to it during the
// year. Stored as settings.taxCode = { code, basis, changes:[{ id, from, code,
// basis }] }; lib/tax.js taxCodeOn works out the code for each pay month.
// A code is only saved once it reads as a real one, so half-typed codes never
// reach the pay figures.
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function CodeInput({ value, onValid, label, S, small }) {
  const [text, setText] = useState(value);
  const [touched, setTouched] = useState(false);
  const parsed = parseTaxCode(text);
  return (
    <div style={{ flex: small ? '0 0 92px' : '1 1 auto', minWidth: 0 }}>
      <input aria-label={label} value={text} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        onChange={e => { const t = e.target.value.toUpperCase().slice(0, 10); setText(t); const p = parseTaxCode(t); if (p.ok) onValid(p); }}
        onBlur={() => { setTouched(true); if (parsed.ok) setText(parsed.code); }}
        style={{ ...S.inp, width: '100%', fontWeight: 800, letterSpacing: '0.02em', ...(small ? { background: 'var(--surface)', padding: '8px 10px', fontSize: '16px' } : { fontSize: '16px' }), ...(touched && !parsed.ok ? { border: '1.5px solid #dc2626' } : null) }}/>
      {touched && !parsed.ok && <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-red-deep)', marginTop: '4px' }}>{parsed.error}</div>}
    </div>
  );
}

function Basis({ value, onChange, BRASS, small }) {
  const opt = (v, label) => (
    <button type="button" onClick={() => onChange(v)} aria-pressed={value === v}
      style={{ flex: 1, border: 'none', borderRadius: '8px', padding: small ? '7px 6px' : '9px 8px', fontFamily: 'inherit', fontWeight: 800, fontSize: small ? '11.5px' : '12.5px', cursor: 'pointer', whiteSpace: 'nowrap', background: value === v ? BRASS : 'transparent', color: value === v ? '#fff' : 'var(--quiet)' }}>{label}</button>
  );
  return (
    <div role="group" aria-label="Normal or emergency tax code" style={{ display: 'flex', gap: '3px', background: small ? 'var(--surface)' : 'var(--surface-2)', borderRadius: '11px', padding: '3px', flex: small ? '0 0 auto' : '1.3 1 0' }}>
      {opt('cumulative', 'Normal')}{opt('month1', 'Emergency')}
    </div>
  );
}

export function TaxCodeEditor({ settings, saveSett, S, BRASS }) {
  const tc = settings.taxCode || {};
  const code = tc.code || DEFAULT_TAX_CODE, basis = tc.basis || 'cumulative';
  const changes = Array.isArray(tc.changes) ? tc.changes : [];
  const save = patch => saveSett({ ...settings, taxCode: { code, basis, changes, ...patch } });
  const setChange = (id, patch) => save({ changes: changes.map(c => c.id === id ? { ...c, ...patch } : c) });
  const curIdx = PAY_PERIODS.findIndex(p => p.start <= localDateStr() && localDateStr() <= p.end);
  const lbl = { fontSize: '10px', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px' };
  const help = { fontSize: '11.5px', color: 'var(--quiet)', lineHeight: 1.45, fontWeight: 600, marginTop: '7px' };
  return (
    <div style={{ borderTop: '1px solid var(--border-2)', marginTop: '14px', paddingTop: '14px' }}>
      <div style={lbl}>Tax code</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <CodeInput key={code} value={code} label="Tax code" S={S} onValid={p => save({ code: p.code, ...(p.month1 ? { basis: 'month1' } : null) })}/>
        <Basis value={basis} onChange={v => save({ basis: v })} BRASS={BRASS}/>
      </div>
      <div style={help}>Copy it from your payslip, next to “Tax Code”. Most people are on <b>1257L</b>.</div>
      <div style={{ ...help, background: 'var(--surface-2)', borderRadius: '11px', padding: '9px 11px', marginTop: '9px' }}>
        <b style={{ color: 'var(--ink)' }}>Normal or Emergency?</b> Pick <b>Emergency</b> if your payslip shows <b>Non Cumul.</b>, <b>M1</b>, <b>W1</b> or <b>X</b> after the code. It's usually temporary, after starting a new job or a tax code change, and means each month is taxed on its own. Otherwise leave it on <b>Normal</b>.
      </div>

      {changes.length > 0 && <div style={{ ...lbl, marginTop: '14px', marginBottom: 0 }}>Changes during the year</div>}
      {changes.map(c => (
        <div key={c.id} style={{ background: 'var(--surface-2)', borderRadius: '12px', padding: '8px', marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)' }}>From</span>
          <select aria-label="Tax code change from pay month" value={c.from} onChange={e => setChange(c.id, { from: e.target.value })} style={{ ...S.inp, flex: '0 0 auto', width: 'auto', background: 'var(--surface)', padding: '8px 10px', fontSize: '16px' }}>
            {PAY_PERIODS.map(p => <option key={p.month} value={p.month}>{p.short.slice(0, 3)} pay</option>)}
          </select>
          <CodeInput key={c.id + c.code} value={c.code} label="New tax code" S={S} small onValid={p => setChange(c.id, { code: p.code, ...(p.month1 ? { basis: 'month1' } : null) })}/>
          <Basis value={c.basis || 'cumulative'} onChange={v => setChange(c.id, { basis: v })} BRASS={BRASS} small/>
          <button type="button" aria-label="Remove tax code change" onClick={() => save({ changes: changes.filter(x => x.id !== c.id) })} style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', display: 'flex', marginLeft: 'auto' }}><Ico n="x" s={15} c="var(--quiet)"/></button>
        </div>
      ))}
      <button type="button" onClick={() => save({ changes: [...changes, { id: newId(), from: PAY_PERIODS[Math.min(11, Math.max(0, curIdx))].month, code, basis: 'cumulative' }] })}
        style={{ background: 'none', border: 'none', padding: '10px 0 0', fontSize: '12.5px', fontWeight: 800, color: BRASS, cursor: 'pointer', fontFamily: 'inherit' }}>+ Change the tax code from a month</button>
      <div style={help}>Works with L, M, N and T codes, K codes, BR, D0, D1, 0T and NT. Scottish (S) codes aren't supported yet.</div>
    </div>
  );
}
