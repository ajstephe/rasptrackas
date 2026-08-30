import { RATE_CHANGE_DATE, daysInclusive } from './payPeriods.js';

// ─── Met Police allowances ────────────────────────────────────────────────────
export const LONDON_WEIGHTING = { pre:3150, post:3260 }; // pre/post 1 Sep 2026
export const LONDON_ALLOWANCE = 6588;                     // fixed p.a.

// ─── UK income tax bands (2026/27) ────────────────────────────────────────────
// Thresholds are pro-rated to the pay period, mirroring how cumulative PAYE
// actually works: by period 6 you've had 6/12 of your personal allowance and
// 6/12 of each band. Comparing cumulative pay against FULL annual thresholds
// (the old approach) understated tax badly until the very end of the year.
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

// Same calculation, but the personal allowance is never tapered — used only
// as a counterfactual to isolate how much of the year's tax bill is caused
// specifically by crossing £100k. A standard payslip generally won't have
// withheld this portion in real time (see the £100k Tax Impact card in
// Settings), so it's the amount most likely to arrive later as a bill.
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

// ─── National Insurance (Class 1 employee, 2026/27) ───────────────────────────
// Unlike income tax, NI for ordinary employees is worked out on each pay
// period in isolation — it doesn't run cumulatively — so it's assessed on
// that period's gross against per-period thresholds.
export const NI_PT  = 12570 / 12;  // primary threshold, monthly
export const NI_UEL = 50270 / 12;  // upper earnings limit, monthly
export const calcNI = periodGross => {
  let ni = 0;
  if (periodGross > NI_PT)  ni += Math.min(periodGross - NI_PT, NI_UEL - NI_PT) * 0.08;
  if (periodGross > NI_UEL) ni += (periodGross - NI_UEL) * 0.02;
  return ni;
};

// NI has no annual concept — it's assessed per pay period, which is exactly
// why totals.ytdNI is built by summing each period's own NI rather than
// feeding a lump YTD figure through calcNI (which expects one period's
// gross against monthly thresholds, and would badly overstate NI if given
// a whole year's money at once). This estimate exists only for the Forecast
// figure, where there's no set of real periods to sum — it applies the
// annual-equivalent thresholds directly to the projected annual gross, a
// reasonable approximation for a full-year projection.
export const estimateAnnualNI = grossAnnual => {
  const ptAnnual = 12570, uelAnnual = 50270;
  let ni = 0;
  if (grossAnnual > ptAnnual)  ni += Math.min(grossAnnual - ptAnnual, uelAnnual - ptAnnual) * 0.08;
  if (grossAnnual > uelAnnual) ni += (grossAnnual - uelAnnual) * 0.02;
  return ni;
};

