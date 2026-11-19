import { getUKTaxYearStart } from './payPeriods.js';

// More › Config › "I moved forces this tax year": for an officer who joined
// from another force since 6 April. Stored as settings.forceMove =
// { on, leaving:'2026-09-20', pay, tax }, the last three copied from the P45
// (Leaving date, Total pay to date, Total tax to date). Off for almost
// everyone; while it's off nothing here changes a single figure.
const PAY_DAY = 20;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
// The pay date of a pay month label ("October 2026"): the 20th, or the Friday
// before when that's a weekend (as lib/payroll.js payDateOf).
const payDateOfLabel = label => {
  const [name, year] = String(label).split(' ');
  const d = new Date(Date.UTC(Number(year), MONTHS.indexOf(name), PAY_DAY));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(PAY_DAY - 1);
  if (dow === 0) d.setUTCDate(PAY_DAY - 2);
  return d.toISOString().slice(0, 10);
};

export const forceMoveOf = settings => {
  const f = settings && settings.forceMove;
  return f && f.on && /^\d{4}-\d{2}-\d{2}$/.test(f.leaving || '') && Number.isFinite(f.pay) && Number.isFinite(f.tax) ? f : null;
};

// Was this pay month paid by the previous force? Pay months of the same tax
// year whose payday was on or before the leaving date.
export const paidByPreviousForce = (settings, month) => {
  const f = forceMoveOf(settings);
  if (!f) return false;
  const pd = payDateOfLabel(month);
  return pd <= f.leaving && getUKTaxYearStart(pd) === getUKTaxYearStart(f.leaving);
};

// The P45's pay and tax, when they count towards this pay month's tax year
// (a pay month after the leaving date, in the same tax year).
export const p45For = (settings, month) => {
  const f = forceMoveOf(settings);
  if (!f) return null;
  const pd = payDateOfLabel(month);
  return pd > f.leaving && getUKTaxYearStart(pd) === getUKTaxYearStart(f.leaving) ? { pay: f.pay, tax: f.tax } : null;
};

// The P45 for the tax year starting `taxYearStart` ('2026-04-06'), or null:
// what the year totals add as "Previous force (P45)". In any later tax
// year it's ignored, and the switch in More › Config shows as off.
export const p45ForTaxYear = (settings, taxYearStart) => {
  const f = forceMoveOf(settings);
  return f && getUKTaxYearStart(f.leaving) === taxYearStart ? { pay: f.pay, tax: f.tax, leaving: f.leaving } : null;
};
