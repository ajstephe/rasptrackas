// ─── Independent PAYE reference — used by tests only, never by the app ───────
// Simulates a real monthly police payslip from HMRC's published payroll
// method, written separately from lib/payroll.js and lib/tax.js so the two
// can check each other. Deliberately simple and literal: one payslip per
// month, everything to date recomputed from scratch.
//
//   · tax code 1257L on the cumulative basis
//   · free pay: (1257 × 10 + 9) ÷ 12, rounded up to the penny, per month
//   · taxable pay to date rounded down to the whole pound
//   · rate limits to date: annual limit × month ÷ 12, rounded up to the pound
//   · no in-year £100k taper (a tax code change or Self Assessment deals with it)
//   · employee NI on each month's pay alone: 8% from £1,048 to £4,189, 2% above,
//     rounded to the nearest penny with a half penny rounded down
//   · police pension under a net pay arrangement: off before tax, not before NI
//   · pay lands on the 20th; April pay is month 1; new rates from 1 Sept 2026

const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const TIERS = [[37035, 0.1288], [79588, 0.1388], [Infinity, 0.1422]]; // 2015 scheme, from 1 April 2026
const tierRate = annual => annual <= TIERS[0][0] ? TIERS[0][1] : annual < TIERS[1][0] ? TIERS[1][1] : TIERS[2][1];
const LW = { pre: 3150, post: 3260 }, LA = 6588;
const PAY_DATES = ['2026-04-20','2026-05-20','2026-06-20','2026-07-20','2026-08-20','2026-09-20','2026-10-20','2026-11-20','2026-12-20','2027-01-20','2027-02-20','2027-03-20'];

const niFor = gross => {
  const raw = 0.08 * Math.max(0, Math.min(gross, 4189) - 1048) + 0.02 * Math.max(0, gross - 4189);
  return Math.ceil(raw * 100 - 0.5 - 1e-9) / 100; // nearest penny, half a penny down
};

// extras[i] = overtime + PA paid on month i+1's payday.
export const simulatePayslips = (salaryAnnual, extras) => {
  let payToDate = 0, taxPaid = 0;
  return PAY_DATES.map((payDate, i) => {
    const n = i + 1;
    const post = payDate >= '2026-09-01';
    const salary = r2(salaryAnnual[post ? 'post' : 'pre'] / 12);
    const lw = r2(LW[post ? 'post' : 'pre'] / 12);
    const la = r2(LA / 12);
    const extra = extras[i] || 0;
    const gross = r2(salary + lw + la + extra);
    const pension = r2((salary + lw) * tierRate(salaryAnnual[post ? 'post' : 'pre'] + LW[post ? 'post' : 'pre']));
    payToDate = r2(payToDate + gross - pension);
    const freePay = n * Math.ceil(((1257 * 10 + 9) / 12) * 100 - 1e-9) / 100;
    const taxable = Math.max(0, Math.floor(payToDate - freePay + 1e-9));
    const basic = Math.ceil(37700 * n / 12 - 1e-9), upper = Math.ceil(125140 * n / 12 - 1e-9);
    const taxToDate = Math.floor((0.2 * Math.min(taxable, basic) + 0.4 * Math.max(0, Math.min(taxable, upper) - basic) + 0.45 * Math.max(0, taxable - upper)) * 100 + 1e-6) / 100;
    const tax = r2(taxToDate - taxPaid);
    taxPaid = taxToDate;
    const ni = niFor(gross);
    return { payDate, gross, pension, tax, ni, net: r2(gross - pension - tax - ni) };
  });
};

// Take-home from the overtime and PA paid in each month: that payslip's net,
// minus the same payslip had that month's overtime and PA not been paid.
export const overtimeTakeHome = (salaryAnnual, extras) => {
  const actual = simulatePayslips(salaryAnnual, extras);
  return extras.map((x, i) => {
    if (!x) return 0;
    const without = simulatePayslips(salaryAnnual, extras.map((y, j) => (j === i ? 0 : y)));
    return r2(actual[i].net - without[i].net);
  });
};