// Full band-by-band income tax split for a given gross and year-fraction —
// how much sits in the tax-free Personal Allowance, how much at 20%, 40%,
// and 45%. Used for the £100k Tax Calculator's detailed breakdown. Summing
// basicTax+higherTax+additionalTax always equals calcUKIncomeTax's result
// for the same inputs — same underlying math, just itemised.
export const computeTaxBandBreakdown = (gross, yearFraction=1) => {
  const f = Math.max(1/365, Math.min(1, yearFraction));
  const annualised = gross / f;
  let paAnnual = 12570;
  if (annualised > 100000) paAnnual = Math.max(0, 12570 - Math.floor((annualised - 100000) / 2));
  const pa = paAnnual * f;
  const basicWidth = 37700 * f, higherWidth = 87440 * f;
  const taxable = Math.max(0, gross - pa);
  const basicAmt = Math.min(taxable, basicWidth);
  const basicTax = basicAmt * 0.20;
  const higherAmt = Math.max(0, Math.min(taxable - basicWidth, higherWidth));
  const higherTax = higherAmt * 0.40;
  const additionalAmt = Math.max(0, taxable - basicWidth - higherWidth);
  const additionalTax = additionalAmt * 0.45;
  return { pa, basicAmt, basicTax, higherAmt, higherTax, additionalAmt, additionalTax, totalTax: basicTax+higherTax+additionalTax };
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
export const calcPensionContribution = (pensionablePay, yearFraction=1) => {
  const f = Math.max(1/365, Math.min(1, yearFraction));
  const annualised = pensionablePay / f;
  const rate = pensionTierRate(annualised);
  return { rate, amount: pensionablePay * rate };
};

// Named bands, used to tell the person plainly which bracket their overtime/PA
// lands in, rather than a blended "effective %" figure. Only used internally
// here (computeTaxBandBreakdown/getTaxBand) — not exported, nothing outside
// this file reads it directly.
const TAX_BANDS = [
  { name:'Personal Allowance', min:0,      rate:0  },
  { name:'Basic Rate',         min:12570,  rate:20 },
  { name:'Higher Rate',        min:50270,  rate:40 },
  { name:'Additional Rate',    min:125140, rate:45 },
];
export const getTaxBand = (cumulativeGross, yearFraction=1) => {
  const f = Math.max(1/365, Math.min(1, yearFraction));
  let band = TAX_BANDS[0];
  for (const b of TAX_BANDS) { if (cumulativeGross >= b.min * f) band = b; else break; }
  return band;
};

// Calculates the actual deductions on a slice of income stacked on top of what's
// already been earned — split across bands exactly as the UK system works (if a
// slice crosses from Basic into Higher Rate, only the portion above the
// threshold is taxed at 40%, not the whole slice).
//
// Tax runs cumulatively across the year; NI is assessed on the pay period in
// isolation. Both are layered the same way so the rate shown reflects what
// actually comes off this money.
export const applyBandTax = (cumulativeBefore, amount, yearFraction=1, periodGrossBefore=null) => {
  if (amount <= 0) return { tax:0, ni:0, net:0, rate:0, bandName:null };
  const tax = calcUKIncomeTax(cumulativeBefore + amount, yearFraction)
            - calcUKIncomeTax(cumulativeBefore, yearFraction);
  const pg  = periodGrossBefore==null ? null : periodGrossBefore;
  const ni  = pg==null ? 0 : (calcNI(pg + amount) - calcNI(pg));
  const total = tax + ni;
  const band = getTaxBand(cumulativeBefore + amount, yearFraction);
  return { tax, ni, net: amount - total, rate: (total / amount) * 100, bandName: band.name };
};

// Splits an amount of income into the portions that fall within each tax band,
// exactly as UK progressive tax works (e.g. the first £X at 0%, next £Y at 20%,
// remainder at 40%). Used to break overtime hours down by which band they fall in.
export const splitAcrossBands = (cumulativeBefore, amount) => {
  let remaining = amount, cursor = cumulativeBefore;
  const portions = [];
  for (let i=0; i<TAX_BANDS.length && remaining>0.005; i++){
    const bandMin = TAX_BANDS[i].min;
    const bandMax = i+1<TAX_BANDS.length ? TAX_BANDS[i+1].min : Infinity;
    if (cursor >= bandMax) continue;
    const capacity = bandMax - Math.max(cursor, bandMin);
    const take = Math.min(remaining, capacity);
    if (take > 0.005) {
      portions.push({ name:TAX_BANDS[i].name, rate:TAX_BANDS[i].rate, amount:take });
      cursor += take; remaining -= take;
    }
  }
  return portions;
};

// Salary (and similar annual amounts like London Weighting/Allowance) is paid
// monthly in the real world, not smoothly by the day. This accrues a full
// month's pay for every calendar month that's fully completed within the
// given range, and pro-rates only the partially-completed edge months —
// so the YTD figure steps up once per payday rather than creeping up daily.
export const monthlySteppedAmount = (annualAmount, rangeStartStr, rangeEndStr) => {
  if (!rangeStartStr || !rangeEndStr || rangeEndStr < rangeStartStr) return 0;
  const monthly = annualAmount / 12;
  const rangeStart = new Date(rangeStartStr);
  const rangeEnd   = new Date(rangeEndStr);
  let total = 0;
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd   = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0);
    const daysInMonth = monthEnd.getDate();
    const clipStart = monthStart < rangeStart ? rangeStart : monthStart;
    const clipEnd   = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    if (clipEnd >= clipStart) {
      const isFullMonth = clipStart.getTime()===monthStart.getTime() && clipEnd.getTime()===monthEnd.getTime();
      if (isFullMonth) {
        total += monthly;
      } else {
        const daysCounted = Math.round((clipEnd - clipStart)/86400000) + 1;
        total += monthly * (daysCounted / daysInMonth);
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }
  return total;
};

// Same monthly-stepped accrual, but split at the 1 Sep 2026 pay rise so each
// side uses its own annual rate.
export const monthlySteppedSplitBySept = (annualPre, annualPost, rangeStartStr, rangeEndStr) => {
  if (!rangeStartStr || !rangeEndStr || rangeEndStr < rangeStartStr) return 0;
  if (rangeEndStr < RATE_CHANGE_DATE)   return monthlySteppedAmount(annualPre, rangeStartStr, rangeEndStr);
  if (rangeStartStr >= RATE_CHANGE_DATE) return monthlySteppedAmount(annualPost, rangeStartStr, rangeEndStr);
  const d = new Date(RATE_CHANGE_DATE); d.setDate(d.getDate()-1);
  const dayBeforeChange = d.toISOString().split('T')[0];
  return monthlySteppedAmount(annualPre, rangeStartStr, dayBeforeChange) + monthlySteppedAmount(annualPost, RATE_CHANGE_DATE, rangeEndStr);
};

// Salary + London Weighting + London Allowance for one pay period, pro-rated
// across the 1 Sep 2026 rate change if the period spans it.
export const periodBaseAmount = (p, svcData) => {
  const totalDays = daysInclusive(p.start, p.end);
  let preDays, postDays;
  if (p.end < RATE_CHANGE_DATE) { preDays = totalDays; postDays = 0; }
  else if (p.start >= RATE_CHANGE_DATE) { preDays = 0; postDays = totalDays; }
  else {
    const d = new Date(RATE_CHANGE_DATE); d.setDate(d.getDate() - 1);
    preDays  = daysInclusive(p.start, d.toISOString().split('T')[0]);
    postDays = totalDays - preDays;
  }
  const salary = svcData ? (preDays/365)*svcData.salary.pre + (postDays/365)*svcData.salary.post : 0;
  const lw     = (preDays/365)*LONDON_WEIGHTING.pre + (postDays/365)*LONDON_WEIGHTING.post;
  const la     = (totalDays/365)*LONDON_ALLOWANCE;
  return salary + lw + la;
};
