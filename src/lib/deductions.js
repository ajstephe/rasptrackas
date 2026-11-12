// Monthly deductions (More › Config): things taken off every payslip that the
// app otherwise can't know about — Federation subs, ATOC, insurance, savings.
// Each has a name, a monthly amount, optional amount changes from a given
// pay month, pay months it's skipped, and whether it comes off after tax or
// before tax and NI (salary sacrifice, e.g. cycle to work).
//
// Pay months are keyed by their label ("January 2027"), the same as
// PAY_PERIODS, so they carry across tax years.
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const monthOrdinal = label => {
  const [name, year] = String(label||'').split(' ');
  const m = MONTHS.indexOf(name);
  return m < 0 || !Number(year) ? NaN : Number(year)*12 + m;
};

const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// What one deduction takes in a pay month: nothing if skipped, otherwise the
// latest amount change on or before that month, else its starting amount.
export const deductionFor = (d, month) => {
  if (!d || (d.off||[]).includes(month)) return 0;
  const at = monthOrdinal(month);
  let amount = num(d.amount), best = -Infinity;
  for (const c of d.changes||[]) {
    const o = monthOrdinal(c.from);
    if (o <= at && o > best) { best = o; amount = num(c.amount); }
  }
  return amount;
};

// A pay month's deductions split by when they come off.
export const deductionsFor = (settings, month) => {
  const list = Array.isArray(settings?.deductions) ? settings.deductions : [];
  let before = 0, after = 0;
  for (const d of list) { const a = deductionFor(d, month); if (d.when === 'before') before += a; else after += a; }
  const r = x => Math.round(x*100)/100;
  return { before: r(before), after: r(after), total: r(before+after) };
};
