import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildStatement, tables, statementPdf, money, minus, fmtLong } from '../lib/statement.js';

// On-screen preview of the pay statement (Export › PDF), drawn at A4 width
// and scaled to fit the screen, with a button that makes the real A4 PDF
// file (lib/statement.js) — the same document on a phone or a computer.
//
// It never takes the app theme: fixed light colours and its own font, and
// nothing in it uses var(--num-font) or other theme variables (the themes
// restyle anything that does, e.g. Insert Coin's pixel figures).
const BODY = "'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
const INK = '#0f172a', MUTED = '#475569', FAINT = '#64748b', RULE = '#cbd5e1', HAIR = '#e2e8f0', BAND = '#f1f5f9';
const NUMS = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const PAGE_W = 794;   // A4 width at 96 dpi

const H = ({ children, sub }) => (
  <div style={{ margin: '26px 0 8px' }}>
    <div style={{ fontSize: '14px', fontWeight: 800, color: INK }}>{children}</div>
    {sub && <div style={{ fontSize: '10.5px', color: FAINT, marginTop: '2px', lineHeight: 1.45 }}>{sub}</div>}
  </div>
);

const MonthTable = ({ tb }) => {
  const th = { fontSize: '9.5px', fontWeight: 700, color: MUTED, textAlign: 'right', padding: '6px 5px', borderBottom: `1.5px solid ${INK}`, verticalAlign: 'bottom' };
  const td = { fontSize: '11px', color: INK, textAlign: 'right', padding: '5px 5px', borderBottom: `1px solid ${HAIR}`, ...NUMS };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><th style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>Pay month</th>{tb.cols.map(c => <th key={c.key} style={th}>{c.label}</th>)}</tr></thead>
      <tbody>
        {tb.rows.map(r => (
          <tr key={r.month}>
            <td style={{ ...td, textAlign: 'left', paddingLeft: 0, fontWeight: 600, color: r.paid ? INK : FAINT }}>
              {r.month}{!r.paid && <span style={{ fontSize: '8px', fontWeight: 700, marginLeft: '5px', letterSpacing: '0.3px' }}>FORECAST</span>}
            </td>
            {tb.cols.map(c => <td key={c.key} style={{ ...td, color: r.paid ? INK : FAINT, fontWeight: c.strong ? 700 : 400, fontStyle: r.paid ? 'normal' : 'italic' }}>{(c.fmt || money)(r[c.key], r)}</td>)}
          </tr>
        ))}
      </tbody>
      <tfoot>
        {tb.foot.map((f, k) => (
          <tr key={f.label} style={{ background: f.band ? BAND : 'transparent' }}>
            <td style={{ ...td, textAlign: 'left', paddingLeft: '3px', fontWeight: 800, borderBottom: 'none', borderTop: k === 0 ? `1.5px solid ${INK}` : 'none' }}>{f.label}</td>
            {tb.cols.map(c => <td key={c.key} style={{ ...td, fontWeight: 800, borderBottom: 'none', borderTop: k === 0 ? `1.5px solid ${INK}` : 'none' }}>{(c.fmt || money)(f.t[c.key], f.t)}</td>)}
          </tr>
        ))}
      </tfoot>
    </table>
  );
};

