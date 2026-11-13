// The pay statement behind Export › PDF: every pay month of a tax year (or a
// single pay month) with salary, allowances, overtime and PA, what came off,
// and what reached the bank. buildStatement works out the figures once; the
// on-screen preview (components/AnnualStatement.jsx) and the A4 PDF file
// (statementPdf below) both draw from it, so they always agree.
import { deductionFor, deductionsFor } from './deductions.js';
import { taperExtra } from './tax.js';
import { fmtGBP, fmtHrs } from './format.js';
import { createPdf, A4, wrap, textWidth } from './pdfDoc.js';

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const sum = (list, f) => r2(list.reduce((s, x) => s + (f(x) || 0), 0));
export const money = n => (Math.abs(n) < 0.005 ? '–' : fmtGBP(n));
export const minus = n => (Math.abs(n) < 0.005 ? '–' : `−${fmtGBP(n)}`);
export const fmtLong = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const whole = n => '£' + Math.round(n).toLocaleString('en-GB');

const monthRow = (pb, settings, calcEntry, todayStr) => {
  const hrs = { h133: 0, h150: 0, h200: 0 }; let paN = 0;
  for (const part of pb.parts || []) {
    if (part.kind === 'ot') { const c = calcEntry(part.entry); hrs.h133 += c.payH1; hrs.h150 += c.payH2; hrs.h200 += c.payH3; }
    else paN += 1;
  }
  const other = deductionsFor(settings, pb.month).after;
  const sacrifice = pb.sacrifice || 0;
  return {
    month: pb.month, payDate: pb.payDate, paid: pb.payDate <= todayStr,
    salary: pb.salary, lw: pb.lw, la: pb.la, ot: pb.ot, imported: pb.imported || 0, pa: pb.pa,
    h133: hrs.h133, h150: hrs.h150, h200: hrs.h200, otHrs: hrs.h133 + hrs.h150 + hrs.h200, paN,
    gross: pb.monthGross, pension: pb.periodPension, sacrifice,
    taxable: r2(pb.monthGross - pb.periodPension - sacrifice),
    tax: pb.monthTax, ni: pb.monthNI, other, net: r2(pb.monthNet - other),
  };
};

const KEYS = ['salary', 'lw', 'la', 'ot', 'pa', 'gross', 'pension', 'sacrifice', 'taxable', 'tax', 'ni', 'other', 'net'];
const totalsOf = rows => {
  const t = {};
  KEYS.forEach(k => { t[k] = sum(rows, x => x[k]); });
  ['h133', 'h150', 'h200', 'otHrs', 'paN'].forEach(k => { t[k] = rows.reduce((s, x) => s + x[k], 0); });
  return t;
};

