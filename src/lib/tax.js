// ─── Met Police allowances ────────────────────────────────────────────────────
// Per year, before / from the 1 Sep 2026 pay award. From September the Met
// payslip shows London Weighting £271.75 a month (£3,261) and London
// Allowance £84.25 + £296.50 + £187.50 variable = £568.25 a month (£6,819).
export const LONDON_WEIGHTING = { pre:3150, post:3261 };
export const LONDON_ALLOWANCE = { pre:6588, post:6819 };
// The three London Allowance lines on a Met payslip, per year. They add up
// to LONDON_ALLOWANCE: 1,011 + 3,327 + 2,250 = 6,588; 1,011 + 3,558 + 2,250 = 6,819.
export const LONDON_ALLOWANCE_PARTS = {
  la1: { pre:1011, post:1011 },
  la2: { pre:3327, post:3558 },
  laVar: { pre:2250, post:2250 },
};

// ─── UK income tax bands (2026/27), on a whole-year basis ─────────────────────
// Used only to size the £100k taper (see taperExtra below): the pay months
// themselves are taxed by the PAYE method further down. `yearFraction`
// pro-rates the allowance and bands to part of a year.
export const calcUKIncomeTax = (cumGross, yearFraction=1) => {
  const f = Math.max(1/365, Math.min(1, yearFraction));
  // The £100k personal-allowance taper is an annual rule, so judge it on the
  // annualised run-rate, then pro-rate the resulting allowance.
  const annualised = cumGross / f;
  let paAnnual = 12570;
  if (annualised > 100000) paAnnual = Math.max(0, 12570 - Math.floor((annualised - 100000) / 2));
  const pa = paAnnual * f;
  const taxable = Math.max(0, cumGross - pa);
  // Band widths are in TAXABLE income terms. The 40% band runs from £37,700
  // to £125,140 of taxable income (width £87,440) — this is what makes the
  // Additional Rate start exactly at £125,140 of total income once the
  // allowance has fully tapered to zero, matching the official HMRC bands.
  const basic = 37700 * f, higher = 87440 * f;
  let tax = 0;
  if (taxable > 0)             tax += Math.min(taxable, basic)          * 0.20;
  if (taxable > basic)         tax += Math.min(taxable - basic, higher) * 0.40;
  if (taxable > basic + higher) tax += (taxable - basic - higher)       * 0.45;
  return tax;
};

// Same calculation, but the personal allowance is never tapered — the
// difference between the two is the tax caused by crossing £100k. Payroll
// doesn't withhold it during the year (see the Tax & 100K+ Calculator in
// More..), so it's the amount most likely to arrive later as a bill.
export const calcUKIncomeTaxNoTaper = (cumGross, yearFraction=1) => {
  const f = Math.max(1/365, Math.min(1, yearFraction));
  const pa = 12570 * f;
  const taxable = Math.max(0, cumGross - pa);
  const basic = 37700 * f, higher = 87440 * f;
  let tax = 0;
  if (taxable > 0)             tax += Math.min(taxable, basic)          * 0.20;
  if (taxable > basic)         tax += Math.min(taxable - basic, higher) * 0.40;
  if (taxable > basic + higher) tax += (taxable - basic - higher)       * 0.45;
  return tax;
};

// 2015 Police Pension Scheme member contribution tiers (England & Wales),
// effective 1 April 2026 — The Police Pensions (Member Contributions)
// (Amendment and Transitional Provisions) (England and Wales) Regulations
// 2026 (S.I. 2026/267). The real rule sets a member's tier from their
// "relevant pay" — actual pensionable earnings over the PREVIOUS scheme
// year (or their current annual rate if newly joined or returning from a
// long absence) — held fixed for the whole current year. This app has no
// way to know last scheme year's actual earnings, so it approximates using
// the CURRENT year's annualised pensionable pay instead. That's correct
// for anyone whose pay hasn't changed much year over year, and is flagged
// as an estimate in the UI for anyone it might not be (e.g. a recent
// promotion). Pensionable pay is basic salary + London Weighting ONLY —
// overtime, PA enhancements, and London Allowance are all non-pensionable.
export const pensionTierRate = annualPensionablePay => {
  if (annualPensionablePay <= 37035) return 0.1288;
  if (annualPensionablePay < 79588) return 0.1388;
  return 0.1422;
};