const Ledger = ({ title, cols, rows }) => (
  <div style={{ border: `1px solid ${RULE}` }}>
    <div style={{ display: 'grid', gridTemplateColumns: `1fr ${cols.map(() => '96px').join(' ')}`, background: BAND, padding: '6px 9px', fontSize: '9.5px', fontWeight: 800, color: MUTED, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
      <span>{title}</span>{cols.map(c => <span key={c} style={{ textAlign: 'right' }}>{c}</span>)}
    </div>
    {rows.map(r => (
      <div key={r.label} style={{ display: 'grid', gridTemplateColumns: `1fr ${cols.map(() => '96px').join(' ')}`, padding: '5px 9px', borderTop: r.total ? `1.5px solid ${INK}` : `1px solid ${HAIR}`, fontSize: '11.5px', fontWeight: r.total ? 800 : 400 }}>
        <span>{r.label}{r.note && <span style={{ color: FAINT, fontSize: '9.5px', fontWeight: 400 }}> · {r.note}</span>}</span>
        {r.v.map((v, i) => <span key={i} style={{ textAlign: 'right', ...NUMS }}>{r.minus ? minus(v) : money(v)}</span>)}
      </div>
    ))}
  </div>
);

// Hands the PDF over: the share sheet on a phone (Save to Files, Mail, ...),
// a normal download elsewhere.
const deliver = async (blob, name) => {
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export default function AnnualStatement({ months, settings, calcEntry, todayStr, yearLabel, rangeLabel, onClose, addToast }) {
  const s = useMemo(() => buildStatement({ months, settings, calcEntry, todayStr, yearLabel, rangeLabel }), [months, settings, calcEntry, todayStr, yearLabel, rangeLabel]);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 24) / PAGE_W));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const save = async () => {
    setBusy(true);
    try { await deliver(statementPdf(s), s.fileName); }
    catch { addToast?.('Could not make the PDF. Try again.', 'warn'); }
    finally { setBusy(false); }
  };

  const p = { margin: 0, fontSize: '11px', color: MUTED, lineHeight: 1.55 };
  return createPortal(
    <div className="payslip-print-area print-root" style={{ position: 'fixed', inset: 0, background: '#cbd5e1', zIndex: 70, overflowY: 'auto', overscrollBehavior: 'contain', padding: '12px', paddingTop: 'calc(12px + env(safe-area-inset-top))', fontFamily: BODY }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', gap: '8px', maxWidth: `${PAGE_W * scale}px`, margin: '0 auto 12px' }}>
        <button onClick={save} disabled={busy} style={{ flex: 1, background: '#0f2744', color: '#fff', border: 'none', borderRadius: '11px', padding: '12px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: BODY, opacity: busy ? 0.6 : 1, boxShadow: '0 4px 14px rgba(15,39,68,0.3)' }}>{busy ? 'Making PDF…' : 'Save A4 PDF'}</button>
        <button onClick={onClose} style={{ background: '#fff', color: MUTED, border: `1px solid ${RULE}`, borderRadius: '11px', padding: '12px 18px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', fontFamily: BODY }}>Close</button>
      </div>

      <div style={{ width: `${PAGE_W * scale}px`, margin: '0 auto' }}>
        <div className="payslip-print-doc acct-statement" style={{ width: `${PAGE_W}px`, zoom: scale, background: '#fff', color: INK, fontFamily: BODY, boxShadow: '0 4px 24px rgba(0,0,0,0.15)', padding: '53px', boxSizing: 'border-box', letterSpacing: 'normal', textShadow: 'none', minHeight: '1123px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', borderBottom: `2px solid ${INK}`, paddingBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: FAINT, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{s.kicker}</div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '3px', letterSpacing: '-0.4px' }}>{s.title}</div>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px' }}>{s.rangeLabel}</div>
            </div>
            <div style={{ fontSize: '10.5px', color: MUTED, lineHeight: 1.6, textAlign: 'right', flexShrink: 0 }}>
              <div><strong style={{ color: INK }}>{s.rank}</strong>, pay point {s.service}</div>
              <div>Tax code 1257L (assumed), cumulative</div>
              <div>Prepared {fmtLong(s.todayStr)}</div>
            </div>
          </div>
          {s.forecastNote && <div style={{ marginTop: '12px', fontSize: '10.5px', color: MUTED, lineHeight: 1.5, background: BAND, padding: '8px 10px' }}>{s.forecastNote}</div>}

          <div style={{ fontSize: '9.5px', fontWeight: 700, color: FAINT, letterSpacing: '0.6px', textTransform: 'uppercase', margin: '18px 0 6px' }}>Overview · {s.overviewLabel}</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.overview.length},1fr)`, border: `1px solid ${RULE}` }}>
            {s.overview.map(([k, v], i) => (
              <div key={k} style={{ padding: '8px 10px', borderLeft: i ? `1px solid ${HAIR}` : 'none' }}>
                <div style={{ fontSize: '10px', color: MUTED }}>{k}</div>
                <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '2px', color: i === s.overview.length - 1 ? '#047857' : INK, ...NUMS }}>{v}</div>
              </div>
            ))}
          </div>

          {tables(s).map(tb => (
            <div key={tb.title}><H sub={tb.sub}>{tb.title}</H><MonthTable tb={tb}/></div>
          ))}

          {s.dedList.length > 0 && (
            <>
              <H sub="Set up in the app under More › Monthly deductions, totalled over the months above.">Other deductions</H>
              <Ledger title="Deduction" cols={['Total']} rows={[
                ...s.dedList.map(d => ({ label: d.name, note: d.when === 'before' ? 'salary sacrifice, before tax & NI' : 'after tax', v: [d.total] })),
                { label: 'Total', v: [s.dedList.reduce((a, d) => a + d.total, 0)], total: true },
              ]}/>
            </>
          )}

          <H sub={s.split ? 'Paid to date and the full year, forecast months included.' : null}>Totals</H>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start' }}>
            <Ledger title="Earnings" cols={s.cols} rows={s.earnings}/>
            <Ledger title="Deductions" cols={s.cols} rows={s.deductions}/>
          </div>

          <H>Notes for a tax return</H>
          <div style={{ display: 'grid', gap: '8px' }}>
            {s.notes.map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px' }}>
                <strong style={{ fontSize: '11.5px' }}>{k}</strong><p style={p}>{v}</p>
              </div>
            ))}
          </div>

          <p style={{ ...p, fontSize: '9.5px', color: FAINT, marginTop: '24px', paddingTop: '12px', borderTop: `1px solid ${RULE}` }}>
            Prepared from the records kept in Overtime &amp; Shift Tracker. Not an official payslip or P60. Tax is worked out as payroll does, on tax code 1257L, cumulatively month by month, at England, Wales and NI rates; NI is on each month's pay. A different tax code, benefits in kind, other income or a missed claim will change the figures, so the payslips and P60 are the final word.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