export function buildStatement({ months, settings, calcEntry, todayStr, yearLabel, rangeLabel }) {
  const rows = months.map(pb => monthRow(pb, settings, calcEntry, todayStr));
  const paidRows = rows.filter(r => r.paid);
  const single = rows.length === 1;
  const hasForecast = paidRows.length < rows.length;
  const split = hasForecast && paidRows.length > 0;     // show "Paid to date" next to the full year
  const tPaid = totalsOf(paidRows), tAll = totalsOf(rows);
  const show = { lw: tAll.lw > 0, la: tAll.la > 0, sac: tAll.sacrifice > 0, other: tAll.other > 0, extras: tAll.ot + tAll.pa > 0 };
  const cols = split ? ['Paid to date', 'Full year'] : [single ? rows[0].month : 'Tax year'];
  const pick = k => (split ? [tPaid[k], tAll[k]] : [tAll[k]]);
  const totalLabel = single ? 'Total' : hasForecast ? 'Full year' : 'Tax year total';
  const foot = [...(split ? [{ label: 'Paid to date', t: tPaid }] : []), { label: totalLabel, t: tAll, band: true }];

  const dedList = (Array.isArray(settings.deductions) ? settings.deductions : [])
    .map(d => ({ name: d.name || 'Deduction', when: d.when, total: sum(rows, r => deductionFor(d, r.month)) }))
    .filter(d => d.total > 0);

  const earnings = [
    { label: 'Basic salary', v: pick('salary') },
    show.lw && { label: 'London Weighting', v: pick('lw') },
    show.la && { label: 'London Allowance', v: pick('la') },
    { label: 'Overtime', note: tAll.otHrs > 0 ? `${fmtHrs(split ? tPaid.otHrs : tAll.otHrs)} paid` : null, v: pick('ot') },
    { label: 'Protection Allowance', note: tAll.paN > 0 ? `${split ? tPaid.paN : tAll.paN} shifts` : null, v: pick('pa') },
    { label: 'Total gross pay', v: pick('gross'), total: true },
  ].filter(Boolean);
  const deductions = [
    { label: 'Pension', note: 'before tax', v: pick('pension'), minus: true },
    show.sac && { label: 'Salary sacrifice', note: 'before tax & NI', v: pick('sacrifice'), minus: true },
    { label: 'Taxable pay', v: pick('taxable'), total: true },
    { label: 'Income tax', v: pick('tax'), minus: true },
    { label: 'National Insurance', note: 'employee', v: pick('ni'), minus: true },
    show.other && { label: 'Other deductions', note: 'after tax', v: pick('other'), minus: true },
    { label: 'Net pay', v: pick('net'), total: true },
  ].filter(Boolean);

  // Headline figures for the top of page one.
  const head = split ? tPaid : tAll;
  const overview = [
    ['Gross pay', fmtGBP(head.gross)], ['Taxable pay', fmtGBP(head.taxable)],
    ['Income tax', fmtGBP(head.tax)], ['National Insurance', fmtGBP(head.ni)], ['Net pay', fmtGBP(head.net)],
  ];
  const overviewLabel = split ? `Paid to date, ${paidRows.length} of ${rows.length} paydays` : single ? rows[0].month : `Tax year ${yearLabel}`;

  // Notes for a tax return, including where the year sits against the
  // thresholds (taxable pay = pay after pension and salary sacrifice).
  const ani = tAll.taxable;
  const notes = [];
  if (!single) {
    const band = ani <= 50270 ? `All in the basic rate, ${whole(50270 - ani)} below the 40% threshold.`
      : ani <= 100000 ? `About ${whole(Math.min(ani, 125140) - 50270)} is in the 40% band. Personal pension contributions or Gift Aid in that band get 40% relief through Self Assessment. ${whole(100000 - ani)} below £100,000.`
      : (() => { const tp = taperExtra(ani, 1); return `${whole(ani - 100000)} over £100,000, so about ${whole(12570 - tp.allowanceLeft)} of personal allowance is lost. Payroll doesn't collect this during the year: roughly ${whole(tp.extraTax)} more tax is likely via a code change or Self Assessment.`; })();
    notes.push(['Tax position', `Taxable pay of ${fmtGBP(ani)}${hasForecast ? ' (full year, forecast months included)' : ''}. ${band}`]);
    if (ani > 60000) notes.push(['Child Benefit', `Over £60,000: if you or a partner claim Child Benefit and you're the higher earner, ${ani < 80000 ? 'part of it (1% for every £200 over)' : 'all of it'} is repaid through Self Assessment.`]);
  }
  notes.push(['Pension', `${fmtGBP(tAll.pension)} of police pension contributions came off before tax (a net pay arrangement), so relief is already given. These are member contributions, not the pension input amount; for the annual allowance, use the scheme's Pension Savings Statement.`]);
  if (show.sac) notes.push(['Salary sacrifice', `${fmtGBP(tAll.sacrifice)} was taken before tax and NI, so it's already left out of taxable pay and NI.`]);
  notes.push(['Uniform', 'Police officers up to and including chief inspector can usually claim a £140 a year flat-rate expense for uniform upkeep (gov.uk/guidance/job-expenses-for-uniforms-work-clothing-and-tools), backdated up to four years, if it isn’t already in the tax code.']);
  if (show.other) notes.push(['Subscriptions', 'Professional subscriptions get tax relief only if the body is on HMRC’s approved list (List 3). Check each one listed before claiming.']);

  return {
    rows, paidRows, single, hasForecast, split, tPaid, tAll, show, cols, foot, dedList, earnings, deductions,
    overview, overviewLabel, notes, yearLabel, rangeLabel, todayStr,
    rank: settings.rank || '–', service: settings.service || '–',
    title: single ? `${rows[0].month} pay` : `Earnings and deductions ${yearLabel}`,
    kicker: `Pay statement · ${single ? 'pay month' : 'tax year'} ${yearLabel}`,
    forecastNote: !hasForecast ? null : single
      ? 'Forecast. This payday hasn’t happened yet: it’s at the current salary with only the overtime already claimed for it.'
      : `${paidRows.length} of ${rows.length} paydays paid as of ${fmtLong(todayStr)}. Months marked forecast are at the current salary with only overtime already claimed, shown in grey italics, and aren’t in the "Paid to date" figures.`,
    fileName: single ? `Pay statement ${rows[0].month}.pdf` : `Pay statement ${yearLabel.replace('/', '-')}.pdf`,
  };
}