// ─── PAYE, month by month, the way payroll works it out ──────────────────────
// Used for every pay month's figures (lib/payroll.js). Tax code 1257L on the
// cumulative basis, straight from HMRC's payroll method:
//   · free pay of (1257 × 10 + 9) ÷ 12 = £1,048.25 a month, to date
//   · taxable pay to date rounded down to the whole pound
//   · rate limits to date: the annual limit × month ÷ 12, rounded up to the pound
//   · no £100k taper in the month — payroll keeps giving the full allowance
//     and the difference is collected later by a code change or Self
//     Assessment (the Tax & 100K+ Calculator shows it as extra tax)
// NI is worked out on each month's pay alone: 8% from £1,048 to £4,189 a
// month and 2% above, rounded to the nearest penny (a half penny rounds down).
// ─── Tax codes ────────────────────────────────────────────────────────────────
// Everyone starts on 1257L cumulative; More › Config can set another code,
// and change it from a given pay month (settings.taxCode). Handled:
//   · number + L, M, N or T (1271L, 1100T, 0T…): that much tax-free pay
//   · K + number: that much extra taxable pay (tax capped at half the month's pay)
//   · BR, D0, D1: all pay at 20%, 40% or 45%;  NT: no tax
// Welsh codes (C prefix) use the same bands. Scottish codes (S prefix) don't,
// and aren't supported yet. "M1", "W1" or "X" after a code means month 1.
export const DEFAULT_TAX_CODE = '1257L';
export const parseTaxCode = raw => {
  let c = String(raw ?? '').toUpperCase().replace(/\s+/g, '');
  if (!c) return { ok:false, error:'Enter your tax code' };
  let month1 = false;
  const tail = c.match(/(M1|W1|X)$/);
  if (tail && c.length > tail[1].length) { month1 = true; c = c.slice(0, -tail[1].length); }
  if (/^S/.test(c)) return { ok:false, error:"Scottish tax codes (starting S) aren't supported yet" };
  if (/^C/.test(c)) c = c.slice(1);
  if (['BR','D0','D1','NT'].includes(c)) return { ok:true, code:c, type:c, n:0, month1 };
  let m = c.match(/^(\d{1,4})([LMNT])$/);
  if (m) return { ok:true, code:c, type:'allowance', n:Number(m[1]), month1 };
  m = c.match(/^K(\d{1,4})$/);
  if (m) return { ok:true, code:c, type:'K', n:Number(m[1]), month1 };
  return { ok:false, error:'That doesn’t look like a tax code, e.g. 1257L' };
};
const DEFAULT_INFO = parseTaxCode(DEFAULT_TAX_CODE);
// Free pay for one month, from HMRC's tables: (number × 10 + 9) ÷ 12, rounded
// up to the penny. K codes add that much instead.
const freePayMonth = info => {
  if (info.type === 'allowance') return info.n === 0 ? 0 : Math.ceil(((info.n*10+9)/12)*100 - 1e-9)/100;
  if (info.type === 'K') return -Math.ceil(((info.n*10+9)/12)*100 - 1e-9)/100;
  return 0;
};
const FLAT_RATE = { BR:0.20, D0:0.40, D1:0.45, NT:0 };
const NI_PT_MONTH = 1048, NI_UEL_MONTH = 4189;
const payeLimits = month => ({ basic: Math.ceil(37700*month/12 - 1e-9), upper: Math.ceil(125140*month/12 - 1e-9) });
const payeTaxable = (payToDate, month, info=DEFAULT_INFO) => Math.max(0, Math.floor(payToDate - freePayMonth(info)*month + 1e-9));
// Tax due on `payToDate` (taxable pay to date) at tax month `month`.
export const taxToDateFor = (payToDate, month, info=DEFAULT_INFO) => {
  const taxable = payeTaxable(payToDate, month, info);
  if (info.type in FLAT_RATE) return Math.floor(taxable*FLAT_RATE[info.type]*100 + 1e-6)/100;
  const { basic, upper } = payeLimits(month);
  const tax = 0.20*Math.min(taxable, basic) + 0.40*Math.max(0, Math.min(taxable, upper) - basic) + 0.45*Math.max(0, taxable - upper);
  return Math.floor(tax*100 + 1e-6)/100;
};
export const payeTaxToDate = (payToDate, month) => taxToDateFor(payToDate, month, DEFAULT_INFO);

