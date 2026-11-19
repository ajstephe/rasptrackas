import { useState, useEffect } from 'react';
import { parseTaxCode, DEFAULT_TAX_CODE } from '../lib/tax.js';
import { PAY_PERIODS, localDateStr } from '../lib/payPeriods.js';
import { Ico } from './Icons.jsx';

// More › Config: the tax code on the payslip, and any changes to it during the
// year. Stored as settings.taxCode = { code, basis, changes:[{ id, from, code,
// basis }] }; lib/tax.js taxCodeOn works out the code for each pay month.
// Edits go into a draft and only reach the pay figures when Save is pressed,
// so nothing moves while a code is being typed.
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fromSettings = s => {
  const tc = s.taxCode || {};
  return {
    code: tc.code || DEFAULT_TAX_CODE,
    basis: tc.basis || 'cumulative',
    changes: (Array.isArray(tc.changes) ? tc.changes : []).map(c => ({ ...c, basis: c.basis || 'cumulative' })),
  };
};

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
  const saved = fromSettings(settings);
  const savedJSON = JSON.stringify(saved);
  const [draft, setDraft] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);
  // Saved settings changing elsewhere (another device) refresh the draft
  // unless something is being edited here.
  const [base, setBase] = useState(savedJSON);
  useEffect(() => {
    if (savedJSON !== base) { if (JSON.stringify(draft) === base) setDraft(JSON.parse(savedJSON)); setBase(savedJSON); }
  }, [savedJSON]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== savedJSON;
  const set = patch => { setDraft(d => ({ ...d, ...patch })); setJustSaved(false); };
  const setChange = (id, patch) => set({ changes: draft.changes.map(c => c.id === id ? { ...c, ...patch } : c) });
  // Typing "1257L M1" (or W1 / X) switches that code to Emergency.
  const typed = (text, apply) => { const t = text.toUpperCase().slice(0, 10); const p = parseTaxCode(t); apply(p.ok && p.month1 ? { code: t, basis: 'month1' } : { code: t }); };

  const mainOk = parseTaxCode(draft.code);
  const errors = [!mainOk.ok && mainOk.error, ...draft.changes.map(c => { const p = parseTaxCode(c.code); return p.ok ? null : `${PAY_PERIODS.find(x => x.month === c.from)?.short.slice(0, 3) || ''} pay: ${p.error}`; })].filter(Boolean);
  const canSave = dirty && errors.length === 0;
  const save = () => {
    if (!canSave) return;
    const clean = c => parseTaxCode(c).code;
    saveSett({ ...settings, taxCode: { code: clean(draft.code), basis: draft.basis, changes: draft.changes.map(c => ({ id: c.id, from: c.from, code: clean(c.code), basis: c.basis })) } });
    setDraft(d => ({ ...d, code: clean(d.code), changes: d.changes.map(c => ({ ...c, code: clean(c.code) })) }));
    setJustSaved(true);
  };

  const curIdx = PAY_PERIODS.findIndex(p => p.start <= localDateStr() && localDateStr() <= p.end);
  const lbl = { fontSize: '10px', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '7px' };
  const help = { fontSize: '11.5px', color: 'var(--quiet)', lineHeight: 1.45, fontWeight: 600, marginTop: '7px' };
  const codeInput = (value, onChange, label, small) => {
    const bad = value.trim() && !parseTaxCode(value).ok;
    return (
      <input aria-label={label} value={value} autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text"
        onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }}
        style={{ ...S.inp, ...(small ? { flex: '0 0 96px', background: 'var(--surface)', padding: '8px 10px' } : { flex: '1 1 auto', minWidth: 0 }), fontSize: '16px', fontWeight: 800, letterSpacing: '0.02em', ...(bad ? { boxShadow: 'inset 0 0 0 1.5px #dc2626' } : null) }}/>
    );
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-2)', marginTop: '14px', paddingTop: '14px' }}>
      <div style={lbl}>Tax code</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {codeInput(draft.code, t => typed(t, set), 'Tax code')}
        <Basis value={draft.basis} onChange={v => set({ basis: v })} BRASS={BRASS}/>
      </div>
      <div style={help}>Copy it from your payslip, next to “Tax Code”. Most people are on <b>1257L</b>.</div>
      <div style={{ ...help, background: 'var(--surface-2)', borderRadius: '11px', padding: '9px 11px', marginTop: '9px' }}>
        <b style={{ color: 'var(--ink)' }}>Normal or Emergency?</b> Pick <b>Emergency</b> if your payslip shows <b>Non Cumul.</b>, <b>M1</b>, <b>W1</b> or <b>X</b> after the code. It's usually temporary, after starting a new job or a tax code change, and means each month is taxed on its own. Otherwise leave it on <b>Normal</b>.
      </div>

      {draft.changes.length > 0 && <div style={{ ...lbl, marginTop: '14px', marginBottom: 0 }}>Changes during the year</div>}
      {draft.changes.map(c => (
        <div key={c.id} style={{ background: 'var(--surface-2)', borderRadius: '12px', padding: '8px', marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)' }}>From</span>
          <select aria-label="Tax code change from pay month" value={c.from} onChange={e => setChange(c.id, { from: e.target.value })} style={{ ...S.inp, flex: '0 0 auto', width: 'auto', background: 'var(--surface)', padding: '8px 10px', fontSize: '16px' }}>
            {PAY_PERIODS.map(p => <option key={p.month} value={p.month}>{p.short.slice(0, 3)} pay</option>)}
          </select>
          {codeInput(c.code, t => typed(t, patch => setChange(c.id, patch)), 'New tax code', true)}
          <Basis value={c.basis} onChange={v => setChange(c.id, { basis: v })} BRASS={BRASS} small/>
          <button type="button" aria-label="Remove tax code change" onClick={() => set({ changes: draft.changes.filter(x => x.id !== c.id) })} style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', display: 'flex', marginLeft: 'auto' }}><Ico n="x" s={15} c="var(--quiet)"/></button>
        </div>
      ))}
      <button type="button" onClick={() => set({ changes: [...draft.changes, { id: newId(), from: PAY_PERIODS[Math.min(11, Math.max(0, curIdx))].month, code: '', basis: 'cumulative' }] })}
        style={{ background: 'none', border: 'none', padding: '10px 0 0', fontSize: '12.5px', fontWeight: 800, color: BRASS, cursor: 'pointer', fontFamily: 'inherit' }}>+ Change the tax code from a month</button>

      {errors.length > 0 && dirty && <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-red-deep)', marginTop: '10px', lineHeight: 1.45 }}>{errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
        {dirty ? (
          <>
            <button type="button" onClick={() => { setDraft(JSON.parse(savedJSON)); setJustSaved(false); }} style={{ flex: '0 0 auto', background: 'transparent', border: '1px solid var(--border)', borderRadius: '11px', padding: '11px 16px', fontFamily: 'inherit', fontWeight: 800, fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={save} disabled={!canSave} style={{ flex: 1, background: canSave ? BRASS : 'var(--chip-bg)', border: 'none', borderRadius: '11px', padding: '11px', fontFamily: 'inherit', fontWeight: 900, fontSize: '13.5px', color: canSave ? '#fff' : 'var(--quiet)', cursor: canSave ? 'pointer' : 'default' }}>Save tax code</button>
          </>
        ) : justSaved ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: 'var(--text-green-deep)' }}><Ico n="check" s={14} c="var(--text-green-deep)"/>Saved. Your pay figures are updated.</span>
        ) : null}
      </div>
      <div style={help}>Works with L, M, N and T codes, K codes, BR, D0, D1, 0T and NT. Scottish (S) codes aren't supported yet.</div>
    </div>
  );
}