// The month tables, shared by preview and PDF. fmt(value, row) formats a cell.
export const tables = s => {
  const hrs = v => (v > 0 ? fmtHrs(v) : '–');
  return [
    { title: 'Earnings by month', sub: 'What each payday paid, before anything comes off. Overtime and PA are in the month they were claimed.', rows: s.rows, foot: s.foot, cols: [
      { key: 'salary', label: 'Basic salary' },
      s.show.lw && { key: 'lw', label: 'London Wtg' },
      s.show.la && { key: 'la', label: 'London Allow.' },
      { key: 'otHrs', label: 'OT hours', fmt: hrs },
      { key: 'ot', label: 'Overtime' },
      { key: 'pa', label: 'Prot. Allow.' },
      { key: 'gross', label: 'Gross pay', strong: true },
    ].filter(Boolean) },
    { title: 'Deductions and net pay by month', sub: 'Pension and salary sacrifice come off before tax; taxable pay is what income tax is worked out on.', rows: s.rows, foot: s.foot, newPage: !s.single, cols: [
      { key: 'pension', label: 'Pension' },
      s.show.sac && { key: 'sacrifice', label: 'Salary sac.' },
      { key: 'taxable', label: 'Taxable pay' },
      { key: 'tax', label: 'Income tax' },
      { key: 'ni', label: 'NI' },
      s.show.other && { key: 'other', label: 'Other deds.' },
      { key: 'net', label: 'Net pay', strong: true },
    ].filter(Boolean) },
    s.show.extras && { title: 'Overtime and allowances', sub: 'Paid overtime hours by rate, and Protection Allowance shifts, in the month each was claimed.', rows: s.rows.filter(r => r.ot + r.pa > 0), foot: [{ label: 'Total', t: s.tAll, band: true }], cols: [
      { key: 'h133', label: 'Hours ×1.33', fmt: hrs },
      { key: 'h150', label: 'Hours ×1.5', fmt: hrs },
      { key: 'h200', label: 'Hours ×2', fmt: hrs },
      { key: 'ot', label: 'Overtime' },
      { key: 'paN', label: 'PA shifts', fmt: v => (v ? String(v) : '–') },
      { key: 'pa', label: 'Prot. Allow.' },
    ] },
  ].filter(Boolean);
};

// ── The A4 PDF file ──────────────────────────────────────────────────────────
const INK = '#0f172a', MUTED = '#475569', FAINT = '#64748b', RULE = '#cbd5e1', HAIR = '#e2e8f0', BAND = '#f1f5f9';
const M = 40, CW = A4.w - M * 2, BOTTOM = A4.h - 48;