// The tax code in force for a pay month (e.g. 'November 2026'):
// { info, basis:'cumulative'|'month1', label }. settings.taxCode is
// { code, basis, changes:[{ id, from:'November 2026', code, basis }] }.
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthKey = label => { const [n, y] = String(label).split(' '); return Number(y)*12 + MONTHS.indexOf(n); };
export const taxCodeOn = (settings, month) => {
  const tc = settings && settings.taxCode;
  let code = tc?.code || DEFAULT_TAX_CODE, basis = tc?.basis || 'cumulative';
  const changes = (tc?.changes || []).filter(c => c && c.from && monthKey(c.from) <= monthKey(month))
    .sort((a,b) => monthKey(a.from) - monthKey(b.from));
  if (changes.length) { const last = changes[changes.length-1]; code = last.code; basis = last.basis || 'cumulative'; }
  let info = parseTaxCode(code);
  if (!info.ok) { info = DEFAULT_INFO; code = DEFAULT_TAX_CODE; }
  if (info.month1) basis = 'month1';
  return { info, basis, label: `${info.code}${basis === 'month1' ? ' Emergency (Non Cumul.)' : ''}` };
};
export const payeNI = monthPay => {
  const raw = 0.08*Math.max(0, Math.min(monthPay, NI_UEL_MONTH) - NI_PT_MONTH) + 0.02*Math.max(0, monthPay - NI_UEL_MONTH);
  return Math.ceil(raw*100 - 0.5 - 1e-9)/100 + 0;   // + 0: never -0 (shown as "-£0.00")
};
export const payeBandName = (payToDate, month, info=DEFAULT_INFO) => {
  const taxable = payeTaxable(payToDate, month, info);
  if (info.type in FLAT_RATE) return info.type === 'NT' ? 'No tax (NT)' : info.type === 'BR' ? 'Basic Rate' : info.type === 'D0' ? 'Higher Rate' : 'Additional Rate';
  const { basic, upper } = payeLimits(month);
  return taxable <= 0 ? 'Personal Allowance' : taxable <= basic ? 'Basic Rate' : taxable <= upper ? 'Higher Rate' : 'Additional Rate';
};

// The same calculation as payeTaxToDate, itemised band by band, for the
// Tax & 100K+ Calculator's full breakdown.
export const payeTaxBreakdown = (payToDate, month, info=DEFAULT_INFO) => {
  const taxable = payeTaxable(payToDate, month, info);
  const { basic, upper } = payeLimits(month);
  let basicAmt = Math.min(taxable, basic);
  let higherAmt = Math.max(0, Math.min(taxable, upper) - basic);
  let additionalAmt = Math.max(0, taxable - upper);
  if (info.type in FLAT_RATE) { basicAmt = info.type==='BR' ? taxable : 0; higherAmt = info.type==='D0' ? taxable : 0; additionalAmt = info.type==='D1' ? taxable : 0; }
  return {
    freePay: freePayMonth(info)*month, taxable, code: info.code,
    basicAmt, basicTax: basicAmt*0.20, higherAmt, higherTax: higherAmt*0.40, additionalAmt, additionalTax: additionalAmt*0.45,
    totalTax: taxToDateFor(payToDate, month, info),
  };
};

// The £100k taper payroll doesn't apply during the year: how much of the
// tax-free allowance is lost, and the extra tax that's likely to be
// collected later (by a tax code change or Self Assessment). `taxable` is
// pay after pension for `fraction` of a year (1 for a whole year).
export const taperExtra = (taxable, fraction=1) => {
  const f = Math.max(1/12, Math.min(1, fraction));
  const runRate = taxable / f;
  const lostAnnual = runRate > 100000 ? Math.min(12570, Math.floor((runRate-100000)/2)) : 0;
  return {
    runRate, over: runRate > 100000,
    allowanceLeft: 12570 - lostAnnual,
    allowanceLostSoFar: lostAnnual * f,
    extraTax: lostAnnual>0 ? calcUKIncomeTax(taxable, f) - calcUKIncomeTaxNoTaper(taxable, f) : 0,
  };
};
