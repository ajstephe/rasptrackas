import { createPortal } from 'react-dom';
import { deductionFor, deductionsFor } from '../lib/deductions.js';
import { taperExtra } from '../lib/tax.js';
import { fmtGBP, fmtHrs, payLabel } from '../lib/format.js';

// The pay statement behind Export › PDF: every pay month of a tax year (or a
// single pay month) with salary, allowances, overtime and PA, what came off,
// and what reached the bank, laid out for an accountant to check against the
// payslips and P60.
//
// It prints on paper, so it never takes the app theme: fixed light colours
// and its own fonts, and nothing in it uses var(--num-font) or other theme
// variables (the themes restyle anything that does, e.g. Insert Coin's pixel
// figures).
const BODY = "'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
const INK = '#0f172a', MUTED = '#475569', FAINT = '#64748b', RULE = '#cbd5e1', HAIR = '#e2e8f0', BAND = '#f1f5f9';
const NUMS = { fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' };

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const sum = (list, f) => r2(list.reduce((s, x) => s + (f(x) || 0), 0));
const money = n => (Math.abs(n) < 0.005 ? '–' : fmtGBP(n));
const short = month => String(month || '').split(' ')[0].slice(0, 3);
const fmtLong = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// One row of figures per pay month.
const monthRow = (pb, settings, calcEntry, todayStr) => {
  const hrs = { h133: 0, h150: 0, h200: 0 }, paCount = { PA1: 0, PA2: 0, PA3: 0 };
  for (const part of pb.parts || []) {
    if (part.kind === 'ot') {
      const c = calcEntry(part.entry);
      hrs.h133 += c.payH1; hrs.h150 += c.payH2; hrs.h200 += c.payH3;
    } else {
      const k = part.entry.paRate; paCount[k] = (paCount[k] || 0) + 1;
    }
  }
  const after = deductionsFor(settings, pb.month).after;
  const sacrifice = pb.sacrifice || 0;
  return {
    month: pb.month, payDate: pb.payDate, paid: pb.payDate <= todayStr,
    salary: pb.salary, lw: pb.lw, la: pb.la, ot: pb.ot, imported: pb.imported || 0, pa: pb.pa,
    otHrs: hrs.h133 + hrs.h150 + hrs.h200, hrs, paCount,
    gross: pb.monthGross, pension: pb.periodPension, sacrifice,
    taxable: r2(pb.monthGross - pb.periodPension - sacrifice),
    tax: pb.monthTax, ni: pb.monthNI, other: after,
    net: r2(pb.monthNet - after),
  };
};

const totalsOf = rows => ({
  salary: sum(rows, x => x.salary), lw: sum(rows, x => x.lw), la: sum(rows, x => x.la),
  ot: sum(rows, x => x.ot), pa: sum(rows, x => x.pa), otHrs: rows.reduce((s, x) => s + x.otHrs, 0),
  gross: sum(rows, x => x.gross), pension: sum(rows, x => x.pension), sacrifice: sum(rows, x => x.sacrifice),
  taxable: sum(rows, x => x.taxable), tax: sum(rows, x => x.tax), ni: sum(rows, x => x.ni),
  other: sum(rows, x => x.other), net: sum(rows, x => x.net),
});

const H = ({ children, sub, newPage }) => (
  <div style={{ margin: '26px 0 8px', breakAfter: 'avoid', breakBefore: newPage ? 'page' : 'auto' }}>
    <div style={{ fontSize: '13px', fontWeight: 800, color: INK, letterSpacing: '-0.1px' }}>{children}</div>
    {sub && <div style={{ fontSize: '10.5px', color: FAINT, marginTop: '2px', lineHeight: 1.45 }}>{sub}</div>}
  </div>
);

// A table of months with a totals footer. cols: [{ key, label, fmt?, strong? }]
const MonthTable = ({ rows, cols, foot }) => {
  const th = { fontSize: '9.5px', fontWeight: 700, color: MUTED, textAlign: 'right', padding: '6px 6px', borderBottom: `1.5px solid ${INK}`, lineHeight: 1.25, verticalAlign: 'bottom' };
  const td = { fontSize: '11px', color: INK, textAlign: 'right', padding: '5px 6px', borderBottom: `1px solid ${HAIR}`, ...NUMS };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', breakInside: 'auto' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>Pay month</th>
            {cols.map(c => <th key={c.key} style={th}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.month} style={{ breakInside: 'avoid', color: r.paid ? INK : FAINT }}>
              <td style={{ ...td, textAlign: 'left', paddingLeft: 0, color: 'inherit', fontWeight: 600 }}>
                {payLabel(r.month).replace(' pay', '')} {r.month.split(' ')[1]}
                {!r.paid && <span style={{ fontSize: '8.5px', fontWeight: 700, color: FAINT, marginLeft: '5px', letterSpacing: '0.3px' }}>FORECAST</span>}
              </td>
              {cols.map(c => (
                <td key={c.key} style={{ ...td, color: r.paid ? (c.strong ? INK : INK) : FAINT, fontWeight: c.strong ? 700 : 400, fontStyle: r.paid ? 'normal' : 'italic' }}>
                  {(c.fmt || money)(r[c.key], r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {foot.map(f => (
            <tr key={f.label} style={{ breakInside: 'avoid' }}>
              <td style={{ ...td, textAlign: 'left', paddingLeft: 0, fontWeight: 800, borderBottom: 'none', borderTop: f.first ? `1.5px solid ${INK}` : 'none', background: f.band ? BAND : 'transparent' }}>{f.label}</td>
              {cols.map(c => (
                <td key={c.key} style={{ ...td, fontWeight: 800, borderBottom: 'none', borderTop: f.first ? `1.5px solid ${INK}` : 'none', background: f.band ? BAND : 'transparent' }}>
                  {(c.fmt || money)(f.t[c.key], f.t)}
                </td>
              ))}
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
};

// A label/value list, P60-style.
const Ledger = ({ title, rows, cols }) => (
  <div style={{ border: `1px solid ${RULE}`, borderRadius: '4px', overflow: 'hidden', breakInside: 'avoid' }}>
    <div style={{ display: 'grid', gridTemplateColumns: `1fr ${cols.map(() => 'minmax(84px,auto)').join(' ')}`, background: BAND, borderBottom: `1px solid ${RULE}`, padding: '7px 10px', fontSize: '10px', fontWeight: 800, color: MUTED, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
      <span>{title}</span>{cols.map(c => <span key={c} style={{ textAlign: 'right' }}>{c}</span>)}
    </div>
    {rows.filter(Boolean).map(r => (
      <div key={r.label} style={{ display: 'grid', gridTemplateColumns: `1fr ${cols.map(() => 'minmax(84px,auto)').join(' ')}`, padding: '6px 10px', borderTop: r.total ? `1.5px solid ${INK}` : `1px solid ${HAIR}`, fontSize: '11.5px', color: INK, fontWeight: r.total ? 800 : 400 }}>
        <span>{r.label}{r.note && <span style={{ color: FAINT, fontSize: '10px', fontWeight: 400 }}> · {r.note}</span>}</span>
        {r.v.map((v, i) => <span key={i} style={{ textAlign: 'right', ...NUMS }}>{typeof v === 'string' ? v : (r.minus && v > 0.005 ? `−${fmtGBP(v)}` : money(v))}</span>)}
      </div>
    ))}
  </div>
);

export default function AnnualStatement({ months, settings, calcEntry, todayStr, yearLabel, rangeLabel, onClose, onPrint }) {
  const rows = months.map(pb => monthRow(pb, settings, calcEntry, todayStr));
  const paidRows = rows.filter(r => r.paid);
  const hasForecast = paidRows.length < rows.length;
  const tPaid = totalsOf(paidRows), tAll = totalsOf(rows);
  const show = { lw: tAll.lw > 0, la: tAll.la > 0, sac: tAll.sacrifice > 0, other: tAll.other > 0 };
  const single = rows.length === 1;
  const t = tAll;                               // the year as it stands, forecasts included
  const cols = hasForecast && paidRows.length ? ['Paid to date', 'Full year'] : [single ? rows[0].month : 'Tax year'];
  const pick = k => (cols.length === 2 ? [tPaid[k], tAll[k]] : [tAll[k]]);

  // Monthly deductions, one line each, totalled over the months shown.
  const dedList = (Array.isArray(settings.deductions) ? settings.deductions : [])
    .map(d => ({ name: d.name || 'Deduction', when: d.when, total: sum(rows, r => deductionFor(d, r.month)) }))
    .filter(d => d.total > 0);

  // Where the year lands against the thresholds an accountant will look at.
  // Taxable pay here is pay after pension and salary sacrifice: the figure
  // on the P60 and, before any other income or reliefs, adjusted net income.
  const ani = t.taxable;
  const taper = taperExtra(ani, 1);
  const hrThreshold = 50270, hicbc = 60000, taperStart = 100000;
  const higherSlice = Math.max(0, Math.min(ani, 125140) - hrThreshold);
  const fmtWhole = n => '£' + Math.round(n).toLocaleString('en-GB');

  const goals = [];
  if (ani < hrThreshold) goals.push(['Basic rate all year', `${fmtWhole(hrThreshold - ani)} more taxable pay before any of it is taxed at 40%.`]);
  else goals.push(['Higher rate', `About ${fmtWhole(higherSlice)} of taxable pay is in the 40% band. Each £1 of personal pension contributions or Gift Aid in that band saves 40p in tax (claimed through Self Assessment).`]);
  if (ani >= hicbc) goals.push(['High Income Child Benefit Charge', `Taxable pay is over £60,000. If you or a partner claim Child Benefit and you're the higher earner, ${ani < 80000 ? 'part of it (1% for every £200 over) is repaid' : 'all of it is repaid'} through Self Assessment.`]);
  if (ani < taperStart) goals.push(['Under £100,000', `${fmtWhole(taperStart - ani)} of headroom before the personal allowance starts to be withdrawn (the 60% band).`]);
  else goals.push(['Over £100,000', `${fmtWhole(ani - taperStart)} over, so about ${fmtWhole(12570 - taper.allowanceLeft)} of personal allowance is lost. Payroll doesn't collect this during the year: roughly ${fmtWhole(taper.extraTax)} more tax is likely via a code change or Self Assessment, unless pension contributions or Gift Aid bring adjusted net income back down.`]);

  const notes = [
    ['Pension', `${fmtGBP(t.pension)} of police pension contributions came off before tax (a net pay arrangement), so tax relief is already given and nothing more is claimed. These are member contributions, not the pension input amount; for the annual allowance, use the scheme's Pension Savings Statement.`],
    show.sac && ['Salary sacrifice', `${fmtGBP(t.sacrifice)} was taken before tax and NI, so it's already left out of taxable pay and NI.`],
    ['Uniform', 'Police officers up to and including chief inspector can usually claim a £140 a year flat-rate expense for uniform upkeep (gov.uk/tax-relief-for-employees/uniforms-work-clothing-and-tools), backdated up to four years, if it isn\'t already in the tax code.'],
    show.other && ['Subscriptions', 'Professional subscriptions get tax relief only if the body is on HMRC\'s approved list (List 3). Check each one listed above before claiming.'],
  ].filter(Boolean);

  const p = { margin: 0, fontSize: '11px', color: MUTED, lineHeight: 1.55 };
  // Rendered straight into <body>, outside the app shell, so printing can
  // hide everything else and let it run over as many pages as it needs.
  return createPortal(
    <div className="payslip-print-area print-root" style={{ position: 'fixed', inset: 0, background: '#e2e8f0', zIndex: 70, overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px', paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
      <div className="no-print" style={{ display: 'flex', gap: '8px', maxWidth: '780px', margin: '0 auto 14px', fontFamily: BODY }}>
        <button onClick={onPrint} style={{ flex: 1, background: '#0f2744', color: '#fff', border: 'none', borderRadius: '11px', padding: '12px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: BODY }}>Print or save as PDF</button>
        <button onClick={onClose} style={{ background: '#fff', color: MUTED, border: `1px solid ${RULE}`, borderRadius: '11px', padding: '12px 18px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', fontFamily: BODY }}>Close</button>
      </div>

      <div className="payslip-print-doc acct-statement" style={{ maxWidth: '780px', margin: '0 auto', background: '#fff', color: INK, fontFamily: BODY, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', padding: '28px clamp(16px,4vw,32px) 26px', letterSpacing: 'normal', textShadow: 'none' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', borderBottom: `2px solid ${INK}`, paddingBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: FAINT, letterSpacing: '0.6px', textTransform: 'uppercase' }}>Pay statement · {single ? 'pay month' : 'tax year'} {yearLabel}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '3px', letterSpacing: '-0.4px' }}>{single ? `${rows[0].month} pay` : `Earnings and deductions ${yearLabel}`}</div>
            <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px' }}>{rangeLabel}</div>
          </div>
          <div style={{ fontSize: '10.5px', color: MUTED, lineHeight: 1.6 }}>
            <div><strong style={{ color: INK }}>{settings.rank || '–'}</strong>, pay point {settings.service || '–'}</div>
            <div>Tax code 1257L (assumed), cumulative</div>
            <div>Prepared {fmtLong(todayStr)}</div>
          </div>
        </div>
        {hasForecast && (
          <div style={{ marginTop: '12px', fontSize: '10.5px', color: MUTED, lineHeight: 1.5, background: BAND, padding: '8px 10px', borderRadius: '4px' }}>
            {single
              ? <><strong style={{ color: INK }}>Forecast.</strong> This payday hasn't happened yet: it's at the current salary with only the overtime already claimed for it.</>
              : <><strong style={{ color: INK }}>{paidRows.length} of {rows.length} paydays paid</strong> as of {fmtLong(todayStr)}. Months marked <em>forecast</em> are at the current salary with only overtime already claimed, and are shown in grey italics. They aren't in the "Paid to date" figures.</>}
          </div>
        )}

        {/* Summary */}
        <H sub="The figures to check against the payslips and, for a full tax year, the P60.">Summary</H>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: '12px' }}>
          <Ledger title="Earnings" cols={cols} rows={[
            { label: 'Basic salary', v: pick('salary') },
            show.lw && { label: 'London Weighting', v: pick('lw') },
            show.la && { label: 'London Allowance', v: pick('la') },
            { label: 'Overtime', note: tAll.otHrs > 0 ? `${fmtHrs(cols.length === 2 ? tPaid.otHrs : tAll.otHrs)} paid` : null, v: pick('ot') },
            { label: 'Protection Allowance', v: pick('pa') },
            { label: 'Total gross pay', v: pick('gross'), total: true },
          ]}/>
          <Ledger title="Deductions" cols={cols} rows={[
            { label: 'Pension', note: 'before tax', v: pick('pension'), minus: true },
            show.sac && { label: 'Salary sacrifice', note: 'before tax & NI', v: pick('sacrifice'), minus: true },
            { label: 'Taxable pay', v: pick('taxable'), total: true },
            { label: 'Income tax', v: pick('tax'), minus: true },
            { label: 'National Insurance', note: 'employee', v: pick('ni'), minus: true },
            show.other && { label: 'Other deductions', note: 'after tax', v: pick('other'), minus: true },
            { label: 'Net pay', v: pick('net'), total: true },
          ]}/>
        </div>

        {/* Month by month */}
        <H sub="What each payday paid, before anything comes off. Overtime and PA are in the month they were claimed.">Earnings by month</H>
        <MonthTable rows={rows} cols={[
          { key: 'salary', label: 'Basic salary' },
          show.lw && { key: 'lw', label: 'London Wtg' },
          show.la && { key: 'la', label: 'London Allow.' },
          { key: 'otHrs', label: 'OT hours', fmt: v => (v > 0 ? fmtHrs(v) : '–') },
          { key: 'ot', label: 'Overtime' },
          { key: 'pa', label: 'Prot. Allow.' },
          { key: 'gross', label: 'Gross pay', strong: true },
        ].filter(Boolean)} foot={[
          ...(hasForecast && paidRows.length ? [{ label: 'Paid to date', t: tPaid, first: true }] : []),
          { label: single ? 'Total' : (hasForecast ? 'Full year' : 'Tax year total'), t: tAll, first: !(hasForecast && paidRows.length), band: true },
        ]}/>

        <H newPage={!single} sub="Pension and salary sacrifice come off before tax; taxable pay is what income tax is worked out on.">Deductions and net pay by month</H>
        <MonthTable rows={rows} cols={[
          { key: 'pension', label: 'Pension' },
          show.sac && { key: 'sacrifice', label: 'Salary sacrifice' },
          { key: 'taxable', label: 'Taxable pay' },
          { key: 'tax', label: 'Income tax' },
          { key: 'ni', label: 'NI' },
          show.other && { key: 'other', label: 'Other deductions' },
          { key: 'net', label: 'Net pay', strong: true },
        ].filter(Boolean)} foot={[
          ...(hasForecast && paidRows.length ? [{ label: 'Paid to date', t: tPaid, first: true }] : []),
          { label: single ? 'Total' : (hasForecast ? 'Full year' : 'Tax year total'), t: tAll, first: !(hasForecast && paidRows.length), band: true },
        ]}/>

        {tAll.ot + tAll.pa > 0 && (
          <>
            <H sub="Paid overtime hours by rate, and Protection Allowance shifts, in the month each was claimed.">Overtime and allowances</H>
            <MonthTable rows={rows.filter(r => r.ot + r.pa > 0)} cols={[
              { key: 'h133', label: 'Hours ×1.33', fmt: (_, r) => (r.hrs.h133 > 0 ? fmtHrs(r.hrs.h133) : '–') },
              { key: 'h150', label: 'Hours ×1.5', fmt: (_, r) => (r.hrs.h150 > 0 ? fmtHrs(r.hrs.h150) : '–') },
              { key: 'h200', label: 'Hours ×2', fmt: (_, r) => (r.hrs.h200 > 0 ? fmtHrs(r.hrs.h200) : '–') },
              { key: 'ot', label: 'Overtime' },
              { key: 'paN', label: 'PA shifts', fmt: (_, r) => { const n = r.paCount.PA1 + r.paCount.PA2 + r.paCount.PA3; return n ? String(n) : '–'; } },
              { key: 'pa', label: 'Prot. Allow.' },
            ]} foot={[{ label: 'Total', first: true, band: true, t: (() => {
              const list = rows.filter(r => r.ot + r.pa > 0);
              const h = k => list.reduce((s, r) => s + r.hrs[k], 0);
              return { ot: tAll.ot, pa: tAll.pa, hrs: { h133: h('h133'), h150: h('h150'), h200: h('h200') }, paCount: list.reduce((a, r) => ({ PA1: a.PA1 + r.paCount.PA1, PA2: a.PA2 + r.paCount.PA2, PA3: a.PA3 + r.paCount.PA3 }), { PA1: 0, PA2: 0, PA3: 0 }) };
            })() }]}/>
            {tAll.ot > 0 && rows.some(r => r.imported > 0) && <p style={{ ...p, marginTop: '6px', fontSize: '10px' }}>Includes overtime entered as one figure for paydays before records began; it has no hours against it.</p>}
          </>
        )}

        {dedList.length > 0 && (
          <>
            <H sub="Set up in the app under More › Monthly deductions, totalled over the months above.">Other deductions</H>
            <Ledger title="Deduction" cols={['Total']} rows={[
              ...dedList.map(d => ({ label: d.name, note: d.when === 'before' ? 'salary sacrifice, before tax & NI' : 'after tax', v: [d.total] })),
              { label: 'Total', v: [sum(dedList, d => d.total)], total: true },
            ]}/>
          </>
        )}

        {/* Overview and goals */}
        {!single && (
          <>
            <H newPage sub={`Based on taxable pay of ${fmtGBP(ani)}${hasForecast ? ' for the full year, forecast months included' : ''}, before any other income or reliefs.`}>Overview and goals</H>
            <div style={{ display: 'grid', gap: '8px' }}>
              {goals.map(([k, v]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', borderLeft: `3px solid ${INK}`, padding: '4px 0 4px 10px', breakInside: 'avoid' }}>
                  <strong style={{ fontSize: '11.5px' }}>{k}</strong><p style={p}>{v}</p>
                </div>
              ))}
            </div>
            <H>Notes for a tax return</H>
            <div style={{ display: 'grid', gap: '8px' }}>
              {notes.map(([k, v]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: '12px', padding: '0 0 0 13px', breakInside: 'avoid' }}>
                  <strong style={{ fontSize: '11.5px' }}>{k}</strong><p style={p}>{v}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <p style={{ ...p, fontSize: '9.5px', color: FAINT, marginTop: '24px', paddingTop: '12px', borderTop: `1px solid ${RULE}` }}>
          Prepared from the records kept in Overtime &amp; Shift Tracker. Not an official payslip or P60. Tax is worked out as payroll does, on tax code 1257L, cumulatively month by month, at England, Wales and NI rates; NI is on each month's pay. A different tax code, benefits in kind, other income or a missed claim will change the figures, so the payslips and P60 are the final word.
        </p>
      </div>
    </div>,
    document.body
  );
}