export function statementPdf(s) {
  const pdf = createPdf({ title: s.title, author: 'Overtime & Shift Tracker' });
  let y = M;
  const room = h => { if (y + h > BOTTOM) { pdf.newPage(); y = M; return true; } return false; };
  const para = (str, x, width, { size = 8.5, color = MUTED, bold = false, lh = 1.4 } = {}) => {
    for (const ln of wrap(str, width, size, bold)) { pdf.text(x, y + size, ln, { size, color, bold }); y += size * lh; }
  };
  const heading = (title, sub, newPage) => {
    if (newPage && y > M) { pdf.newPage(); y = M; } else { y += 16; room(70); }
    pdf.text(M, y + 11, title, { size: 11, bold: true }); y += 15;
    if (sub) { para(sub, M, CW, { size: 8, color: FAINT }); }
    y += 4;
  };

  // Header
  pdf.text(M, y + 7, s.kicker.toUpperCase(), { size: 7, bold: true, color: FAINT });
  pdf.text(M, y + 27, s.title, { size: 18, bold: true });
  pdf.text(M, y + 41, s.rangeLabel, { size: 8.5, color: MUTED });
  [[`${s.rank}, pay point ${s.service}`, true], ['Tax code 1257L (assumed), cumulative', false], [`Prepared ${fmtLong(s.todayStr)}`, false]]
    .forEach(([t, b], i) => pdf.text(A4.w - M, y + 8 + i * 11, t, { size: 8, color: b ? INK : MUTED, bold: b, align: 'right' }));
  y += 52; pdf.line(M, y, A4.w - M, y, { width: 1.5, color: INK }); y += 10;

  if (s.forecastNote) {
    const lines = wrap(s.forecastNote, CW - 16, 8);
    pdf.rect(M, y, CW, lines.length * 11 + 10, { fill: BAND });
    lines.forEach((ln, i) => pdf.text(M + 8, y + 13 + i * 11, ln, { size: 8, color: MUTED }));
    y += lines.length * 11 + 16;
  }

  // Overview strip
  pdf.text(M, y + 8, `OVERVIEW · ${s.overviewLabel.toUpperCase()}`, { size: 7, bold: true, color: FAINT }); y += 13;
  const cw = CW / s.overview.length;
  pdf.rect(M, y, CW, 38, { stroke: RULE });
  s.overview.forEach(([k, v], i) => {
    const x = M + i * cw;
    if (i) pdf.line(x, y, x, y + 38, { color: HAIR });
    pdf.text(x + 8, y + 13, k, { size: 7.5, color: MUTED });
    pdf.text(x + 8, y + 29, v, { size: 11, bold: true, color: i === s.overview.length - 1 ? '#047857' : INK });
  });
  y += 38;

  // Month tables
  const drawTable = tb => {
    heading(tb.title, tb.sub, tb.newPage);
    const firstW = 96, colW = (CW - firstW) / tb.cols.length, rowH = 15;
    const head = () => {
      tb.cols.forEach((c, i) => pdf.text(M + firstW + colW * (i + 1) - 3, y + 9, c.label, { size: 7, bold: true, color: MUTED, align: 'right' }));
      pdf.text(M, y + 9, 'Pay month', { size: 7, bold: true, color: MUTED });
      y += 13; pdf.line(M, y, A4.w - M, y, { width: 1, color: INK });
    };
    head();
    tb.rows.forEach(r => {
      if (room(rowH)) head();
      const col = r.paid ? INK : FAINT;
      pdf.text(M, y + 10.5, r.month, { size: 8, bold: true, color: col });
      if (!r.paid) pdf.text(M + textWidth(r.month, 8, true) + 4, y + 10.5, 'FORECAST', { size: 5.5, bold: true, color: FAINT });
      tb.cols.forEach((c, i) => pdf.text(M + firstW + colW * (i + 1) - 3, y + 10.5, (c.fmt || money)(r[c.key], r), { size: 8, color: col, bold: !!c.strong, italic: !r.paid, align: 'right' }));
      y += rowH; pdf.line(M, y, A4.w - M, y, { color: HAIR });
    });
    tb.foot.forEach((f, k) => {
      room(rowH);
      if (f.band) pdf.rect(M, y, CW, rowH, { fill: BAND });
      if (k === 0) pdf.line(M, y, A4.w - M, y, { width: 1, color: INK });
      pdf.text(M + 3, y + 10.5, f.label, { size: 8, bold: true });
      tb.cols.forEach((c, i) => pdf.text(M + firstW + colW * (i + 1) - 3, y + 10.5, (c.fmt || money)(f.t[c.key], f.t), { size: 8, bold: true, align: 'right' }));
      y += rowH;
    });
  };
  tables(s).forEach(drawTable);

  // A label/value list with a column per figure.
  const ledger = (x, w, title, cols, rows) => {
    const valW = 74, top = y;
    let yy = y;
    pdf.rect(x, yy, w, 16, { fill: BAND });
    pdf.text(x + 7, yy + 11, title.toUpperCase(), { size: 7, bold: true, color: MUTED });
    cols.forEach((c, i) => pdf.text(x + w - 7 - valW * (cols.length - 1 - i), yy + 11, c.toUpperCase(), { size: 7, bold: true, color: MUTED, align: 'right' }));
    yy += 16;
    rows.forEach(r => {
      pdf.line(x, yy, x + w, yy, r.total ? { width: 1, color: INK } : { color: HAIR });
      pdf.text(x + 7, yy + 11, r.label, { size: 8.5, bold: !!r.total });
      if (r.note) pdf.text(x + 7 + textWidth(r.label, 8.5, !!r.total) + 4, yy + 11, r.note, { size: 7, color: FAINT });
      r.v.forEach((v, i) => pdf.text(x + w - 7 - valW * (r.v.length - 1 - i), yy + 11, r.minus ? minus(v) : money(v), { size: 8.5, bold: !!r.total, align: 'right' }));
      yy += 16;
    });
    pdf.rect(x, top, w, yy - top, { stroke: RULE });
    return yy;
  };

  if (s.dedList.length) {
    heading('Other deductions', 'Set up in the app under More › Monthly deductions, totalled over the months above.');
    room(16 * (s.dedList.length + 2));
    y = ledger(M, CW, 'Deduction', ['Total'], [
      ...s.dedList.map(d => ({ label: d.name, note: d.when === 'before' ? 'salary sacrifice, before tax & NI' : 'after tax', v: [d.total] })),
      { label: 'Total', v: [s.dedList.reduce((a, d) => a + d.total, 0)], total: true },
    ]);
  }

  // Totals, then notes, at the end.
  heading('Totals', s.split ? 'Paid to date and the full year, forecast months included.' : null, !s.single);
  room(16 * 9);
  const half = (CW - 12) / 2;
  const yA = ledger(M, half, 'Earnings', s.cols, s.earnings);
  const yB = ledger(M + half + 12, half, 'Deductions', s.cols, s.deductions);
  y = Math.max(yA, yB);

  heading('Notes for a tax return');
  s.notes.forEach(([k, v]) => {
    const lines = wrap(v, CW - 110, 8.5);
    room(lines.length * 12 + 6);
    pdf.text(M, y + 9, k, { size: 8.5, bold: true });
    lines.forEach((ln, i) => pdf.text(M + 110, y + 9 + i * 12, ln, { size: 8.5, color: MUTED }));
    y += lines.length * 12 + 6;
  });

  y += 10; room(40); pdf.line(M, y, A4.w - M, y, { color: RULE }); y += 6;
  para('Prepared from the records kept in Overtime & Shift Tracker. Not an official payslip or P60. Tax is worked out as payroll does, on tax code 1257L, cumulatively month by month, at England, Wales and NI rates; NI is on each month’s pay. A different tax code, benefits in kind, other income or a missed claim will change the figures, so the payslips and P60 are the final word.', M, CW, { size: 7, color: FAINT });

  pdf.eachPage((i, count) => {
    pdf.text(M, A4.h - 24, s.title, { size: 7, color: FAINT });
    pdf.text(A4.w - M, A4.h - 24, `Page ${i + 1} of ${count}`, { size: 7, color: FAINT, align: 'right' });
  });
  return pdf.toBlob();
}
