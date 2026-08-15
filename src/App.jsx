import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── financial year — generated, not hardcoded ────────────────────────────────
// Pay periods follow a fixed 4-4-5-4-4-5-4-4-5-4-4-5 week cycle (52 weeks/364
// days every year, Monday to Sunday), shifting forward exactly 364 days each
// year. This was reverse-engineered from two real years of the user's actual
// pay records — 2022/23 and 2026/27, four years and exactly 208 weeks apart —
// and reproduces all 24 known period boundaries from those years exactly.
//
// One thing this can't know: whether the force occasionally inserts a 53-week
// year to stay aligned with the calendar (common in systems like this, every
// 5-6 years or so) — neither known sample year had one, so there's no
// evidence either way. If a future year's real dates ever come out different
// from what this generates, the fix is a single override below, not a rewrite.
const FY_ANCHOR_YEAR    = 2026;              // the "April" label's calendar year for the anchor
const FY_ANCHOR_START   = '2026-02-09';      // verified: start of "April 2026", from the user's own spreadsheet
const FY_WEEK_PATTERN   = [4,5,4,4,5,4,4,5,4,4,5,4]; // weeks per period, in order
const FY_MONTH_LABELS   = ['April','May','June','July','August','September','October','November','December','January','February','March'];
const FY_SHORT_LABELS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

// Known corrections for years where the simple 364-day rule doesn't hold —
// e.g. a 53-week year. Empty for now since no such year has been confirmed;
// add an entry here (fyStartCalendarYear -> explicit period list) if/when one is.
const FY_OVERRIDES = {};

const addDaysToISO = (iso, days) => {
  const d = new Date(iso+'T12:00:00Z'); // noon UTC sidesteps DST edge cases
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
};

const generateFYPeriods = (fyStartCalendarYear) => {
  if (FY_OVERRIDES[fyStartCalendarYear]) return FY_OVERRIDES[fyStartCalendarYear];
  const yearOffset = fyStartCalendarYear - FY_ANCHOR_YEAR;
  let cursor = addDaysToISO(FY_ANCHOR_START, yearOffset*364);
  return FY_WEEK_PATTERN.map((weeks,i)=>{
    const start = cursor;
    const end = addDaysToISO(start, weeks*7-1);
    const labelYear = i<9 ? fyStartCalendarYear : fyStartCalendarYear+1;
    cursor = addDaysToISO(end, 1);
    return { month:`${FY_MONTH_LABELS[i]} ${labelYear}`, short:FY_SHORT_LABELS[i], start, end };
  });
};

// Which FY-start calendar year contains a given date — e.g. 2 Aug 2026 falls
// within the year labelled "April 2026" onward, so this returns 2026.
const getFYStartYearFor = (dateISO) => {
  const daysSinceAnchor = Math.floor((new Date(dateISO+'T12:00:00Z') - new Date(FY_ANCHOR_START+'T12:00:00Z')) / 86400000);
  return FY_ANCHOR_YEAR + Math.floor(daysSinceAnchor/364);
};

const CURRENT_FY_YEAR = getFYStartYearFor(new Date().toISOString().split('T')[0]);
const PAY_PERIODS = generateFYPeriods(CURRENT_FY_YEAR);
const FY_START = PAY_PERIODS[0].start;
const FY_END   = PAY_PERIODS[11].end;

// Cloud retention: current financial year plus the 3 most recent (4 FYs
// total). This is a CLOUD-ONLY policy — local storage on the device is
// never pruned and can hold data indefinitely, however far back it goes.
const CLOUD_RETENTION_CUTOFF = generateFYPeriods(CURRENT_FY_YEAR - 3)[0].start;
const isWithinCloudRetention = (dateISO) => dateISO >= CLOUD_RETENTION_CUTOFF;

// Shared by both the mobile bottom nav and the wide-screen sidebar — one
// list, so the two can never disagree about what the tabs are.
const NAV_TABS = [
  {id:'dashboard',n:'home', lbl:'Home'},
  {id:'add',      n:'plus', lbl:'Log Overtime'},
  {id:'months',   n:'cal',  lbl:'Summary'},
  {id:'carms',    n:'check', lbl:'CARMS/PA'},
  {id:'graph',    n:'clock', lbl:'TOIL'},
  {id:'settings', n:'cog',  lbl:'More..'},
];
const RATE_CHANGE_DATE = '2026-09-01'; // new pay rates + night enhancement from here — a real pay-award date, not a pattern to generate

// ─── pay rates ────────────────────────────────────────────────────────────────
// Pre-Sept salaries are post ÷ 1.035 (3.5% pay rise from 1 Sep 2026).
// PC 1-3 pre-Sept use their own back-calculated figures (not Year 3 mapping).
const PAY_RATES = {
  Constable: {
    'PC 1': {
      salary: { pre:31159, post:32255 },
      pre:    { base:14.95, r133:19.88, r150:22.43, r200:29.89 },
      post:   { base:15.47, r133:20.58, r150:23.21, r200:30.94 },
    },
    'PC 2': {
      salary: { pre:32470, post:33609 },
      pre:    { base:15.57, r133:20.72, r150:23.36, r200:31.15 },
      post:   { base:16.12, r133:21.44, r150:24.18, r200:32.24 },
    },
    'PC 3': {
      salary: { pre:33786, post:34972 },
      pre:    { base:16.20, r133:21.55, r150:24.31, r200:32.41 },
      post:   { base:16.77, r133:22.30, r150:25.16, r200:33.54 },
    },
    'PC 4': {
      salary: { pre:35104, post:36335 },
      pre:    { base:16.86, r133:22.43, r150:25.24, r200:33.65 },
      post:   { base:17.42, r133:23.17, r150:26.13, r200:34.84 },
    },
    'PC 5': {
      salary: { pre:37737, post:39058 },
      pre:    { base:18.13, r133:24.11, r150:27.13, r200:36.17 },
      post:   { base:18.73, r133:24.91, r150:28.10, r200:37.46 },
    },
    'PC 6': {
      salary: { pre:43036, post:44544 },
      pre:    { base:20.68, r133:27.50, r150:30.94, r200:41.25 },
      post:   { base:21.36, r133:28.41, r150:32.04, r200:42.72 },
    },
    'PC 7 (top)': {
      salary: { pre:50255, post:52015 },
      pre:    { base:24.14, r133:32.11, r150:36.13, r200:48.17 },
      post:   { base:24.94, r133:33.17, r150:37.41, r200:49.88 },
    },
  },
  Sergeant: {
    'SGT 2 (on promotion)': {
      salary: { pre:53567, post:55443 },
      pre:    { base:25.73, r133:34.23, r150:38.51, r200:51.34 },
      post:   { base:26.59, r133:35.36, r150:39.89, r200:53.18 },
    },
    'SGT 3': {
      salary: { pre:54659, post:56573 },
      pre:    { base:26.26, r133:34.93, r150:39.29, r200:52.39 },
      post:   { base:27.13, r133:36.08, r150:40.70, r200:54.26 },
    },
    'SGT 4 (top)': {
      salary: { pre:56206, post:58175 },
      pre:    { base:27.01, r133:35.92, r150:40.40, r200:53.87 },
      post:   { base:27.90, r133:37.11, r150:41.85, r200:55.80 },
    },
  },
};

const PA_RATES   = { None:0, PA1:40, PA2:90, PA3:125 };

// ─── Record Shift Times (optional Notes convenience) ──────────────────────────
const toMinutesOfDay = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };

// A blank end-time equal to or earlier than start is treated as finishing the
// following day — matches how the app already handles overnight night-work.
const fmtShiftRange = (start, end) => {
  if (!start || !end) return null;
  const overnight = toMinutesOfDay(end) <= toMinutesOfDay(start);
  return `${start}–${end}${overnight ? ' (next day)' : ''}`;
};

const SHIFT_TIMES_MARKER = '⏱ ';

const generateShiftTimesLine = f => {
  if (!f.recordShiftTimes) return null;
  if (f.dutyType === 'rdw') {
    const a = fmtShiftRange(f.actualStart, f.actualEnd);
    if (!a) return null;
    return SHIFT_TIMES_MARKER + `Rest Day Working (RDW)  |  Actual: ${a}`;
  }
  const r = fmtShiftRange(f.rosteredStart, f.rosteredEnd);
  const a = fmtShiftRange(f.actualStart, f.actualEnd);
  if (!r && !a) return null;
  const parts = [];
  if (r) parts.push(`Rostered: ${r}`);
  if (a) parts.push(`Actual: ${a}`);
  return SHIFT_TIMES_MARKER + parts.join('  |  ');
};

// ─── Overtime auto-calculation from rostered vs actual shift times ───
// Overtime = how much longer the actual shift ran than the rostered one
// (duration comparison, not a clock-window comparison — an early start that's
// offset by an early finish of the same size produces zero overtime). On a
// Rest Day Working (RDW) shift there's no roster to compare against, so the
// whole actual shift is overtime.
const shiftDurationMinutes = (start, end) => {
  if (!start || !end) return 0;
  let s = toMinutesOfDay(start), e = toMinutesOfDay(end);
  if (e <= s) e += 1440; // overnight
  return e - s;
};

const calcAutoOTHours = f => {
  const actualDur = shiftDurationMinutes(f.actualStart, f.actualEnd);
  if (f.dutyType === 'rdw') return actualDur / 60;
  const rosteredDur = shiftDurationMinutes(f.rosteredStart, f.rosteredEnd);
  return Math.max(0, (actualDur - rosteredDur) / 60);
};

// Which of the three overtime rate tiers a given field name/key maps to —
// used to convert TOIL hours (worked) into TOIL hours (banked).
const RATE_TIER_MULT = { hours133:1.33, hours150:1.5, hours200:2.0 };

// ── display helpers — module scope, not inside the component, so they're
// never at risk of being referenced before their own declaration executes
// (e.g. from inside a useMemo defined earlier in the component body) ────────
const fmt    = n=>`£${n.toFixed(2)}`;
// Decimal hours → "HH.MM" where MM is minutes (0-59), not a decimal fraction —
// e.g. 21.5 (21h 30m) → "21.30", not "21.50".
const fmtHM  = n=>{
  const sign = n<0 ? '-' : '';
  const abs = Math.abs(n);
  let h = Math.floor(abs);
  let m = Math.round((abs-h)*60);
  if (m===60) { h+=1; m=0; }
  return `${sign}${h}.${String(m).padStart(2,'0')}`;
};
const fmtGBP = n=>`£${n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtD   = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});

// Keeps the auto-generated shift-times line in sync with the top of Notes,
// without disturbing anything else the person has typed underneath it.
const syncShiftTimesIntoForm = f => {
  const lines = (f.comments||'').split('\n');
  const hasMarker = lines[0] && lines[0].startsWith(SHIFT_TIMES_MARKER);
  const rest = hasMarker ? lines.slice(1).join('\n').replace(/^\n+/,'') : (f.comments||'');
  const line = generateShiftTimesLine(f);
  // Always a blank line after the generated line, even with nothing typed yet
  // below it — that blank line is where the cursor gets placed once the
  // actual shift end time is set.
  const comments = line ? `${line}\n\n${rest}` : rest;
  return { ...f, comments };
};
const PA_LABELS  = { None:'—', PA1:'£40', PA2:'£90', PA3:'£125' };

// ─── Met Police allowances ────────────────────────────────────────────────────
const LONDON_WEIGHTING = { pre:3150, post:3260 }; // pre/post 1 Sep 2026
const LONDON_ALLOWANCE = 6588;                     // fixed p.a.

// ─── UK income tax bands (2026/27) ────────────────────────────────────────────
// Thresholds are pro-rated to the pay period, mirroring how cumulative PAYE
// actually works: by period 6 you've had 6/12 of your personal allowance and
// 6/12 of each band. Comparing cumulative pay against FULL annual thresholds
// (the old approach) understated tax badly until the very end of the year.
const calcUKIncomeTax = (cumGross, yearFraction=1) => {
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
const calcUKIncomeTaxNoTaper = (cumGross, yearFraction=1) => {
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
const NI_PT  = 12570 / 12;  // primary threshold, monthly
const NI_UEL = 50270 / 12;  // upper earnings limit, monthly
const calcNI = periodGross => {
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
const estimateAnnualNI = grossAnnual => {
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
const computeTaxBandBreakdown = (gross, yearFraction=1) => {
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
const pensionTierRate = annualPensionablePay => {
  if (annualPensionablePay <= 37035) return 0.1288;
  if (annualPensionablePay < 79588) return 0.1388;
  return 0.1422;
};
const calcPensionContribution = (pensionablePay, yearFraction=1) => {
  const f = Math.max(1/365, Math.min(1, yearFraction));
  const annualised = pensionablePay / f;
  const rate = pensionTierRate(annualised);
  return { rate, amount: pensionablePay * rate };
};

// Named bands, used to tell the person plainly which bracket their overtime/PA
// lands in, rather than a blended "effective %" figure.
const TAX_BANDS = [
  { name:'Personal Allowance', min:0,      rate:0  },
  { name:'Basic Rate',         min:12570,  rate:20 },
  { name:'Higher Rate',        min:50270,  rate:40 },
  { name:'Additional Rate',    min:125140, rate:45 },
];
const getTaxBand = (cumulativeGross, yearFraction=1) => {
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
const applyBandTax = (cumulativeBefore, amount, yearFraction=1, periodGrossBefore=null) => {
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
const splitAcrossBands = (cumulativeBefore, amount) => {
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

const daysInclusive = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

// Builds a Monday-start week grid for a pay period, with null padding cells
// before/after so the days line up correctly under Mo-Su column headers.
const buildCalendarWeeks = (period) => {
  const start = new Date(period.start+'T12:00:00');
  const end   = new Date(period.end+'T12:00:00');
  const startDow = (start.getDay()+6)%7; // Monday=0
  const days = [];
  for (let i=0;i<startDow;i++) days.push(null);
  let cursor = new Date(start);
  while (cursor <= end) { days.push(new Date(cursor)); cursor.setDate(cursor.getDate()+1); }
  while (days.length%7!==0) days.push(null);
  const weeks = [];
  for (let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
  return weeks;
};

// ─── UK tax year (6 April – 5 April) ───────────────────────────────────────────
// This is what actually governs personal allowance/tax band resets — it's
// different from the force's own pay-year (which starts 9 Feb per PAY_PERIODS
// above). For anything tax-related we anchor to the REAL tax year, not the
// pay-year.
const getUKTaxYearStart = dateStr => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const apr6ThisYear = `${y}-04-06`;
  return dateStr >= apr6ThisYear ? apr6ThisYear : `${y-1}-04-06`;
};
const addYearMinusOneDay = dateStr => {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear()+1);
  d.setDate(d.getDate()-1);
  return d.toISOString().split('T')[0];
};
// How far into the UK tax year CONTAINING this date we are, as a continuous
// 0-1 fraction (6 Apr = just past 0, 5 Apr next year = 1). Used to pro-rate
// annual PA/band thresholds for a specific date, regardless of which pay
// period it happens to fall in.
const taxYearFractionForDate = dateStr => {
  const tys = getUKTaxYearStart(dateStr);
  const days = Math.max(0, (new Date(dateStr) - new Date(tys))/86400000) + 1;
  return Math.max(1/365, Math.min(1, days/365));
};

// Salary (and similar annual amounts like London Weighting/Allowance) is paid
// monthly in the real world, not smoothly by the day. This accrues a full
// month's pay for every calendar month that's fully completed within the
// given range, and pro-rates only the partially-completed edge months —
// so the YTD figure steps up once per payday rather than creeping up daily.
const monthlySteppedAmount = (annualAmount, rangeStartStr, rangeEndStr) => {
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
const monthlySteppedSplitBySept = (annualPre, annualPost, rangeStartStr, rangeEndStr) => {
  if (!rangeStartStr || !rangeEndStr || rangeEndStr < rangeStartStr) return 0;
  if (rangeEndStr < RATE_CHANGE_DATE)   return monthlySteppedAmount(annualPre, rangeStartStr, rangeEndStr);
  if (rangeStartStr >= RATE_CHANGE_DATE) return monthlySteppedAmount(annualPost, rangeStartStr, rangeEndStr);
  const d = new Date(RATE_CHANGE_DATE); d.setDate(d.getDate()-1);
  const dayBeforeChange = d.toISOString().split('T')[0];
  return monthlySteppedAmount(annualPre, rangeStartStr, dayBeforeChange) + monthlySteppedAmount(annualPost, RATE_CHANGE_DATE, rangeEndStr);
};

// Salary + London Weighting + London Allowance for one pay period, pro-rated
// across the 1 Sep 2026 rate change if the period spans it.
const periodBaseAmount = (p, svcData) => {
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

// ─── rate helper ──────────────────────────────────────────────────────────────
// Returns the correct rate set for a given pay point and entry date.
const getRates = (rank, service, date) => {
  const empty = { base:0, r133:0, r150:0, r200:0 };
  if (!rank || !service || !date) return empty;
  const grp = PAY_RATES[rank];
  if (!grp) return empty;
  const svc = grp[service];
  if (!svc) return empty;
  return date >= RATE_CHANGE_DATE ? svc.post : svc.pre;
};

// ─── storage ──────────────────────────────────────────────────────────────────
const KEYS = {
  entries:'ajs_ot_entries', settings:'ajs_ot_settings',
  backupCount:'ajs_ot_backupCount', backedUpAt:'ajs_ot_backedUpAt',
  lastBackupReminder:'ajs_ot_lastBackupReminder',
  defaultBreakdownView:'ajs_ot_defaultBreakdownView',
  toilTaken:'ajs_ot_toilTaken',
  lastSeenFYYear:'ajs_ot_lastSeenFYYear',
  lastSyncedEntries:'ajs_ot_lastSyncedEntries',
  lastSyncedToilTaken:'ajs_ot_lastSyncedToilTaken',
  lastSyncedSettings:'ajs_ot_lastSyncedSettings',
  lastCloudPruneCheck:'ajs_ot_lastCloudPruneCheck',
};
const dualWrite = (key, val) => {
  const s = JSON.stringify(val);
  try { localStorage.setItem(key,s); }   catch(_){}
  try { sessionStorage.setItem(key,s); } catch(_){}
};
const dualRead = (key, fb) => {
  try { const v=localStorage.getItem(key);   if(v) return JSON.parse(v); } catch(_){}
  try { const v=sessionStorage.getItem(key); if(v) return JSON.parse(v); } catch(_){}
  return fb;
};

// ─── auth: supabase client ─────────────────────────────────────────────────────
// PHASE 1 SCOPE: sign in / sign up / sign out / local-only mode only.
// Entries, toilTaken and settings still live purely in localStorage at this
// stage — nothing is encrypted or synced to Supabase yet. That's phase 2,
// once the data-key wrap/unwrap functions exist, so a signed-in account
// doesn't imply "your data is backed up" until that lands.
let supabaseUrl, supabaseAnonKey;
try {
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
} catch(_){}
// If the environment variables are missing or malformed, supabase stays null
// rather than throwing — the app falls back to local-only behaviour instead
// of a blank white screen. Every call site below checks for this.
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// ─── crypto: data key wrap/unwrap ──────────────────────────────────────────
// Every user's shift data is encrypted with a single random "data key" (DEK),
// generated once at sign-up. The DEK itself never leaves the device in the
// clear — it's wrapped (encrypted) by a key derived from the login password,
// AND separately wrapped again by a key derived from the recovery word.
// Either secret alone is enough to unwrap the same DEK; losing one doesn't
// affect the other. Supabase only ever stores the wrapped (still-encrypted)
// copies — it never sees the DEK, the password, or the recovery word.
// Verified independently (round-trip via both paths, wrong-secret rejection,
// uniqueness of salts/IVs) before being wired in here — see build notes.
const _enc = new TextEncoder();
const _dec = new TextDecoder();
const b64encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const b64decode = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function deriveKekFromSecret(secret, saltB64, iterations) {
  const salt = b64decode(saltB64);
  const keyMaterial = await crypto.subtle.importKey('raw', _enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['wrapKey', 'unwrapKey']
  );
}
const randomSaltB64 = () => b64encode(crypto.getRandomValues(new Uint8Array(16)));
const generateDataKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

// Wraps dataKey under a secret (password or recovery word). Returns a single
// base64 blob (IV + wrapped key bytes, concatenated) plus the salt used —
// matches the schema's wrapped_dek / kek_salt columns exactly, no extra IV
// column needed.
async function wrapDataKey(dataKey, secret, iterations) {
  const salt = randomSaltB64();
  const kek = await deriveKekFromSecret(secret, salt, iterations);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedBytes = new Uint8Array(await crypto.subtle.wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv }));
  const combined = new Uint8Array(iv.length + wrappedBytes.length);
  combined.set(iv, 0);
  combined.set(wrappedBytes, iv.length);
  return { wrapped: b64encode(combined), salt };
}

async function unwrapDataKey(wrappedB64, saltB64, secret, iterations) {
  const kek = await deriveKekFromSecret(secret, saltB64, iterations);
  const combined = b64decode(wrappedB64);
  const iv = combined.slice(0, 12);
  const wrappedBytes = combined.slice(12);
  return crypto.subtle.unwrapKey(
    'raw', wrappedBytes, kek, { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}

// Encrypts/decrypts the actual row payloads (entries, toilTaken, settings)
// under the (already-unwrapped, in-memory) data key. Same IV-bundled blob
// pattern, matching the ciphertext text column.
async function encryptWithDataKey(dataKey, plainObj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = _enc.encode(JSON.stringify(plainObj));
  const ctBytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, plaintextBytes));
  const combined = new Uint8Array(iv.length + ctBytes.length);
  combined.set(iv, 0);
  combined.set(ctBytes, iv.length);
  return b64encode(combined);
}

async function decryptWithDataKey(dataKey, blobB64) {
  const combined = b64decode(blobB64);
  const iv = combined.slice(0, 12);
  const ctBytes = combined.slice(12);
  const plaintextBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dataKey, ctBytes);
  return JSON.parse(_dec.decode(plaintextBytes));
}

// Recovery-word validation: 5+ characters, not on a short blocklist of
// obviously-guessable words. At this length the blocklist is doing most of
// the real work, not the length check — deliberate trade-off, not an
// oversight.
const RECOVERY_MIN_LENGTH = 5;
const RECOVERY_BLOCKLIST = ['password','overtime','shift','shift1','police','london','metro','12345','qwerty','letmein','admin','welcome','abcde','testy'];
const PASSWORD_KDF_ITERATIONS = 210000; // used every sign-in, cost stays invisible
const RECOVERY_KDF_ITERATIONS = 600000; // used maybe once ever, so it can afford to be slower

// Migrate settings if they contain old rank names from a previous version
const migrateSettings = s => {
  const def = { rank:'', service:'' };
  if (!s) return def;
  const validRanks = Object.keys(PAY_RATES);
  if (!validRanks.includes(s.rank)) return def;
  const validServices = Object.keys(PAY_RATES[s.rank]||{});
  if (!validServices.includes(s.service)) return def;
  return { rank:s.rank, service:s.service };
};

// CARMS submission tracking predates this migration for any entry already
// on the device — defaulting those to "submitted" rather than suddenly
// flagging years of past shifts as outstanding. Only entries created going
// forward start out genuinely unsubmitted (see blankForm). Submission dates
// default to the shift's own date for the same reason — there's no real
// record of when a pre-existing entry was actually submitted, and falling
// back to the shift date keeps historical period attribution exactly where
// it already was rather than silently reshuffling old pay periods.
const migrateEntries = list => (list||[]).map(e => ({
  ...e,
  otSubmitted: e.otSubmitted===undefined ? true : e.otSubmitted,
  paSubmitted: e.paSubmitted===undefined ? true : e.paSubmitted,
  otSubmittedDate: e.otSubmittedDate || e.date,
  paSubmittedDate: e.paSubmittedDate || e.date,
}));

// ─── icon component ───────────────────────────────────────────────────────────
const Ico = ({ n, s=20, c, w=2, f='none' }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={f} stroke={c||'currentColor'}
       strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    {n==='home'  &&<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
    {n==='plus'  &&<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
    {n==='cog'   &&<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}
    {n==='edit'  &&<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}
    {n==='trash' &&<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>}
    {n==='save'  &&<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>}
    {n==='clock' &&<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
    {n==='coffee' &&<><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>}
    {n==='checklist' &&<><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 13 1.5 1.5L13.5 11"/><path d="M9 18h6"/></>}
    {n==='cash' &&<><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.3"/><path d="M6 12h.01M18 12h.01"/></>}
    {n==='cR'    &&<polyline points="9 18 15 12 9 6"/>}
    {n==='cL'    &&<polyline points="15 18 9 12 15 6"/>}
    {n==='cU'    &&<polyline points="18 15 12 9 6 15"/>}
    {n==='cD'    &&<polyline points="6 9 12 15 18 9"/>}
    {n==='list'  &&<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>}
    {n==='star'  &&<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
    {n==='cal'   &&<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
    {n==='bar'   &&<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>}
    {n==='uPlus' &&<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>}
    {n==='check' &&<polyline points="20 6 9 17 4 12"/>}
    {n==='shield'&&<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
    {n==='calc'  &&<><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M16 14h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M16 18h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></>}
    {n==='back'  &&<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>}
    {n==='undo'  &&<><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.31"/></>}
    {n==='x'     &&<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
    {n==='dl'    &&<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}
    {n==='ul'    &&<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>}
    {n==='mail'  &&<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></>}
    {n==='table' &&<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></>}
    {n==='doc'   &&<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}
    {n==='share' &&<><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>}
    {n==='bell'  &&<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
    {n==='refresh'&&<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>}
    {n==='user'&&<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>}
  </svg>
);

// ─── toast stack ──────────────────────────────────────────────────────────────
// Original cartoon-style £50 note icon for the header. Deliberately generic —
// no portrait, no Bank of England insignia, no reproduced security features —
// just enough banknote "character" (gradient, see-through window motif,
// guilloche-style texture, serif denomination) to read clearly at a glance.
function ClockCashIcon({ width=28, height=19 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 44 30" style={{flexShrink:0}}>
      <defs>
        <linearGradient id="noteGradFront" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e"/>
          <stop offset="60%" stopColor="#16a34a"/>
          <stop offset="100%" stopColor="#15803d"/>
        </linearGradient>
      </defs>

      {/* clock */}
      <circle cx="12" cy="13" r="10" fill="#fff" stroke="#1e3a5f" strokeWidth="2"/>
      <g stroke="#1e3a5f" strokeWidth="1" strokeLinecap="round">
        <line x1="12" y1="4.3" x2="12" y2="6"/>
        <line x1="12" y1="20" x2="12" y2="21.7"/>
        <line x1="3.3" y1="13" x2="5" y2="13"/>
        <line x1="19" y1="13" x2="20.7" y2="13"/>
      </g>
      <line x1="12" y1="13" x2="12" y2="7.8" stroke="#1e3a5f" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="12" y1="13" x2="15.6" y2="10.2" stroke="#2563eb" strokeWidth="1.7" strokeLinecap="round"/>
      <circle cx="12" cy="13" r="1.1" fill="#1e3a5f"/>

      {/* three-bill stack, overlapping the clock's bottom-right */}
      <rect x="19" y="19" width="23" height="9" rx="1.6" fill="#136534" stroke="#0f3d21" strokeWidth="0.6"/>
      <rect x="18" y="17" width="23" height="9" rx="1.6" fill="#178a41" stroke="#0f3d21" strokeWidth="0.6"/>
      <rect x="17" y="15" width="23" height="9" rx="1.6" fill="url(#noteGradFront)" stroke="#0f3d21" strokeWidth="0.7"/>
      <text x="28.5" y="23" textAnchor="middle" fontFamily="Georgia,'Times New Roman',serif" fontSize="10" fontWeight="900" fill="#f0fdf4">£</text>
    </svg>
  );
}

const TIME_HOURS = Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
const TIME_MINUTES = ['00','15','30','45'];

// Simplified fire-exit-sign pictogram — running figure heading through a
// doorway, with a directional arrow — evoking the standard green exit
// sign. White strokes/fills throughout, meant to sit on a green backdrop.
function FireExitIcon({ size=20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="4" r="1.7" fill="#fff"/>
      <path d="M6.5 6 L8 11" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M8 11 L10.5 13 L9.5 16.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M8 11 L4.8 13 L4 11.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M7 7.3 L9.8 6.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M6.8 7.6 L4.8 9.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/>
      <rect x="15.5" y="2.5" width="6.5" height="19" rx="0.6" stroke="#fff" strokeWidth="1.4"/>
      <path d="M11.5 12 H19" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M16.3 9 L19.3 12 L16.3 15" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Two small selects (hour, then minute) rather than one 96-option list —
// picking "21" then "45" is much faster than scrolling to find "21:45".
// Combines back into the same "HH:MM" string the rest of the app expects,
// so nothing downstream needs to know the UI is split.
function TimeSelect({ value, onChange }) {
  const [h,m] = value ? value.split(':') : ['',''];
  const selStyle = {flex:1,background:'#fff',border:'1px solid #dbeafe',padding:'9px 6px',borderRadius:'10px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',color:'#0f172a',height:'42px'};
  return (
    <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
      <select style={selStyle} value={h} onChange={e=>{
        const newH = e.target.value;
        onChange(newH ? `${newH}:${m||'00'}` : (m ? `00:${m}` : ''));
      }}>
        <option value="">HH</option>
        {TIME_HOURS.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <span style={{fontWeight:900,fontSize:'15px',color:'#94a3b8',flexShrink:0}}>:</span>
      <select style={selStyle} value={m} onChange={e=>{
        const newM = e.target.value;
        onChange(h ? `${h}:${newM||'00'}` : (newM ? `00:${newM}` : ''));
      }}>
        <option value="">MM</option>
        {TIME_MINUTES.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  return (
    <div style={{position:'absolute',top:'72px',left:'50%',transform:'translateX(-50%)',zIndex:999,display:'flex',flexDirection:'column',gap:'7px',width:'calc(100% - 24px)',maxWidth:'390px',pointerEvents:'none'}}>
      {toasts.map(t=>{
        // 'alert' gets an enlarged layout — charcoal with a red accent bar, a
        // bold title, an explanatory line and a full-width action button.
        // Used where the app is redirecting the person rather than just
        // confirming something, so it needs to actually stop them.
        if(t.type==='alert'){
          return (
            <div key={t.id} style={{background:'#0f172a',color:'#fff',borderRadius:'16px',padding:'15px 16px 15px 13px',borderLeft:'5px solid #ef4444',boxShadow:'0 6px 26px rgba(15,23,42,0.42)',animation:'su 0.22s ease',pointerEvents:'all'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'11px',marginBottom:t.action?'12px':0}}>
                <div style={{background:'rgba(239,68,68,0.22)',borderRadius:'10px',padding:'7px',flexShrink:0,display:'flex'}}>
                  <Ico n="uPlus" s={17} c="#f87171" w={2.5}/>
                </div>
                <div style={{flex:1}}>
                  {t.title&&<div style={{fontSize:'14px',fontWeight:900,marginBottom:'3px'}}>{t.title}</div>}
                  <div style={{fontSize:'12px',fontWeight:600,color:'#cbd5e1',lineHeight:1.45}}>{t.message}</div>
                </div>
                {/* dismiss — purely to get the banner out of the way */}
                <button onClick={()=>onDismiss&&onDismiss(t.id)} aria-label="Dismiss" style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'8px',padding:'6px',cursor:'pointer',flexShrink:0,display:'flex',alignSelf:'flex-start'}}>
                  <Ico n="x" s={14} c="#94a3b8"/>
                </button>
              </div>
              {t.action&&<button onClick={t.action.fn} style={{background:'#ef4444',border:'none',borderRadius:'9px',padding:'10px',color:'#fff',fontWeight:900,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'0.5px',width:'100%'}}>{t.action.label}</button>}
            </div>
          );
        }
        return (
          <div key={t.id} style={{background:t.type==='undo'?'#1e3a5f':t.type==='warn'?'#b45309':'#065f46',color:'#fff',borderRadius:'14px',padding:'11px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',boxShadow:'0 4px 20px rgba(0,0,0,0.22)',animation:'su 0.22s ease',pointerEvents:'all'}}>
            <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
              {(t.type==='undo'||t.type==='warn')&&<Ico n={t.type==='undo'?'undo':'bell'} s={15} c="#fff"/>}
              <span style={{fontSize:'13px',fontWeight:700}}>{t.message}</span>
            </div>
            {t.action&&<button onClick={t.action.fn} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:'8px',padding:'4px 10px',color:'#fff',fontWeight:900,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap'}}>{t.action.label}</button>}
          </div>
        );
      })}
    </div>
  );
}

// ─── auth screens ───────────────────────────────────────────────────────────
// Phase 1 scope: sign in, sign up, forgot-password request, and the
// local-only escape hatch. Recovery-secret setup and real cloud sync of
// entries/toilTaken/settings are phase 2, once the data-key wrap/unwrap
// functions exist — signing up here does not yet mean data is backed up.
function AuthScreens({ supabase, addToast, setAuthFlowBusy, onUnlocked, startInPasswordRecovery, onRecoveryComplete, isWide }) {
  const [screen, setScreen]         = useState(startInPasswordRecovery ? 'set-new-password' : 'signin'); // 'signin' | 'signup' | 'forgot' | 'recovery-setup' | 'set-new-password' | 'recovery-unlock'
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [password2, setPassword2]   = useState('');
  const [recoveryWord, setRecoveryWord] = useState('');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [noRecoveryWarning, setNoRecoveryWarning] = useState(false);

  const AS = {
    // Dark blue page — deliberately different from the rest of the app's
    // light theme, matching the brand-moment treatment requested for this
    // screen specifically. #0f2744 matches the app's own theme-color, so
    // it's not a new colour being introduced, just used at page-scale here.
    page: {display:'flex',flexDirection:'column',minHeight:'100dvh',maxWidth:isWide?'none':'430px',margin:'0 auto',background:'#0f2744',fontFamily:"'DM Sans',system-ui,sans-serif",color:'#0f172a',boxSizing:'border-box',position:'relative',overflowY:'auto'},
    cardWrap: {flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',position:'relative',zIndex:1,minHeight:0},
    card: {width:'100%',maxWidth:isWide?'460px':'none',background:'#fff',borderRadius:'18px',padding:isWide?'34px 30px 28px':'26px 22px 22px',boxShadow:'0 12px 34px rgba(0,0,0,0.28)',boxSizing:'border-box'},
    label:{display:'block',fontSize:'9px',color:'#64748b',margin:'0 0 6px',fontWeight:900,textTransform:'uppercase',letterSpacing:'1.5px'},
    input:{width:'100%',background:'#f8fafc',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a',marginBottom:'14px'},
    err:{fontSize:'12px',color:'#dc2626',margin:'-10px 0 14px',fontWeight:700},
    btn:{width:'100%',padding:'13px 0',borderRadius:'13px',border:'none',fontFamily:'inherit',fontSize:'11px',fontWeight:900,cursor:'pointer',background:'#2563eb',color:'#fff',textTransform:'uppercase',letterSpacing:'1px'},
    btnGhost:{width:'100%',padding:'13px 0',borderRadius:'13px',border:'1px solid #f1f5f9',fontFamily:'inherit',fontSize:'11px',fontWeight:900,cursor:'pointer',background:'#fff',color:'#64748b',marginTop:'10px',textTransform:'uppercase',letterSpacing:'1px'},
    linkRow:{textAlign:'center',marginTop:'14px',fontSize:'13px',color:'#94a3b8',fontWeight:700},
    link:{color:'#2563eb',cursor:'pointer'},
    note:{display:'flex',gap:'9px',background:'#f5f3ff',borderRadius:'13px',padding:'12px 13px',marginBottom:'16px',fontSize:'12.5px',lineHeight:1.5,color:'#6d28d9',fontWeight:600},
    divider:{display:'flex',alignItems:'center',justifyContent:'center',gap:'10px',margin:'14px 0',fontSize:'11.5px',color:'#94a3b8',fontWeight:700},
  };

  const validEmail = /\S+@\S+\.\S+/.test(email);

  const handleSignIn = async () => {
    setError('');
    if (!validEmail) { setError('Enter a valid email address'); return; }
    setBusy(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setBusy(false); setError(err.message); return; }
    // Covers an account that signed up but never finished recovery-secret
    // setup (e.g. email confirmation delayed the first real session).
    const { data: keyRow } = await supabase.from('user_keys')
      .select('wrapped_dek, kek_salt, kek_iterations')
      .eq('user_id', data.user.id).maybeSingle();
    if (!keyRow) {
      setBusy(false);
      if (setAuthFlowBusy) setAuthFlowBusy(true);
      setScreen('recovery-setup');
      return;
    }
    try {
      const dek = await unwrapDataKey(keyRow.wrapped_dek, keyRow.kek_salt, password, keyRow.kek_iterations);
      setBusy(false);
      setPassword('');
      if (onUnlocked) onUnlocked(dek);
    } catch (e) {
      // Password was accepted by Supabase Auth but couldn't unwrap the data
      // key — should only happen if the row's been corrupted or tampered
      // with, not from a normal wrong-password case (that fails at
      // signInWithPassword, above, before this point is ever reached).
      setBusy(false);
      setError('Signed in, but couldn\u2019t unlock your data — contact support rather than retrying blindly.');
    }
  };

  const handleSignUp = async () => {
    setError('');
    if (!validEmail) { setError('Enter a valid email address'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== password2) { setError('Passwords do not match'); return; }
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (!data.session) {
      // Email confirmation required — no session yet, nowhere safe to write
      // key material. Setup resumes on first sign-in instead, above.
      if (addToast) addToast('Check your email to confirm your account, then sign in.', 'success', null, 6000, 'Almost there');
      setScreen('signin');
      return;
    }
    if (setAuthFlowBusy) setAuthFlowBusy(true);
    setScreen('recovery-setup');
    // password intentionally stays in state — it's needed to wrap the data key next
  };

  const recoveryTooCommon = RECOVERY_BLOCKLIST.includes(recoveryWord.toLowerCase());

  const handleRecoverySetup = async () => {
    setError('');
    if (recoveryWord.length < RECOVERY_MIN_LENGTH) { setError(`Must be at least ${RECOVERY_MIN_LENGTH} letters`); return; }
    if (recoveryTooCommon) { setError('Too common — choose something less predictable'); return; }
    setBusy(true);
    try {
      const dek = await generateDataKey();
      const passWrap = await wrapDataKey(dek, password, PASSWORD_KDF_ITERATIONS);
      const recWrap  = await wrapDataKey(dek, recoveryWord, RECOVERY_KDF_ITERATIONS);
      const { data: sessionData } = await supabase.auth.getSession();
      const { error: err } = await supabase.from('user_keys').upsert({
        user_id: sessionData.session.user.id,
        wrapped_dek: passWrap.wrapped,
        kek_salt: passWrap.salt,
        kek_iterations: PASSWORD_KDF_ITERATIONS,
        wrapped_dek_recovery: recWrap.wrapped,
        recovery_salt: recWrap.salt,
        recovery_iterations: RECOVERY_KDF_ITERATIONS,
      });
      setBusy(false);
      if (err) { setError(err.message); return; }
      setPassword(''); setRecoveryWord('');
      if (addToast) addToast('Recovery secret saved — you\u2019re all set', 'success', null, 4000, 'Ready to go');
      if (setAuthFlowBusy) setAuthFlowBusy(false);
      if (onUnlocked) onUnlocked(dek);
      if (onRecoveryComplete) onRecoveryComplete();
    } catch (e) {
      setBusy(false);
      setError('Something went wrong setting up encryption \u2014 try again');
    }
  };

  const handleForgotRequest = async () => {
    setError('');
    if (!validEmail) { setError('Enter a valid email address'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setForgotSent(true);
  };

  // Reached after clicking the link in a reset email. Supabase already has
  // a temporary session at this point (see the PASSWORD_RECOVERY handling
  // in the parent) — this just sets the actual new password. The old data
  // key is still wrapped under the OLD password after this succeeds; that's
  // resolved next, in handleRecoveryUnlock.
  const handleSetNewPassword = async () => {
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== password2) { setError('Passwords do not match'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setPassword2('');
    setScreen('recovery-unlock');
    // `password` intentionally stays in state — it's the new password,
    // needed below to re-wrap the data key once the recovery word unlocks it.
  };

  // Unwraps the existing data key via the recovery-word path, then re-wraps
  // that SAME key under the new password. The data key itself never
  // changes here — only which secrets can unwrap it — so nothing already
  // encrypted under it needs touching.
  const handleRecoveryUnlock = async () => {
    setError('');
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session.user.id;
      const { data: keyRow, error: fetchErr } = await supabase.from('user_keys')
        .select('wrapped_dek_recovery, recovery_salt, recovery_iterations')
        .eq('user_id', uid).maybeSingle();
      if (fetchErr || !keyRow) throw new Error('missing key row');
      const dek = await unwrapDataKey(keyRow.wrapped_dek_recovery, keyRow.recovery_salt, recoveryWord, keyRow.recovery_iterations);
      const newPassWrap = await wrapDataKey(dek, password, PASSWORD_KDF_ITERATIONS);
      const { error: updateErr } = await supabase.from('user_keys').update({
        wrapped_dek: newPassWrap.wrapped,
        kek_salt: newPassWrap.salt,
        kek_iterations: PASSWORD_KDF_ITERATIONS,
      }).eq('user_id', uid);
      if (updateErr) throw updateErr;
      setBusy(false);
      setPassword(''); setRecoveryWord('');
      if (onUnlocked) onUnlocked(dek);
      if (onRecoveryComplete) onRecoveryComplete();
      if (addToast) addToast('Password reset and data unlocked', 'success', null, 4000, 'All set');
    } catch (e) {
      setBusy(false);
      setError('That recovery word didn\u2019t work \u2014 try again, or continue without your old data below.');
    }
  };

  return (
    <div style={AS.page}>
      <div style={AS.cardWrap}>
      <div style={AS.card}>
        {/* Title lives inside the card itself on this screen, rather than
            as a page-level header above it — colours suited to the card's
            white background, unlike the page's dark backdrop. */}
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'20px'}}>
          <ClockCashIcon width={26} height={18}/>
          <div style={{display:'flex',flexDirection:'column',lineHeight:1.2,minWidth:0}}>
            <span style={{fontSize:'17px',fontWeight:900,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',letterSpacing:'-0.4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Overtime &amp; Shift Tracker</span>
            <span style={{fontSize:'12px',fontWeight:700,color:'#94a3b8',letterSpacing:'0.2px'}}>by Adam Stephens</span>
          </div>
        </div>

        {screen === 'signin' && (
          <>
            <label style={AS.label}>Email</label>
            <input style={AS.input} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
            <label style={AS.label}>Password</label>
            <input style={AS.input} type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/>
            {error && <div style={AS.err}>{error}</div>}
            <button style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy} onClick={handleSignIn}>{busy?'Signing in…':'Sign in'}</button>
            <div style={AS.divider}>or</div>
            <button style={AS.btnGhost} onClick={()=>{ setScreen('signup'); setError(''); }}>Create account</button>
            <div style={AS.linkRow}><span style={AS.link} onClick={()=>{ setScreen('forgot'); setError(''); setForgotSent(false); }}>Forgot password?</span></div>
          </>
        )}

        {screen === 'signup' && (
          <>
            <label style={AS.label}>Email</label>
            <input style={AS.input} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
            <label style={AS.label}>Password</label>
            <input style={AS.input} type="password" placeholder="At least 8 characters" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
            <label style={AS.label}>Confirm password</label>
            <input style={AS.input} type="password" placeholder="••••••••" value={password2} onChange={e=>setPassword2(e.target.value)} autoComplete="new-password"/>
            <div style={AS.note}>
              <span>↻</span>
              <span><b>You'll set up a recovery secret next.</b> That protects your data if you ever forget your password.</span>
            </div>
            {error && <div style={AS.err}>{error}</div>}
            <button style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy} onClick={handleSignUp}>{busy?'Creating…':'Create account'}</button>
            <div style={AS.linkRow}>Already have an account? <span style={AS.link} onClick={()=>{ setScreen('signin'); setError(''); }}>Sign in</span></div>
          </>
        )}

        {screen === 'recovery-setup' && (
          <>
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Save your recovery secret</div>
            <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>If you ever forget your password, this word is the only other way back into your data. Nobody else has a copy of it — not even us.</div>

            <label style={AS.label}>Your recovery word</label>
            <input style={AS.input} type="text" placeholder="Something only you'd think of" autoComplete="off" value={recoveryWord} onChange={e=>setRecoveryWord(e.target.value)}/>
            <div style={{fontSize:'12px',color:recoveryWord.length>=RECOVERY_MIN_LENGTH?'#16a34a':'#94a3b8',margin:'-10px 0 6px',fontWeight:700}}>{recoveryWord.length} / {RECOVERY_MIN_LENGTH} characters minimum</div>
            {recoveryTooCommon && recoveryWord.length>0 && <div style={AS.err}>Too common — choose something less predictable</div>}
            {error && <div style={{...AS.err,marginTop:recoveryTooCommon?0:'-4px'}}>{error}</div>}

            <button style={{...AS.btn,opacity:busy?0.7:1,marginTop:'8px'}} disabled={busy} onClick={handleRecoverySetup}>{busy?'Saving…':'Save and continue'}</button>
          </>
        )}

        {screen === 'forgot' && !forgotSent && (
          <>
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Reset your password</div>
            <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>We'll email you a secure link to set a new password.</div>
            <label style={AS.label}>Email</label>
            <input style={AS.input} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
            {error && <div style={AS.err}>{error}</div>}
            <button style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy} onClick={handleForgotRequest}>{busy?'Sending…':'Send reset link'}</button>
            <div style={AS.linkRow}><span style={AS.link} onClick={()=>{ setScreen('signin'); setError(''); }}>Back to sign in</span></div>
          </>
        )}

        {screen === 'forgot' && forgotSent && (
          <>
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Check your email</div>
            <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>A reset link's on its way to {email}. Follow it to set a new password.</div>
            <button style={AS.btnGhost} onClick={()=>{ setScreen('signin'); setError(''); setForgotSent(false); }}>Back to sign in</button>
          </>
        )}

        {screen === 'set-new-password' && (
          <>
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Set a new password</div>
            <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>Choose a new password for your account.</div>
            <label style={AS.label}>New password</label>
            <input style={AS.input} type="password" placeholder="At least 8 characters" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/>
            <label style={AS.label}>Confirm new password</label>
            <input style={AS.input} type="password" placeholder="••••••••" value={password2} onChange={e=>setPassword2(e.target.value)} autoComplete="new-password"/>
            {error && <div style={AS.err}>{error}</div>}
            <button style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy} onClick={handleSetNewPassword}>{busy?'Saving…':'Set new password'}</button>
          </>
        )}

        {screen === 'recovery-unlock' && (
          <>
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Unlock your existing data</div>
            <div style={{fontSize:'13px',color:'#64748b',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>Your password's been reset. Enter your recovery word to restore access to your previous shifts and TOIL.</div>
            <label style={AS.label}>Recovery word</label>
            <input style={AS.input} type="text" placeholder="Enter your recovery word" autoComplete="off" value={recoveryWord} onChange={e=>setRecoveryWord(e.target.value)}/>
            {error && <div style={AS.err}>{error}</div>}
            <button style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy} onClick={handleRecoveryUnlock}>{busy?'Unlocking…':'Unlock my data'}</button>
            <div style={AS.linkRow}><span style={AS.link} onClick={()=>setNoRecoveryWarning(true)}>I don't have my recovery word</span></div>
            {noRecoveryWarning && (
              <div style={{marginTop:'12px'}}>
                <div style={{fontSize:'11.5px',color:'#dc2626',lineHeight:1.5,fontWeight:700,marginBottom:'10px'}}>Without it, your existing shifts and TOIL can't be recovered by anyone. You can continue and set up a fresh recovery word, but everything logged before this reset will be gone for good.</div>
                <button style={AS.btnGhost} onClick={()=>{ setError(''); setRecoveryWord(''); setNoRecoveryWarning(false); setScreen('recovery-setup'); }}>Continue without my old data</button>
              </div>
            )}
          </>
        )}

      </div>
      </div>
    </div>
  );
}


// ─── app ──────────────────────────────────────────────────────────────────────
export default function App() {
  const todayStr      = new Date().toISOString().split('T')[0];
  const currPeriodIdx = PAY_PERIODS.findIndex(p=>todayStr>=p.start&&todayStr<=p.end);

  const [tab,          setTab]          = useState('dashboard');
  const [entries,      setEntries]      = useState(()=>migrateEntries(dualRead(KEYS.entries,[])));
  const [toilTaken,    setToilTaken]    = useState(()=>dualRead(KEYS.toilTaken,[]));
  const [settings,     setSettings]     = useState(()=>migrateSettings(dualRead(KEYS.settings,null)));
  const [expanded,     setExpanded]     = useState(null);
  const [chartTap, setChartTap] = useState(null);     // {chart:'cum'|'mon', i, big}
  const [chartModal, setChartModal] = useState(null); // 'cum' | 'mon' | null
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState(null); // null (choosing) | 'pdf' | 'csv'
  const [payslipMode, setPayslipMode] = useState('period'); // 'period' | 'custom' | 'financialYear'
  const [payslipPeriodIdx, setPayslipPeriodIdx] = useState(null);
  const [payslipFYYear, setPayslipFYYear] = useState(null); // calendar FY-start-year selected in 'financialYear' export mode
  const [payslipStart, setPayslipStart] = useState('');
  const [payslipEnd, setPayslipEnd] = useState('');
  const [payslipPreview, setPayslipPreview] = useState(null); // { start, end, label, data } | null
  const [sanitiseNotes, setSanitiseNotes] = useState(true); // blank the Notes column on CSV export by default — safer given notes may hold operationally sensitive detail
  const [defaultBreakdownView, setDefaultBreakdownView] = useState(()=>dualRead(KEYS.defaultBreakdownView,'calendar'));
  const [breakdownView, setBreakdownView] = useState(()=>dualRead(KEYS.defaultBreakdownView,'calendar')); // 'list' | 'calendar'
  const [calPeriodIdx, setCalPeriodIdx] = useState(null); // set to currPeriodIdx on first render
  const [selectedCalDay, setSelectedCalDay] = useState(null);
  const [confirmCreateDay, setConfirmCreateDay] = useState(null);
  const [focusEntryId, setFocusEntryId] = useState(null);
  const [focusCarmsToggle, setFocusCarmsToggle] = useState(false);

  // Which period group in CARMS Outstanding should scroll into view and
  // pulse, set when jumping there from a "CARMS & MetHR pending" panel in
  // Summary — same scroll-and-fade pattern as focusEntryId/focusCarmsToggle.
  const [pulsePeriodIdx, setPulsePeriodIdx] = useState(null);
  const [editing,      setEditing]      = useState(null);
  const [wipeConf,     setWipeConf]     = useState(false);
  const [wipingData,   setWipingData]   = useState(false);
  const [deleteAcctConf, setDeleteAcctConf] = useState(false);
  const [deleteAcctTyped, setDeleteAcctTyped] = useState('');
  const [deletingAcct, setDeletingAcct] = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(null);
  const [toasts,       setToasts]       = useState([]);
  const [savedBadge,   setSavedBadge]   = useState(false);
  const [session,      setSession]      = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [dataKey,      setDataKey]      = useState(null); // unwrapped CryptoKey, in memory only, never persisted
  const [manualSyncing, setManualSyncing] = useState(false);

  // Width-based desktop detection — 960px chosen as "narrow laptop and up",
  // matching what the reviewed mockups were built against. This is purely
  // presentational: it changes which shell renders (sidebar+glance vs the
  // existing mobile chrome), never the underlying tab/data logic, which
  // stays identical either way.
  // isWide also covers phones/tablets rotated to landscape — without this,
  // a phone in landscape stays under the 960px desktop threshold and just
  // shows the narrow 430px mobile column centred in a lot of empty grey
  // space either side, rather than actually using the width it has.
  const computeIsWide = () => window.innerWidth>=960 || (window.innerWidth>window.innerHeight && window.innerWidth>=650);
  const [isWide, setIsWide] = useState(()=>typeof window!=='undefined' && computeIsWide());
  useEffect(()=>{
    const onResize = () => setIsWide(computeIsWide());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  },[]);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [showFYRollover, setShowFYRollover] = useState(false);
  const [fySummaryYear, setFySummaryYear] = useState(null); // calendar FY-start-year of the archived year being viewed, or null
  const [fySummaryPrintMode, setFySummaryPrintMode] = useState(false); // true when opened via Financial Year export (all periods expanded, Print button shown)
  const [archiveExpandedPeriod, setArchiveExpandedPeriod] = useState(null); // short label of the expanded period within that year, or null
  const [taxImpactExpanded, setTaxImpactExpanded] = useState(false);
  const [dataManagementExpanded, setDataManagementExpanded] = useState(false);
  const [salaryBreakdownExpanded, setSalaryBreakdownExpanded] = useState(false);
  // Navigating away from Home resets its expandable sections back to their
  // starting (collapsed) state, so returning to Home later doesn't leave
  // something open from a previous visit that's easy to forget was expanded.
  useEffect(()=>{ if (tab!=='dashboard') setSalaryBreakdownExpanded(false); },[tab]);
  const [taxCalcActualDetailOpen, setTaxCalcActualDetailOpen] = useState(false);
  const [taxCalcForecastDetailOpen, setTaxCalcForecastDetailOpen] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(false);
  const [exportDataExpanded, setExportDataExpanded] = useState(false);

  // Configuration must stay visibly open for as long as rank/pay point
  // setup is incomplete — that's the critical first-run flow, not
  // something a collapse toggle should be able to hide. The moment setup
  // actually completes, it's left open rather than snapping shut, since
  // the person was just looking at it.
  const configSetupIncomplete = !settings.rank || !settings.service;
  const prevConfigSetupIncompleteRef = useRef(configSetupIncomplete);
  useEffect(()=>{
    if (prevConfigSetupIncompleteRef.current && !configSetupIncomplete) {
      setConfigExpanded(true);
    }
    prevConfigSetupIncompleteRef.current = configSetupIncomplete;
  },[configSetupIncomplete]);
  const configShown = configExpanded || configSetupIncomplete;
  const [financialYearsExpanded, setFinancialYearsExpanded] = useState(false);
  const [pulseBackupBtn, setPulseBackupBtn] = useState(false);

  const mainRef   = useRef(null);
  const fileRef   = useRef(null);
  const monthRefs = useRef({});
  const stickyRef = useRef(null);
  const entryRefs = useRef({});
  const carmsToggleRef = useRef(null);
  const periodGroupRefs = useRef({});
  const calSwipeStartX = useRef(null);

  // Desktop-only custom date picker for the CARMS submission-date fields —
  // native <input type="date"> stays exactly as-is on mobile, where it
  // already works well. datePickerFor is null (closed) or 'ot'/'pa'
  // (which field it's editing); datePickerMonth is the YYYY-MM currently
  // shown, independent of the selected value so browsing doesn't move it.
  const [datePickerFor, setDatePickerFor] = useState(null);
  const [datePickerMonth, setDatePickerMonth] = useState(todayStr.slice(0,7));
  const notesRef = useRef(null);
  // What's already been pushed to Supabase, keyed by row id — compared
  // against on every local change so only genuinely new/edited/removed
  // items get pushed, not the whole array on every render. Hydrated from
  // localStorage on mount, and re-persisted on every mutation below —
  // without this, a plain page reload would forget everything this device
  // has ever actually synced, since useRef alone doesn't survive that.
  const lastSyncedEntriesRef = useRef(new Map(Object.entries(dualRead(KEYS.lastSyncedEntries,{}))));
  const lastSyncedToilRef = useRef(new Map(Object.entries(dualRead(KEYS.lastSyncedToilTaken,{}))));
  const lastSyncedSettingsRef = useRef(dualRead(KEYS.lastSyncedSettings,null));
  const persistLastSyncedEntries = () => dualWrite(KEYS.lastSyncedEntries, Object.fromEntries(lastSyncedEntriesRef.current));
  const persistLastSyncedToil = () => dualWrite(KEYS.lastSyncedToilTaken, Object.fromEntries(lastSyncedToilRef.current));
  const persistLastSyncedSettings = () => dualWrite(KEYS.lastSyncedSettings, lastSyncedSettingsRef.current);
  // Always-current mirrors of local state, for the async pull/realtime code
  // below — a value captured at the top of a useEffect can be stale by the
  // time an awaited call or an event callback actually runs.
  const entriesRef = useRef(entries);
  const toilTakenRef = useRef(toilTaken);
  const settingsRef = useRef(settings);
  useEffect(()=>{ entriesRef.current = entries; },[entries]);
  useEffect(()=>{ toilTakenRef.current = toilTaken; },[toilTaken]);
  useEffect(()=>{ settingsRef.current = settings; },[settings]);

  const blankForm = { date:todayStr, reason:'', hours133:'', hours150:'', hours200:'', paRate:'None', comments:'', recordShiftTimes:true, rosteredStart:'', rosteredEnd:'', actualStart:'', actualEnd:'', dutyType:'normal', otRateTier:'hours133', otAuto:true, takeAs:'pay', toilHours:'', otSubmitted:false, paSubmitted:false, otSubmittedDate:'', paSubmittedDate:'' };
  const [form, setForm] = useState(blankForm);

  // ── cloud push sync ──────────────────────────────────────────────────────
  // Local state (via dualWrite, below) stays the instant, source-of-truth
  // write — this only ever runs after that, in the background, and never
  // blocks or slows down anything the person sees. Diffs against what was
  // last pushed so an edit to one entry doesn't reupload every other one.
  // Deliberately no retry queue or offline detection yet — a failed push
  // here is silently dropped rather than lost data, since local storage
  // already has the real copy; that gap is closed by pull-and-merge on
  // sign-in, which is the next piece, not this one.
  async function pushRowChanges(table, items, lastSyncedRef, persistFn) {
    if (!supabase || !session || !dataKey) return;
    const uid = session.user.id;
    const currentIds = new Set(items.map(it => it.id));
    const toUpsert = items.filter(it => lastSyncedRef.current.get(it.id) !== JSON.stringify(it));
    const toDelete = Array.from(lastSyncedRef.current.keys()).filter(id => !currentIds.has(id));
    if (toUpsert.length === 0 && toDelete.length === 0) return;
    const now = new Date().toISOString();
    for (const item of toUpsert) {
      try {
        const ciphertext = await encryptWithDataKey(dataKey, item);
        const { error } = await supabase.from(table).upsert({ id: item.id, user_id: uid, ciphertext, updated_at: now, deleted_at: null });
        if (!error) { lastSyncedRef.current.set(item.id, JSON.stringify(item)); persistFn(); console.log(`[sync] pushed ${table} id=${item.id}`); }
        else console.error(`[sync] push failed for ${table} id=${item.id}:`, error.message || error);
      } catch (e) { console.error(`[sync] push threw for ${table} id=${item.id}:`, e.message || e); }
    }
    for (const id of toDelete) {
      const { error } = await supabase.from(table).update({ deleted_at: now, updated_at: now }).eq('id', id).eq('user_id', uid);
      if (!error) { lastSyncedRef.current.delete(id); persistFn(); }
      else console.error(`[sync] soft-delete failed for ${table} id=${id}:`, error.message || error);
    }
  }

  async function pushSettingsChange(settingsObj) {
    if (!supabase || !session || !dataKey) return;
    const json = JSON.stringify(settingsObj);
    if (lastSyncedSettingsRef.current === json) return;
    try {
      const ciphertext = await encryptWithDataKey(dataKey, settingsObj);
      const { error } = await supabase.from('settings').upsert({ user_id: session.user.id, ciphertext, updated_at: new Date().toISOString() });
      if (!error) { lastSyncedSettingsRef.current = json; persistLastSyncedSettings(); console.log('[sync] pushed settings'); }
      else console.error('[sync] push failed for settings:', error.message || error);
    } catch (e) { console.error('[sync] push threw for settings:', e.message || e); }
  }

  // ── cloud pull + merge ──────────────────────────────────────────────────
  // Runs once when the data key first becomes ready (a fresh sign-in or a
  // freshly-unlocked device), and again every time the realtime channel
  // (re)connects, to close whatever gap opened while disconnected.
  //
  // The merge rule reuses lastSyncedRef rather than needing a separate
  // per-item local timestamp: if a local item's JSON still matches what
  // this device last believes it pushed, there's no unsynced local edit,
  // so it's safe to take whatever the server has (which may be newer, from
  // another device). If the local JSON has since diverged, there's a
  // pending local edit — keep it, and the next push cycle will send it up.
  // An item that WAS synced before but is missing from the server now
  // means another device deleted it — dropped locally too, not resurrected.
  async function pullAndMergeRows(table, itemsRef, setLocalItems, lastSyncedRef, persistFn) {
    if (!supabase || !session || !dataKey) return;
    const uid = session.user.id;
    const { data: rows, error } = await supabase.from(table).select('id, ciphertext, deleted_at').eq('user_id', uid);
    if (error) { console.error(`[sync] pull failed for ${table}:`, error.message || error); return; }
    if (!rows) return;
    console.log(`[sync] pulled ${rows.length} row(s) from ${table}`);
    const remoteMap = new Map();
    let decryptFailures = 0;
    for (const row of rows) {
      if (row.deleted_at) continue;
      try { remoteMap.set(row.id, await decryptWithDataKey(dataKey, row.ciphertext)); }
      catch (e) { decryptFailures++; }
    }
    if (decryptFailures > 0) console.error(`[sync] ${decryptFailures} row(s) in ${table} failed to decrypt with the current key`);
    const merged = [];
    for (const localItem of itemsRef.current) {
      if (remoteMap.has(localItem.id)) {
        const remoteItem = remoteMap.get(localItem.id);
        const noPendingLocalEdit = lastSyncedRef.current.get(localItem.id) === JSON.stringify(localItem);
        if (noPendingLocalEdit) {
          merged.push(remoteItem);
          lastSyncedRef.current.set(localItem.id, JSON.stringify(remoteItem));
        } else {
          merged.push(localItem);
        }
        remoteMap.delete(localItem.id);
      } else if (!lastSyncedRef.current.has(localItem.id)) {
        merged.push(localItem); // never synced yet — keep, will push shortly
      } else if (!isWithinCloudRetention(localItem.date)) {
        // Was synced before, now gone from the cloud — but this item is
        // older than the retention window, so its absence is expected
        // (pruned for storage, not a deletion on another device). Kept
        // locally without limit; not re-pushed either, since deliberately
        // pruned data shouldn't just reappear in the cloud on its own.
        merged.push(localItem);
      }
      // else: was synced before, still within the retention window, but
      // gone from the server now — genuinely deleted elsewhere, drop it.
    }
    for (const [id, remoteItem] of remoteMap) {
      merged.push(remoteItem);
      lastSyncedRef.current.set(id, JSON.stringify(remoteItem));
    }
    persistFn();
    setLocalItems(merged);
  }

  async function pullAndMergeSettings() {
    if (!supabase || !session || !dataKey) return;
    const { data: row, error } = await supabase.from('settings').select('ciphertext').eq('user_id', session.user.id).maybeSingle();
    if (error || !row) return;
    try {
      const remoteSettings = await decryptWithDataKey(dataKey, row.ciphertext);
      // A device that's never synced settings before (lastSyncedSettingsRef
      // still null) only has blank local defaults, not a real pending edit
      // — that's not the same case as "synced before, changed since," and
      // needs to be treated as safe to overwrite, same as no pending edit.
      const neverSynced = lastSyncedSettingsRef.current === null;
      const noPendingLocalEdit = neverSynced || lastSyncedSettingsRef.current === JSON.stringify(settingsRef.current);
      if (noPendingLocalEdit) {
        saveSett(remoteSettings);
        lastSyncedSettingsRef.current = JSON.stringify(remoteSettings);
        persistLastSyncedSettings();
      }
    } catch (e) { /* undecryptable — skip */ }
  }

  // Runs the initial catch-up pull once the data key is actually ready —
  // deliberately keyed on dataKey alone, not on entries/toilTaken/settings,
  // since this should fire once per unlock, not on every local edit.
  useEffect(()=>{
    if (!dataKey) return;
    pullAndMergeRows('entries', entriesRef, setEntries, lastSyncedEntriesRef, persistLastSyncedEntries);
    pullAndMergeRows('toil_taken', toilTakenRef, setToilTaken, lastSyncedToilRef, persistLastSyncedToil);
    pullAndMergeSettings();
    pruneOldCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dataKey]);

  // ── realtime ─────────────────────────────────────────────────────────────
  // Live updates from other signed-in devices while this one's also open.
  // RLS applies to realtime the same as any other query, so the filter
  // below is belt-and-braces, not the actual security boundary. On
  // (re)connect — including the very first connection — a full pull runs
  // first, closing any gap from time spent disconnected before relying on
  // the live stream for anything after that point.
  useEffect(()=>{
    if (!supabase || !session || !dataKey) return;
    const uid = session.user.id;
    // Tracks whether this is a genuine reconnect (channel dropped and came
    // back) versus the very first connection, which the dataKey-ready
    // effect above already pulled for. Re-pulling again immediately after
    // that first pull raced against the push effect it triggers — the
    // push would mark an item as synced between the two pulls, tricking
    // the second one into thinking a genuine pending local edit was safe
    // to overwrite with a stale remote copy.
    let hasConnectedOnce = false;

    const handleRowChange = async (setLocalItems, lastSyncedRef, persistFn, payload) => {
      const row = payload.new;
      if (!row) return;
      if (row.deleted_at) {
        setLocalItems(prev => prev.filter(it => it.id !== row.id));
        lastSyncedRef.current.delete(row.id);
        persistFn();
        return;
      }
      try {
        const decrypted = await decryptWithDataKey(dataKey, row.ciphertext);
        lastSyncedRef.current.set(row.id, JSON.stringify(decrypted));
        persistFn();
        setLocalItems(prev => {
          const idx = prev.findIndex(it => it.id === row.id);
          if (idx === -1) return [...prev, decrypted];
          const copy = [...prev]; copy[idx] = decrypted; return copy;
        });
      } catch (e) { /* undecryptable — skip */ }
    };

    const channel = supabase.channel('sync-'+uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${uid}` }, p => handleRowChange(setEntries, lastSyncedEntriesRef, persistLastSyncedEntries, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toil_taken', filter: `user_id=eq.${uid}` }, p => handleRowChange(setToilTaken, lastSyncedToilRef, persistLastSyncedToil, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${uid}` }, async (p) => {
        const row = p.new; if (!row) return;
        try {
          const decrypted = await decryptWithDataKey(dataKey, row.ciphertext);
          lastSyncedSettingsRef.current = JSON.stringify(decrypted);
          persistLastSyncedSettings();
          saveSett(decrypted);
        } catch (e) { /* undecryptable — skip */ }
      })
      .subscribe((status)=>{
        if (status === 'SUBSCRIBED') {
          if (hasConnectedOnce) {
            pullAndMergeRows('entries', entriesRef, setEntries, lastSyncedEntriesRef, persistLastSyncedEntries);
            pullAndMergeRows('toil_taken', toilTakenRef, setToilTaken, lastSyncedToilRef, persistLastSyncedToil);
            pullAndMergeSettings();
          }
          hasConnectedOnce = true;
        }
      });

    return () => { supabase.removeChannel(channel); };
  },[supabase, session, dataKey]);

  // ── persist ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    dualWrite(KEYS.entries,entries);
    pushRowChanges('entries', entries, lastSyncedEntriesRef, persistLastSyncedEntries);
  },[entries]);
  useEffect(()=>{ dualWrite(KEYS.toilTaken,toilTaken); pushRowChanges('toil_taken', toilTaken, lastSyncedToilRef, persistLastSyncedToil); },[toilTaken]);
  useEffect(()=>{ dualWrite(KEYS.settings,settings); pushSettingsChange(settings); },[settings]);

  // ── auth session ──────────────────────────────────────────────────────────
  // Checks for an existing session once on mount, then stays subscribed for
  // sign-in/sign-out events for the lifetime of the app. A signed-in session
  // is now required — there's no local-only bypass.
  useEffect(()=>{
    if (!supabase) { setAuthLoading(false); return; }
    let cancelled = false;
    supabase.auth.getSession().then(({data})=>{
      if (cancelled) return;
      setSession(data.session);
      setAuthLoading(false);
    }).catch(()=>{
      // Offline or unreachable — fall through to the auth gate rather than
      // hang on "Loading…" forever.
      if (cancelled) return;
      setSession(null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession)=>{
      // Clicking the emailed reset link lands here as a PASSWORD_RECOVERY
      // event, with a real (temporary) session attached. Without this
      // check that session would satisfy the normal !session gate check
      // below and drop the person straight into the main app with their
      // old password still active — the whole point of the reset link is
      // to make them set a new one first.
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryMode(true);
      setSession(newSession);
    });
    return ()=>{ cancelled = true; listener.subscription.unsubscribe(); };
  },[]);
  useEffect(()=>{ if(mainRef.current) mainRef.current.scrollTop=0; },[tab]);

  // Opening the Breakdown tab always returns to the starred default view.
  // Switching views is treated as a temporary look, not a lasting preference —
  // only the star changes what Breakdown opens on. The ref lets handleSave
  // bypass this, since it deliberately targets a specific view and entry.
  const skipBreakdownReset = useRef(false);
  const taxImpactCardRef = useRef(null);
  const scrollToTaxImpact = useRef(false); // set true only when tapped from Home's Tax Threshold card
  useEffect(()=>{
    if(tab!=='months') return;
    if(skipBreakdownReset.current){ skipBreakdownReset.current=false; return; }
    setBreakdownView(defaultBreakdownView);
    if(defaultBreakdownView==='calendar') setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0);
  },[tab]);

  // Scrolls Settings so the £100k Tax Impact card sits at the top — but only
  // right after tapping through from Home's Tax Threshold tracker, not on an
  // ordinary visit to Options. The small delay lets the card's just-expanded
  // content finish laying out first, so the scroll target is stable.
  useEffect(()=>{
    if(tab!=='settings' || !scrollToTaxImpact.current) return;
    scrollToTaxImpact.current = false;
    setTimeout(()=>{ taxImpactCardRef.current?.scrollIntoView({behavior:'auto',block:'start'}); }, 60);
  },[tab]);

  // Collapse every expandable Options card the moment the person leaves the
  // Options tab, so it's back to a clean, collapsed state next time they
  // arrive — rather than remembering whatever was left open. Same idea for
  // the Home tab's graph toggle.
  const prevTabRef = useRef(tab);
  useEffect(()=>{
    if(prevTabRef.current==='settings' && tab!=='settings'){
      setTaxImpactExpanded(false);
      setTaxCalcActualDetailOpen(false);
      setTaxCalcForecastDetailOpen(false);
      setConfigExpanded(false);
      setExportDataExpanded(false);
      setFinancialYearsExpanded(false);
      setDataManagementExpanded(false);
    }
    if(prevTabRef.current==='carms' && tab!=='carms'){
      setCarmsFilter('all');
    }
    prevTabRef.current = tab;
  },[tab]);

  // ── snap zoom back to default when switching tabs ───────────────────────────
  // Pinch-zoom is allowed while browsing a tab. When the person switches tabs,
  // this forces the browser to reprocess the viewport at scale=1. Simply
  // mutating the meta tag's content attribute in place is often ignored by
  // mobile browsers if they judge nothing "changed" — removing the tag from
  // the DOM and reinserting it forces a genuine reprocess, which is the more
  // reliable version of this technique. Held briefly before restoring the
  // zoomable viewport so pinch still works next time.
  useEffect(()=>{
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport || !viewport.parentNode) return;
    const parent = viewport.parentNode;
    const zoomable = 'width=device-width,initial-scale=1.0,maximum-scale=5.0,user-scalable=yes';
    const locked   = 'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no';

    const forceReprocess = content => {
      parent.removeChild(viewport);
      viewport.setAttribute('content', content);
      parent.appendChild(viewport);
    };

    forceReprocess(locked);
    window.scrollTo(0,0);
    const t = setTimeout(()=>{ forceReprocess(zoomable); }, 450);
    return ()=>clearTimeout(t);
  },[tab]);

  // ── monthly backup reminder ──────────────────────────────────────────────────
  // Optional and dismissible — never blocks the app. Fires roughly every 30
  // days, measured from whichever happened more recently: an actual backup,
  // or the last time this reminder was shown/dismissed. First-ever use just
  // sets a baseline rather than nagging immediately. Monthly rather than
  // more frequent, since data now syncs to the cloud automatically — this
  // is just a periodic nudge for a downloadable hard copy, not a safety net.
  useEffect(()=>{
    if (entries.length === 0) return;
    const REMINDER_INTERVAL = 30*24*60*60*1000;
    const lastReminder = dualRead(KEYS.lastBackupReminder, null);
    const lastBackup   = dualRead(KEYS.backedUpAt, null);
    const baseline = Math.max(lastReminder||0, lastBackup||0);
    if (baseline === 0) { dualWrite(KEYS.lastBackupReminder, Date.now()); return; }
    if (Date.now() - baseline >= REMINDER_INTERVAL) setShowBackupReminder(true);
  },[]);

  const dismissBackupReminder = () => {
    dualWrite(KEYS.lastBackupReminder, Date.now());
    setShowBackupReminder(false);
  };

  const goBackupNow = () => {
    dualWrite(KEYS.lastBackupReminder, Date.now());
    setShowBackupReminder(false);
    setTab('settings');
    setPulseBackupBtn(true);
    setTimeout(()=>setPulseBackupBtn(false), 6000);
  };

  // ── financial year rollover ─────────────────────────────────────────────────
  // Compares the FY the person last had the app open in against today's actual
  // current FY (computed above). First-ever use just sets the baseline rather
  // than announcing a "rollover" that never happened.
  useEffect(()=>{
    const lastSeen = dualRead(KEYS.lastSeenFYYear, null);
    if (lastSeen === null) { dualWrite(KEYS.lastSeenFYYear, CURRENT_FY_YEAR); return; }
    if (lastSeen < CURRENT_FY_YEAR) setShowFYRollover(true);
  },[]);

  const dismissFYRollover = () => {
    dualWrite(KEYS.lastSeenFYYear, CURRENT_FY_YEAR);
    setShowFYRollover(false);
  };

  // ── toasts ─────────────────────────────────────────────────────────────────
  const addToast = useCallback((msg,type='success',action=null,dur=3500,title=null)=>{
    const id=Date.now()+Math.random();
    setToasts(t=>[...t,{id,message:msg,type,action,title}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),dur);
  },[]);

  const dismissToast = useCallback(id=>setToasts(t=>t.filter(x=>x.id!==id)),[]);

  const saveSett = s=>{ setSettings(s); setSavedBadge(true); setTimeout(()=>setSavedBadge(false),2200); };

  // ── entry calculator ───────────────────────────────────────────────────────
  // Returns the gross pay components for a single entry using date-correct rates.
  // Net is NOT calculated here — tax is applied per pay period on a cumulative
  // marginal basis (see periodBreakdown in totals below), since a flat personal
  // tax rate can't correctly reflect where each pound sits in the tax bands.
  const calcEntry = useCallback((e)=>{
    const r  = getRates(settings.rank, settings.service, e.date);
    const h1 = parseFloat(e.hours133)||0;
    const h2 = parseFloat(e.hours150)||0;
    const h3 = parseFloat(e.hours200)||0;
    // Night hours no longer factor into any calculation — kept as a fixed
    // zero here (rather than removed from the returned shape entirely) so
    // every downstream site that reads c.nh/c.night keeps working exactly
    // as before, just always contributing nothing, instead of needing every
    // one of those call sites updated individually.
    const nh = 0;
    // TOIL hours (worked at e.otRateTier's rate, taken as time instead of
    // pay) reduce the CASH overtime calculation only — h1/h2/h3 still
    // reflect hours actually worked, so hours-worked totals stay correct.
    const toilH = e.otRateTier ? (parseFloat(e.toilHours)||0) : 0;
    const payH1 = e.otRateTier==='hours133' ? Math.max(0,h1-toilH) : h1;
    const payH2 = e.otRateTier==='hours150' ? Math.max(0,h2-toilH) : h2;
    const payH3 = e.otRateTier==='hours200' ? Math.max(0,h3-toilH) : h3;
    const ot1 = payH1*r.r133, ot2 = payH2*r.r150, ot3 = payH3*r.r200;
    const ot  = ot1+ot2+ot3;
    const toilBanked = e.otRateTier ? toilH * RATE_TIER_MULT[e.otRateTier] : 0;
    const night = 0;
    const pa    = PA_RATES[e.paRate]||0;
    const gross = ot + night + pa;
    return { h1, h2, h3, payH1, payH2, payH3, ot1, ot2, ot3, nh, ot, night, pa, gross, r, toilH, toilBanked, otRateTier:e.otRateTier, takeAs:e.takeAs };
  },[settings]);

  // Whether a component counts as submitted — defensive against undefined
  // (older/synced entries that predate this field) rather than relying on
  // every single entry point — initial load, cloud pull, backup restore —
  // remembering to migrate it. Anything except an explicit false counts.
  const isOtSubmitted = e => e.otSubmitted !== false;
  const isPaSubmitted = e => e.paSubmitted !== false;

  // Shared by every place that needs an entry's actually-counted gross —
  // the export, the PDF payslip preview, and the archived-year view all
  // used to compute this same formula independently, which is exactly the
  // kind of duplication that lets one copy drift out of sync with the
  // others after a future change. One definition here, reused everywhere.
  const submittedGross = e => {
    const c = calcEntry(e);
    const hasPA = e.paRate && e.paRate!=='None';
    // Night allowance is paid automatically — it never needs its own CARMS
    // submission. It only rides on the OT toggle when the entry also has
    // genuine overtime hours (the toggle covers both together, since
    // they're the same worked hours). An entry with only night hours has
    // nothing to submit, so its night pay always counts.
    const hasOTHours = c.h1 + c.h2 + c.h3 > 0;
    const otPart = hasOTHours ? (isOtSubmitted(e) ? c.ot + c.night : 0) : c.night;
    return otPart + ((hasPA && isPaSubmitted(e)) ? c.pa : 0);
  };

  // The date that decides which pay period a component's earnings actually
  // land in — the date it was submitted, not the date the shift was worked,
  // since a late submission gets processed in whichever period it goes in
  // on, same as the real payslip. Falls back to the shift's own date when
  // there's no explicit submission date on record (legacy entries, or an
  // entry that's marked submitted without ever going through the toggle —
  // shouldn't normally happen, but a shift date is a safer fallback than
  // an empty string reaching a date comparison).
  const effectiveOtDate = e => e.otSubmittedDate || e.date;
  const effectivePaDate = e => e.paSubmittedDate || e.date;

  // Shared by the List View entry row and the calendar day popup — same
  // four states, same colours, just a different font size for each
  // context. Extracted so the two can't quietly drift apart the way two
  // separately-maintained copies of the same logic eventually do.
  const carmsBadge = (e, fontSize) => {
    const otOK = isOtSubmitted(e);
    const hasPA = e.paRate && e.paRate!=='None';
    const paOK = !hasPA || isPaSubmitted(e);
    const style = {display:'inline-block',fontSize:fontSize+'px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',marginLeft:'4px',textTransform:'uppercase',letterSpacing:'0.5px'};
    if (otOK && paOK) return <div style={{...style,background:'#f0fdf4',color:'#059669'}}>✓ Submitted</div>;
    const goToEntry = (ev) => { ev.stopPropagation(); setSelectedCalDay(null); setConfirmDel(null); startEdit(e); setFocusCarmsToggle(true); };
    const clickable = {...style,border:'1px solid #fecaca',background:'#fef2f2',color:'#b91c1c',cursor:'pointer'};
    if (otOK && !paOK) return <div onClick={goToEntry} style={clickable}>✗ PA not submitted</div>;
    if (!otOK && paOK) return <div onClick={goToEntry} style={clickable}>✗ Overtime not submitted</div>;
    return <div onClick={goToEntry} style={clickable}>✗ Overtime &amp; PA not submitted</div>;
  };

  // Desktop-only custom calendar picker for the CARMS submission-date
  // fields, in place of the native <input type="date"> which renders
  // quite small on desktop browsers. Deliberately generous sizing — this
  // exists specifically because the native picker felt too small here;
  // mobile keeps the native input untouched, where it already works well.
  const renderDatePickerGrid = (currentValue, onSelect) => {
    const [y, m] = datePickerMonth.split('-').map(Number);
    const firstDay = new Date(y, m-1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startOffset = (firstDay.getDay()+6)%7; // Monday-start week
    const monthLabel = firstDay.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const cells = Array(startOffset).fill(null).concat(Array.from({length:daysInMonth},(_,i)=>i+1));
    const changeMonth = (delta) => {
      const d = new Date(y, m-1+delta, 1);
      setDatePickerMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    };
    return (
      <div onClick={ev=>ev.stopPropagation()} style={{background:'#fff',borderRadius:'18px',boxShadow:'0 24px 64px rgba(0,0,0,0.28)',border:'1px solid #e2e8f0',padding:'22px',width:'360px',maxWidth:'calc(100vw - 32px)',boxSizing:'border-box'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'18px'}}>
          <button onClick={()=>changeMonth(-1)} style={{background:'#f1f5f9',border:'none',borderRadius:'10px',width:'38px',height:'38px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Ico n="cL" s={18} c="#475569"/></button>
          <div style={{fontWeight:900,fontSize:'17px',color:'#0f172a'}}>{monthLabel}</div>
          <button onClick={()=>changeMonth(1)} style={{background:'#f1f5f9',border:'none',borderRadius:'10px',width:'38px',height:'38px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Ico n="cR" s={18} c="#475569"/></button>
        </div>
        <div style={{fontSize:'12.5px',fontWeight:700,color:'#64748b',textAlign:'center',marginBottom:'14px'}}>
          {datePickerFor==='ot' ? 'Select the date you submitted this OT to CARMS' : datePickerFor==='pa' ? 'Select the date you submitted this PA claim to MetHR' : 'Select the date of this shift'}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'6px'}}>
          {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=><div key={d} style={{textAlign:'center',fontSize:'11.5px',fontWeight:800,color:'#94a3b8',padding:'4px 0'}}>{d}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
          {cells.map((d,i)=>{
            if (d===null) return <div key={i}/>;
            const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isSelected = dateStr===currentValue;
            const isToday = dateStr===todayStr;
            return (
              <button key={i} onClick={()=>{ onSelect(dateStr); setDatePickerFor(null); }} style={{aspectRatio:'1',border:isToday&&!isSelected?'1.5px solid #2563eb':'none',borderRadius:'10px',background:isSelected?'#2563eb':'transparent',color:isSelected?'#fff':'#0f172a',fontWeight:isSelected?900:700,fontSize:'14.5px',cursor:'pointer',fontFamily:'inherit'}}>{d}</button>
            );
          })}
        </div>
      </div>
    );
  };


  // ── derived totals ─────────────────────────────────────────────────────────
  // Includes an entry if its shift date, OR either component's effective
  // (submission) date, falls in this financial year — a shift worked right
  // at the end of one FY but not submitted until the next needs to still be
  // visible here so its pay gets attributed to the FY it actually lands in.
  const fyEntries = useMemo(()=>entries.filter(e=>
    (e.date>=FY_START&&e.date<=FY_END) ||
    (effectiveOtDate(e)>=FY_START&&effectiveOtDate(e)<=FY_END) ||
    (effectivePaDate(e)>=FY_START&&effectivePaDate(e)<=FY_END)
  ),[entries]);
  const yearsWithData = useMemo(()=>{
    const set = new Set();
    entries.forEach(e=>set.add(getFYStartYearFor(e.date)));
    return [...set].filter(y=>y<CURRENT_FY_YEAR).sort((a,b)=>b-a);
  },[entries]);

  const totals = useMemo(()=>{
    const svcData = settings.rank && settings.service ? PAY_RATES[settings.rank]?.[settings.service] : null;

    // Anchored to the REAL UK tax year (6 Apr – 5 Apr), not the force's pay
    // year (which starts 9 Feb) — HMRC resets personal allowance/bands on
    // 6 April regardless of when the police pay calendar happens to start.
    // Computed up front so the cascade below can use it.
    const taxYearStart = getUKTaxYearStart(todayStr);
    const taxYearEnd    = addYearMinusOneDay(taxYearStart);
    const ytdRangeEnd   = todayStr <= taxYearEnd ? todayStr : taxYearEnd;

    // ── build the period-by-period cumulative marginal cascade ────────────────
    // For each period, in chronological order: add salary+LW+LA, then layer this
    // period's overtime, then night enhancement, then PA on top of the running
    // cumulative total. Each layer's tax is the difference in cumulative tax
    // before/after it — i.e. the true marginal rate for that slice of income.
    //
    // The running total only ever accumulates periods that belong to the
    // CURRENT UK tax year — a period is treated as belonging to whichever tax
    // year contains its end date (matching how PAYE actually works: tax
    // follows the pay date, not a smooth day-by-day split). The pay calendar
    // starts 9 Feb, so exactly one period each year (the one ending before
    // 6 April) falls in the previous, already-closed tax year; its own
    // marginal tax is estimated as a fresh start from zero rather than folded
    // into this year's cumulative, since this view has no visibility into
    // whatever else was earned earlier in that prior year.
    let cum = 0;
    let totalGross=0, totalHrs=0;

    // Computed once per entry rather than once per entry PER period — the
    // loop below checks all 13 periods for every entry, so without this,
    // calcEntry (and the date lookups) would re-run up to 13x more than
    // necessary for the exact same result.
    const entryCalc = new Map(fyEntries.map(e=>[e, calcEntry(e)]));
    const entryOtDate = new Map(fyEntries.map(e=>[e, effectiveOtDate(e)]));
    const entryPaDate = new Map(fyEntries.map(e=>[e, effectivePaDate(e)]));

    const periodBreakdown = PAY_PERIODS.map((p,pIdx)=>{
      // Hours worked this period — tracks the shift's own date regardless
      // of submission timing, since this is a factual record of when the
      // work happened, not when it gets paid.
      const pE = fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
      let hrs=0;
      pE.forEach(e=>{ const c=entryCalc.get(e); hrs+=c.h1+c.h2+c.h3; });

      // Money earned this period — attributed by each component's own
      // submission date, not the shift date, since OT and PA can be
      // submitted on different days and each lands in whichever period
      // its own submission date falls in, matching the real payslip.
      let ot=0, night=0, pa=0;
      fyEntries.forEach(e=>{
        const c = entryCalc.get(e);
        const otDate = entryOtDate.get(e);
        // Night allowance is automatic and only waits on the OT toggle when
        // there are genuine overtime hours on the entry too — see
        // submittedGross for the full reasoning. A night-only entry's
        // allowance lands in its own period unconditionally.
        const hasOTHours = c.h1 + c.h2 + c.h3 > 0;
        if (!hasOTHours) {
          if (otDate>=p.start && otDate<=p.end) night+=c.night;
        } else if (isOtSubmitted(e) && otDate>=p.start && otDate<=p.end) {
          ot+=c.ot; night+=c.night;
        }
        const hasPA = e.paRate && e.paRate!=='None';
        const paDate = entryPaDate.get(e);
        if (hasPA && isPaSubmitted(e) && paDate>=p.start && paDate<=p.end) { pa+=c.pa; }
      });

      const baseAmt = periodBaseAmount(p, svcData); // salary + London Weighting + London Allowance
      const inCurrentTaxYear = p.end >= taxYearStart;

      // How far into the relevant tax year this period's end falls, as a
      // continuous 0-1 fraction — used to pro-rate the annual PA/band
      // thresholds down to "so far this year", exactly as cumulative PAYE
      // does it. A period outside the current tax year gets its own span as
      // the reference instead (there's no larger year to measure against).
      const daysForFraction = inCurrentTaxYear
        ? Math.max(0, (new Date(p.end) - new Date(taxYearStart))/86400000) + 1
        : daysInclusive(p.start, p.end);
      const yearFraction = Math.max(1/365, Math.min(1, daysForFraction/365));

      let periodCum = inCurrentTaxYear ? cum : 0; // fresh start for a prior-tax-year period
      periodCum += baseAmt;                        // taxed first, so OT stacks on top of it
      let pGross = baseAmt;                         // this period's gross so far, for NI (unaffected by the tax-year split — NI has no annual concept)

      const otResult    = applyBandTax(periodCum, ot,    yearFraction, pGross); periodCum += ot;    pGross += ot;
      const nightResult = applyBandTax(periodCum, night, yearFraction, pGross); periodCum += night; pGross += night;
      const paResult    = applyBandTax(periodCum, pa,    yearFraction, pGross); periodCum += pa;

      if (inCurrentTaxYear) cum = periodCum; // only carry forward into the next period if this one belongs to the current tax year

      totalGross += ot+night+pa; totalHrs += hrs;

      return {
        month:p.month, start:p.start, end:p.end,
        baseAmt, ot, night, pa,
        otResult, nightResult, paResult,
        combinedGross: ot+night+pa,
        combinedNet: otResult.net+nightResult.net+paResult.net,
        cumAfter: periodCum,
        inCurrentTaxYear,
      };
    });

    const totalNet = periodBreakdown.reduce((s,pb)=>s+pb.combinedNet,0);
    // Per-component YTD figures — same underlying otResult/nightResult/paResult
    // used everywhere else, just summed by component instead of combined, so
    // totalOTGross+totalNightGross+totalPAGross === totalGross by construction
    // (same for the net figures), keeping this consistent with every other tab.
    const totalOTGross    = periodBreakdown.reduce((s,pb)=>s+pb.ot,0);
    const totalOTNet      = periodBreakdown.reduce((s,pb)=>s+pb.otResult.net,0);
    const totalNightGross = periodBreakdown.reduce((s,pb)=>s+pb.night,0);
    const totalNightNet   = periodBreakdown.reduce((s,pb)=>s+pb.nightResult.net,0);
    const totalPAGross    = periodBreakdown.reduce((s,pb)=>s+pb.pa,0);
    const totalPANet      = periodBreakdown.reduce((s,pb)=>s+pb.paResult.net,0);

    const getP=i=>{
      if(i<0||i>=periodBreakdown.length) return null;
      const pb=periodBreakdown[i];
      return{month:pb.month,start:pb.start,end:pb.end,gross:pb.combinedGross,net:pb.combinedNet};
    };

    const cumData = periodBreakdown.map(pb=>({short:PAY_PERIODS.find(p=>p.month===pb.month).short,cumulative:pb.cumAfter}));

    // ── salary + allowances YTD (for the top Home summary card) ───────────────
    // Anchored to the REAL UK tax year (6 Apr – 5 Apr), not the force's pay
    // year (which starts 9 Feb) — HMRC resets personal allowance/bands on
    // 6 April regardless of when the police pay calendar happens to start.
    // Salary/allowances accrue in proper monthly instalments (stepping up
    // once per completed month) rather than a smooth daily creep.
    const todayD      = new Date(todayStr);
    const fyStartD    = new Date(FY_START);
    const fyEndD      = new Date(FY_END);
    const effectiveEnd = todayD <= fyEndD ? todayD : fyEndD;
    const daysElapsed  = Math.max(0, (effectiveEnd - fyStartD) / 86400000); // still used for "days into FY" label (police pay-year)

    const taxYearDaysElapsed = Math.max(0, (new Date(ytdRangeEnd) - new Date(taxYearStart)) / 86400000);

    const salaryYTD = svcData ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, taxYearStart, ytdRangeEnd) : 0;
    const lwYTD     = monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStart, ytdRangeEnd);
    const laYTD     = monthlySteppedAmount(LONDON_ALLOWANCE, taxYearStart, ytdRangeEnd);

    // Overtime/PA actually earned so far THIS TAX YEAR — excludes future-dated
    // "Planned" entries, and excludes anything dated before the tax year
    // started (which belongs to the previous tax year's allowance/bands).
    // Hours use the shift's own date; money uses each component's own
    // submission date, same split as periodBreakdown above and for the
    // same reason — OT and PA can each land in a different YTD window.
    let otPaidToDate = 0, otNightPaidToDate = 0, hrsToDate = 0;
    fyEntries.forEach(e=>{
      const c = entryCalc.get(e);
      if (e.date >= taxYearStart && e.date <= todayStr) {
        hrsToDate += c.h1 + c.h2 + c.h3;
      }
      const otDate = entryOtDate.get(e);
      // Same principle as periodBreakdown above — night allowance from a
      // night-only entry counts unconditionally, since there's no OT to
      // wait on.
      const hasOTHoursYTD = c.h1 + c.h2 + c.h3 > 0;
      if (!hasOTHoursYTD) {
        if (otDate >= taxYearStart && otDate <= todayStr) {
          otPaidToDate += c.night;
          otNightPaidToDate += c.night;
        }
      } else if (isOtSubmitted(e) && otDate >= taxYearStart && otDate <= todayStr) {
        otPaidToDate += c.ot + c.night;
        otNightPaidToDate += c.ot + c.night; // hourly-earned only, excludes flat PA
      }
      const hasPA = e.paRate && e.paRate!=='None';
      const paDate = entryPaDate.get(e);
      if (hasPA && isPaSubmitted(e) && paDate >= taxYearStart && paDate <= todayStr) {
        otPaidToDate += c.pa;
      }
    });

    // Break the to-date overtime/night money down by which tax band it falls
    // in (stacked on top of salary+allowances), then convert each band's
    // portion back to hours using the blended average £/hr for that money.
    const avgHourlyRate = hrsToDate > 0 ? otNightPaidToDate / hrsToDate : 0;
    const hoursByBand = splitAcrossBands(salaryYTD+lwYTD+laYTD, otNightPaidToDate)
      .map(b => ({ ...b, hours: avgHourlyRate > 0 ? b.amount / avgHourlyRate : 0 }));

    // Full UK tax year totals (for showing "earned so far / full year" progress),
    // matching the same tax-year window and monthly-stepped method as above.
    const lwAnnualTotal = monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStart, taxYearEnd);
    const laAnnualTotal = monthlySteppedAmount(LONDON_ALLOWANCE, taxYearStart, taxYearEnd);
    const salaryAnnualTotal = svcData ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, taxYearStart, taxYearEnd) : 0;

    const combinedGrossYTD = salaryYTD + lwYTD + laYTD + otPaidToDate;

    // Deductions on what's actually been earned so far — no projection or
    // extrapolation. Thresholds are pro-rated to how far through the UK tax
    // year we are (6 Apr onward), not how far through the force's pay year
    // (which starts 9 Feb, ~2 months earlier) — using the pay-year count here
    // would overstate how much of the tax year has elapsed and understate
    // every YTD-based figure below.
    const taxYearFraction = Math.max(1/365, Math.min(1, taxYearDaysElapsed/365));
    const ytdTax = calcUKIncomeTax(combinedGrossYTD, taxYearFraction);
    // NI is assessed per pay period in isolation (no annual concept), so sum
    // only the periods that actually fall within the current UK tax year —
    // slicing by pay-period position would pull in periods 1-2 of the pay
    // year, which run 9 Feb – ~5 Apr and belong to the previous tax year.
    const ytdNI = periodBreakdown
      .filter(pb => pb.end >= taxYearStart && pb.start <= todayStr)
      .reduce((s,pb)=>s + calcNI(pb.baseAmt + pb.ot + pb.night + pb.pa), 0);
    const combinedNetYTD = combinedGrossYTD - ytdTax - ytdNI;

    const currentBand   = getTaxBand(combinedGrossYTD, taxYearFraction);
    const taxBand        = currentBand.name;
    const taxBandRate    = currentBand.rate;

    // Same annualisation the tax functions use internally, surfaced here so
    // the £100k tracker and the tax figures always agree with each other.
    const projectedAnnualGross = combinedGrossYTD / taxYearFraction;
    const taperExtraTax = projectedAnnualGross > 100000
      ? calcUKIncomeTax(projectedAnnualGross, 1) - calcUKIncomeTaxNoTaper(projectedAnnualGross, 1)
      : 0;

    return{
      totalGross, totalNet, totalHrs, cumData, periodBreakdown,
      totalOTGross, totalOTNet, totalNightGross, totalNightNet, totalPAGross, totalPANet,
      prev:getP(currPeriodIdx-1), curr:getP(currPeriodIdx), next:getP(currPeriodIdx+1),
      salaryYTD, lwYTD, laYTD, lwAnnualTotal, laAnnualTotal, salaryAnnualTotal, combinedGrossYTD, combinedNetYTD,
      ytdTax, ytdNI, taxBand, taxBandRate, daysElapsed, taxYearDaysElapsed, taxYearStart, hoursByBand,
      projectedAnnualGross, taperExtraTax,
    };
  },[fyEntries,calcEntry,settings,currPeriodIdx,todayStr]);

  // Full-year tax forecast, pension-adjusted and taper-aware — pulled out
  // of the Tax & 100K+ Calculator card's own render so the actual formula
  // lives in one place, kept separate from the JSX that displays it.
  const taxForecast = useMemo(()=>{
    if (!(settings.rank && settings.service)) return null;
    const proj = totals.projectedAnnualGross;
    const pensionablePayF = totals.salaryAnnualTotal + totals.lwAnnualTotal;
    const pensionF = calcPensionContribution(pensionablePayF, 1);
    const taxableGrossF = Math.max(0, proj - pensionF.amount);
    const overF = taxableGrossF > 100000;
    const paLostF = overF ? Math.min(12570, Math.floor((taxableGrossF-100000)/2)) : 0;
    const paRemainingF = 12570 - paLostF;
    const extraTaxF = overF ? (calcUKIncomeTax(taxableGrossF,1) - calcUKIncomeTaxNoTaper(taxableGrossF,1)) : 0;
    const breakdownF = computeTaxBandBreakdown(taxableGrossF, 1);
    const niF = estimateAnnualNI(proj);
    const netF = proj - pensionF.amount - breakdownF.totalTax - niF;
    const band = getTaxBand(taxableGrossF, 1);
    return { proj, pensionablePayF, pensionF, taxableGrossF, overF, paLostF, paRemainingF, extraTaxF, breakdownF, niF, netF, bandName: band.name };
  },[settings, totals]);

  // ── CARMS outstanding claims ──────────────────────────────────────────────
  // Grouped by pay period (matching how Archived Financial Years and the
  // month pills already frame things), each entry that has anything
  // outstanding shows once, with however much of it — OT, PA, or both —
  // hasn't been submitted yet. Fully-submitted entries and entries with no
  // pay component at all (pure TOIL-only days with no PA) never appear here.
  const carmsOutstanding = useMemo(()=>{
    const groups = [];
    let totalAmount = 0, totalClaims = 0, totalOtAmount = 0, totalPaAmount = 0;
    PAY_PERIODS.forEach((p,pIdx)=>{
      const pE = entries.filter(e=>e.date>=p.start&&e.date<=p.end);
      const items = [];
      pE.forEach(e=>{
        const hasPA = e.paRate && e.paRate!=='None';
        const c = calcEntry(e);
        // Night allowance is paid automatically and never needs its own
        // CARMS submission — only genuine overtime hours (the 1.33x/1.5x/2.0x
        // tiers) do. An entry with only night hours (no OT hours) has
        // nothing to claim, so it should never show as outstanding here,
        // regardless of what its own otSubmitted flag happens to be — that
        // toggle is disabled for exactly this reason on the Log Overtime
        // form (see hasOTHours there).
        const hasOTHours = c.h1 + c.h2 + c.h3 > 0;
        const otOK = !hasOTHours || isOtSubmitted(e);
        const paOK = !hasPA || isPaSubmitted(e);
        if (otOK && paOK) return; // nothing outstanding on this entry
        // !otOK can only be true when hasOTHours is true (otOK is always
        // true otherwise), so night allowance tied to genuinely unsubmitted
        // OT hours is correctly still part of the outstanding amount here —
        // it's only excluded for night-only entries, which never reach
        // !otOK at all.
        const otAmt = !otOK ? (c.ot + c.night) : 0;
        const paAmt = (hasPA && !paOK) ? c.pa : 0;
        const amount = otAmt + paAmt;
        if (amount <= 0 && otOK && paOK) return; // defensive, shouldn't happen given the check above
        // TOIL doesn't have its own submit toggle — it rides on otSubmitted,
        // same as the banking gate built earlier. An entry only has TOIL at
        // stake if it's actually taking TOIL (or a mix) AND the overtime
        // side is what's outstanding.
        const takesToil = e.takeAs==='toil' || e.takeAs==='mix';
        const toilOutstanding = !otOK && takesToil;
        const toilHrs = toilOutstanding ? c.toilBanked : 0;
        items.push({ entry: e, otOutstanding: !otOK, paOutstanding: hasPA && !paOK, toilOutstanding, toilHrs, otAmt, paAmt, amount });
        totalOtAmount += otAmt;
        totalPaAmount += paAmt;
      });
      if (items.length) {
        const periodTotal = items.reduce((s,it)=>s+it.amount,0);
        groups.push({ period: p, periodIdx: pIdx, items, periodTotal });
        totalAmount += periodTotal;
        // Overtime and TOIL share one toggle (otSubmitted) so they count as
        // a single item together; PA is independent and counts separately —
        // a day with both outstanding is genuinely two claims to submit,
        // not one, since they go to two different systems (CARMS/MetHR).
        totalClaims += items.reduce((s,it)=>s+(it.otOutstanding?1:0)+(it.paOutstanding?1:0),0);
      }
    });
    return { groups, totalAmount, totalClaims, totalOtAmount, totalPaAmount, periodCount: groups.length };
  },[entries, calcEntry]);

  // Which subset of the outstanding list is currently shown — All /
  // Overtime / PA. Overtime and PA are inclusive of each other (an item
  // outstanding on both counts shows under either filter), since there's
  // no longer a separate "Both" option to catch that overlap.
  const [carmsFilter, setCarmsFilter] = useState('all');
  // Sequential numbering for the CARMS/PA list — oldest claim is #1, and the
  // numbers shift automatically as claims get submitted, since this is
  // recomputed fresh from whatever's still outstanding rather than being
  // assigned once and stuck to an entry. Numbers whatever the current filter
  // actually shows: Overtime and PA are two separate claims on the same
  // entry (matching how the CARMS/PA badge itself counts them), while TOIL
  // rides on the same toggle as Overtime and only gets its own number when
  // the TOIL filter is the one actually displaying it.
  const carmsClaimNumbers = useMemo(()=>{
    const flat = [];
    carmsOutstanding.groups.forEach(g=>{
      g.items.forEach(it=>{
        if (carmsFilter==='toil') {
          if (it.toilOutstanding) flat.push({ key: it.entry.id+'-toil', date: it.entry.date });
        } else {
          // TOIL never gets its own key here — outside the dedicated TOIL
          // filter it's shown merged into the same row as Overtime (they're
          // the same submission), so it borrows the '-ot' number rather
          // than needing one of its own.
          if (it.otOutstanding && carmsFilter!=='pa') flat.push({ key: it.entry.id+'-ot', date: it.entry.date });
          if (it.paOutstanding && carmsFilter!=='ot') flat.push({ key: it.entry.id+'-pa', date: it.entry.date });
        }
      });
    });
    flat.sort((a,b)=> a.date===b.date ? 0 : (a.date<b.date ? -1 : 1));
    const map = new Map();
    flat.forEach((f,i)=>map.set(f.key, i+1));
    return map;
  },[carmsOutstanding, carmsFilter]);

  // ── TOIL balance ───────────────────────────────────────────────────────────
  // All-time running balance: every hour ever banked as TOIL (from any logged
  // shift, in any year) minus every hour ever logged as taken. Deliberately
  // NOT scoped to the financial year the way pay figures are — TOIL carries
  // over, it doesn't reset with the tax year.
  const toilLedger = useMemo(()=>{
    const earned = entries
      .filter(e=>e.otRateTier && (parseFloat(e.toilHours)||0) > 0 && isOtSubmitted(e))
      .map(e=>{
        const worked = parseFloat(e.toilHours)||0;
        const dLabel = new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
        return {
          id:'earn-'+e.id, date:e.date, type:'earned',
          hours: calcEntry(e).toilBanked,
          note: `${fmtHM(worked)}h OT @ ${RATE_TIER_MULT[e.otRateTier]}x — ${e.reason||'shift'} ${dLabel}`,
        };
      });
    const taken = toilTaken.map(t=>({
      id:'take-'+t.id, rawId:t.id, date:t.date, type:'taken',
      hours: -(parseFloat(t.hours)||0), note: t.note||'TOIL taken',
    }));
    const combined = [...earned, ...taken].sort((a,b)=>a.date.localeCompare(b.date));
    let running = 0;
    const rows = combined.map(l=>{ running += l.hours; return {...l, balanceAfter:running}; });
    return { rows, balance: running };
  },[entries, toilTaken, calcEntry]);

  // ── auto-calc effects for Record Shift Times ────────────────────────────────
  // Keep the Overtime Hours figure in sync with rostered/actual times and duty
  // type, unless the person has manually overridden it (form.otAuto false) —
  // e.g. to add hours for a recall the times themselves don't capture.
  useEffect(()=>{
    if (!form.recordShiftTimes || !form.otAuto || !form.otRateTier) return;
    const auto = Math.round(calcAutoOTHours(form)*100)/100;
    const current = parseFloat(form[form.otRateTier])||0;
    if (current===auto) return;
    setForm(f=>({ ...f, [form.otRateTier]: auto ? String(auto) : '' }));
  },[form.rosteredStart, form.rosteredEnd, form.actualStart, form.actualEnd, form.dutyType, form.otAuto, form.otRateTier, form.recordShiftTimes]);

  // Which rate tier TOIL banking applies to — in auto-calc mode this is just
  // form.otRateTier; in manual mode there's no rate-pill selector, so we look
  // at which single hours133/150/200 box actually has something in it. If
  // more than one tier is populated there's no single clear rate, so TOIL
  // doesn't apply (Take As stays hidden and any TOIL split gets reset).
  const manualSingleTier = (()=>{
    const populated = ['hours133','hours150','hours200'].filter(k=>(parseFloat(form[k])||0)>0);
    return populated.length===1 ? populated[0] : null;
  })();
  const effectiveTier = form.recordShiftTimes ? form.otRateTier : manualSingleTier;

  // Keep toilHours tracking the Pay/TOIL/Mix choice: 'pay' → 0, 'toil' → the
  // full total, 'mix' → whatever's been split, clamped if the total shrinks
  // (e.g. the overtime hours were edited down after a Mix split was made).
  useEffect(()=>{
    if (!effectiveTier) {
      if ((form.toilHours && form.toilHours!=='0') || form.takeAs!=='pay') {
        setForm(f=>({...f, toilHours:'0', takeAs:'pay'}));
      }
      return;
    }
    // in manual mode, keep otRateTier pointing at whichever tier is actually
    // populated, so the saved entry and calcEntry agree on which tier TOIL
    // was taken from
    if (form.otRateTier !== effectiveTier) { setForm(f=>({...f, otRateTier:effectiveTier})); return; }
    const total = parseFloat(form[effectiveTier])||0;
    const currentToil = parseFloat(form.toilHours)||0;
    let target = currentToil;
    if (form.takeAs==='pay') target = 0;
    else if (form.takeAs==='toil') target = total;
    else target = Math.min(currentToil, total); // mix — just clamp
    if (target!==currentToil) setForm(f=>({ ...f, toilHours: target ? String(target) : '0' }));
  },[effectiveTier, form.takeAs, form.hours133, form.hours150, form.hours200, form.toilHours, form.otRateTier]);

  // ── live form preview ──────────────────────────────────────────────────────
  // Shows the net for this shift as if logged right now — using the tax band
  // that applies once this shift's total is added to everything already
  // earned this FY (salary, allowances, other OT/PA).
  const preview = useMemo(()=>{
    const r  = getRates(settings.rank, settings.service, form.date||todayStr);
    const h1 = parseFloat(form.hours133)||0;
    const h2 = parseFloat(form.hours150)||0;
    const h3 = parseFloat(form.hours200)||0;
    const toilH = form.otRateTier ? (parseFloat(form.toilHours)||0) : 0;
    const payH1 = form.otRateTier==='hours133' ? Math.max(0,h1-toilH) : h1;
    const payH2 = form.otRateTier==='hours150' ? Math.max(0,h2-toilH) : h2;
    const payH3 = form.otRateTier==='hours200' ? Math.max(0,h3-toilH) : h3;
    const ot    = payH1*r.r133 + payH2*r.r150 + payH3*r.r200;
    const toilBanked = form.otRateTier ? toilH * RATE_TIER_MULT[form.otRateTier] : 0;
    const night = 0; // night hours no longer factor into any calculation
    const pa    = PA_RATES[form.paRate]||0;
    const gross = ot + night + pa;
    // Use the pay period this shift falls in for NI (period-based, no annual
    // concept), and the shift's own date for pro-rating tax thresholds —
    // reflecting the right point in the UK tax year, not the pay calendar.
    const d = form.date||todayStr;
    const pIdx = PAY_PERIODS.findIndex(p=>d>=p.start&&d<=p.end);
    const pb = pIdx>=0 ? totals.periodBreakdown[pIdx] : null;
    const periodGrossBefore = pb ? pb.baseAmt + pb.ot + pb.night + pb.pa : 0;
    const result = applyBandTax(totals.combinedGrossYTD, gross, taxYearFractionForDate(d), periodGrossBefore);
    return { gross, net:result.net, night, toilBanked, has:gross>0||toilBanked>0 };
  },[form, settings, todayStr, totals.combinedGrossYTD, totals.periodBreakdown, currPeriodIdx]);

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleSave=()=>{
    if(!form.date) return;

    // One entry per date — if the date is already taken, point the person at
    // the existing record rather than silently creating a second one.
    const dupe = entries.find(e=>e.date===form.date && (!editing || e.id!==editing.id));
    if(dupe){
      const dStr = new Date(form.date+'T12:00:00').toLocaleDateString('en-GB');
      addToast(
        `You've already logged overtime for ${dStr}. Edit that record instead of creating a second one.`,
        'alert',
        {label:'Edit existing entry',fn:()=>startEdit(dupe)},
        8000,
        'Entry already exists'
      );
      return;
    }

    const targetDate = form.date;
    // Trim trailing whitespace so the blank line left for the cursor after
    // Record Shift Times doesn't get saved if the person never typed into it.
    const cleanForm = { ...form, comments: (form.comments||'').replace(/\s+$/,'') };
    let savedId, updatedEntries;
    if(editing){
      savedId = editing.id;
      updatedEntries = entries.map(e=>e.id===editing.id?{...cleanForm,id:e.id}:e);
      setEntries(updatedEntries);
      addToast('Record updated');
    } else {
      savedId = Date.now().toString();
      updatedEntries = [...entries,{...cleanForm,id:savedId}];
      setEntries(updatedEntries);
      addToast('Overtime logged');
      // nudge backup every 5 entries
      const count=(dualRead(KEYS.backupCount,0)||0)+1;
      dualWrite(KEYS.backupCount,count);
      if(count%5===0) setTimeout(()=>addToast(`${count} records logged — download a backup?`,'warn',{label:'Backup now',fn:handleExport},8000),800);
    }

    // Show the person the record they just saved, in whichever Breakdown view
    // they've set as their default.
    const periodIdx = PAY_PERIODS.findIndex(p=>targetDate>=p.start&&targetDate<=p.end);
    const period = periodIdx>=0 ? PAY_PERIODS[periodIdx] : null;
    skipBreakdownReset.current = true; // this navigation targets a specific entry

    if(defaultBreakdownView==='calendar' && period){
      setBreakdownView('calendar');
      setCalPeriodIdx(periodIdx);
      // open that day's detail popover so the entry is visible straight away
      const dEntries = updatedEntries.filter(e=>e.date===targetDate);
      const dayTotals = dEntries.reduce((acc,e)=>{
        const c=calcEntry(e);
        acc.hrs += c.h1+c.h2+c.h3;
        if(e.paRate && e.paRate!=='None') acc.pa = true;
        return acc;
      },{hrs:0,pa:false});
      setSelectedCalDay({
        ds: targetDate, dEntries, periodIdx,
        totalHrs: dayTotals.hrs, hasPA: dayTotals.pa, hasOT: true,
      });
      if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'auto'});
    } else {
      setBreakdownView('list');
      if(period) setExpanded(period.month);
      setFocusEntryId(savedId);
    }
    setTab('months');

    setForm({...blankForm,date:todayStr}); setEditing(null);
  };

  const startEdit=e=>{ setForm(e); setEditing(e); setTab('add'); };
  const delEntry=id=>{
    const d=entries.find(e=>e.id===id);
    setEntries(prev=>prev.filter(x=>x.id!==id));
    setConfirmDel(null);
    addToast('Record deleted','undo',{label:'Undo',fn:()=>setEntries(prev=>[...prev,d])},7000);
  };

  const [toilTakenForm, setToilTakenForm] = useState({date:todayStr, hours:'', minutes:'00', note:''});
  const addToilTaken = () => {
    const wholeHours = parseInt(toilTakenForm.hours,10)||0;
    const mins = parseInt(toilTakenForm.minutes,10)||0;
    const hrs = wholeHours + mins/60;
    if (!toilTakenForm.date || hrs<=0) { addToast('Enter a date and a positive number of hours','warn'); return; }
    const resultingBalance = toilLedger.balance - hrs;
    setToilTaken(prev=>[...prev, { id:Date.now().toString(), date:toilTakenForm.date, hours:hrs, note:toilTakenForm.note||'' }]);
    setToilTakenForm({date:todayStr, hours:'', minutes:'00', note:''});
    if (resultingBalance < 0) {
      addToast(`Logged — balance is now ${fmtHM(resultingBalance)} h (more taken than earned)`,'warn');
    } else {
      addToast('TOIL taken logged');
    }
  };
  const deleteToilTaken = id => {
    const d = toilTaken.find(t=>t.id===id);
    setToilTaken(prev=>prev.filter(t=>t.id!==id));
    addToast('Entry removed','undo',{label:'Undo',fn:()=>setToilTaken(prev=>[...prev,d])},7000);
  };

  // Standard backup filename convention: OTbackup + day + 3-letter month +
  // 2-digit year. e.g. 21 Sept 2026 -> "OTbackup21Sep26"
  // Deliberately date-only: a second backup on the same day replaces the
  // first, so you keep one current file per day rather than a cluttered folder.
  const backupFileStamp = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2,'0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${pad(d.getDate())}${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
  };

  async function handleExport(){
    const now=Date.now();
    const filename = `OTbackup${backupFileStamp()}.json`;
    const json = JSON.stringify({entries,settings,toilTaken,exportedAt:new Date().toISOString()}, null, 2);

    const markSaved = () => {
      dualWrite(KEYS.backupCount,0); dualWrite(KEYS.backedUpAt,now);
      dualWrite(KEYS.lastBackupReminder,now); setPulseBackupBtn(false);
      addToast('Backup saved');
    };

    // Where supported (Chrome/Edge desktop), let the person choose the folder
    // and confirm the filename. iOS Safari doesn't implement this API, so we
    // fall back to a normal download — which on iOS still opens the share
    // sheet and lets you pick Files/iCloud anyway.
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description:'Overtime & Shift Tracker backup', accept:{ 'application/json':['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        markSaved();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // person cancelled the dialog
        // any other failure falls through to the standard download below
      }
    }

    const blob = new Blob([json], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'),{href:url,download:filename}).click();
    URL.revokeObjectURL(url);
    markSaved();
  }

  // ExcelJS is loaded from a CDN at the moment it's actually needed, rather
  // than as an npm dependency — keeps the deploy to just this one file,
  // same as everything else here, no package.json/build step involved.
  // Using ExcelJS specifically rather than the more common SheetJS here,
  // because SheetJS's free tier doesn't reliably write cell styling (fills,
  // fonts) into the file — confirmed by testing it directly — whereas
  // ExcelJS's free/open-source build genuinely supports it.
  const loadExcelJSLib = () => new Promise((resolve, reject) => {
    if (window.ExcelJS) { resolve(window.ExcelJS); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(script);
  });

  // Exports all logged shifts as an .xlsx workbook — opens directly in
  // Excel/Google Sheets/Numbers. Gross/Net are real numeric cells here
  // (not formatted text like a CSV would need), so they sum and format
  // correctly if someone builds on top of the export in Excel.
  async function handleExportSpreadsheet(start, end, sanitise){
    const headers = [
      'Pay Period','Date','Duty/Reason','1.33x Hours','1.5x Hours','2.0x Hours',
      'PA Rate','Submitted','Breakdown','Gross (£)',
      'Cumulative Taxable Income Before This Entry (£)','Net (£)','Rate Applied','Notes'
    ];
    // DD/MM/YYYY as plain text — deliberately not a real date cell, since
    // date-serial conversion between JS and Excel can silently shift by a
    // day around timezone boundaries. A formatted string always shows
    // exactly what it says, with no risk of that.
    const fmtDDMMYYYY = dateStr => {
      const [y,m,d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    };
    const submittedLabel = e => {
      const hasPA = e.paRate && e.paRate!=='None';
      const otOK = isOtSubmitted(e), paOK = !hasPA || isPaSubmitted(e);
      if (otOK && paOK) return 'Yes';
      if (otOK && !paOK) return 'OT only (PA pending)';
      if (!otOK && paOK) return hasPA ? 'PA only (OT pending)' : 'No';
      return 'No';
    };
    // Which entries fall "within" a date range for export purposes is based
    // on submission date, not the shift's own date — same principle as
    // periodBreakdown's own FY attribution. A shift worked in late March but
    // submitted in April belongs to the new financial year's export, since
    // that's when it actually became real money on CARMS/MetHR, matching
    // how the Home screen's own totals already treat it. An entry qualifies
    // if EITHER its OT or PA submission date falls in range — an entry with
    // only one side submitted still needs to show up once that side lands.
    const inRange = e => {
      if (!start && !end) return true;
      const hasPA = e.paRate && e.paRate!=='None';
      const otDate = isOtSubmitted(e) ? effectiveOtDate(e) : null;
      const paDate = (hasPA && isPaSubmitted(e)) ? effectivePaDate(e) : null;
      const dateInRange = d => d!=null && (!start || d>=start) && (!end || d<=end);
      if (dateInRange(otDate) || dateInRange(paDate)) return true;
      // An entry with nothing submitted at all has no submission date to go
      // by — fall back to its own shift date, so unsubmitted work already
      // sitting in this window still shows up (as £0, same as everywhere
      // else) rather than silently vanishing from the export entirely.
      if (otDate==null && paDate==null) return (!start || e.date>=start) && (!end || e.date<=end);
      return false;
    };
    const sorted = [...entries].filter(inRange).sort((a,b)=>new Date(a.date)-new Date(b.date));
    const rowPeriodIdx = []; // parallel array, one entry per data row (not padding), tracks which pay period it belongs to
    const rows = sorted.map(e=>{
      const c = calcEntry(e);
      const gross = submittedGross(e);
      const pIdx = PAY_PERIODS.findIndex(p=>e.date>=p.start&&e.date<=p.end);
      rowPeriodIdx.push(pIdx);
      const p = pIdx>=0 ? PAY_PERIODS[pIdx] : null;
      const pb = pIdx>=0 ? totals.periodBreakdown[pIdx] : null;
      // Every other entry within this SAME pay period, dated before this
      // one — these stack on top of base salary within the period, same
      // as the main app's own period-by-period calculation does.
      const priorInPeriod = p ? entries.filter(x=>x.date>=p.start && x.date<=p.end && (x.date<e.date || (x.date===e.date && x.id<e.id)))
        .reduce((sum,x)=>sum+submittedGross(x),0) : 0;
      // Cumulative taxable income BEFORE this entry — base salary is taxed
      // first, so overtime stacks on top of it, same as everywhere else in
      // the app. pb.cumAfter is the proven-correct running total (base +
      // all overtime) through the END of this period; subtracting this
      // period's own combinedGross backs it out to "just after this
      // period's base salary, before any of this period's overtime" —
      // then priorInPeriod adds back only what's already been claimed
      // earlier in this same period, ahead of this specific entry.
      const cumulativeBefore = pb ? (pb.cumAfter - pb.combinedGross + priorInPeriod) : 0;
      const periodGrossBefore = (pb ? pb.baseAmt : 0) + priorInPeriod;
      // Year-fraction uses the PERIOD's end date, same as the main app's own
      // periodBreakdown calculation — tax is assessed at the point the whole
      // period gets paid out, not on each shift's own date within it.
      const yearFraction = p ? taxYearFractionForDate(p.end) : taxYearFractionForDate(e.date);
      const result = applyBandTax(cumulativeBefore, gross, yearFraction, periodGrossBefore);
      // A plain-language breakdown of exactly how the Gross figure was made
      // up — e.g. "4hr@1.5x=£60.00 + PA2@£90.00". Respects submission
      // status the same way Gross itself does, so the parts shown here
      // always add up to the Gross value in the next column, rather than
      // showing OT/PA components that haven't actually been claimed yet.
      const hasPA = e.paRate && e.paRate!=='None';
      const breakdownParts = [];
      if (isOtSubmitted(e)) {
        if (c.payH1>0) breakdownParts.push(`${c.payH1}hr@1.33x=£${c.ot1.toFixed(2)}`);
        if (c.payH2>0) breakdownParts.push(`${c.payH2}hr@1.5x=£${c.ot2.toFixed(2)}`);
        if (c.payH3>0) breakdownParts.push(`${c.payH3}hr@2.0x=£${c.ot3.toFixed(2)}`);
      }
      if (hasPA && isPaSubmitted(e)) breakdownParts.push(`${e.paRate}@£${c.pa.toFixed(2)}`);
      const breakdown = breakdownParts.join(' + ') || '—';
      // Leading '' reserves column A for the merged, rotated pay-period
      // label set separately below — this row array only ever fills
      // columns B onward.
      return [
        '', fmtDDMMYYYY(e.date), e.reason||'', c.h1||'', c.h2||'', c.h3||'',
        e.paRate!=='None'?e.paRate:'',
        submittedLabel(e), breakdown,
        Math.round(gross*100)/100,
        Math.round(cumulativeBefore*100)/100,
        Math.round(result.net*100)/100,
        result.bandName ? `${result.bandName} (${result.rate.toFixed(1)}%)` : '',
        sanitise ? '' : (e.comments||'')
      ];
    });

    // Group the chronologically-sorted rows into consecutive blocks by pay
    // period (they're already sorted, so same-period rows are always
    // contiguous), then pad short blocks with blank rows — split before
    // and after — so the merged, rotated month label always has enough
    // vertical room to read comfortably rather than looking cramped or
    // overflowing past its own block.
    const blocks = [];
    for (let i=0; i<rows.length; i++){
      if (i===0 || rowPeriodIdx[i]!==rowPeriodIdx[i-1]) blocks.push({ pIdx: rowPeriodIdx[i], rows: [rows[i]] });
      else blocks[blocks.length-1].rows.push(rows[i]);
    }
    const blankRow = () => Array(headers.length).fill('');
    // A period's own subtotal row — 1.33x/1.5x/2.0x hours, Gross and Net
    // summed across every real entry in that block. Everything else
    // (PA rate, submitted status, cumulative income, rate band, notes)
    // doesn't have a meaningful sum, so those stay blank.
    const totalRowFor = block => {
      const sum = colIdx => block.rows.reduce((s,r)=>s+(parseFloat(r[colIdx])||0),0);
      const row = blankRow();
      row[2] = 'Period Total';
      row[3] = sum(3) || ''; row[4] = sum(4) || ''; row[5] = sum(5) || '';
      row[9] = Math.round(sum(9)*100)/100;
      row[11] = Math.round(sum(11)*100)/100;
      return row;
    };
    const expandedRows = [];
    const expandedRowPeriodIdx = []; // parallel to expandedRows — which period each row (including its padding) belongs to
    const totalRowIndices = []; // which expandedRows indices are subtotal rows, for distinct styling below
    const mergeRanges = []; // { label, startRow, endRow } — 1-indexed spreadsheet row numbers, filled in once expandedRows is built
    blocks.forEach(block => {
      const p = block.pIdx>=0 ? PAY_PERIODS[block.pIdx] : null;
      const label = p ? p.month : '';
      // Rough estimate of rows needed for the rotated label to fit
      // comfortably: character count × font size × a width-to-height
      // factor for rotated proportional text, divided by the default row
      // height — deliberately generous rather than exact, since font
      // metrics vary slightly by viewer. +1 accounts for the subtotal row
      // always present at the end of the block, which also contributes
      // real height, reducing how much blank padding is actually needed.
      const minRowsNeeded = label ? Math.ceil((label.length * 10 * 0.68) / 15) : 0;
      const padTotal = Math.max(0, minRowsNeeded - (block.rows.length + 1));
      const padBefore = Math.floor(padTotal/2), padAfter = padTotal - padBefore;
      const startRow = expandedRows.length + 2; // +2: header is row 1, data starts at row 2
      for (let i=0;i<padBefore;i++) { expandedRows.push(blankRow()); expandedRowPeriodIdx.push(block.pIdx); }
      block.rows.forEach(r => { expandedRows.push(r); expandedRowPeriodIdx.push(block.pIdx); });
      expandedRows.push(totalRowFor(block)); expandedRowPeriodIdx.push(block.pIdx);
      totalRowIndices.push(expandedRows.length - 1);
      for (let i=0;i<padAfter;i++) { expandedRows.push(blankRow()); expandedRowPeriodIdx.push(block.pIdx); }
      const endRow = expandedRows.length + 1;
      if (label) mergeRanges.push({ label, startRow, endRow });
    });

    const suffix = start&&end ? `_${start}_to_${end}` : `_${new Date().toISOString().split('T')[0]}`;
    try {
      const ExcelJS = await loadExcelJSLib();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Overtime Records');

      ws.addRow(headers);
      expandedRows.forEach(r => ws.addRow(r));

      // Header row — grey-blue fill, white bold text, frozen so it stays
      // visible while scrolling through a long list of shifts.
      const headerRow = ws.getRow(1);
      headerRow.height = 24;
      headerRow.eachCell(cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF5C7C99'} };
        cell.font = { bold:true, color:{argb:'FFFFFFFF'}, size:11 };
        cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
        cell.border = { bottom:{style:'medium',color:{argb:'FF3E5A70'}} };
      });
      ws.views = [{ state:'frozen', ySplit:1, xSplit:1 }];

      // Merge and rotate the pay-period label down column A, spanning
      // each period's own block of rows (including its padding, if any).
      mergeRanges.forEach(({label, startRow, endRow}) => {
        ws.mergeCells(`A${startRow}:A${endRow}`);
        const cell = ws.getCell(`A${startRow}`);
        cell.value = label;
        cell.alignment = { textRotation: 90, vertical:'middle', horizontal:'center' };
        cell.font = { bold:true, size:11, color:{argb:'FF3E5A70'} };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} };
        cell.border = { top:{style:'thick',color:{argb:'FF5C7C99'}}, bottom:{style:'thick',color:{argb:'FF5C7C99'}}, left:{style:'thick',color:{argb:'FF5C7C99'}}, right:{style:'thick',color:{argb:'FF5C7C99'}} };
      });

      // Currency columns (J, K, L — Gross/Cumulative/Net, shifted one letter
      // left now that Night Hours has been removed) get the accounting
      // format — aligned £ symbol, thousands separators, a plain dash for
      // zero, matching Excel's own built-in "Accounting" look.
      const acctFmt = '_-£* #,##0.00_-;-£* #,##0.00_-;_-£* "-"??_-;_-@_-';
      const currencyCols = ['J','K','L'];
      const thinGrey = { style:'thin', color:{argb:'FFD9E2E8'} };
      // Thick border wherever the pay period changes from the row above —
      // same grey-blue as the header, so scanning down the list makes it
      // obvious which dates fall within the same pay run. Blank padding
      // rows count as belonging to their surrounding block for this check.
      const periodBoundary = { style:'thick', color:{argb:'FF5C7C99'} };

      const lastDataRow = expandedRows.length + 1;
      const totalRowSet = new Set(totalRowIndices);
      expandedRows.forEach((r, i) => {
        const row = ws.getRow(i+2);
        const isTotalRow = totalRowSet.has(i);
        // Alternating pistachio-tinted stripe for readability on longer
        // exports, rather than a plain flat white background throughout.
        const isStripe = i % 2 === 1;
        const isNewPeriod = i===0 || expandedRowPeriodIdx[i] !== expandedRowPeriodIdx[i-1];
        row.eachCell({ includeEmpty:true }, cell => {
          if (cell.col===1) return; // column A is the merged period label, styled separately above
          if (isTotalRow) {
            // Amber/gold for the period subtotal — a third, clearly distinct
            // colour from the grey-blue header and pistachio stripes, but
            // still part of the app's own established palette (the same
            // amber used for "outstanding" elsewhere), so it reads as
            // intentional rather than random.
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFDF0D5'} };
            cell.font = { bold:true, color:{argb:'FF92400E'} };
            cell.border = { top:{style:'medium',color:{argb:'FFD97706'}}, bottom:thinGrey, left:thinGrey, right:thinGrey };
          } else {
            if (isStripe) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} };
            cell.border = { top:isNewPeriod?periodBoundary:thinGrey, bottom:thinGrey, left:thinGrey, right:thinGrey };
          }
          // Duty/Reason (col 3), Breakdown (col 9) and Notes (col 14) are
          // the three fields most likely to occasionally run longer than
          // the column width comfortably allows — wrap those specifically
          // rather than truncating, so nothing needs manually expanding to read.
          cell.alignment = { vertical:'middle', wrapText: cell.col===3 || cell.col===9 || cell.col===14 };
        });
        currencyCols.forEach(col => { row.getCell(col).numFmt = acctFmt; });
        // A subtle pistachio left-border accent on fully-submitted rows —
        // ties the colour scheme to something functionally meaningful
        // rather than purely decorative. Index 8 is 'Submitted', shifted
        // one place right by the new leading Pay Period column.
        if (!isTotalRow && r[8] === 'Yes') {
          row.getCell('B').border = { ...row.getCell('B').border, left:{style:'medium',color:{argb:'FF8FBC6B'}} };
        }
      });

      // Grand total — one final row summing every real entry across the
      // whole export, not just one period. Same grey-blue as the header
      // rather than the amber used for period subtotals, so it reads as
      // the overall figure rather than another period's total.
      const grandTotalRowNum = lastDataRow + 1;
      const grandTotal = colIdx => rows.reduce((s,r)=>s+(parseFloat(r[colIdx])||0),0);
      const gtRow = ws.getRow(grandTotalRowNum);
      gtRow.getCell('C').value = 'Grand Total';
      gtRow.getCell('D').value = grandTotal(3) || '';
      gtRow.getCell('E').value = grandTotal(4) || '';
      gtRow.getCell('F').value = grandTotal(5) || '';
      gtRow.getCell('J').value = Math.round(grandTotal(9)*100)/100;
      gtRow.getCell('L').value = Math.round(grandTotal(11)*100)/100;
      gtRow.eachCell({ includeEmpty:true }, cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF5C7C99'} };
        cell.font = { bold:true, color:{argb:'FFFFFFFF'}, size:11 };
        cell.border = { top:{style:'thick',color:{argb:'FF3E5A70'}} };
        cell.alignment = { vertical:'middle' };
      });
      ['J','L'].forEach(col => { gtRow.getCell(col).numFmt = acctFmt; });

      // Column widths sized to the longest actual value in each column
      // (header or data), not a guess — genuinely fits the content. Uses
      // getColumn(index) explicitly rather than ws.columns.forEach, since
      // a column with no non-empty data cells (e.g. PA Rate when nothing
      // has PA, or Notes when sanitised) isn't reliably picked up by the
      // implicit columns array otherwise. Floor is 10, not 9 — confirmed
      // by direct testing that a width of exactly 9 gets silently dropped
      // by this version of the library when the file is written.
      headers.forEach((h, i) => {
        if (i===0) { ws.getColumn(1).width = 6; return; } // Pay Period column — narrow, since text is rotated
        let maxLen = String(h).length;
        for (let r=0; r<expandedRows.length; r++){
          const len = String(expandedRows[r][i] ?? '').length;
          if (len > maxLen) maxLen = len;
        }
        ws.getColumn(i+1).width = Math.min(Math.max(maxLen + 2, 10), 65);
      });

      // AutoFilter lets Excel filter/sort directly — e.g. down to just the
      // rows still pending submission. Starts at column B, not A: column A
      // is the merged, rotated Pay Period label, and merged cells inside
      // an AutoFilter range behave unreliably in Excel (a filter action can
      // hide part of a merged block while leaving the rest visible).
      ws.autoFilter = `B1:N${lastDataRow}`;

      // Print setup — landscape and fit-to-width, since this sheet is wide;
      // the header row repeats on every printed page so a multi-page
      // printout still reads correctly without it.
      ws.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left:0.4, right:0.4, top:0.5, bottom:0.5, header:0.2, footer:0.2 }
      };
      ws.pageSetup.printTitlesRow = '1:1';

      // Conditional formatting on the Submitted column — anything still
      // outstanding gets flagged in red at a glance, without needing to
      // scan the whole column manually. Excludes blank cells explicitly,
      // so the always-empty padding and subtotal rows aren't caught by it.
      ws.addConditionalFormatting({
        ref: `H2:H${lastDataRow}`,
        rules: [{
          type: 'expression',
          formulae: [`AND(H2<>"Yes",H2<>"")`],
          style: {
            fill: { type:'pattern', pattern:'solid', bgColor:{argb:'FFFEE2E2'} },
            font: { bold:true, color:{argb:'FFB91C1C'} }
          }
        }]
      });

      // ── Summary worksheet — a second tab giving the headline figures
      // without needing to scroll or add up the detailed sheet by hand.
      const sws = wb.addWorksheet('Summary');
      sws.getColumn(1).width = 22; sws.getColumn(2).width = 20; sws.getColumn(3).width = 20;
      sws.getColumn(4).width = 45; sws.getColumn(5).width = 12;

      const titleCell = sws.getCell('A1');
      titleCell.value = 'Overtime & Shift Tracker — Summary';
      titleCell.font = { bold:true, size:14, color:{argb:'FF0F172A'} };
      sws.mergeCells('A1:C1');
      sws.getCell('A2').value = `Generated ${new Date().toLocaleDateString('en-GB')}`;
      sws.getCell('A2').font = { size:10, color:{argb:'FF64748B'} };

      const sectionHeaderStyle = cell => {
        cell.font = { bold:true, size:12, color:{argb:'FFFFFFFF'} };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF5C7C99'} };
        cell.alignment = { vertical:'middle' };
      };
      const labelValueRow = (r, label, value, isCurrency) => {
        sws.getCell(`A${r}`).value = label;
        sws.getCell(`A${r}`).font = { bold:true, color:{argb:'FF0F172A'} };
        const vc = sws.getCell(`B${r}`);
        vc.value = value;
        if (isCurrency) vc.numFmt = acctFmt;
        vc.font = { color:{argb:'FF0F172A'} };
      };

      // Year to date
      sws.mergeCells('A4:C4');
      sectionHeaderStyle(sws.getCell('A4'));
      sws.getCell('A4').value = 'Year to Date';
      labelValueRow(5, 'Gross YTD', Math.round(totals.combinedGrossYTD*100)/100, true);
      labelValueRow(6, 'Net YTD', Math.round(totals.combinedNetYTD*100)/100, true);
      labelValueRow(7, 'Current TOIL Balance (hrs)', Math.round(toilLedger.balance*100)/100, false);

      // By pay period — reuses the same set of periods that actually
      // appear in the detailed sheet, respecting whatever date range was
      // exported, rather than dumping the whole financial year regardless.
      let r = 9;
      sws.mergeCells(`A${r}:C${r}`);
      sectionHeaderStyle(sws.getCell(`A${r}`));
      sws.getCell(`A${r}`).value = 'By Pay Period';
      r++;
      ['Period','Gross (£)','Net (£)'].forEach((h,i) => {
        const c = sws.getCell(r, i+1);
        c.value = h; c.font = { bold:true, color:{argb:'FF3E5A70'} };
        c.border = { bottom:{style:'thin',color:{argb:'FFD9E2E8'}} };
      });
      r++;
      mergeRanges.forEach(({label}, i) => {
        // Gross/Net shown here are this period's SUBMITTED totals from the
        // detailed sheet's own subtotal row — matches what's actually in
        // the export, not the app's live figures which may have since moved on.
        const periodGross = blocks[i].rows.reduce((s,row)=>s+(parseFloat(row[9])||0),0);
        const periodNet = blocks[i].rows.reduce((s,row)=>s+(parseFloat(row[11])||0),0);
        sws.getCell(r,1).value = label;
        sws.getCell(r,2).value = Math.round(periodGross*100)/100; sws.getCell(r,2).numFmt = acctFmt;
        sws.getCell(r,3).value = Math.round(periodNet*100)/100; sws.getCell(r,3).numFmt = acctFmt;
        if (i%2===1) [1,2,3].forEach(c=>{ sws.getCell(r,c).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} }; });
        r++;
      });

      // TOIL history — the full all-time ledger, same as the TOIL tab in
      // the app itself, since TOIL carries over and isn't scoped to a tax
      // year or the date range picked for this specific export.
      r += 1;
      sws.mergeCells(`A${r}:C${r}`);
      sectionHeaderStyle(sws.getCell(`A${r}`));
      sws.getCell(`A${r}`).value = 'TOIL History (All-Time)';
      r++;
      ['Date','Type','Hours','Note','Balance After'].forEach((h,i) => {
        const c = sws.getCell(r, i+1);
        c.value = h; c.font = { bold:true, color:{argb:'FF3E5A70'} };
        c.border = { bottom:{style:'thin',color:{argb:'FFD9E2E8'}} };
      });
      r++;
      toilLedger.rows.forEach((row, i) => {
        sws.getCell(r,1).value = fmtDDMMYYYY(row.date);
        sws.getCell(r,2).value = row.type==='earned' ? 'Banked' : 'Taken';
        sws.getCell(r,3).value = Math.round(row.hours*100)/100;
        sws.getCell(r,4).value = row.note;
        sws.getCell(r,5).value = Math.round(row.balanceAfter*100)/100;
        if (i%2===1) [1,2,3,4,5].forEach(c=>{ sws.getCell(r,c).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} }; });
        r++;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'),{href:url,download:`OvertimeShiftTracker_Records${suffix}.xlsx`}).click();
      URL.revokeObjectURL(url);
      addToast('Spreadsheet exported');
    } catch (err) {
      addToast('Could not reach the spreadsheet library — check your connection and try again');
    }
  }

  const handleImport=ev=>{
    const fr=new FileReader();
    fr.onload=e=>{ const d=JSON.parse(e.target.result); setEntries(d.entries); setSettings(migrateSettings(d.settings)); setToilTaken(d.toilTaken||[]); setTab('dashboard'); addToast('Backup restored'); };
    fr.readAsText(ev.target.files[0]);
  };

  // Clears local data as before, and — new — the same user's rows in
  // Supabase, when there's an active session. Deliberately does NOT delete
  // the auth account/email itself; that's what Delete Account is for,
  // separately. Cloud deletes are attempted first: if any of them fail,
  // local data is left untouched rather than risk local being wiped while
  // stale cloud data silently survives.
  const handleWipe = async () => {
    setWipingData(true);
    if (supabase && session) {
      try {
        const uid = session.user.id;
        const results = await Promise.all([
          supabase.from('entries').delete().eq('user_id', uid),
          supabase.from('toil_taken').delete().eq('user_id', uid),
          supabase.from('settings').delete().eq('user_id', uid),
        ]);
        if (results.some(r => r.error)) {
          setWipingData(false);
          addToast('Couldn\u2019t fully clear cloud data \u2014 check your connection and try again', 'warn', null, 6000);
          return;
        }
      } catch (e) {
        setWipingData(false);
        addToast('Couldn\u2019t clear cloud data \u2014 check your connection and try again', 'warn', null, 6000);
        return;
      }
    }
    setEntries([]); setToilTaken([]); saveSett({rank:'',service:''});
    lastSyncedEntriesRef.current.clear(); persistLastSyncedEntries();
    lastSyncedToilRef.current.clear(); persistLastSyncedToil();
    lastSyncedSettingsRef.current = null; persistLastSyncedSettings();
    setWipingData(false);
    setWipeConf(false);
    setTab('dashboard');
  };
  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setDataKey(null);
    addToast('Signed out', 'success');
    // No manual state changes needed — onAuthStateChange (in the effect above)
    // picks this up and clears session automatically, which sends the app
    // straight back to the sign-in gate.
  };

  // Permanently deletes the Supabase Auth account itself — not just this
  // device's data. This can't be done directly from the browser (deleting
  // an auth user needs the service_role key, which never ships to client
  // code), so it calls a small Edge Function that does it server-side.
  // Deleting the auth user cascades to entries/toil_taken/settings/user_keys
  // automatically via the "on delete cascade" foreign keys in the schema —
  // nothing else needs deleting here. Local data on this device is
  // deliberately untouched — the real distinction from Wipe All Data is
  // that this removes the account and email entirely; Wipe All Data clears
  // everything (local and cloud) but leaves the same account signed in.
  const handleDeleteAccount = async () => {
    if (!supabase) return;
    setDeletingAcct(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDataKey(null);
      setDeleteAcctConf(false);
      setDeleteAcctTyped('');
      addToast('Account deleted', 'success', null, 5000);
      // Session clears via onAuthStateChange once the token this session
      // was using no longer resolves to an existing user, same as sign-out.
    } catch (e) {
      addToast('Couldn\u2019t delete account \u2014 ' + (e.message || 'try again'), 'warn', null, 6000);
    } finally {
      setDeletingAcct(false);
    }
  };

  // Manual "sync now" — the same pull-and-merge already used on unlock and
  // on realtime reconnect, just triggered on demand instead of waiting for
  // one of those moments. Push isn't included deliberately: local changes
  // already push themselves the moment they happen, so there's nothing a
  // manual push would do that hasn't already been attempted.
  // Every path that ends in "the app is now unlocked" — a fresh sign-in,
  // finishing recovery-secret setup, or recovering after a password reset
  // — calls this. Always landing back on Home regardless of which path got
  // here, rather than wherever `tab` happened to be left from an earlier
  // sign-out in the same session.
  const handleUnlocked = (dek) => {
    setDataKey(dek);
    setTab('dashboard');
  };

  // Hard-deletes entries/toil_taken rows older than the 5-financial-year
  // cloud retention window (see isWithinCloudRetention above) — a real
  // DELETE, not a soft-delete, since the goal is to actually reduce what's
  // stored in Supabase. The server has no way to know which rows qualify
  // on its own — dates live inside the encrypted ciphertext, not in a
  // plaintext column — so this decrypts each row client-side first,
  // decides locally, then deletes only those specific rows by id.
  // Throttled to at most once a day; local data is never touched here.
  const pruneOldCloudData = async () => {
    if (!supabase || !session || !dataKey) return;
    const today = new Date().toISOString().split('T')[0];
    if (dualRead(KEYS.lastCloudPruneCheck, null) === today) return;
    const uid = session.user.id;
    try {
      for (const table of ['entries', 'toil_taken']) {
        const { data: rows, error } = await supabase.from(table).select('id, ciphertext, deleted_at').eq('user_id', uid);
        if (error || !rows) continue;
        const idsToDelete = [];
        for (const row of rows) {
          if (row.deleted_at) continue; // already soft-deleted — not this policy's concern
          try {
            const decrypted = await decryptWithDataKey(dataKey, row.ciphertext);
            if (decrypted.date && !isWithinCloudRetention(decrypted.date)) idsToDelete.push(row.id);
          } catch (e) { /* undecryptable — leave it alone rather than guess */ }
        }
        if (idsToDelete.length > 0) {
          const { error: delError } = await supabase.from(table).delete().eq('user_id', uid).in('id', idsToDelete);
          if (delError) console.error(`[retention] failed to prune ${table}:`, delError.message || delError);
          else console.log(`[retention] pruned ${idsToDelete.length} row(s) from ${table} older than ${CLOUD_RETENTION_CUTOFF}`);
        }
      }
      dualWrite(KEYS.lastCloudPruneCheck, today);
    } catch (e) {
      console.error('[retention] prune check failed:', e.message || e);
    }
  };

  const handleManualSync = async () => {
    if (!supabase || !session || !dataKey) { addToast('Not signed in \u2014 nothing to sync', 'warn'); return; }
    setManualSyncing(true);
    try {
      await Promise.all([
        pullAndMergeRows('entries', entriesRef, setEntries, lastSyncedEntriesRef, persistLastSyncedEntries),
        pullAndMergeRows('toil_taken', toilTakenRef, setToilTaken, lastSyncedToilRef, persistLastSyncedToil),
        pullAndMergeSettings(),
      ]);
      pruneOldCloudData();
      addToast('Synced', 'success', null, 2000);
    } catch (e) {
      addToast('Sync failed \u2014 check your connection', 'warn');
    } finally {
      setManualSyncing(false);
    }
  };

  // Scrolls the main container so a month card sits just below the sticky
  // header. The header's height is measured live (it changes between views,
  // since the month pills are only present in List View), so the card is
  // never left partly hidden behind it.
  const scrollToMonth = (month, smooth=true) => {
    const el = monthRefs.current[month];
    const cont = mainRef.current;
    if (!el || !cont) return;
    const stickyH = stickyRef.current ? stickyRef.current.offsetHeight : 58;
    const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - stickyH - 8;
    cont.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  };

  // Snaps List View to whichever period we're currently in. The delay lets
  // React finish rendering first — switching views changes the sticky
  // header's height, and arriving from another tab has to mount it entirely.
  const snapToActiveMonth = (smooth=true, delay=90) => {
    if (currPeriodIdx < 0) return; // today falls outside this financial year
    const month = PAY_PERIODS[currPeriodIdx].month;
    setTimeout(()=>scrollToMonth(month, smooth), delay);
  };

  const jumpTo=month=>{ setExpanded(month); setTimeout(()=>scrollToMonth(month),80); };

  // After saving, scroll the newly created/updated record into view and give it
  // a brief highlight, so the person can see their entry landed correctly.
  useEffect(()=>{
    if(!focusEntryId || tab!=='months' || breakdownView!=='list') return;
    const t = setTimeout(()=>{
      const el = entryRefs.current[focusEntryId];
      const cont = mainRef.current;
      if(el && cont){
        const stickyH = stickyRef.current ? stickyRef.current.offsetHeight : 58;
        const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - stickyH - 12;
        cont.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
      }
      setTimeout(()=>setFocusEntryId(null), 2200);
    }, 220);
    return ()=>clearTimeout(t);
  },[focusEntryId, tab, breakdownView]);

  // Same idea, for jumping from CARMS Outstanding straight to the on/off
  // toggles on the Log Overtime edit screen, rather than just opening the
  // form at the top and leaving the person to scroll down themselves.
  useEffect(()=>{
    if(!focusCarmsToggle || tab!=='add') return;
    const t = setTimeout(()=>{
      const el = carmsToggleRef.current;
      const cont = mainRef.current;
      if(el && cont){
        const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - 12;
        cont.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
      }
      setTimeout(()=>setFocusCarmsToggle(false), 2200);
    }, 220);
    return ()=>clearTimeout(t);
  },[focusCarmsToggle, tab]);

  // Jumping to a specific period group in CARMS Outstanding from a "CARMS &
  // MetHR pending" panel in Summary — same scroll-then-fade shape as the
  // two effects above.
  useEffect(()=>{
    if(pulsePeriodIdx===null || tab!=='carms') return;
    const t = setTimeout(()=>{
      const el = periodGroupRefs.current[pulsePeriodIdx];
      const cont = mainRef.current;
      if(el && cont){
        const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - 12;
        cont.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
      }
      setTimeout(()=>setPulsePeriodIdx(null), 2200);
    }, 220);
    return ()=>clearTimeout(t);
  },[pulsePeriodIdx, tab]);

  // ── display helpers ────────────────────────────────────────────────────────

  // Today's effective rates were shown on Home; now only surfaced in Options.

  // ── styles ─────────────────────────────────────────────────────────────────
  const S={
    wrap: {display:'flex',flexDirection:'column',height:'100dvh',maxWidth:'430px',margin:'0 auto',background:'#f8fafc',fontFamily:"'DM Sans',system-ui,sans-serif",color:'#0f172a',position:'relative',boxShadow:'0 0 60px rgba(0,0,0,0.14)',overflow:'hidden'},
    hdr:  {background:'#fff',padding:'13px 18px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,zIndex:10},
    main: {flex:1,overflowY:'auto',overflowX:'hidden',minWidth:0,scrollbarWidth:'none',msOverflowStyle:'none'},
    nav:  {background:'rgba(255,255,255,0.96)',backdropFilter:'blur(14px)',borderTop:'1px solid #e2e8f0',position:'absolute',bottom:0,width:'100%',padding:'7px 4px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',zIndex:20},
    nBtn: (a,add)=>({flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',padding:add?'9px 4px':'6px 4px',background:'transparent',color:add?'#10b981':a?'#2563eb':'#94a3b8',borderRadius:add?'13px':'8px',border:'none',cursor:'pointer',transition:'all 0.18s',fontFamily:'inherit',boxShadow:'none'}),
    nLbl: {fontSize:'8px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap'},
    card: {background:'#fff',borderRadius:'18px',padding:'18px',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',border:'1px solid #f1f5f9',marginBottom:'10px'},
    dark: {background:'#0f2744',borderRadius:'18px',padding:'19px',boxShadow:'0 8px 28px rgba(15,39,68,0.28)',marginBottom:'10px',position:'relative',overflow:'hidden'},
    lbl:  {display:'block',fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'7px'},
    inp:  {width:'100%',background:'#f8fafc',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a'},
    ta:   {width:'100%',background:'#f8fafc',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',outline:'none',fontFamily:'inherit',resize:'none',boxSizing:'border-box',color:'#0f172a'},
    sel:  {width:'100%',background:'#f8fafc',border:'1px solid #e2e8f0',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a',appearance:'none'},
  };

  // ── Trends charts — shared between the inline (small) card and the
  // enlarge modal (big), so both stay pixel-for-pixel consistent. Tapping a
  // point shows a value callout; tapping it again (or a different point)
  // swaps it out. Tooltip boxes use dominantBaseline:'middle' per line and
  // explicit padding, rather than guessing baseline offsets, specifically so
  // text can't spill outside the box regardless of font metrics.
  const renderCumulativeChart = (big) => {
    const data = totals.cumData, max = Math.max(...data.map(d=>d.cumulative), 200);
    const W = big?520:330, H = big?260:150, pX = big?46:34, pY = big?20:12;
    const eW = W-pX*2, eH = H-pY*2;
    const fsAxis = big?11:8, fsLbl = big?11:8, ptR = big?6:4, lineW = big?3.5:2.5;
    const pts = data.map((d,i)=>({x:pX+i*(eW/(data.length-1)), y:H-pY-(d.cumulative/max)*eH, val:d.cumulative, lbl:d.short}));
    const path = pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
    const fillPath = `${path} L ${pts[pts.length-1].x} ${H-pY} L ${pts[0].x} ${H-pY} Z`;
    const gradId = big?'cgBig':'cgSmall';
    const tapPt = (chartTap && chartTap.chart==='cum' && chartTap.big===big) ? pts[chartTap.i] : null;
    const toggle = i => setChartTap(t=>(t&&t.chart==='cum'&&t.i===i&&t.big===big)?null:{chart:'cum',i,big});

    let tooltip = null;
    if (tapPt) {
      const tw = big?115:88;
      const padTop = big?17:13, lineH = big?18:14, padBottom = big?10:8;
      const th = padTop + lineH + padBottom;
      let tx = tapPt.x - tw/2; if (tx<2) tx=2; if (tx+tw>W-2) tx=W-2-tw;
      let ty = tapPt.y - th - 10; if (ty<2) ty = tapPt.y + 14;
      tooltip = (
        <g>
          <rect x={tx} y={ty} width={tw} height={th} rx="7" fill="#1e3a5f"/>
          <text x={tx+tw/2} y={ty+padTop} textAnchor="middle" dominantBaseline="middle" style={{fontSize:big?10:8,fontWeight:900,fill:'#93c5fd'}}>{tapPt.lbl}</text>
          <text x={tx+tw/2} y={ty+padTop+lineH} textAnchor="middle" dominantBaseline="middle" style={{fontSize:big?13:11,fontWeight:900,fill:'#fff'}}>{fmtGBP(tapPt.val)}</text>
        </g>
      );
    }

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',overflow:'visible'}} preserveAspectRatio="none">
        <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
        {[0,0.5,1].map(v=>(<g key={v}><line x1={pX} y1={H-pY-v*eH} x2={W-pX} y2={H-pY-v*eH} stroke="#f1f5f9" strokeWidth="1" strokeDasharray={v===0?'0':'3 4'}/><text x={pX-4} y={H-pY-v*eH} textAnchor="end" dominantBaseline="middle" style={{fontSize:fsAxis,fill:'#cbd5e1',fontWeight:700}}>£{Math.round(max*v)}</text></g>))}
        {pts.map((p,i)=><text key={i} x={p.x} y={H-pY+(big?17:11)} textAnchor="middle" style={{fontSize:fsLbl,fill:'#94a3b8',fontWeight:900}}>{p.lbl}</text>)}
        <path d={fillPath} fill={`url(#${gradId})`} opacity="0.22"/>
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={ptR} fill="#2563eb" stroke="white" strokeWidth="2" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
            <circle cx={p.x} cy={p.y} r={ptR+8} fill="transparent" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
          </g>
        ))}
        {tooltip}
      </svg>
    );
  };

  // Full financial year Overtime & PA totals — same card that used to live on
  // Home, now shown at the end of both Summary views instead, since it's a
  // whole-year figure and belongs alongside the rest of the year's detail
  // rather than competing with Home's day-to-day figures.
  const renderFYTotalsCard = () => (
    <div style={{...S.card,background:'#2563eb',border:'none',marginTop:'9px',boxShadow:'0 6px 20px rgba(37,99,235,0.28)'}}>
      <div style={{fontSize:'11px',fontWeight:900,color:'#dbeafe',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'10px'}}>Overtime & PA — FY {CURRENT_FY_YEAR}/{(CURRENT_FY_YEAR+1).toString().slice(-2)}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
        <div>
          <div style={{fontSize:'11px',fontWeight:900,color:'#bfdbfe',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'3px'}}>Gross OT</div>
          <div style={{fontSize:'18px',fontWeight:900,color:'#fff'}}>{fmt(totals.totalGross)}</div>
        </div>
        <div>
          <div style={{fontSize:'11px',fontWeight:900,color:'#bbf7d0',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'3px'}}>Net OT</div>
          <div style={{fontSize:'18px',fontWeight:900,color:'#dcfce7'}}>{fmt(totals.totalNet)}</div>
        </div>
        <div>
          <div style={{fontSize:'11px',fontWeight:900,color:'#bfdbfe',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'3px'}}>Hours</div>
          <div style={{fontSize:'18px',fontWeight:900,color:'#fff',display:'flex',alignItems:'center',gap:'5px'}}><Ico n="clock" s={13} c="rgba(255,255,255,0.6)"/>{totals.totalHrs.toFixed(1)}</div>
        </div>
      </div>
    </div>
  );

  const renderMonthlyChart = (big, dark=false) => {
    const data = totals.periodBreakdown.map(pb=>({short:PAY_PERIODS.find(p=>p.month===pb.month).short, gross:pb.combinedGross, net:pb.combinedNet}));
    const max = Math.max(...data.map(d=>d.gross), 200);
    const W = big?520:330, H = big?300:170, pX = big?46:34, pY = big?20:12;
    const eW = W-pX*2, eH = H-pY*2;
    const fsAxis = big?11:8, fsLbl = big?11:8, ptR = big?6:3, lineW = big?3:2;
    const pts = data.map((d,i)=>({x:pX+i*(eW/(data.length-1)), yG:H-pY-(d.gross/max)*eH, yN:H-pY-(d.net/max)*eH, g:d.gross, n:d.net, lbl:d.short}));
    const gp = pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.yG}`).join(' ');
    const np = pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.yN}`).join(' ');
    const tapPt = (chartTap && chartTap.chart==='mon' && chartTap.big===big) ? pts[chartTap.i] : null;
    const toggle = i => setChartTap(t=>(t&&t.chart==='mon'&&t.i===i&&t.big===big)?null:{chart:'mon',i,big});
    // Dark variant sits on the navy Total Gross YTD card, so grid/label
    // colours flip to bright blue-white instead of slate-on-white.
    const gridStroke = dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';
    const axisFill    = dark ? '#64748b' : '#cbd5e1';
    const lblFill      = dark ? '#94a3b8' : '#94a3b8';
    const dotStroke   = dark ? '#0f2744' : 'white';
    const tooltipBg    = dark ? '#132f52' : '#1e3a5f';

    let tooltip = null;
    if (tapPt) {
      const tw = big?150:114;
      const padTop = big?16:12, lineH = big?17:14, padBottom = big?10:8;
      const th = padTop + lineH*2 + padBottom;
      let tx = tapPt.x - tw/2; if (tx<2) tx=2; if (tx+tw>W-2) tx=W-2-tw;
      const topY = Math.min(tapPt.yG, tapPt.yN);
      let ty = topY - th - 10; if (ty<2) ty = Math.max(tapPt.yG,tapPt.yN) + 14;
      tooltip = (
        <g>
          <rect x={tx} y={ty} width={tw} height={th} rx="7" fill={tooltipBg}/>
          <text x={tx+tw/2} y={ty+padTop} textAnchor="middle" dominantBaseline="middle" style={{fontSize:big?10:8,fontWeight:900,fill:'#93c5fd'}}>{tapPt.lbl}</text>
          <text x={tx+tw/2} y={ty+padTop+lineH} textAnchor="middle" dominantBaseline="middle" style={{fontSize:big?11:9,fontWeight:800,fill:'#6ee7b7'}}>Gross {fmtGBP(tapPt.g)}</text>
          <text x={tx+tw/2} y={ty+padTop+lineH*2} textAnchor="middle" dominantBaseline="middle" style={{fontSize:big?11:9,fontWeight:800,fill:'#fca5a5'}}>Net {fmtGBP(tapPt.n)}</text>
        </g>
      );
    }

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',overflow:'visible'}} preserveAspectRatio="none">
        {[0,0.5,1].map(v=>(<g key={v}><line x1={pX} y1={H-pY-v*eH} x2={W-pX} y2={H-pY-v*eH} stroke={gridStroke} strokeWidth="1" strokeDasharray={v===0?'0':'3 4'}/><text x={pX-4} y={H-pY-v*eH} textAnchor="end" dominantBaseline="middle" style={{fontSize:fsAxis,fill:axisFill,fontWeight:700}}>£{Math.round(max*v)}</text></g>))}
        {pts.map((p,i)=><text key={i} x={p.x} y={H-pY+(big?17:11)} textAnchor="middle" style={{fontSize:fsLbl,fill:lblFill,fontWeight:900}}>{p.lbl}</text>)}
        <path d={np} fill="none" stroke="#f87171" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round"/>
        <path d={gp} fill="none" stroke="#34d399" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x} cy={p.yG} r={ptR} fill="#34d399" stroke={dotStroke} strokeWidth="1.5" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
            <circle cx={p.x} cy={p.yG} r={ptR+7} fill="transparent" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
            <circle cx={p.x} cy={p.yN} r={ptR} fill="#f87171" stroke={dotStroke} strokeWidth="1.5" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
            <circle cx={p.x} cy={p.yN} r={ptR+7} fill="transparent" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
          </g>
        ))}
        {tooltip}
      </svg>
    );
  };

  // Payslip data for an arbitrary date range. Reuses the same tax/NI approach
  // already used for the Log Overtime live preview: this range's gross is
  // treated as a slice stacked on top of everything else logged this tax
  // year (for cumulative income tax banding) and on top of the rest of its
  // containing pay period (for NI, which resets each period). Whole-period
  // exports are exact since they match how totals.periodBreakdown is built;
  // custom ranges spanning multiple periods are a reasonable estimate.
  const computePayslipData = (start, end) => {
    // If the requested range reaches back before the tax year containing its
    // end date, everything shown is clipped to that tax year only — keeping
    // hours, PA counts, and gross/tax all describing the same scope, and
    // keeping gross consistent with combinedGrossYTD below (which is itself
    // scoped to the current tax year). clippedFrom is exposed so the PDF can
    // show an honest note when this happens.
    const taxYearStartForRange = getUKTaxYearStart(end);
    const clipped = start < taxYearStartForRange;
    const effectiveStart = clipped ? taxYearStartForRange : start;
    const rangeEntries = entries.filter(e=>e.date>=effectiveStart&&e.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
    let ot=0, night=0, pa=0, hrs=0, toilBanked=0;
    const rateHrs = { hours133:0, hours150:0, hours200:0 };
    const paCounts = { PA1:0, PA2:0, PA3:0 };
    rangeEntries.forEach(e=>{
      const c = calcEntry(e);
      const hasPA = e.paRate && e.paRate!=='None';
      // Money figures respect submission status, same principle as
      // totals/the spreadsheet export — an unsubmitted OT claim hasn't
      // actually landed as pay yet, so it shouldn't inflate what this
      // payslip shows as gross/net. Hours worked stay unconditional below,
      // since that's a factual record of the shift regardless of
      // submission status, matching how the rest of the app treats it.
      if (isOtSubmitted(e)) { ot += c.ot; toilBanked += c.toilBanked; }
      if (hasPA && isPaSubmitted(e)) { pa += c.pa; paCounts[e.paRate] = (paCounts[e.paRate]||0)+1; }
      hrs += c.h1+c.h2+c.h3;
      rateHrs.hours133 += c.payH1; rateHrs.hours150 += c.payH2; rateHrs.hours200 += c.payH3;
    });
    const gross = ot + night + pa;

    // Pension — same principle as the Home £100k Tax Calculator: pensionable
    // pay is basic salary + London Weighting only (overtime/PA/London
    // Allowance are all non-pensionable), the tier is judged on the
    // annualised YTD-through-this-report rate, and the contribution comes
    // off pay BEFORE income tax, which is why it reduces the taxable
    // cumulative baseline below — but never National Insurance.
    const svcData = settings.rank && settings.service ? PAY_RATES[settings.rank]?.[settings.service] : null;
    const tyFracForEnd = taxYearFractionForDate(end);
    const pensionablePayYTDThroughEnd = svcData
      ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, taxYearStartForRange, end) + monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStartForRange, end)
      : 0;
    const pensionablePayForRange = svcData
      ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, effectiveStart, end) + monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, effectiveStart, end)
      : 0;
    const pensionRate = pensionTierRate(pensionablePayYTDThroughEnd / tyFracForEnd);
    const pensionYTDThroughEnd = pensionablePayYTDThroughEnd * pensionRate;
    const pensionForRange = pensionablePayForRange * pensionRate;

    const endIdx = PAY_PERIODS.findIndex(p=>end>=p.start&&end<=p.end);
    const pb = endIdx>=0 ? totals.periodBreakdown[endIdx] : null;
    const cumulativeBefore = Math.max(0, totals.combinedGrossYTD - gross - pensionYTDThroughEnd);
    const periodGrossBefore = pb ? Math.max(0, (pb.baseAmt+pb.ot+pb.night+pb.pa) - gross) : 0; // NI stays on full gross, unaffected by pension
    const result = applyBandTax(cumulativeBefore, gross, tyFracForEnd, periodGrossBefore);
    const r = getRates(settings.rank, settings.service, end);

    return { rangeEntries, ot, night, pa, hrs, toilBanked, rateHrs, paCounts, gross,
      net:result.net, tax:result.tax, ni:result.ni, bandName:result.bandName, rate:result.rate, rates:r,
      pensionForRange, pensionRate, pensionablePayForRange,
      clippedFrom: clipped ? effectiveStart : null };
  };

  const handleGenerateExport = () => {
    if (payslipMode==='financialYear') {
      if (payslipFYYear==null) return;
      const yPeriods = generateFYPeriods(payslipFYYear);
      const start = yPeriods[0].start, end = yPeriods[11].end;
      if (exportFormat==='csv') { handleExportSpreadsheet(start, end, sanitiseNotes); setPayslipModalOpen(false); return; }
      // PDF: the current year's tax/NI figures are accurate (same context the
      // rest of the app uses), so it gets the normal payslip-style report.
      // A past year's cumulative context is stale, so — same reasoning as
      // Archived Financial Years — it opens that gross-only, period-grouped
      // view instead, now with a Print button for exactly this purpose.
      if (payslipFYYear===CURRENT_FY_YEAR) {
        setPayslipPreview({ start, end, rangeLabel: `${yPeriods[0].month} – ${yPeriods[11].month}`, label: `FY ${payslipFYYear}/${(payslipFYYear+1).toString().slice(-2)}`, data: computePayslipData(start, end) });
      } else {
        setArchiveExpandedPeriod(null);
        setFySummaryPrintMode(true);
        setFySummaryYear(payslipFYYear);
      }
      setPayslipModalOpen(false);
      return;
    }
    let start, end, label;
    if (payslipMode==='period' && payslipPeriodIdx!=null) {
      const p = PAY_PERIODS[payslipPeriodIdx];
      start = p.start; end = p.end; label = p.month;
    } else if (payslipMode==='custom' && payslipStart && payslipEnd && payslipEnd>=payslipStart) {
      start = payslipStart; end = payslipEnd; label = `${fmtD(start)} – ${fmtD(end)}`;
    } else return;
    if (exportFormat==='csv') { handleExportSpreadsheet(start, end, sanitiseNotes); setPayslipModalOpen(false); return; }
    setPayslipPreview({ start, end, label, data: computePayslipData(start, end) });
    setPayslipModalOpen(false);
  };

  // Archived-year data — grouped by pay period, individual entries included.
  // Deliberately no tax/NI estimate: that math leans on the CURRENT year's
  // cumulative gross and period breakdown, which isn't the right context for
  // a past year — rather than produce a number that looks precise but isn't,
  // this sticks to what can be stated correctly regardless of year (gross
  // figures, hours, shift counts).
  const computeArchivedYear = (year) => {
    const yPeriods = generateFYPeriods(year);
    let totalShifts = 0, totalGross = 0, totalHrs = 0, totalToilBanked = 0;
    // Same submission-date attribution as periodBreakdown and the
    // spreadsheet export — a shift's OT and PA can each land in a different
    // pay period, depending on when each was actually submitted, same as
    // the real payslip. An entry with nothing submitted yet falls back to
    // its own shift date, so it still shows up (at £0) rather than
    // vanishing. Each period only counts the portion of an entry's gross
    // that actually belongs to it — an entry whose OT and PA submission
    // dates straddle two different periods appears in both, but each period
    // shows only its own share, so nothing gets double-counted overall.
    const periods = yPeriods.map(p=>{
      const pEntries = entries.filter(e=>{
        const hasPA = e.paRate && e.paRate!=='None';
        const otDate = isOtSubmitted(e) ? effectiveOtDate(e) : null;
        const paDate = (hasPA && isPaSubmitted(e)) ? effectivePaDate(e) : null;
        const inP = d => d!=null && d>=p.start && d<=p.end;
        if (inP(otDate) || inP(paDate)) return true;
        if (otDate==null && paDate==null) return e.date>=p.start && e.date<=p.end;
        return false;
      }).sort((a,b)=>a.date.localeCompare(b.date));
      let periodGross = 0;
      const rows = pEntries.map(e=>{
        const c = calcEntry(e);
        const hasPA = e.paRate && e.paRate!=='None';
        const otInThisPeriod = isOtSubmitted(e) && effectiveOtDate(e)>=p.start && effectiveOtDate(e)<=p.end;
        const paInThisPeriod = hasPA && isPaSubmitted(e) && effectivePaDate(e)>=p.start && effectivePaDate(e)<=p.end;
        const rowGross = (otInThisPeriod ? c.ot : 0) + (paInThisPeriod ? c.pa : 0);
        periodGross += rowGross; totalHrs += c.h1+c.h2+c.h3;
        if (otInThisPeriod) totalToilBanked += c.toilBanked;
        return { id:e.id, date:e.date, reason:e.reason, gross:rowGross };
      });
      totalShifts += pEntries.length; totalGross += periodGross;
      return { ...p, entries: rows, gross: periodGross };
    }).filter(p=>p.entries.length>0);
    return { year, start: yPeriods[0].start, end: yPeriods[11].end, totalShifts, totalGross, totalHrs, totalToilBanked, periods };
  };

  // ── auth gate ──────────────────────────────────────────────────────────────
  // Placed after every hook above has already run (React's rules of hooks
  // require that), so it's safe to branch the actual render here. An active
  // session is required to reach the app below. If Supabase itself is
  // unreachable or misconfigured (supabase is null), this still falls back
  // to rendering the app rather than a dead end — see the client setup above.
  if (authLoading) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',background:'#f8fafc'}}>
        <span style={{fontSize:'13px',fontWeight:700,color:'#94a3b8',fontFamily:"'DM Sans',system-ui,sans-serif"}}>Loading…</span>
      </div>
    );
  }
  if (supabase && passwordRecoveryMode) {
    return (
      <AuthScreens
        key="recovery"
        supabase={supabase}
        addToast={addToast}
        onUnlocked={handleUnlocked}
        startInPasswordRecovery={true}
        onRecoveryComplete={()=>setPasswordRecoveryMode(false)}
        isWide={isWide}
      />
    );
  }
  if (supabase && (!session || !dataKey)) {
    return <AuthScreens key="normal" supabase={supabase} addToast={addToast} onUnlocked={handleUnlocked} isWide={isWide} />;
  }

  return (
    <div style={isWide ? {...S.wrap, maxWidth:'980px', margin:'0 auto 0 250px'} : S.wrap}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes su{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes urgentPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(220,38,38,0);transform:scale(1)}25%{opacity:0.78;box-shadow:0 0 0 9px rgba(220,38,38,0.38);transform:scale(1.012)}50%{opacity:1;box-shadow:0 0 0 0 rgba(220,38,38,0);transform:scale(1)}75%{opacity:0.78;box-shadow:0 0 0 9px rgba(220,38,38,0.38);transform:scale(1.012)}}
        @keyframes backupPulse{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}30%{box-shadow:0 0 0 8px rgba(37,99,235,0.35)}50%{box-shadow:0 0 0 0 rgba(37,99,235,0)}70%{box-shadow:0 0 0 8px rgba(37,99,235,0.35)}}
        @keyframes subtlePulse{0%{opacity:0.5}20%{opacity:1}40%{opacity:0.5}60%{opacity:1}80%,100%{opacity:0.5}}
        @keyframes entryFlash{0%{box-shadow:0 0 0 0 rgba(37,99,235,0.45)}60%{box-shadow:0 0 0 10px rgba(37,99,235,0)}100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}}
        .entry-flash{animation:entryFlash 1.4s ease-out 2}
        @keyframes carmsPulse{
          0%{box-shadow:0 0 0 0 rgba(37,99,235,0.6); transform:scale(1);}
          20%{box-shadow:0 0 0 16px rgba(37,99,235,0); transform:scale(1.02);}
          40%{box-shadow:0 0 0 0 rgba(37,99,235,0.6); transform:scale(1);}
          60%{box-shadow:0 0 0 16px rgba(37,99,235,0); transform:scale(1.02);}
          100%{box-shadow:0 0 0 0 rgba(37,99,235,0); transform:scale(1);}
        }
        .carms-pulse{animation:carmsPulse 1.6s ease-out;}
        @keyframes navAddPulse{0%,100%{opacity:1}50%{opacity:0.45}}
        .nav-add-pulse{animation:navAddPulse 1.8s ease-in-out infinite;}
        /* ── Fluid mobile nav ───────────────────────────────────────────
           Six tabs at fixed sizes leave almost no slack on a 320px phone
           (an iPhone SE) — "Log Overtime" in particular ends up exactly
           filling its slot with nothing to spare, so anything that nudges
           it wider (a longer label, a larger system font) would break the
           row. clamp() scales the icons, labels and padding continuously
           with viewport width instead: small phones get proportionally
           smaller elements, while anything from ~390px up is pinned to the
           original sizes, so nothing changes on the phones that already
           fit comfortably. CSS width/height overrides the SVG's own
           width/height attributes, which can't take clamp() themselves. */
        nav .nav-ico svg{
          width:clamp(15px, 4.6vw, 18px) !important;
          height:clamp(15px, 4.6vw, 18px) !important;
        }
        nav .nav-ico-add svg{
          width:clamp(18px, 5.4vw, 21px) !important;
          height:clamp(18px, 5.4vw, 21px) !important;
        }
        nav .nav-lbl{ font-size:clamp(6.4px, 2.05vw, 8px) !important; letter-spacing:clamp(0.1px, 0.13vw, 0.5px) !important; }
        nav button{ padding-left:clamp(1px, 1vw, 4px) !important; padding-right:clamp(1px, 1vw, 4px) !important; }
        .star-tap{transition:transform 0.12s}
        .star-tap:active{transform:scale(1.35)}
        .hint-pulse{animation:subtlePulse 1.8s ease-in-out infinite}
        .backup-pulse{animation:backupPulse 1.4s ease-in-out infinite}
        .fi{animation:fi 0.22s ease}
        .setup-pulse-urgent{animation:urgentPulse 1.5s ease-in-out infinite}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input:focus,select:focus,textarea:focus{outline:2px solid #2563eb;outline-offset:-2px}
        input,select,textarea{font-size:16px}
        button:active{opacity:0.8;transform:scale(0.96)}
        input[type=date]{-webkit-appearance:none;appearance:none;color-scheme:light;line-height:1.2}
        input[type=date]::-webkit-date-and-time-value{text-align:left}
        input[type=date]::-webkit-datetime-edit{padding:0}
        input[type=date]::-webkit-calendar-picker-indicator{background:transparent;cursor:pointer;opacity:0.55;padding:0;margin:0}
        @media print{
          .no-print{display:none !important}
          .payslip-print-area{position:static !important;inset:auto !important;width:100% !important;max-width:none !important;max-height:none !important;overflow:visible !important;background:#fff !important;padding:0 !important}
          .payslip-print-doc{box-shadow:none !important;border-radius:0 !important}
          body,html{background:#fff !important}
        }
      `}</style>

      <div className="no-print"><ToastStack toasts={toasts} onDismiss={dismissToast}/></div>

      {/* ── header ── */}
      <header className="no-print" style={S.hdr}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',minWidth:0}}>
          <ClockCashIcon width={28} height={19}/>
          <div style={{display:'flex',flexDirection:'column',lineHeight:1.2,minWidth:0,overflow:'hidden'}}>
            <span style={{fontSize:'19px',fontWeight:900,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',letterSpacing:'-0.4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Overtime &amp; Shift Tracker</span>
            <span style={{fontSize:'13px',fontWeight:700,color:'#94a3b8',letterSpacing:'0.2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>by Adam Stephens</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',flexShrink:0}}>
          {session&&(
            <button onClick={handleManualSync} disabled={manualSyncing} aria-label="Sync now" style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 13px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'9px',color:'#2563eb',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:manualSyncing?'default':'pointer',whiteSpace:'nowrap'}}>
              <span style={{display:'flex',animation:manualSyncing?'spin 0.8s linear infinite':'none'}}><Ico n="refresh" s={13} c="#2563eb"/></span> Sync
            </button>
          )}
        </div>
      </header>

      {/* ── sign-out confirmation — bottom sheet, same pattern as the export
           modal, with an explicit close (×) as well as Cancel ── */}
      {signOutConfirmOpen&&(
        <div onClick={()=>setSignOutConfirmOpen(false)} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.55)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:60}}>
          <div onClick={e=>e.stopPropagation()} className="fi" style={{background:'#fff',borderRadius:isWide?'20px':'20px 20px 0 0',width:'100%',maxWidth:'430px',padding:'20px',boxSizing:'border-box',position:'relative',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
            <button onClick={()=>setSignOutConfirmOpen(false)} aria-label="Close" style={{position:'absolute',top:'14px',right:'14px',width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',background:'#f1f5f9',border:'none',borderRadius:'50%',cursor:'pointer'}}>
              <Ico n="x" s={14} c="#64748b"/>
            </button>
            {!isWide && <div style={{width:'36px',height:'4px',background:'#e2e8f0',borderRadius:'4px',margin:'0 auto 14px'}}/>}
            <div style={{fontSize:'15px',fontWeight:900,marginBottom:'6px',textAlign:'center'}}>Sign out?</div>
            <div style={{fontSize:'12px',color:'#64748b',textAlign:'center',marginBottom:'18px',lineHeight:1.5}}>You'll need your password again to get back in. Data already synced stays exactly as it is.</div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{ setSignOutConfirmOpen(false); handleSignOut(); }} style={{flex:1,padding:'12px',background:'#2563eb',border:'none',borderRadius:'11px',color:'#fff',fontWeight:900,fontSize:'11px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Sign Out</button>
              <button onClick={()=>setSignOutConfirmOpen(false)} style={{flex:1,padding:'12px',background:'#f1f5f9',border:'none',borderRadius:'11px',color:'#64748b',fontWeight:900,fontSize:'11px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {restoreConfirmOpen&&(
        <div onClick={()=>setRestoreConfirmOpen(false)} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.55)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:60}}>
          <div onClick={e=>e.stopPropagation()} className="fi" style={{background:'#fff',borderRadius:isWide?'20px':'20px 20px 0 0',width:'100%',maxWidth:'430px',padding:'20px',boxSizing:'border-box',position:'relative',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
            <button onClick={()=>setRestoreConfirmOpen(false)} aria-label="Close" style={{position:'absolute',top:'14px',right:'14px',width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',background:'#f1f5f9',border:'none',borderRadius:'50%',cursor:'pointer'}}>
              <Ico n="x" s={14} c="#64748b"/>
            </button>
            {!isWide && <div style={{width:'36px',height:'4px',background:'#e2e8f0',borderRadius:'4px',margin:'0 auto 14px'}}/>}
            <div style={{fontSize:'15px',fontWeight:900,marginBottom:'6px',textAlign:'center'}}>Are you sure you want to overwrite the existing data?</div>
            <div style={{fontSize:'12px',color:'#64748b',textAlign:'center',marginBottom:'18px',lineHeight:1.5}}>Do you want to create a backup before proceeding?</div>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <button onClick={async ()=>{ setRestoreConfirmOpen(false); await handleExport(); fileRef.current.click(); }} style={{padding:'12px',background:'#2563eb',border:'none',borderRadius:'11px',color:'#fff',fontWeight:900,fontSize:'11px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Back Up, Then Restore</button>
              <button onClick={()=>{ setRestoreConfirmOpen(false); fileRef.current.click(); }} style={{padding:'12px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'11px',color:'#b91c1c',fontWeight:900,fontSize:'11px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Restore Without Backup</button>
              <button onClick={()=>setRestoreConfirmOpen(false)} style={{padding:'12px',background:'#f1f5f9',border:'none',borderRadius:'11px',color:'#64748b',fontWeight:900,fontSize:'11px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── monthly backup reminder — optional, dismissible, never blocks the app ── */}
      {showBackupReminder&&(
        <div className="fi no-print" style={{background:'#eff6ff',borderBottom:'1px solid #bfdbfe',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px',flexShrink:0,zIndex:15}}>
          <div style={{background:'#dbeafe',borderRadius:'10px',padding:'7px',flexShrink:0}}><Ico n="shield" s={15} c="#2563eb"/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:'12px',color:'#1e3a5f',marginBottom:'2px'}}>Time for a backup</div>
            <div style={{fontSize:'11px',color:'#3b82f6',lineHeight:1.4,marginBottom:'8px'}}>It's been a couple of weeks — worth downloading a fresh backup of your records.</div>
            <div style={{display:'flex',gap:'7px'}}>
              <button onClick={goBackupNow} style={{background:'#2563eb',border:'none',borderRadius:'8px',padding:'6px 13px',fontWeight:900,fontSize:'10px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Back Up Now</button>
              <button onClick={dismissBackupReminder} style={{background:'none',border:'none',padding:'6px 4px',fontWeight:700,fontSize:'10px',color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>Not now</button>
            </div>
          </div>
          <button onClick={dismissBackupReminder} style={{background:'none',border:'none',cursor:'pointer',padding:'2px',flexShrink:0}}><Ico n="x" s={15} c="#94a3b8"/></button>
        </div>
      )}

      {/* ── financial year rollover — one-time, dismissible, never blocks the app ── */}
      {showFYRollover&&(
        <div className="fi no-print" style={{background:'#eff6ff',borderBottom:'1px solid #bfdbfe',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px',flexShrink:0,zIndex:15}}>
          <div style={{background:'#dbeafe',borderRadius:'10px',padding:'7px',flexShrink:0}}><Ico n="star" s={15} c="#2563eb"/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:'12px',color:'#1e3a5f',marginBottom:'2px'}}>Welcome to FY {CURRENT_FY_YEAR}/{(CURRENT_FY_YEAR+1).toString().slice(-2)}</div>
            <div style={{fontSize:'11px',color:'#3b82f6',lineHeight:1.4,marginBottom:'8px'}}>Your {CURRENT_FY_YEAR-1}/{CURRENT_FY_YEAR.toString().slice(-2)} year is complete — find it any time under Financial Years in Options.</div>
            <div style={{display:'flex',gap:'7px'}}>
              <button onClick={()=>{dismissFYRollover();setTab('settings');}} style={{background:'#2563eb',border:'none',borderRadius:'8px',padding:'6px 13px',fontWeight:900,fontSize:'10px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>View Last Year</button>
              <button onClick={dismissFYRollover} style={{background:'none',border:'none',padding:'6px 4px',fontWeight:700,fontSize:'10px',color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>Got it</button>
            </div>
          </div>
          <button onClick={dismissFYRollover} style={{background:'none',border:'none',cursor:'pointer',padding:'2px',flexShrink:0}}><Ico n="x" s={15} c="#94a3b8"/></button>
        </div>
      )}

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <main ref={mainRef} className="no-print" style={S.main}>

        {/* ══════════════════════════════════════════ DASHBOARD */}
        {tab==='dashboard'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            {!settings.rank&&(
              <div className="setup-pulse-urgent" style={{background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:'14px',padding:'13px 14px',marginBottom:'12px',display:'flex',gap:'11px',alignItems:'flex-start'}}>
                <Ico n="uPlus" s={19} c="#dc2626"/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,color:'#991b1b',fontSize:'13px',marginBottom:'3px'}}>Setup Required</div>
                  <div style={{color:'#b91c1c',fontSize:'12px',marginBottom:'8px'}}>Configure your rank and pay in More..</div>
                  <button onClick={()=>setTab('settings')} style={{background:'#fca5a5',border:'none',borderRadius:'8px',padding:'5px 11px',fontWeight:900,fontSize:'11px',color:'#7f1d1d',cursor:'pointer',fontFamily:'inherit'}}>Go to More.. →</button>
                </div>
              </div>
            )}

            {/* ── Total combined earnings card — the main/first card, now with Tax Threshold merged in below a divider ── */}
            <div style={S.dark}>
              <div style={{position:'absolute',right:'-14px',top:'-14px',width:'72px',height:'72px',background:'rgba(255,255,255,0.04)',borderRadius:'50%'}}/>

              {/* header */}
              <div style={{fontSize:'15px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'3px'}}>
                Total Gross YTD
              </div>
              <div style={{fontSize:'28px',fontWeight:900,color:'#fff',letterSpacing:'-2px',lineHeight:1,marginTop:'4px',marginBottom:'3px'}}>
                {settings.rank&&settings.service ? fmtGBP(totals.combinedGrossYTD) : '—'}
              </div>
              <div style={{fontSize:'11px',fontWeight:700,color:'#94a3b8',marginBottom:'12px'}}>
                {settings.rank&&settings.service
                  ? `${Math.round(totals.taxYearDaysElapsed)} days into ${totals.taxYearStart.split('-')[0]}/${(parseInt(totals.taxYearStart.split('-')[0])+1).toString().slice(-2)} tax year`
                  : 'Set your rank & pay point in More..'}
              </div>
              {carmsOutstanding.totalAmount>0&&(
                <div onClick={()=>setTab('carms')} style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'11px',fontWeight:800,color:'#fbbf24',cursor:'pointer'}}>
                  <Ico n="clock" s={11} c="#fbbf24"/>+{fmtGBP(carmsOutstanding.totalAmount)} not yet submitted to CARMS
                </div>
              )}
            </div>

            {/* ── Salary Breakdown & Forecast — collapsed by default, same
                 tap-to-expand pattern as Account & Data Management below.
                 Keeps the top card to just the headline figure, with the
                 six-line breakdown and both gauge bars tucked away here
                 rather than all visible at once on first open. ── */}
            {settings.rank&&settings.service&&(
              <div style={{...S.card,cursor:'pointer'}} onClick={()=>setSalaryBreakdownExpanded(v=>!v)}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'11px'}}>
                    <div style={{background:'#eff6ff',padding:'10px',borderRadius:'12px',flexShrink:0}}><Ico n="bar" s={17} c="#2563eb"/></div>
                    <div>
                      <div style={{fontWeight:900,fontSize:'10.5px',color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px'}}>Salary Breakdown &amp; Overtime Forecast</div>
                      <div style={{fontSize:'10.5px',color:'#94a3b8',marginTop:'1px'}}>Base, allowances, overtime, full-year projection</div>
                    </div>
                  </div>
                  <span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',flexShrink:0}}>{salaryBreakdownExpanded?'Tap to Close':'Tap to expand'}</span>
                </div>

                {salaryBreakdownExpanded&&(
                  <div onClick={e=>e.stopPropagation()} style={{cursor:'default'}}>
                    {/* breakdown rows — London Weighting/Allowance shown as YTD out of full year */}
                    <div style={{borderTop:'1px solid #f1f5f9',marginTop:'14px',paddingTop:'12px',display:'flex',flexDirection:'column',gap:'6px'}}>
                      {[
                        ['Base Salary (YTD)', totals.salaryYTD, null],
                        ['London Weighting', settings.rank&&settings.service ? totals.lwYTD : null, totals.lwAnnualTotal],
                        ['London Allowance', settings.rank&&settings.service ? totals.laYTD : null, totals.laAnnualTotal],
                      ].map(([label,val,fullYear])=>(
                        <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>{label}</span>
                          <span style={{fontSize:'13px',fontWeight:900,color:val==null?'#94a3b8':'#0f172a'}}>
                            {val==null
                              ? 'Set rank & pay point'
                              : fullYear!=null
                                ? <>{fmtGBP(val)}<span style={{color:'#94a3b8',fontWeight:700}}> / {fmtGBP(fullYear)}</span></>
                                : fmtGBP(val)}
                          </span>
                        </div>
                      ))}
                      {[
                        ['Overtime', totals.totalOTGross, totals.totalOTNet],
                        ['PA',       totals.totalPAGross, totals.totalPANet],
                      ].map(([label,gross,net])=>(
                        <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>{label}</span>
                          <span style={{fontSize:'13px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(gross)}<span style={{color:'#059669',fontWeight:700}}> ({fmtGBP(net)})</span></span>
                        </div>
                      ))}
                      <div style={{fontSize:'9.5px',fontWeight:600,color:'#94a3b8',textAlign:'right',marginTop:'2px'}}>Figures in brackets, e.g. <span style={{color:'#059669'}}>(£xx.xx)</span>, are net</div>
                    </div>

                    {/* ── Gross Salary (Actual) ── */}
                    {(()=>{
                      const grossYTD = totals.combinedGrossYTD;
                      const over100k = grossYTD > 100000;
                      const paNow = over100k ? Math.max(0, 12570 - Math.floor((grossYTD-100000)/2)) : 12570;
                      const scaleMax = Math.max(125140, grossYTD*1.05);
                      const pct = v => Math.max(0, Math.min(100, (v/scaleMax)*100));
                      const barColor = grossYTD>=100000 ? '#ef4444' : grossYTD>=50270 ? '#f59e0b' : '#059669';
                      const statusText = grossYTD>=125140 ? '+£125k — No PA' : grossYTD>=100000 ? '+£100k — PA tapering' : grossYTD>=50270 ? 'Higher rate' : 'Basic rate';
                      const markers = [
                        { key:'pa',  value: paNow,  label: paNow===0 ? 'PA £0' : over100k ? `PA £${(paNow/1000).toFixed(1)}k` : 'PA £12.6k' },
                        { key:'hr',  value: 50270,  label: '£50.3k' },
                        { key:'100', value: 100000, label: '£100k' },
                        { key:'125', value: 125140, label: '£125.1k' },
                      ];
                      return (
                        <div onClick={e=>{e.stopPropagation();scrollToTaxImpact.current=true;setTaxImpactExpanded(true);setTab('settings');}} style={{borderTop:'1px solid #f1f5f9',marginTop:'14px',paddingTop:'12px',cursor:'pointer'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'26px'}}>
                            <div style={{fontSize:'11px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.5px'}}>Gross Salary (Actual)</div>
                            <div style={{fontSize:'10px',fontWeight:800,color:barColor}}>{statusText}</div>
                          </div>
                          <div style={{position:'relative',marginBottom:'16px'}}>
                            <div style={{background:'#eef1f5',borderRadius:'2px',height:'10px',overflow:'hidden',position:'relative'}}>
                              <div style={{width:`${pct(grossYTD)}%`,height:'100%',background:barColor,transition:'width 0.3s, background 0.3s'}}/>
                            </div>
                            {markers.map(m=>(
                              <div key={m.key} style={{position:'absolute',left:`${pct(m.value)}%`,top:'-2px',width:'2px',height:'14px',background:'#cbd5e1',transform:'translateX(-1px)'}}>
                                <div style={{position:'absolute',top:'17px',left:'50%',transform:'translateX(-50%)',fontSize:'8px',fontWeight:800,color:'#64748b',whiteSpace:'nowrap'}}>{m.label}</div>
                              </div>
                            ))}
                            <div style={{position:'absolute',left:`${pct(grossYTD)}%`,top:'-5px',width:'3px',height:'20px',background:barColor,transform:'translateX(-1.5px)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}/>
                            <div style={{position:'absolute',left:`${pct(grossYTD)}%`,top:'-19px',transform:'translateX(-50%)',fontSize:'10px',fontWeight:900,color:barColor,whiteSpace:'nowrap'}}>£{(grossYTD/1000).toFixed(1)}k</div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Gross Salary (Forecast) — full-year projection at your current overtime pace ── */}
                    {(()=>{
                      const proj = totals.projectedAnnualGross;
                      const over100k = proj > 100000;
                      const paNow = over100k ? Math.max(0, 12570 - Math.floor((proj-100000)/2)) : 12570;
                      const scaleMax = Math.max(125140, proj*1.05);
                      const pct = v => Math.max(0, Math.min(100, (v/scaleMax)*100));
                      const barColor = proj>=100000 ? '#ef4444' : proj>=50270 ? '#f59e0b' : '#059669';
                      const statusText = proj>=125140 ? '+£125k — No PA' : proj>=100000 ? '+£100k — PA tapering' : proj>=50270 ? 'Higher rate' : 'Basic rate';
                      const markers = [
                        { key:'pa',  value: paNow,  label: paNow===0 ? 'PA £0' : over100k ? `PA £${(paNow/1000).toFixed(1)}k` : 'PA £12.6k' },
                        { key:'hr',  value: 50270,  label: '£50.3k' },
                        { key:'100', value: 100000, label: '£100k' },
                        { key:'125', value: 125140, label: '£125.1k' },
                      ];
                      return (
                        <div onClick={e=>{e.stopPropagation();scrollToTaxImpact.current=true;setTaxImpactExpanded(true);setTab('settings');}} style={{borderTop:'1px solid #f1f5f9',marginTop:'14px',paddingTop:'12px',cursor:'pointer'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'3px'}}>
                            <div style={{fontSize:'11px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.5px'}}>Gross Salary (Forecast)</div>
                            <div style={{fontSize:'10px',fontWeight:800,color:barColor}}>{statusText}</div>
                          </div>
                          <div style={{fontSize:'9.5px',fontWeight:600,color:'#94a3b8',marginBottom:'19px'}}>Forecast based on your overtime submissions</div>
                          <div style={{position:'relative',marginBottom:'16px'}}>
                            <div style={{background:'#eef1f5',borderRadius:'2px',height:'10px',overflow:'hidden',position:'relative'}}>
                              <div style={{width:`${pct(proj)}%`,height:'100%',background:barColor,transition:'width 0.3s, background 0.3s'}}/>
                            </div>
                            {markers.map(m=>(
                              <div key={m.key} style={{position:'absolute',left:`${pct(m.value)}%`,top:'-2px',width:'2px',height:'14px',background:'#cbd5e1',transform:'translateX(-1px)'}}>
                                <div style={{position:'absolute',top:'17px',left:'50%',transform:'translateX(-50%)',fontSize:'8px',fontWeight:800,color:'#64748b',whiteSpace:'nowrap'}}>{m.label}</div>
                              </div>
                            ))}
                            <div style={{position:'absolute',left:`${pct(proj)}%`,top:'-5px',width:'3px',height:'20px',background:barColor,transform:'translateX(-1.5px)',boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}/>
                            <div style={{position:'absolute',left:`${pct(proj)}%`,top:'-19px',transform:'translateX(-50%)',fontSize:'10px',fontWeight:900,color:barColor,whiteSpace:'nowrap'}}>£{(proj/1000).toFixed(1)}k</div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Monthly Gross vs Net — expands and collapses
                         together with the rest of the card now, rather than
                         needing its own separate toggle. A clearly visible
                         divider (not just the usual faint hairline) marks
                         where the gauge bars end and the chart begins,
                         since on a wide desktop card the two sections sat
                         close enough to read as one continuous block. ── */}
                    <div style={{borderTop:'2px solid #e2e8f0',marginTop:'22px',paddingTop:'20px'}}>
                      <div style={{fontSize:'11px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'12px'}}>Monthly OT Gross/Net</div>
                      <div style={{maxWidth:isWide?'75%':'100%',margin:'0 auto'}}>
                        {renderMonthlyChart(false, false)}
                      </div>
                      <div style={{display:'flex',justifyContent:'center',gap:'18px',marginTop:'8px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'13px',height:'2.5px',background:'#059669',borderRadius:'2px'}}/><span style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</span></div>
                        <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'13px',height:'2.5px',background:'#ef4444',borderRadius:'2px'}}/><span style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1px'}}>Net</span></div>
                      </div>
                      <div style={{textAlign:'center',marginTop:'6px',fontSize:'9px',color:'#94a3b8'}}>Tap any point for that period's figure</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CARMS Outstanding — only shown once there's actually
                 something outstanding, tapping through to the full view ── */}
            {carmsOutstanding.totalClaims>0&&(
              <div onClick={()=>setTab('carms')} style={{...S.card,cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                  <div style={{background:'#fffbeb',padding:'11px',borderRadius:'13px',flexShrink:0}}><Ico n="checklist" s={19} c="#d97706"/></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:900,fontSize:'10.5px',color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'2px'}}>CARMS &amp; MetHR Awaiting Submission</div>
                    <div style={{fontSize:'17px',fontWeight:900,color:'#d97706',marginTop:'6px'}}>{fmtGBP(carmsOutstanding.totalAmount)}</div>
                    <div style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:600,marginTop:'1px'}}>{carmsOutstanding.totalClaims} claim{carmsOutstanding.totalClaims!==1?'s':''} across {carmsOutstanding.periodCount} pay period{carmsOutstanding.periodCount!==1?'s':''}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TOIL summary card — stays a genuine warning card in red when
                 overdrawn (a real status worth the saturated colour), but
                 drops to a neutral white card with a coloured icon chip
                 when the balance is fine, rather than being solid purple
                 for no functional reason. ── */}
            <div onClick={()=>setTab('graph')} style={toilLedger.balance<0
              ? {...S.card,background:'#fef2f2',border:'1px solid #fecaca',cursor:'pointer'}
              : {...S.card,cursor:'pointer'}
            }>
              <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                <div style={{background:toilLedger.balance<0?'#fee2e2':'#f5f3ff',padding:'11px',borderRadius:'13px',flexShrink:0}}><Ico n="clock" s={19} c={toilLedger.balance<0?'#b91c1c':'#7c3aed'}/></div>
                <div>
                  <div style={{fontSize:'10.5px',fontWeight:900,color:toilLedger.balance<0?'#b91c1c':'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px'}}>TOIL Balance{toilLedger.balance<0?' — Overdrawn':''}</div>
                  <div style={{fontSize:'17px',fontWeight:900,color:toilLedger.balance<0?'#b91c1c':'#0f172a',marginTop:'1px'}}>{fmtHM(toilLedger.balance)} h</div>
                  <div style={{fontSize:'10.5px',fontWeight:700,color:toilLedger.balance<0?'#dc2626':'#94a3b8',marginTop:'1px'}}>≈ {(toilLedger.balance/8).toFixed(1)} days at 8h/day</div>
                </div>
              </div>
            </div>

            {/* ── Current pay period — tap through to Calendar view in Summary ── */}
            {totals.curr&&(
              <div onClick={()=>{ skipBreakdownReset.current=true; setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); setTab('months'); }} style={{...S.card,cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                  <div style={{background:'#f0fdfa',padding:'11px',borderRadius:'13px',flexShrink:0}}><Ico n="cal" s={19} c="#0d9488"/></div>
                  <div>
                    <div style={{fontSize:'10.5px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px'}}>Current Pay Period</div>
                    <div style={{fontSize:'17px',fontWeight:900,color:'#0f172a',marginTop:'1px'}}>{totals.curr.month}</div>
                    <div style={{fontSize:'10.5px',fontWeight:700,color:'#94a3b8',marginTop:'1px'}}>{fmtD(totals.curr.start)} – {fmtD(totals.curr.end)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── At a Glance — mobile-only equivalent of the desktop
                 secondary column's own widget, since phones don't have
                 that extra space to show it persistently alongside
                 everything else. Positioned as the last card on Home. ── */}
            {!isWide&&(()=>{
              const pb = currPeriodIdx>=0 ? totals.periodBreakdown[currPeriodIdx] : null;
              return (
                <div style={S.card}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:'12px'}}>
                    <div style={{background:'#dcfce7',padding:'11px',borderRadius:'13px',flexShrink:0}}><Ico n="cash" s={19} c="#15803d"/></div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:900,fontSize:'10.5px',color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'8px'}}>Gross &amp; Net OT — Current Period</div>
                      <div style={{display:'flex',justifyContent:'space-between',gap:'12px'}}>
                        <div>
                          <div style={{fontSize:'9.5px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</div>
                          <div style={{fontSize:'17px',fontWeight:900,color:'#0f172a',marginTop:'1px'}}>{pb?fmtGBP(pb.combinedGross):'£0.00'}</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:'9.5px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Net</div>
                          <div style={{fontSize:'17px',fontWeight:900,color:'#059669',marginTop:'1px'}}>{pb?fmtGBP(pb.combinedNet):'£0.00'}</div>
                        </div>
                      </div>
                      <div style={{fontSize:'10.5px',color:'#94a3b8',marginTop:'8px'}}>{pb?pb.month:'—'} · submitted only</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{fontSize:'10.5px',color:'#b91c1c',textAlign:'center',lineHeight:1.5,padding:'8px 12px 0'}}>For guidance only. Always verify amounts against your payslip.</div>
          </div>
        )}

        {/* ══════════════════════════════════════════ LOG SHIFT */}
        {tab==='add'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:isWide?'14px':'160px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'18px'}}>
              {editing&&<button onClick={()=>{setEditing(null);setTab('months');}} style={{background:'#f1f5f9',border:'none',borderRadius:'10px',padding:'8px',cursor:'pointer',display:'flex'}}><Ico n="back" s={16}/></button>}
              <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',margin:0,letterSpacing:'-0.5px'}}>{editing?'Edit Record':'Log Overtime'}</h2>
            </div>

            {!settings.rank||!settings.service ? (
              /* ── blocked until rank & pay point are configured — no figures can be entered until then ── */
              <div style={{background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:'18px',padding:'26px 20px',textAlign:'center'}}>
                <div style={{width:'52px',height:'52px',borderRadius:'50%',background:'#fee2e2',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                  <Ico n="uPlus" s={24} c="#dc2626"/>
                </div>
                <div style={{fontWeight:900,fontSize:'15px',color:'#991b1b',marginBottom:'6px'}}>Setup Required</div>
                <div style={{fontSize:'12px',color:'#b91c1c',lineHeight:1.6,marginBottom:'16px'}}>You need to select your rank and pay point in More.. before you can log overtime. This ensures your pay is calculated correctly from the start.</div>
                <button onClick={()=>setTab('settings')} style={{background:'#dc2626',border:'none',borderRadius:'11px',padding:'12px 22px',fontWeight:900,fontSize:'12px',color:'#fff',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(220,38,38,0.3)'}}>Go to More.. →</button>
              </div>
            ) : (
            <>
            {/* date + duty + notes */}
            <div style={S.card}>
              <div style={{marginBottom:'13px'}}>
                <label style={S.lbl}>Date</label>
                {isWide ? (
                  <button onClick={()=>{ setDatePickerMonth((form.date||todayStr).slice(0,7)); setDatePickerFor('shift'); }} style={{...S.inp,display:'block',boxSizing:'border-box',height:'46px',textAlign:'left',cursor:'pointer',fontFamily:'inherit'}}>
                    {new Date((form.date||todayStr)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
                  </button>
                ) : (
                  <input type="date" style={{...S.inp,display:'block',boxSizing:'border-box',height:'46px'}} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
                )}
              </div>
              <div style={{marginBottom:'13px'}}><label style={S.lbl}>Duty / Reason</label><input type="text" placeholder="e.g. MPL7XX, PXX" style={S.inp} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></div>

              {/* Manual Override — auto-calculated shift times/rate is now the
                  default; flip this on to fall back to the classic free-entry
                  hours grid instead. */}
              <div style={{marginBottom:'13px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#eff6ff',border:'1.5px solid #bfdbfe',borderRadius:'13px',padding:'12px 13px'}}>
                  <div style={{fontSize:'14px',fontWeight:900,color:'#1e3a5f'}}>Rostered CARM Shift / Actual Shift</div>
                  <div onClick={()=>{
                      const switchingToManual = form.recordShiftTimes; // currently auto → about to go manual
                      setForm(f=>syncShiftTimesIntoForm({...f, recordShiftTimes:!switchingToManual, otRateTier: !switchingToManual && !f.otRateTier ? 'hours133' : f.otRateTier}));
                    }} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',flexShrink:0}}>
                    <span style={{fontSize:'9px',fontWeight:600,color:'#64748b'}}>Input Hours Manually</span>
                    <div style={{width:'32px',height:'18px',borderRadius:'10px',position:'relative',flexShrink:0,transition:'background 0.2s',background:!form.recordShiftTimes?'#2563eb':'#e2e8f0'}}>
                      <div style={{width:'14px',height:'14px',borderRadius:'50%',background:'#fff',position:'absolute',top:'2px',transition:'left 0.2s',left:!form.recordShiftTimes?'16px':'2px',boxShadow:'0 1px 2px rgba(0,0,0,0.3)'}}/>
                    </div>
                  </div>
                </div>

                {form.recordShiftTimes&&(
                  <div style={{background:'#eff6ff',border:'1.5px solid #bfdbfe',borderTop:'none',borderRadius:'0 0 13px 13px',marginTop:'-13px',padding:'15px 13px 13px'}}>
                    <div style={{height:'2px'}}/>

                    {/* Normal Duty vs Rest Day Working (RDW) — on RDW there's no
                        roster to compare against, so the whole shift is overtime */}
                    <div style={{display:'flex',gap:'6px',background:'#dbeafe',borderRadius:'11px',padding:'3px',marginBottom:'13px'}}>
                      <button onClick={()=>setForm(f=>syncShiftTimesIntoForm({...f,dutyType:'normal'}))} style={{flex:1,border:'none',background:form.dutyType!=='rdw'?'#fff':'transparent',padding:'8px 4px',borderRadius:'9px',fontFamily:'inherit',fontWeight:800,fontSize:'11px',color:'#2563eb',cursor:'pointer',boxShadow:form.dutyType!=='rdw'?'0 2px 6px rgba(37,99,235,0.25)':'none'}}>Normal Duty</button>
                      <button onClick={()=>setForm(f=>syncShiftTimesIntoForm({...f,dutyType:'rdw',rosteredStart:'',rosteredEnd:''}))} style={{flex:1,border:'none',background:form.dutyType==='rdw'?'#fff':'transparent',padding:'8px 4px',borderRadius:'9px',fontFamily:'inherit',fontWeight:800,fontSize:'11px',color:'#2563eb',cursor:'pointer',boxShadow:form.dutyType==='rdw'?'0 2px 6px rgba(37,99,235,0.25)':'none'}}>Rest Day Working (RDW)</button>
                    </div>

                    {form.dutyType!=='rdw' && (
                      <>
                        <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px'}}>
                          <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#2563eb'}}/>
                          <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Rostered CARM Shift</div>
                        </div>
                        <div style={{fontSize:'9.5px',fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'5px'}}>Quick presets</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'5px',marginBottom:'12px'}}>
                          {[['07:00','15:00'],['07:00','19:00'],['08:00','20:00'],['13:00','23:00']].map(([start,end])=>{
                            const isSelected = form.rosteredStart===start && form.rosteredEnd===end;
                            return (
                              <button key={start+end} onClick={()=>setForm(f=>syncShiftTimesIntoForm(isSelected ? {...f,rosteredStart:'',rosteredEnd:''} : {...f,rosteredStart:start,rosteredEnd:end}))} style={{padding:'7px 2px',borderRadius:'9px',border:isSelected?'1.5px solid #2563eb':'1px solid #e2e8f0',background:isSelected?'#eff6ff':'#fff',color:isSelected?'#2563eb':'#64748b',fontWeight:800,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',whiteSpace:'nowrap'}}>
                                {start.replace(':','')}–{end.replace(':','')}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'18px',marginBottom:'5px'}}>
                          <div><label style={{...S.lbl,marginBottom:'5px'}}>Start</label>
                            <TimeSelect value={form.rosteredStart} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,rosteredStart:v}))}/>
                          </div>
                          <div><label style={{...S.lbl,marginBottom:'5px'}}>End</label>
                            <TimeSelect value={form.rosteredEnd} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,rosteredEnd:v}))}/>
                          </div>
                        </div>
                        {form.rosteredStart&&form.rosteredEnd&&toMinutesOfDay(form.rosteredEnd)<=toMinutesOfDay(form.rosteredStart)&&(
                          <div style={{fontSize:'9.5px',fontWeight:700,color:'#2563eb',marginBottom:'12px'}}>↷ Ends the next day</div>
                        )}
                      </>
                    )}

                    {form.dutyType!=='rdw' && (
                      <div style={{height:'1px',background:'#e2e8f0',margin:'14px 0'}}/>
                    )}

                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px'}}>
                      <div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#2563eb'}}/>
                      <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Actual Shift Worked</div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'18px'}}>
                      <div><label style={{...S.lbl,marginBottom:'5px'}}>Start</label>
                        <TimeSelect value={form.actualStart} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,actualStart:v}))}/>
                      </div>
                      <div><label style={{...S.lbl,marginBottom:'5px'}}>End</label>
                        <TimeSelect value={form.actualEnd} onChange={v=>setForm(f=>syncShiftTimesIntoForm({...f,actualEnd:v}))}/>
                      </div>
                    </div>
                    {form.actualStart&&form.actualEnd&&toMinutesOfDay(form.actualEnd)<=toMinutesOfDay(form.actualStart)&&(
                      <div style={{fontSize:'9.5px',fontWeight:700,color:'#2563eb',marginTop:'7px'}}>↷ Ends the next day</div>
                    )}
                    {form.dutyType==='rdw' && (
                      <div style={{fontSize:'9.5px',fontWeight:600,color:'#3b82f6',marginTop:'10px',lineHeight:1.5}}>On a Rest Day Working (RDW) shift, the whole shift counts as overtime at the rate you select below — no rostered comparison needed.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Notes — sits above the overtime rate section, after
                  Rostered/Actual, still inside the same outer card */}
              <div style={{marginBottom:'13px'}}><label style={S.lbl}>Notes</label><textarea ref={notesRef} rows="4" placeholder="Shift notes or incident details..." style={{...S.ta,lineHeight:1.5}} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}
                onFocus={e=>{
                  // Cursor lands on the blank line left after the auto-generated
                  // shift-times summary — but only on the person's own tap into
                  // the box, never forced automatically (that pops the keyboard
                  // up and blocks the screen right after picking a time).
                  const line = generateShiftTimesLine(form);
                  if (line) {
                    const pos = line.length+2;
                    const target = e.target;
                    setTimeout(()=>{ try{ target.setSelectionRange(pos,pos); }catch(_){} },0);
                  }
                }}/></div>

              {/* overtime hours — nested within the same outer card, sitting
                  right after Notes */}
              {(()=>{
                const formRates = getRates(settings.rank, settings.service, form.date||todayStr);

                if (!form.recordShiftTimes) {
                  // classic manual entry — unchanged, still the fallback for
                  // shifts that genuinely span more than one rate tier
                  return (
                    <div style={{background:'#eff6ff',border:'1.5px solid #dbeafe',borderRadius:'13px',padding:'14px 13px'}}>
                      <div style={{fontSize:'10px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'4px'}}>Overtime Hours</div>
                      <div style={{fontSize:'9px',fontWeight:600,color:'#64748b',textAlign:'center',marginBottom:'13px'}}>Record only the hours worked on overtime — not your whole shift</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'9px'}}>
                        {['hours133','hours150','hours200'].map((h,i)=>(
                          <div key={h} style={{textAlign:'center'}}>
                            <label style={{...S.lbl,color:'#3b82f6',textAlign:'center',display:'block'}}>{[1.33,1.5,2.0][i]}x</label>
                            <input type="number" step="0.25" placeholder="0" style={{...S.inp,textAlign:'center',fontWeight:900,background:'#fff',fontSize:'17px',padding:'11px 6px'}} value={form[h]} onChange={e=>setForm({...form,[h]:e.target.value})}/>
                            <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:700,marginTop:'4px'}}>£{(formRates[['r133','r150','r200'][i]]||0).toFixed(2)}/hr</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // Record Shift Times is on — one rate for the whole shift,
                // hours calculated from rostered/actual times (still editable,
                // for a recall the times themselves don't capture).
                const tier = form.otRateTier || 'hours133';
                const otHours = parseFloat(form[tier])||0;
                const basisReady = form.dutyType==='rdw' ? !!(form.actualStart&&form.actualEnd) : !!(form.rosteredStart&&form.rosteredEnd&&form.actualStart&&form.actualEnd);
                let basisText = 'Set your shift times above to calculate overtime';
                if (basisReady) {
                  const actualDur = shiftDurationMinutes(form.actualStart, form.actualEnd)/60;
                  basisText = form.dutyType==='rdw'
                    ? `RDW — full ${actualDur.toFixed(2).replace(/\.00$/,'')}h actual shift counts as overtime`
                    : `${actualDur.toFixed(1)}h actual − ${(shiftDurationMinutes(form.rosteredStart,form.rosteredEnd)/60).toFixed(1)}h rostered = ${otHours.toFixed(2).replace(/\.00$/,'')}h overtime`;
                }

                return (
                  <div style={{background:'#eff6ff',border:'1.5px solid #dbeafe',borderRadius:'13px',padding:'12px 13px'}}>
                    <div className="hint-pulse" style={{fontSize:'12px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'9px'}}>Select O/T Rate for this Shift</div>
                    <div style={{display:'flex',gap:'6px',marginBottom:'9px'}}>
                      {['hours133','hours150','hours200'].map((h,i)=>(
                        <button key={h} onClick={()=>setForm(f=>{
                          if (f.otRateTier===h) return f;
                          const val = f.otRateTier ? f[f.otRateTier] : '';
                          return {...f, otRateTier:h, hours133:'', hours150:'', hours200:'', [h]:val};
                        })} style={{flex:1,padding:'8px 4px',borderRadius:'10px',border:'none',fontFamily:'inherit',fontWeight:900,fontSize:'12px',cursor:'pointer',background:tier===h?'#2563eb':'#fff',color:tier===h?'#fff':'#3b82f6',boxShadow:tier===h?'0 4px 11px rgba(37,99,235,0.35)':'none'}}>{[1.33,1.5,2.0][i]}x</button>
                      ))}
                    </div>
                    <div style={{background:'#fff',borderRadius:'10px',padding:'9px',textAlign:'center'}}>
                      <label style={{...S.lbl,marginBottom:'4px',display:'block'}}>Overtime Hours</label>
                      <input type="number" step="0.25" style={{width:'100%',boxSizing:'border-box',textAlign:'center',fontWeight:900,fontSize:'17px',border:'none',background:'transparent',fontFamily:'inherit',color:'#0f172a'}}
                        value={form[tier]}
                        onChange={e=>setForm({...form, otAuto:false, [tier]:e.target.value})}/>
                      {form.otAuto
                        ? <span style={{display:'inline-block',fontSize:'8px',fontWeight:800,padding:'2px 6px',borderRadius:'6px',marginTop:'4px',background:'#dcfce7',color:'#166534'}}>auto-calculated</span>
                        : <span onClick={()=>setForm({...form, otAuto:true})} style={{display:'inline-block',fontSize:'8px',fontWeight:800,padding:'2px 6px',borderRadius:'6px',marginTop:'4px',background:'#fef3c7',color:'#92400e',cursor:'pointer'}}>edited — tap to reset</span>}
                    </div>
                    <div style={{fontSize:'9px',color:'#64748b',textAlign:'center',marginTop:'6px',lineHeight:1.4}}>{basisText}</div>
                  </div>
                );
              })()}

              {/* Take As — Pay / TOIL / Mix — shown whenever there's a single clear
                  rate to bank TOIL against, whether that's from auto-calc
                  (form.otRateTier) or manual entry (exactly one tier box filled in) */}
              {effectiveTier && (parseFloat(form[effectiveTier])||0) > 0 && (()=>{
                const tier = effectiveTier;
                const total = parseFloat(form[tier])||0;
                const toilH = Math.min(total, parseFloat(form.toilHours)||0);
                const payH = Math.max(0, total-toilH);
                return (
                  <div style={{background:'#6d28d9',border:'none',borderRadius:'13px',padding:'14px 13px',marginTop:'13px'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:'#fff',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'13px'}}>Take Overtime As</div>
                    <div style={{display:'flex',gap:'6px',background:'rgba(0,0,0,0.18)',borderRadius:'11px',padding:'3px'}}>
                      {[['pay','Pay','#1e40af'],['toil','TOIL','#6d28d9'],['mix','Mix','#334155']].map(([m,lbl,col])=>(
                        <button key={m} onClick={()=>setForm(f=>{
                          const t = parseFloat(f[tier])||0;
                          const th = m==='pay' ? 0 : m==='toil' ? t : (parseFloat(f.toilHours)||0);
                          return {...f, takeAs:m, toilHours: th?String(th):'0'};
                        })} style={{flex:1,border:'none',background:form.takeAs===m?'#fff':'transparent',padding:'8px 4px',borderRadius:'9px',fontFamily:'inherit',fontWeight:800,fontSize:'11px',color:form.takeAs===m?col:'rgba(255,255,255,0.8)',cursor:'pointer',boxShadow:form.takeAs===m?'0 2px 6px rgba(0,0,0,0.25)':'none'}}>{lbl}</button>
                      ))}
                    </div>
                    {form.takeAs==='mix' && (
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginTop:'12px'}}>
                        <div style={{background:'#eff6ff',borderRadius:'12px',padding:'10px',textAlign:'center'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:'6px'}}>Pay Hours</div>
                          <input type="number" step="0.25" style={{width:'100%',boxSizing:'border-box',textAlign:'center',fontWeight:900,fontSize:'17px',border:'none',background:'#fff',borderRadius:'8px',padding:'7px',fontFamily:'inherit',color:'#0f172a'}}
                            value={payH.toFixed(2).replace(/\.00$/,'')}
                            onChange={e=>{ let v=parseFloat(e.target.value); if(isNaN(v))v=0; v=Math.max(0,Math.min(total,v)); setForm({...form, toilHours:String(total-v)}); }}/>
                        </div>
                        <div style={{background:'#f5f3ff',borderRadius:'12px',padding:'10px',textAlign:'center'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:'6px'}}>TOIL Hours</div>
                          <input type="number" step="0.25" style={{width:'100%',boxSizing:'border-box',textAlign:'center',fontWeight:900,fontSize:'17px',border:'none',background:'#fff',borderRadius:'8px',padding:'7px',fontFamily:'inherit',color:'#0f172a'}}
                            value={toilH.toFixed(2).replace(/\.00$/,'')}
                            onChange={e=>{ let v=parseFloat(e.target.value); if(isNaN(v))v=0; v=Math.max(0,Math.min(total,v)); setForm({...form, toilHours:String(v)}); }}/>
                        </div>
                      </div>
                    )}
                    {toilH>0 && (
                      <div style={{marginTop:'12px',background:'#f5f3ff',borderRadius:'10px',padding:'10px 13px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontSize:'11px',fontWeight:700,color:'#6d28d9'}}>{fmtHM(toilH)}h worked @ {RATE_TIER_MULT[tier]}x</span>
                        <span style={{fontSize:'14px',fontWeight:900,color:'#4c1d95'}}>{fmtHM(toilH*RATE_TIER_MULT[tier])}h banked</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* PA allowance */}
            <div style={{...S.card,background:'#fffbeb',border:'1px solid #fde68a'}}>
              <div style={{fontSize:'12px',fontWeight:900,color:'#92400e',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'13px'}}>Protection Allowance</div>
              <div style={{display:'flex',gap:'6px'}}>
                {['None','PA1','PA2','PA3'].map(pa=>(
                  <button key={pa} onClick={()=>setForm({...form,paRate:pa,paSubmitted:(form.paRate==='None'&&pa!=='None')?false:form.paSubmitted})} style={{flex:1,paddingTop:'9px',paddingBottom:'9px',borderRadius:'11px',border:'none',fontFamily:'inherit',cursor:'pointer',transition:'all 0.14s',background:form.paRate===pa?'#f59e0b':'#fff',color:form.paRate===pa?'#fff':'#b45309',boxShadow:form.paRate===pa?'0 4px 11px rgba(245,158,11,0.38)':'none',display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                    <span style={{fontSize:'12px',fontWeight:900}}>{pa}</span>
                    <span style={{fontSize:'9px',fontWeight:700,opacity:form.paRate===pa?0.85:0.55}}>{PA_LABELS[pa]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* CARMS Submission — independent of logging the shift itself.
                Both default to false via blankForm; editing an existing
                entry reflects whatever it's already set to. PA toggle only
                shown when there's actually a PA rate selected, since
                otherwise there's nothing to track for that part. */}
            <div ref={carmsToggleRef} className={focusCarmsToggle?'carms-pulse':''} style={{...S.card,marginBottom:'11px',border:focusCarmsToggle?'2px solid #2563eb':'1px solid #f1f5f9'}}>
              <div style={{fontWeight:900,fontSize:'15px',color:'#0f172a',marginBottom:'2px'}}>CARMS Submission</div>
              <div style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:600,marginBottom:'4px'}}>Toggle when Overtime and/or PA claims have been submitted on the relevant system.</div>
              {(()=>{
                const hasOTHours = (parseFloat(form.hours133)||0) + (parseFloat(form.hours150)||0) + (parseFloat(form.hours200)||0) > 0;
                return (
              <div style={{padding:'11px 0',borderBottom:'1px solid #f1f5f9',opacity:hasOTHours?1:0.45}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:700,color:'#0f172a'}}>Overtime submitted on CARMS</div>
                  </div>
                      <div onClick={()=>{
                        if (!hasOTHours) return;
                        if (form.otSubmitted) { setForm({...form,otSubmitted:false}); return; }
                        setDatePickerMonth(todayStr.slice(0,7));
                        setDatePickerFor('ot');
                      }} style={{width:'42px',height:'24px',borderRadius:'14px',position:'relative',cursor:hasOTHours?'pointer':'default',flexShrink:0,background:(hasOTHours&&form.otSubmitted)?'#059669':'#e2e8f0',transition:'background 0.15s'}}>
                        <div style={{width:'18px',height:'18px',borderRadius:'50%',background:'#fff',position:'absolute',top:'3px',left:(hasOTHours&&form.otSubmitted)?'21px':'3px',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.15s'}}/>
                      </div>
                </div>
                {form.otSubmitted&&(
                  <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'12px',padding:'10px',marginTop:'9px'}}>
                    <div style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'5px'}}>Date submitted</div>
                    {isWide ? (
                      <button onClick={()=>{ setDatePickerMonth((form.otSubmittedDate||todayStr).slice(0,7)); setDatePickerFor('ot'); }} style={{width:'100%',boxSizing:'border-box',background:'#fff',border:'1px solid #bfdbfe',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'#0f172a',textAlign:'left',cursor:'pointer'}}>
                        {new Date((form.otSubmittedDate||todayStr)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
                      </button>
                    ) : (
                      <input type="date" value={form.otSubmittedDate||todayStr} onChange={e=>setForm({...form,otSubmittedDate:e.target.value})} style={{width:'100%',boxSizing:'border-box',background:'#fff',border:'1px solid #bfdbfe',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'#0f172a'}}/>
                    )}
                  </div>
                )}
              </div>
                );
              })()}
              <div style={{padding:'11px 0',opacity:form.paRate==='None'?0.45:1}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:700,color:'#0f172a'}}>PA Submitted on MetHR</div>
                    <div style={{fontSize:'10.5px',color:'#94a3b8',fontWeight:600,marginTop:'1px'}}>{form.paRate==='None' ? 'No PA rate selected for this shift' : `${form.paRate} — ${fmtGBP(PA_RATES[form.paRate]||0)}`}</div>
                  </div>
                  <div onClick={()=>{
                    if (form.paRate==='None') return;
                    if (form.paSubmitted) { setForm({...form,paSubmitted:false}); return; }
                    setDatePickerMonth(todayStr.slice(0,7));
                    setDatePickerFor('pa');
                  }} style={{width:'42px',height:'24px',borderRadius:'14px',position:'relative',cursor:form.paRate==='None'?'default':'pointer',flexShrink:0,background:(form.paRate!=='None'&&form.paSubmitted)?'#059669':'#e2e8f0',transition:'background 0.15s'}}>
                    <div style={{width:'18px',height:'18px',borderRadius:'50%',background:'#fff',position:'absolute',top:'3px',left:(form.paRate!=='None'&&form.paSubmitted)?'21px':'3px',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.15s'}}/>
                  </div>
                </div>
                {form.paRate!=='None'&&form.paSubmitted&&(
                  <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'12px',padding:'10px',marginTop:'9px'}}>
                    <div style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'5px'}}>Date submitted</div>
                    {isWide ? (
                      <button onClick={()=>{ setDatePickerMonth((form.paSubmittedDate||todayStr).slice(0,7)); setDatePickerFor('pa'); }} style={{width:'100%',boxSizing:'border-box',background:'#fff',border:'1px solid #bfdbfe',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'#0f172a',textAlign:'left',cursor:'pointer'}}>
                        {new Date((form.paSubmittedDate||todayStr)+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
                      </button>
                    ) : (
                      <input type="date" value={form.paSubmittedDate||todayStr} onChange={e=>setForm({...form,paSubmittedDate:e.target.value})} style={{width:'100%',boxSizing:'border-box',background:'#fff',border:'1px solid #bfdbfe',borderRadius:'9px',padding:'9px 11px',fontWeight:700,fontSize:'13px',fontFamily:'inherit',color:'#0f172a'}}/>
                    )}
                  </div>
                )}
              </div>
              <div style={{fontSize:'10.5px',color:'#94a3b8',lineHeight:1.5,marginTop:'4px'}}>Toggles default to <b>off</b> when you log a new shift — you're recording that you worked it, not that you've claimed it on the relevant systems.</div>
            </div>

            {/* live preview */}
            {preview.has&&(
              <div style={{background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)',borderRadius:'15px',padding:'14px 18px',marginBottom:'11px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: preview.toilBanked>0?'10px':0}}>
                  <div style={{fontSize:'15px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1px'}}>This Shift</div>
                  <div style={{display:'flex',gap:'18px',alignItems:'center'}}>
                    <div style={{textAlign:'right'}}><div style={{fontSize:'14px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.5px'}}>Gross</div><div style={{fontSize:'23px',fontWeight:900,color:'#fff'}}>{fmt(preview.gross)}</div></div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:'14px',fontWeight:900,color:'#6ee7b7',textTransform:'uppercase',letterSpacing:'0.5px'}}>Net</div>
                      <div style={{fontSize:'23px',fontWeight:900,color:'#34d399'}}>{fmt(preview.net)}</div>
                    </div>
                  </div>
                </div>
                {preview.toilBanked>0&&(
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
                    <Ico n="clock" s={11} c="#c4b5fd"/>
                    <span style={{fontSize:'15px',fontWeight:700,color:'#c4b5fd'}}>+ {fmtHM(preview.toilBanked)}h TOIL banked (not included in Gross/Net above)</span>
                  </div>
                )}
              </div>
            )}

            {/* in-flow save button — desktop only. Same handler, same look
                as the floating mobile version below, just placed at the
                natural end of the form instead of fixed over the content,
                since there's no bottom nav here for it to need to float
                above. Sits outside the preview's own conditional so it
                always shows once rank/pay point are set, whether or not
                a preview happens to be showing. */}
            {isWide&&(
              <button onClick={handleSave} style={{width:'100%',background:'#dc2626',color:'#fff',boxShadow:'0 4px 20px rgba(220,38,38,0.5)',padding:'17px',borderRadius:'16px',border:'none',fontWeight:900,fontSize:'15px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'9px',letterSpacing:'-0.2px',marginTop:'18px'}}>
                <Ico n="save" s={18} c="#fff"/>
                {editing?'Update Record':'Save Record'}
              </button>
            )}
            </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════ BREAKDOWN */}
        {tab==='months'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            {/* Sticky header — heading, toggle and month pills all float together */}
            <div ref={stickyRef} style={{position:'sticky',top:0,zIndex:20,background:'#f8fafc',paddingTop:'6px',paddingBottom:'8px',marginTop:'-14px',marginBottom:'6px'}}>
              <h2 style={{fontSize:'21px',fontWeight:900,color:'#0f172a',margin:'0 0 10px',letterSpacing:'-0.5px'}}>Summary</h2>
              <div style={{display:'flex',background:'#eef2f7',borderRadius:'14px',padding:'4px',boxShadow:'0 4px 14px rgba(15,23,42,0.08)'}}>
                {/* Each half is a div rather than a button so the star can be its own
                    tap target inside it — nesting buttons isn't valid HTML. */}
                <div onClick={()=>{ setBreakdownView('calendar'); setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0); if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'auto'}); }} style={{flex:1,padding:'9px 6px',borderRadius:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',background:breakdownView==='calendar'?'#2563eb':'transparent',color:breakdownView==='calendar'?'#fff':'#64748b',boxShadow:breakdownView==='calendar'?'0 2px 8px rgba(37,99,235,0.3)':'none',transition:'all 0.15s',display:'flex',alignItems:'center',gap:'4px',userSelect:'none'}}>
                  <span style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                    <Ico n="cal" s={13} c={breakdownView==='calendar'?'#fff':'#64748b'} w={2.5}/>Calendar View
                  </span>
                  <span onClick={e=>{ e.stopPropagation(); setDefaultBreakdownView('calendar'); dualWrite(KEYS.defaultBreakdownView,'calendar'); }} className="star-tap" style={{flexShrink:0,display:'flex',alignItems:'center',padding:'4px 5px',cursor:'pointer'}}>
                    <Ico n="star" s={17} w={1.8}
                      c={defaultBreakdownView==='calendar'?'#fbbf24':(breakdownView==='calendar'?'rgba(255,255,255,0.5)':'#cbd5e1')}
                      f={defaultBreakdownView==='calendar'?'#fbbf24':'none'}/>
                  </span>
                </div>
                <div onClick={()=>{ setBreakdownView('list'); snapToActiveMonth(); }} style={{flex:1,padding:'9px 6px',borderRadius:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',background:breakdownView==='list'?'#2563eb':'transparent',color:breakdownView==='list'?'#fff':'#64748b',boxShadow:breakdownView==='list'?'0 2px 8px rgba(37,99,235,0.3)':'none',transition:'all 0.15s',display:'flex',alignItems:'center',gap:'4px',userSelect:'none'}}>
                  <span style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                    <Ico n="list" s={13} c={breakdownView==='list'?'#fff':'#64748b'} w={2.5}/>List View
                  </span>
                  <span onClick={e=>{ e.stopPropagation(); setDefaultBreakdownView('list'); dualWrite(KEYS.defaultBreakdownView,'list'); }} className="star-tap" style={{flexShrink:0,display:'flex',alignItems:'center',padding:'4px 5px',cursor:'pointer'}}>
                    <Ico n="star" s={17} w={1.8}
                      c={defaultBreakdownView==='list'?'#fbbf24':(breakdownView==='list'?'rgba(255,255,255,0.5)':'#cbd5e1')}
                      f={defaultBreakdownView==='list'?'#fbbf24':'none'}/>
                  </span>
                </div>
              </div>
              <div style={{fontSize:'11.5px',fontWeight:600,color:'#94a3b8',textAlign:'center',marginTop:'6px',lineHeight:1.4}}>
                {defaultBreakdownView==='list'?'List View':'Calendar View'} opens by default · tap ★ to change
              </div>

              {/* month jump pills — part of the sticky header in List View.
                  On desktop, boxed to match the Calendar/List toggle above
                  rather than floating loose in the open page. */}
              {breakdownView==='list'&&(
                <div style={isWide?{background:'#f8fafc',border:'1px solid #f1f5f9',borderRadius:'14px',padding:'10px 14px',marginTop:'8px'}:{}}>
                <div style={{display:'flex',gap:'3px',paddingTop:isWide?0:'8px',justifyContent:'center'}}>
                  {PAY_PERIODS.map((p,idx)=>{
                    const isCurr=idx===currPeriodIdx, isOpen=expanded===p.month;
                    // Matches Calendar View's own guarantee that exactly one
                    // pill always reads as "active" — falls back to the
                    // current period when nothing's been manually expanded,
                    // rather than leaving every pill unselected once a card
                    // gets collapsed.
                    const isActive = expanded===null ? isCurr : isOpen;
                    const hasOutstanding = carmsOutstanding.groups.some(g=>g.periodIdx===idx);
                    return(
                      // flex:1 with minWidth:0 lets all twelve periods share the
                      // row evenly and fit without horizontal scrolling, rather
                      // than each sizing to its own text and overflowing.
                      <button key={p.short} onClick={()=>jumpTo(p.month)} style={{flex:'1 1 0',minWidth:0,padding:isWide?'5px 4px':'5px 2px',borderRadius:'14px',border:isActive?'1.5px solid #2563eb':hasOutstanding?'1px solid #fecaca':isCurr?'1.5px solid #2563eb':'1px solid #e2e8f0',background:hasOutstanding?'#fef2f2':isActive?'#2563eb':isCurr?'#eff6ff':'#fff',color:hasOutstanding?'#b91c1c':isActive?'#fff':isCurr?'#2563eb':'#64748b',fontSize:isWide?'12px':'10.5px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.14s',textAlign:'center',overflow:'hidden'}}>
                        {p.short}
                      </button>
                    );
                  })}
                </div>
                </div>
              )}

              {/* month pills — Calendar View equivalent, selects the period
                  being viewed. Same boxed treatment on desktop as List View
                  above, for consistency between the two. */}
              {breakdownView==='calendar'&&(
                <div style={isWide?{background:'#f8fafc',border:'1px solid #f1f5f9',borderRadius:'14px',padding:'10px 14px',marginTop:'8px'}:{}}>
                <div style={{display:'flex',gap:'3px',paddingTop:isWide?0:'8px',justifyContent:'center'}}>
                  {PAY_PERIODS.map((p,idx)=>{
                    const isCurr=idx===currPeriodIdx;
                    const isSel=(calPeriodIdx===null?currPeriodIdx:calPeriodIdx)===idx;
                    const hasOutstanding = carmsOutstanding.groups.some(g=>g.periodIdx===idx);
                    return(
                      <button key={p.short} onClick={()=>{ setCalPeriodIdx(idx); if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'smooth'}); }} style={{flex:'1 1 0',minWidth:0,padding:isWide?'5px 4px':'5px 2px',borderRadius:'14px',border:isSel?'1.5px solid #2563eb':hasOutstanding?'1px solid #fecaca':isCurr?'1.5px solid #2563eb':'1px solid #e2e8f0',background:hasOutstanding?'#fef2f2':isSel?'#2563eb':isCurr?'#eff6ff':'#fff',color:hasOutstanding?'#b91c1c':isSel?'#fff':isCurr?'#2563eb':'#64748b',fontSize:isWide?'12px':'10.5px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.14s',textAlign:'center',overflow:'hidden'}}>
                        {p.short}
                      </button>
                    );
                  })}
                </div>
                </div>
              )}
            </div>

            {breakdownView==='list' ? (
            <>
            {PAY_PERIODS.map((p,idx)=>{
              const pE=fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
              const pb=totals.periodBreakdown[idx];
              let h133=0,h150=0,h200=0,pa1=0,pa2=0,pa3=0,totalToilWorked=0,totalToilBanked=0;
              pE.forEach(e=>{
                const c=calcEntry(e);
                h133+=c.h1; h150+=c.h2; h200+=c.h3;
                totalToilWorked+=c.toilH; totalToilBanked+=c.toilBanked;
                if(e.paRate==='PA1')pa1++; else if(e.paRate==='PA2')pa2++; else if(e.paRate==='PA3')pa3++;
              });
              const gOT=pb.ot, gPA=pb.pa;
              const totG=pb.combinedGross, totN=pb.combinedNet;
              const isExp=expanded===p.month, isCurr=idx===currPeriodIdx;

              return(
                <div key={p.month} ref={el=>monthRefs.current[p.month]=el} style={{background:isCurr?'#eff6ff':'#fff',borderRadius:'17px',border:isCurr?'2px solid #2563eb':'1px solid #f1f5f9',borderLeft:isCurr?'5px solid #2563eb':'1px solid #f1f5f9',boxShadow:isCurr?'0 4px 20px rgba(37,99,235,0.18)':'0 1px 5px rgba(0,0,0,0.04)',marginBottom:'9px',overflow:'hidden'}}>
                  <button onClick={()=>setExpanded(isExp?null:p.month)} style={{width:'100%',textAlign:'left',padding:'16px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'11px'}}>
                      <div>
                        {isCurr&&<div style={{display:'inline-flex',alignItems:'center',gap:'4px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',color:'#fff',fontSize:'10px',fontWeight:900,padding:'3px 9px',borderRadius:'8px',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'5px',boxShadow:'0 2px 6px rgba(37,99,235,0.35)'}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#fff'}}/>Active Month</div>}
                        <div style={{fontWeight:900,fontSize:'19px',color:'#0f172a',letterSpacing:'-0.3px'}}>{p.month}</div>
                        <div style={{fontSize:'13px',fontWeight:700,color:'#3b82f6',marginTop:'2px'}}>{fmtD(p.start)} – {fmtD(p.end)}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'4px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'4px',background:isCurr?'#dbeafe':'#eff6ff',border:isCurr?'1px solid #93c5fd':'1px solid #bfdbfe',padding:'5px 9px',borderRadius:'9px'}}>
                          <div style={{fontSize:'13px',fontWeight:900,color:'#1d4ed8'}}>{(h133+h150+h200).toFixed(1)} hrs</div>
                        </div>
                        <div style={{fontSize:'11px',fontWeight:700,color:'#94a3b8'}}>{pE.length} record{pE.length!==1?'s':''}</div>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px'}}>
                      <div><div style={{fontSize:'11px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Gross</div><div style={{fontWeight:900,fontSize:'19px',color:'#1e3a5f'}}>{fmt(totG)}</div></div>
                      <div style={{textAlign:'right'}}><div style={{fontSize:'11px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Net</div><div style={{fontWeight:900,fontSize:'19px',color:'#059669'}}>{fmt(totN)}</div></div>
                    </div>
                    {(() => {
                      const g = carmsOutstanding.groups.find(g=>g.periodIdx===idx);
                      if (!g) return null;
                      return (
                        <div onClick={ev=>{ ev.stopPropagation(); setTab('carms'); setPulsePeriodIdx(idx); }} className="nav-add-pulse" style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'13px',padding:'12px 14px',marginTop:'9px',cursor:'pointer'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'4px'}}>
                            <Ico n="clock" s={16} c="#d97706"/>
                            <span style={{fontSize:'17.5px',fontWeight:800,color:'#0f172a'}}>CARMS &amp; MetHR Awaiting Submission</span>
                          </div>
                          <div style={{fontSize:'17.5px',fontWeight:900,color:'#d97706'}}>{fmtGBP(g.periodTotal)}</div>
                        </div>
                      );
                    })()}
                    {!isExp&&(
                      <div style={{fontSize:'12px',fontWeight:700,color:isCurr?'#64748b':'#94a3b8',textAlign:'center',marginTop:'11px',paddingTop:'9px',borderTop:isCurr?'1px solid #bfdbfe':'1px solid #f1f5f9'}}>Tap to see more</div>
                    )}
                  </button>

                  {isExp&&(
                    <div style={{background:'#f8fafc',borderTop:'1px solid #f1f5f9',padding:'13px'}}>
                      {/* month summary cards — net figures now use cumulative marginal tax, rate shown */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px',marginBottom:'9px'}}>
                        <div style={{background:'#fff',borderRadius:'13px',padding:'13px',border:'1px solid #dbeafe'}}>
                          <div style={{fontSize:'11px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'7px'}}>OT Pay</div>
                          <div style={{fontSize:'14px',fontWeight:700,color:'#1e3a5f',marginBottom:'1px'}}>Gross: {fmt(gOT)}</div>
                          <div style={{fontSize:'13px',fontWeight:700,color:'#3b82f6',marginBottom:'7px'}}>Net: {fmt(pb.otResult.net)}</div>
                          <div style={{borderTop:'1px solid #eff6ff',paddingTop:'5px'}}>
                            {h133>0&&<div style={{fontSize:'12px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{h133}h @ 1.33x</div>}
                            {h150>0&&<div style={{fontSize:'12px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{h150}h @ 1.5x</div>}
                            {h200>0&&<div style={{fontSize:'12px',fontWeight:700,color:'#64748b'}}>{h200}h @ 2.0x</div>}
                          </div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'9px'}}>
                          <div style={{background:'#fff',borderRadius:'13px',padding:'11px',border:'1px solid #fde68a'}}>
                            <div style={{fontSize:'11px',fontWeight:900,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'5px'}}>PA</div>
                            <div style={{fontSize:'14px',fontWeight:700,color:'#92400e',marginBottom:'1px'}}>Gross: {fmt(gPA)}</div>
                            <div style={{fontSize:'13px',fontWeight:700,color:'#d97706',marginBottom:'7px'}}>Net: {fmt(pb.paResult.net)}</div>
                            <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #fef3c7',paddingTop:'6px'}}>
                              <span style={{fontSize:'12px',fontWeight:700,color:'#78716c'}}>PA1 × {pa1}</span>
                              <span style={{fontSize:'12px',fontWeight:700,color:'#78716c'}}>PA2 × {pa2}</span>
                              <span style={{fontSize:'12px',fontWeight:700,color:'#78716c'}}>PA3 × {pa3}</span>
                            </div>
                          </div>
                          <div onClick={()=>setTab('graph')} style={{background:'#f5f3ff',borderRadius:'13px',padding:'11px',border:'1px solid #ddd6fe',cursor:'pointer'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'5px'}}><Ico n="clock" s={11} c="#7c3aed"/><div style={{fontSize:'11px',fontWeight:900,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>TOIL</div></div>
                            <div style={{fontSize:'14px',fontWeight:700,color:'#4c1d95',marginBottom:'6px'}}>{fmtHM(totalToilWorked)}h worked → {fmtHM(totalToilBanked)}h banked</div>
                            <div style={{fontSize:'11px',fontWeight:700,color:'#8b5cf6'}}>See TOIL Tab</div>
                          </div>
                        </div>
                      </div>

                      <div style={{fontSize:'11px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',textAlign:'center',marginBottom:'9px'}}>Individual Records</div>

                      {pE.length===0
                        ?<div style={{textAlign:'center',padding:'14px',color:'#94a3b8',fontSize:'15px',fontWeight:700}}>No records yet</div>
                        :[...pE].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>{
                          const c=calcEntry(e);
                          const isFut=e.date>todayStr;
                          // individual records use the period-blended rate for each component
                          const eOTNet    = c.ot>0    ? c.ot*(1-pb.otResult.rate/100)       : 0;
                          const ePANet    = c.pa>0    ? c.pa*(1-pb.paResult.rate/100)       : 0;
                          const eNet = eOTNet+ePANet;
                          return(
                            <div key={e.id} ref={el=>entryRefs.current[e.id]=el} className={focusEntryId===e.id?'entry-flash':''} style={{background:focusEntryId===e.id?'#eff6ff':'#fff',borderRadius:'13px',border:focusEntryId===e.id?'2px solid #2563eb':isFut?'1px solid #bfdbfe':'1px solid #f1f5f9',padding:'13px',marginBottom:'7px',position:'relative',transition:'background 0.4s ease, border-color 0.4s ease'}}>
                              {isFut&&<div style={{position:'absolute',top:'-6px',right:'9px',background:'#2563eb',color:'#fff',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',textTransform:'uppercase',letterSpacing:'1px'}}>Planned</div>}
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'7px'}}>
                                <div>
                                  <div style={{fontWeight:900,fontSize:'15px',color:'#0f172a'}}>{new Date(e.date+'T12:00:00').toLocaleDateString('en-GB')}</div>
                                  <div style={{fontSize:'12px',fontWeight:700,color:'#3b82f6',marginTop:'2px',textTransform:'uppercase'}}>Duty / Reason: {e.reason||'Shift'}</div>
                                  {e.takeAs==='toil'&&<div style={{display:'inline-block',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'#f5f3ff',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>TOIL</div>}
                                  {e.takeAs==='mix'&&<div style={{display:'inline-block',fontSize:'10px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'#f5f3ff',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>Mix — Pay + TOIL</div>}
                                  {carmsBadge(e, 10)}
                                </div>
                                <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                                  <button onClick={()=>{setConfirmDel(null);startEdit(e);}} style={{background:'#f1f5f9',border:'none',borderRadius:'8px',padding:'8px',cursor:'pointer',display:'flex'}}><Ico n="edit" s={14} c="#64748b"/></button>
                                  <button onClick={()=>setConfirmDel(confirmDel===e.id?null:e.id)} style={{background:confirmDel===e.id?'#fee2e2':'#fef2f2',border:confirmDel===e.id?'1.5px solid #fca5a5':'1.5px solid transparent',borderRadius:'8px',padding:'8px',cursor:'pointer',display:'flex',transition:'all 0.15s'}}><Ico n="trash" s={14} c="#ef4444"/></button>
                                </div>
                              </div>

                              {/* delete confirmation */}
                              {confirmDel===e.id&&(
                                <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',padding:'11px 12px',marginBottom:'9px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                                  <span style={{fontSize:'14px',fontWeight:700,color:'#991b1b'}}>Delete this record?</span>
                                  <div style={{display:'flex',gap:'7px',flexShrink:0}}>
                                    <button onClick={()=>setConfirmDel(null)} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'5px 12px',fontSize:'13px',fontWeight:900,color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                                    <button onClick={()=>delEntry(e.id)} style={{background:'#dc2626',border:'none',borderRadius:'8px',padding:'5px 12px',fontSize:'13px',fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Delete</button>
                                  </div>
                                </div>
                              )}

                              {/* notes — sits under Duty/Reason with separators, matching the Calendar View popover */}
                              {e.comments&&(
                                <div style={{borderTop:'1px solid #e2e8f0',paddingTop:'10px',marginBottom:'10px'}}>
                                  <div style={{fontSize:'11px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>Notes</div>
                                  <div style={{fontSize:'13px',fontStyle:'italic',color:'#0f172a',borderLeft:'2px solid #bfdbfe',paddingLeft:'8px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.5}}>{e.comments}</div>
                                </div>
                              )}

                              <div style={{background:'#f8fafc',borderRadius:'11px',padding:'12px'}}>
                                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                                  {c.payH1>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'13px',fontWeight:700,color:'#475569'}}>{c.payH1}h @ 1.33x {c.toilH>0&&c.otRateTier==='hours133'?'(Pay)':''} <span style={{color:'#94a3b8'}}>(£{c.r.r133.toFixed(2)}/hr)</span></span>
                                      <span style={{fontSize:'14px',fontWeight:900,color:'#1e3a5f'}}>£{c.ot1.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {c.payH2>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'13px',fontWeight:700,color:'#475569'}}>{c.payH2}h @ 1.5x {c.toilH>0&&c.otRateTier==='hours150'?'(Pay)':''} <span style={{color:'#94a3b8'}}>(£{c.r.r150.toFixed(2)}/hr)</span></span>
                                      <span style={{fontSize:'14px',fontWeight:900,color:'#1e3a5f'}}>£{c.ot2.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {c.payH3>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'13px',fontWeight:700,color:'#475569'}}>{c.payH3}h @ 2.0x {c.toilH>0&&c.otRateTier==='hours200'?'(Pay)':''} <span style={{color:'#94a3b8'}}>(£{c.r.r200.toFixed(2)}/hr)</span></span>
                                      <span style={{fontSize:'14px',fontWeight:900,color:'#1e3a5f'}}>£{c.ot3.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {c.toilH>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'13px',fontWeight:700,color:'#6d28d9'}}>{fmtHM(c.toilH)}h @ {RATE_TIER_MULT[c.otRateTier]}x <span style={{color:'#a78bfa'}}>(TOIL{c.takeAs==='mix'?' — part of shift':''})</span></span>
                                      <span style={{fontSize:'14px',fontWeight:900,color:'#4c1d95'}}>{fmtHM(c.toilBanked)}h banked</span>
                                    </div>
                                  )}
                                  {e.paRate!=='None'&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'13px',fontWeight:700,color:'#b45309'}}>{e.paRate} allowance</span>
                                      <span style={{fontSize:'14px',fontWeight:900,color:'#92400e'}}>£{c.pa.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px',borderTop:'1px solid #e2e8f0',paddingTop:'8px',marginTop:'8px'}}>
                                  <div><div style={{fontSize:'11px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</div><div style={{fontWeight:900,fontSize:'15px',color:'#1e3a5f'}}>{fmt(c.gross)}</div></div>
                                  <div style={{textAlign:'right'}}><div style={{fontSize:'11px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px'}}>Net</div><div style={{fontWeight:900,fontSize:'15px',color:'#059669'}}>{fmt(eNet)}</div></div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      }
                      <button onClick={()=>setExpanded(null)} style={{width:'100%',marginTop:'4px',padding:'9px',background:'#fff',border:'1px solid #e2e8f0',borderRadius:'11px',fontSize:'11px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px'}}>
                        Close <Ico n="cU" s={12} c="#94a3b8"/>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {renderFYTotalsCard()}
            </>
            ) : (
            <>
            {/* ══════════════════ CALENDAR VIEW (Overtime Visualiser) ══════════════════ */}
            {(()=>{
              const cIdx = calPeriodIdx===null ? currPeriodIdx : calPeriodIdx;
              const cPeriod = PAY_PERIODS[cIdx];
              const cEntries = fyEntries.filter(e=>e.date>=cPeriod.start&&e.date<=cPeriod.end);
              const cTotalHrs = cEntries.reduce((s,e)=>{ const c=calcEntry(e); return s+c.h1+c.h2+c.h3; },0);
              const weeks = buildCalendarWeeks(cPeriod);

              // period-level totals for the breakdown boxes (mirrors List View)
              const pb = totals.periodBreakdown[cIdx];
              let ph133=0, ph150=0, ph200=0, ppa1=0, ppa2=0, ppa3=0, pToilWorked=0, pToilBanked=0;
              cEntries.forEach(e=>{
                const c = calcEntry(e);
                ph133+=c.h1; ph150+=c.h2; ph200+=c.h3;
                pToilWorked+=c.toilH; pToilBanked+=c.toilBanked;
                if(e.paRate==='PA1')ppa1++; else if(e.paRate==='PA2')ppa2++; else if(e.paRate==='PA3')ppa3++;
              });

              const dayInfo = (date) => {
                if (!date) return null;
                const ds = date.toISOString().split('T')[0];
                const dEntries = cEntries.filter(e=>e.date===ds);
                let h1=0,h2=0,h3=0;
                dEntries.forEach(e=>{ const c=calcEntry(e); h1+=c.h1; h2+=c.h2; h3+=c.h3; });
                const totalHrs = h1+h2+h3;
                const hasPA = dEntries.some(e=>e.paRate&&e.paRate!=='None');
                const hasToil = dEntries.some(e=>e.otRateTier&&(parseFloat(e.toilHours)||0)>0);
                // Hours text is colored by rate tier — blue 1.33x, green 1.5x,
                // red 2.0x — independent of the cell's own background/border,
                // which reflects CARMS submission status instead. Mixed-rate
                // days (more than one tier worked) fall back to the default.
                const ratesUsed = [h1>0, h2>0, h3>0].filter(Boolean).length;
                const rateColor = ratesUsed===1 ? (h1>0?'#0f172a':h2>0?'#059669':'#dc2626') : '#0f172a';
                // A day only reads as "fully submitted" once every entry on
                // it has both parts settled — overtime, and PA if there is
                // any. One outstanding piece keeps the whole day flagged,
                // same as a day with nothing submitted at all.
                const isFullySubmitted = dEntries.length>0 && dEntries.every(e =>
                  isOtSubmitted(e) && (!e.paRate || e.paRate==='None' || isPaSubmitted(e))
                );
                return { ds, dEntries, totalHrs, hasPA, hasToil, hasOT: dEntries.length>0, isFullySubmitted, rateColor, periodIdx: cIdx };
              };

              return (
                <>
                  {/* period navigator */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
                    <button onClick={()=>setCalPeriodIdx(i=>Math.max(0,(i===null?currPeriodIdx:i)-1))} disabled={cIdx===0} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'9px 14px',cursor:cIdx===0?'default':'pointer',opacity:cIdx===0?0.3:1}}><Ico n="cL" s={18} c="#2563eb"/></button>
                    <div style={{textAlign:'center'}}>
                      {cIdx===currPeriodIdx&&(
                        <div style={{display:'inline-flex',alignItems:'center',gap:'4px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',color:'#fff',fontSize:'10px',fontWeight:900,padding:'3px 9px',borderRadius:'8px',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px',boxShadow:'0 2px 6px rgba(37,99,235,0.35)'}}>
                          <span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#fff'}}/>Active Month
                        </div>
                      )}
                      <div style={{fontWeight:900,fontSize:'22px',color:cIdx===currPeriodIdx?'#1d4ed8':'#0f172a'}}>{cPeriod.month}</div>
                      <div style={{fontSize:'14px',fontWeight:700,color:'#3b82f6'}}>{fmtD(cPeriod.start)} – {fmtD(cPeriod.end)}</div>
                    </div>
                    <button onClick={()=>setCalPeriodIdx(i=>Math.min(11,(i===null?currPeriodIdx:i)+1))} disabled={cIdx===11} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'9px 14px',cursor:cIdx===11?'default':'pointer',opacity:cIdx===11?0.3:1}}><Ico n="cR" s={18} c="#2563eb"/></button>
                  </div>

                  {/* stats strip — Shifts and Total O/T Hours */}
                  <div style={{...S.card,display:'flex',padding:'16px',background:cIdx===currPeriodIdx?'#eff6ff':'#fff',border:cIdx===currPeriodIdx?'2px solid #2563eb':'1px solid #f1f5f9',boxShadow:cIdx===currPeriodIdx?'0 4px 20px rgba(37,99,235,0.18)':'0 1px 6px rgba(0,0,0,0.05)'}}>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:'12px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.5px'}}>Shifts Logged</div>
                      <div style={{fontSize:'22px',fontWeight:900,color:'#1e3a5f'}}>{cEntries.length}</div>
                    </div>
                    {/* separator needs a darker tone on the active month, since #f1f5f9 is invisible against the blue tint */}
                    <div style={{width:'1px',background:cIdx===currPeriodIdx?'#bfdbfe':'#f1f5f9'}}/>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{fontSize:'12px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.5px'}}>Total O/T Hours</div>
                      <div style={{fontSize:'22px',fontWeight:900,color:'#1e3a5f'}}>{cTotalHrs}</div>
                    </div>
                  </div>

                  <div className="hint-pulse" style={{fontSize:'14px',color:'#94a3b8',textAlign:'center',fontWeight:600,margin:'10px 0'}}>Tap a day to view details or add an entry</div>

                  {/* calendar grid */}
                  <div
                    onTouchStart={isWide?undefined:(e=>{ calSwipeStartX.current = e.touches[0].clientX; })}
                    onTouchEnd={isWide?undefined:(e=>{
                      if (calSwipeStartX.current===null) return;
                      const dx = e.changedTouches[0].clientX - calSwipeStartX.current;
                      calSwipeStartX.current = null;
                      if (Math.abs(dx) < 50) return; // too small to count as an intentional swipe
                      if (dx > 0) setCalPeriodIdx(i=>Math.max(0,(i===null?currPeriodIdx:i)-1));
                      else setCalPeriodIdx(i=>Math.min(11,(i===null?currPeriodIdx:i)+1));
                    })}
                    style={{...S.card,overflow:'hidden'}}>
                    {/* minmax(0,1fr) is essential — plain '1fr' lets long cell text (e.g. "5h@1.33x")
                        force columns wider than their share, which pushed the grid past the screen edge */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'3px',marginBottom:'8px'}}>
                      {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>(
                        <div key={d} style={{textAlign:'center',fontSize:'13px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',minWidth:0,overflow:'hidden'}}>{d}</div>
                      ))}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                      {weeks.map((week,wi)=>(
                        <div key={wi} style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:'3px'}}>
                          {week.map((date,di)=>{
                            if (!date) return <div key={di} style={{minWidth:0}}/>;
                            const info = dayInfo(date);
                            const isToday = info.ds===todayStr;
                            return (
                              <button key={di} onClick={()=>{
                                  if (info.hasOT) { setSelectedCalDay(info); }
                                  else { setConfirmCreateDay(info.ds); }
                                }}
                                style={{
                                  ...(isWide ? {height:'48px'} : {aspectRatio:'1', minHeight:'42px'}),
                                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                                  borderRadius:'10px', border: isToday?'2px solid #2563eb':info.hasOT?(info.isFullySubmitted?'1px solid #bbf7d0':'1px solid #fecaca'):'1px solid transparent',
                                  background: info.hasOT ? (info.isFullySubmitted?'#f0fdf4':'#fef2f2') : 'transparent',
                                  cursor:'pointer', padding:'2px 1px', fontFamily:'inherit', position:'relative',
                                  minWidth:0, width:'100%', overflow:'hidden', boxSizing:'border-box', gap:'2px',
                                }}>
                                {(date.getDate()===1 || (wi===0 && week.slice(0,di).every(d=>!d)))&&(
                                  <span style={{position:'absolute',top:'1px',left:'3px',fontSize:'7px',fontWeight:900,color:'#2563eb',textTransform:'uppercase',letterSpacing:'0.3px',lineHeight:1}}>{date.toLocaleDateString('en-GB',{month:'short'})}</span>
                                )}
                                <span style={{fontSize:'13px',fontWeight:info.hasOT?900:600,color:info.hasOT?(info.isFullySubmitted?'#15803d':'#b91c1c'):'#94a3b8',lineHeight:1}}>{date.getDate()}</span>
                                {info.totalHrs>0&&(
                                  <span style={{fontSize:'9px',fontWeight:900,color:info.rateColor,lineHeight:1,maxWidth:'100%',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{info.totalHrs}h</span>
                                )}
                                {(info.hasPA||info.hasToil)&&(
                                  <div style={{display:'flex',gap:'2px',flexShrink:0}}>
                                    {info.hasPA&&<div style={{width:'4px',height:'4px',borderRadius:'50%',background:'#f59e0b',flexShrink:0}}/>}
                                    {info.hasToil&&<div style={{width:'4px',height:'4px',borderRadius:'50%',background:'#7c3aed',flexShrink:0}}/>}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* legend */}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginTop:'12px',paddingTop:'12px',borderTop:'1px solid #f1f5f9'}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'6px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#fef2f2',border:'1px solid #fecaca'}}/><span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>OT/PA Recorded</span></div>
                        <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#f0fdf4',border:'1px solid #bbf7d0'}}/><span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>OT/PA Submitted</span></div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'8px'}}>
                        <div style={{display:'flex',gap:'10px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#f59e0b'}}/><span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>PA</span></div>
                          <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'7px',height:'7px',borderRadius:'50%',background:'#7c3aed'}}/><span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>TOIL</span></div>
                        </div>
                        <div style={{display:'flex',gap:'10px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#0f172a'}}/><span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>1.33x</span></div>
                          <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#059669'}}/><span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>1.5x</span></div>
                          <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'11px',height:'11px',borderRadius:'3px',background:'#dc2626'}}/><span style={{fontSize:'13px',fontWeight:700,color:'#64748b'}}>2.0x</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* period breakdown boxes — same layout as List View */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px'}}>
                    <div style={{background:'#fff',borderRadius:'13px',padding:'13px',border:'1px solid #dbeafe'}}>
                      <div style={{fontSize:'11px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'7px'}}>OT Pay</div>
                      <div style={{fontSize:'14px',fontWeight:700,color:'#1e3a5f',marginBottom:'1px'}}>Gross: {fmt(pb.ot)}</div>
                      <div style={{fontSize:'13px',fontWeight:700,color:'#3b82f6',marginBottom:'7px'}}>Net: {fmt(pb.otResult.net)}</div>
                      <div style={{borderTop:'1px solid #eff6ff',paddingTop:'5px'}}>
                        {ph133>0&&<div style={{fontSize:'12px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{ph133}h @ 1.33x</div>}
                        {ph150>0&&<div style={{fontSize:'12px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{ph150}h @ 1.5x</div>}
                        {ph200>0&&<div style={{fontSize:'12px',fontWeight:700,color:'#64748b'}}>{ph200}h @ 2.0x</div>}
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'9px'}}>
                      <div style={{background:'#fff',borderRadius:'13px',padding:'11px',border:'1px solid #fde68a'}}>
                        <div style={{fontSize:'11px',fontWeight:900,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'5px'}}>PA</div>
                        <div style={{fontSize:'14px',fontWeight:700,color:'#92400e',marginBottom:'1px'}}>Gross: {fmt(pb.pa)}</div>
                        <div style={{fontSize:'13px',fontWeight:700,color:'#d97706',marginBottom:'7px'}}>Net: {fmt(pb.paResult.net)}</div>
                        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #fef3c7',paddingTop:'6px'}}>
                          <span style={{fontSize:'12px',fontWeight:700,color:'#78716c'}}>PA1 × {ppa1}</span>
                          <span style={{fontSize:'12px',fontWeight:700,color:'#78716c'}}>PA2 × {ppa2}</span>
                          <span style={{fontSize:'12px',fontWeight:700,color:'#78716c'}}>PA3 × {ppa3}</span>
                        </div>
                      </div>
                      <div onClick={()=>setTab('graph')} style={{background:'#f5f3ff',borderRadius:'13px',padding:'11px',border:'1px solid #ddd6fe',cursor:'pointer'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'5px'}}><Ico n="clock" s={11} c="#7c3aed"/><div style={{fontSize:'11px',fontWeight:900,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>TOIL</div></div>
                        <div style={{fontSize:'14px',fontWeight:700,color:'#4c1d95',marginBottom:'6px'}}>{fmtHM(pToilWorked)}h worked → {fmtHM(pToilBanked)}h banked</div>
                        <div style={{fontSize:'11px',fontWeight:700,color:'#8b5cf6'}}>See TOIL Tab</div>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const g = carmsOutstanding.groups.find(g=>g.periodIdx===cIdx);
                    if (!g) return null;
                    return (
                      <div onClick={ev=>{ ev.stopPropagation(); setTab('carms'); setPulsePeriodIdx(cIdx); }} className="nav-add-pulse" style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'13px',padding:'18px',marginTop:'9px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                          <Ico n="clock" s={14} c="#d97706"/>
                          <span style={{fontSize:'12.5px',fontWeight:800,color:'#0f172a'}}>CARMS &amp; MetHR Awaiting Submission</span>
                        </div>
                        <span style={{fontSize:'21.5px',fontWeight:900,color:'#d97706'}}>{fmtGBP(g.periodTotal)}</span>
                      </div>
                    );
                  })()}

                  <div style={{...S.card,marginTop:'9px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px'}}>
                      <div><div style={{fontSize:'14px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Gross</div><div style={{fontWeight:900,fontSize:'23px',color:'#1e3a5f'}}>{fmt(pb.combinedGross)}</div></div>
                      <div style={{textAlign:'right'}}><div style={{fontSize:'14px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Net</div><div style={{fontWeight:900,fontSize:'23px',color:'#059669'}}>{fmt(pb.combinedNet)}</div></div>
                    </div>
                  </div>
                  {renderFYTotalsCard()}
                </>
              );
            })()}
            </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════ CARMS OUTSTANDING */}
        {tab==='carms'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',margin:'0 0 18px',letterSpacing:'-0.5px'}}>CARMS &amp; PA Outstanding</h2>

            <div style={{...S.dark,background:'#0f2744'}}>
              <div style={{fontSize:'11px',color:'#93c5fd',fontWeight:600,lineHeight:1.5,marginBottom:'14px'}}>Spacing out your overtime for a steadier payday, or quietly dodging the taxman as £100k creeps closer — either way, good thinking. This is everything still sitting unclaimed in CARMS and PA, so nothing gets left behind.</div>
              <div style={{display:'flex',gap:'10px',marginBottom:carmsOutstanding.groups.length?'14px':0}}>
                <div style={{flex:1,background:'rgba(255,255,255,0.08)',borderRadius:'12px',padding:'12px'}}>
                  <div style={{fontSize:'19px',fontWeight:900,color:'#fff'}}>{fmtGBP(carmsOutstanding.totalOtAmount)}</div>
                  <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.8px',marginTop:'2px'}}>OT Outstanding</div>
                </div>
                <div style={{flex:1,background:'rgba(255,255,255,0.08)',borderRadius:'12px',padding:'12px'}}>
                  <div style={{fontSize:'19px',fontWeight:900,color:'#fff'}}>{fmtGBP(carmsOutstanding.totalPaAmount)}</div>
                  <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.8px',marginTop:'2px'}}>PA Outstanding</div>
                </div>
                <div style={{flex:1,background:'rgba(255,255,255,0.08)',borderRadius:'12px',padding:'12px'}}>
                  <div style={{fontSize:'19px',fontWeight:900,color:'#fff'}}>{carmsOutstanding.totalClaims}</div>
                  <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.8px',marginTop:'2px'}}>Claims</div>
                </div>
              </div>

              {carmsOutstanding.groups.length===0 ? (
                <div style={{textAlign:'center',padding:'20px 10px',color:'#93c5fd',fontSize:'13px',fontWeight:700}}>Nothing outstanding — every logged claim has been marked as submitted.</div>
              ) : (
                <>
                  <div style={{background:'rgba(217,119,6,0.12)',border:'1px solid #d97706',borderRadius:'10px',padding:'10px 12px',fontSize:'11px',color:'#fde68a',lineHeight:1.5,marginBottom:'14px'}}>
                    This {fmtGBP(carmsOutstanding.totalAmount)} isn't in your Total Gross YTD yet — it only counts once it's been marked as submitted on the Log Overtime screen.
                  </div>

                  <div style={{display:'flex',gap:'6px',marginBottom:'14px'}}>
                    {[{id:'all',lbl:'All'},{id:'ot',lbl:'Overtime'},{id:'pa',lbl:'PA'},{id:'toil',lbl:'TOIL'}].map(f=>(
                      <div key={f.id} onClick={()=>setCarmsFilter(f.id)} style={{flex:1,textAlign:'center',padding:'8px 4px',borderRadius:'10px',fontSize:'11px',fontWeight:800,cursor:'pointer',background:carmsFilter===f.id?'#2563eb':'rgba(255,255,255,0.08)',color:carmsFilter===f.id?'#fff':'#93c5fd'}}>{f.lbl}</div>
                    ))}
                  </div>

                  {carmsOutstanding.groups.map(g=>{
                    const visibleItems = g.items.filter(it => {
                      if (carmsFilter==='ot') return it.otOutstanding;
                      if (carmsFilter==='pa') return it.paOutstanding;
                      if (carmsFilter==='toil') return it.toilOutstanding;
                      return true;
                    });
                    if (visibleItems.length===0) return null;
                    const visibleTotalLabel = (() => {
                      if (carmsFilter==='toil') return `${visibleItems.reduce((s,it)=>s+it.toilHrs,0).toFixed(1)}h`;
                      const total = visibleItems.reduce((s,it)=>{
                        if (carmsFilter==='ot') return s+it.otAmt;
                        if (carmsFilter==='pa') return s+it.paAmt;
                        return s+it.amount;
                      },0);
                      return fmtGBP(total);
                    })();
                    return (
                      <div key={g.periodIdx} ref={el=>periodGroupRefs.current[g.periodIdx]=el} className={pulsePeriodIdx===g.periodIdx?'carms-pulse':''} style={{marginBottom:'14px',borderRadius:'14px',border:pulsePeriodIdx===g.periodIdx?'2px solid #2563eb':'2px solid transparent'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 4px',fontSize:'10.5px',fontWeight:800,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.6px'}}>
                          <span>{g.period.short} · {g.period.month} · {fmtD(g.period.start)} – {fmtD(g.period.end)}</span>
                          <span>{visibleTotalLabel}</span>
                        </div>
                        <div style={{background:'#f8fafc',borderRadius:'12px',padding:'4px 12px'}}>
                          {visibleItems.map(it=>{
                            const goToEntry = () => {
                              startEdit(it.entry);
                              setFocusCarmsToggle(true);
                            };
                            const showOt = it.otOutstanding && carmsFilter!=='pa' && carmsFilter!=='toil';
                            const showPa = it.paOutstanding && carmsFilter!=='ot' && carmsFilter!=='toil';
                            const showToil = it.toilOutstanding && carmsFilter!=='ot' && carmsFilter!=='pa';
                            // Overtime and TOIL are the same submission — TOIL only
                            // banks once the underlying OT is submitted, so whenever
                            // both are outstanding on one entry they share a single
                            // numbered row rather than each claiming their own number.
                            // A day showing TOIL on its own (the dedicated TOIL filter
                            // tab, where showOt is always false) still gets its own row.
                            const mergeOtToil = showOt && showToil;
                            return (
                              <div key={it.entry.id} onClick={goToEntry} style={{padding:isWide?'12px 0':'10px 0',borderBottom:'1px solid #f1f5f9',cursor:'pointer'}}>
                                <div style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:700,color:'#2563eb',textDecoration:'underline',marginBottom:'6px'}}>
                                  {it.entry.reason||'Shift'} — {new Date(it.entry.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}
                                </div>
                                {mergeOtToil&&(
                                  <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                                    <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'#64748b',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-ot')}</span>
                                    <span style={{fontSize:isWide?'10.5px':'8.5px',fontWeight:800,padding:'2px 6px',borderRadius:'10px',border:'1px solid #0f172a',textTransform:'uppercase',background:'#eff6ff',color:'#2563eb'}}>Overtime</span>
                                    <span style={{fontSize:isWide?'10.5px':'8.5px',fontWeight:800,padding:'2px 6px',borderRadius:'10px',border:'1px solid #0f172a',textTransform:'uppercase',background:'#f5f3ff',color:'#7c3aed'}}>TOIL</span>
                                    <div style={{marginLeft:'auto',textAlign:'right'}}>
                                      <div style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'#d97706'}}>{fmtGBP(it.otAmt)}</div>
                                      <div style={{fontSize:isWide?'9.5px':'8.5px',fontWeight:700,color:'#7c3aed'}}>+ {it.toilHrs.toFixed(1)}h TOIL</div>
                                    </div>
                                  </div>
                                )}
                                {showOt&&!mergeOtToil&&(
                                  <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                                    <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'#64748b',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-ot')}</span>
                                    <span style={{fontSize:isWide?'10.5px':'8.5px',fontWeight:800,padding:'2px 6px',borderRadius:'10px',border:'1px solid #0f172a',textTransform:'uppercase',background:'#eff6ff',color:'#2563eb'}}>Overtime</span>
                                    <span style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.otAmt)}</span>
                                  </div>
                                )}
                                {showPa&&(
                                  <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                                    <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'#64748b',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-pa')}</span>
                                    <span style={{fontSize:isWide?'10.5px':'8.5px',fontWeight:800,padding:'2px 6px',borderRadius:'10px',border:'1px solid #0f172a',textTransform:'uppercase',background:'#fffbeb',color:'#f59e0b'}}>PA</span>
                                    <span style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'#d97706',marginLeft:'auto'}}>{fmtGBP(it.paAmt)}</span>
                                  </div>
                                )}
                                {showToil&&!mergeOtToil&&(
                                  <div style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 0'}}>
                                    <span style={{fontSize:isWide?'10.5px':'9px',fontWeight:900,color:'#64748b',minWidth:isWide?'14px':'12px'}}>{carmsClaimNumbers.get(it.entry.id+'-toil')}</span>
                                    <span style={{fontSize:isWide?'10.5px':'8.5px',fontWeight:800,padding:'2px 6px',borderRadius:'10px',border:'1px solid #0f172a',textTransform:'uppercase',background:'#f5f3ff',color:'#7c3aed'}}>TOIL</span>
                                    <span style={{fontSize:isWide?'14.5px':'12.5px',fontWeight:800,color:'#d97706',marginLeft:'auto'}}>{it.toilHrs.toFixed(1)}h</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════ TOIL */}
        {tab==='graph'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',marginBottom:'14px',letterSpacing:'-0.5px'}}>TOIL</h2>

            <div style={{background:toilLedger.balance<0?'#fef2f2':'#f5f3ff',border:toilLedger.balance<0?'1.5px solid #fecaca':'1.5px solid #ddd6fe',borderRadius:'16px',padding:'16px',marginBottom:'14px'}}>
              <div style={{fontSize:'11px',fontWeight:900,color:toilLedger.balance<0?'#dc2626':'#6d28d9',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>TOIL Balance{toilLedger.balance<0?' — Overdrawn':''}</div>
              <div style={{fontSize:'26px',fontWeight:900,color:toilLedger.balance<0?'#991b1b':'#4c1d95'}}>{fmtHM(toilLedger.balance)} h</div>
              <div style={{fontSize:'11px',fontWeight:700,color:toilLedger.balance<0?'#dc2626':'#7c3aed',marginTop:'2px'}}>≈ {(toilLedger.balance/8).toFixed(1)} days at 8h/day</div>
            </div>

            <div style={{...S.card,background:'#fff',border:'1.5px solid #ede9fe'}}>
              <div style={{...S.lbl,fontSize:'11px',marginBottom:'8px'}}>Redeem TOIL</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 52px 80px',gap:'8px',marginBottom:'8px'}}>
                <input type="date" style={{border:'1px solid #ddd6fe',borderRadius:'9px',padding:'8px',fontFamily:'inherit',fontSize:'16px',boxSizing:'border-box'}} value={toilTakenForm.date} onChange={e=>setToilTakenForm({...toilTakenForm,date:e.target.value})}/>
                <input type="number" min="0" step="1" placeholder="Hrs" style={{border:'1px solid #ddd6fe',borderRadius:'9px',padding:'8px',fontFamily:'inherit',fontSize:'16px',textAlign:'center',boxSizing:'border-box'}} value={toilTakenForm.hours} onChange={e=>setToilTakenForm({...toilTakenForm,hours:e.target.value})}/>
                <select style={{border:'1px solid #ddd6fe',borderRadius:'9px',padding:'8px 4px',fontFamily:'inherit',fontSize:'16px',textAlign:'center',boxSizing:'border-box',background:'#fff'}} value={toilTakenForm.minutes} onChange={e=>setToilTakenForm({...toilTakenForm,minutes:e.target.value})}>
                  <option value="00">00m</option>
                  <option value="15">15m</option>
                  <option value="30">30m</option>
                  <option value="45">45m</option>
                </select>
              </div>
              <input type="text" placeholder="Note (optional) — e.g. half day, appointment" style={{width:'100%',boxSizing:'border-box',border:'1px solid #ddd6fe',borderRadius:'9px',padding:'8px',fontFamily:'inherit',fontSize:'16px',marginBottom:'8px'}} value={toilTakenForm.note} onChange={e=>setToilTakenForm({...toilTakenForm,note:e.target.value})}/>
              <button onClick={addToilTaken} style={{width:'100%',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',padding:'11px',fontWeight:900,fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}>Redeem TOIL</button>
            </div>

            <div style={{...S.lbl,fontSize:'11px',margin:'14px 0 8px'}}>Ledger</div>
            <div style={{fontSize:'11.5px',fontWeight:600,color:'#94a3b8',lineHeight:1.5,marginBottom:'10px'}}>Green entries post automatically whenever you log a shift as TOIL or Mix. Red entries result when you redeem TOIL in the box above.</div>
            {toilLedger.rows.length===0 ? (
              <div style={{fontSize:'14px',color:'#94a3b8',textAlign:'center',padding:'20px'}}>No TOIL activity yet</div>
            ) : toilLedger.rows.map(l=>(
              <div key={l.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 12px',marginBottom:'8px',borderRadius:'11px',gap:'10px',background:l.type==='earned'?'#f0fdf4':'#fef2f2',border:l.type==='earned'?'1px solid #bbf7d0':'1px solid #fecaca'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:700,color:'#334155'}}>{l.note}</div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px'}}>
                    <span style={{fontSize:'11.5px',color:'#94a3b8'}}>{new Date(l.date+'T12:00:00').toLocaleDateString('en-GB')}</span>
                    {l.type==='taken'&&(
                      <button onClick={()=>deleteToilTaken(l.rawId)} style={{flexShrink:0,display:'flex',alignItems:'center',gap:'3px',background:'#fff',border:'1.5px solid #fecaca',borderRadius:'7px',padding:'3px 7px',color:'#dc2626',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:'pointer'}}>
                        <Ico n="trash" s={10} c="#dc2626"/> Remove
                      </button>
                    )}
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:'15px',fontWeight:900,color:l.type==='earned'?'#059669':'#dc2626'}}>{l.hours>=0?'+':''}{fmtHM(l.hours)}h</div>
                  <div style={{fontSize:'11px',color:'#94a3b8'}}>bal: {fmtHM(l.balanceAfter)} h</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════ SETTINGS */}
        {tab==='settings'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
              <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',margin:0,letterSpacing:'-0.5px'}}>Options, Settings, Export and Backup</h2>
              {savedBadge&&<div style={{display:'flex',alignItems:'center',gap:'5px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'9px',padding:'4px 9px'}}><Ico n="check" s={12} c="#059669"/><span style={{fontSize:'11px',fontWeight:900,color:'#065f46'}}>Saved</span></div>}
            </div>

            {/* ── Configuration — now a single collapsible unit like the
                 other cards, except it forces itself open for as long as
                 rank/pay point setup is incomplete (see configShown above)
                 — that part was never meant to be hideable. ── */}
            <div style={S.card}>
              <div onClick={configSetupIncomplete?undefined:()=>setConfigExpanded(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',cursor:configSetupIncomplete?'default':'pointer',marginBottom:configShown?'13px':0}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <div style={{background:'#eff6ff',padding:isWide?'11px':'9px',borderRadius:'11px'}}><Ico n="cog" s={isWide?21:17} c="#2563eb"/></div>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Config, Rates &amp; Payscales</div>
                </div>
                {!configSetupIncomplete && <span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',flexShrink:0}}>{configShown?'Tap to Close':'Tap to expand'}</span>}
              </div>

              {configShown && (
              <>
              <div style={{marginBottom:'13px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px'}}>
                  <label style={{...S.lbl,marginBottom:0}}>Rank</label>
                  {!settings.rank&&<span style={{fontSize:'9px',fontWeight:900,color:'#dc2626',background:'#fee2e2',padding:'2px 7px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.5px'}}>Start here</span>}
                </div>
                <div className={!settings.rank?'setup-pulse-urgent':''} style={{borderRadius:'13px'}}>
                  <select style={{...S.sel,border: !settings.rank ? '2px solid #dc2626' : '1px solid #e2e8f0',fontWeight: !settings.rank ? 900 : 700}} value={settings.rank} onChange={e=>{
                    const r=e.target.value;
                    if(!r) return saveSett({...settings,rank:'',service:''});
                    saveSett({...settings,rank:r,service:''});
                  }}>
                    <option value="">Select Rank...</option>
                    {Object.keys(PAY_RATES).map(k=><option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              {settings.rank&&(
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px'}}>
                    <label style={{...S.lbl,marginBottom:0}}>Pay Point</label>
                    {!settings.service&&<span style={{fontSize:'9px',fontWeight:900,color:'#dc2626',background:'#fee2e2',padding:'2px 7px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.5px'}}>Now this</span>}
                  </div>
                  <div className={!settings.service?'setup-pulse-urgent':''} style={{borderRadius:'13px'}}>
                    <select style={{...S.sel,border: !settings.service ? '2px solid #dc2626' : '1px solid #e2e8f0',fontWeight: !settings.service ? 900 : 700}} value={settings.service} onChange={e=>saveSett({...settings,service:e.target.value})}>
                      <option value="">Select pay point...</option>
                      {Object.keys(PAY_RATES[settings.rank]).map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div style={{display:'flex',alignItems:'center',gap:'8px',borderTop:'1px solid #f1f5f9',marginTop:'14px',paddingTop:'12px'}}>
                <div style={{background:'#eff6ff',padding:'9px',borderRadius:'11px'}}><Ico n="clock" s={17} c="#2563eb"/></div>
                <span style={{fontWeight:900,fontSize:'13px',color:'#0f172a'}}>Hourly Rates & Payscales</span>
              </div>

              {settings.rank&&settings.service&&(()=>{
                const svcData = PAY_RATES[settings.rank][settings.service];
                return (
                  <div style={{borderTop:'1px solid #f1f5f9',marginTop:'14px',paddingTop:'14px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                      {[['Pre 1 Sep 2026','pre','#64748b','#f8fafc'],['From 1 Sep 2026','post','#2563eb','#fff']].map(([label,key,col,bg])=>(
                        <div key={key} style={{background:bg,borderRadius:'12px',padding:'12px',border:key==='post'?'1.5px solid #bfdbfe':'1px solid #f1f5f9'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:col,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'8px'}}>{label}</div>
                          {['Base','1.33x','1.5x','2.0x'].map((lbl,i)=>(
                            <div key={lbl} style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                              <span style={{fontSize:'10px',fontWeight:700,color:'#64748b'}}>{lbl}</span>
                              <span style={{fontSize:'10px',fontWeight:900,color:key==='post'?'#1e3a5f':'#475569'}}>£{(svcData[key][['base','r133','r150','r200'][i]]||0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    <div style={{borderTop:'1px solid #dbeafe',marginTop:'16px',paddingTop:'14px'}}>
                      <div style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.2px',marginBottom:'10px'}}>Published Pay Scales</div>
                      {['Constable','Sergeant'].map(rank=>(
                        <div key={rank} style={{marginBottom: rank==='Constable' ? '16px' : 0}}>
                          <div style={{fontSize:'10px',fontWeight:900,color:'#1e3a5f',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'7px'}}>{rank}</div>
                          <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr',gap:'2px 8px',alignItems:'center'}}>
                            <div style={{fontSize:'8px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',paddingBottom:'5px',borderBottom:'1px solid #dbeafe'}}>Pay Point</div>
                            <div style={{fontSize:'8px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid #dbeafe'}}>Pre-Sept</div>
                            <div style={{fontSize:'8px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid #dbeafe'}}>Post-Sept</div>
                            {Object.entries(PAY_RATES[rank]).map(([point,data])=>(
                              <div key={point} style={{display:'contents'}}>
                                <div style={{fontSize:'11px',fontWeight:700,color:'#0f172a',padding:'5px 0'}}>{point}</div>
                                <div style={{fontSize:'11px',fontWeight:700,color:'#64748b',textAlign:'right',padding:'5px 0'}}>£{data.salary.pre.toLocaleString('en-GB')}</div>
                                <div style={{fontSize:'11px',fontWeight:900,color:'#1e3a5f',textAlign:'right',padding:'5px 0'}}>£{data.salary.post.toLocaleString('en-GB')}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div style={{marginTop:'12px',fontSize:'9px',fontWeight:600,color:'#94a3b8',lineHeight:1.5}}>Excludes London Weighting (£3,150 pre-Sept / £3,260 post-Sept) and London Allowance (£6,588), which are added separately.</div>
                    </div>
                  </div>
                );
              })()}
              </>
              )}
            </div>

            {/* ── Tax & 100K+ Calculator — Actual (YTD) and Forecast (full year), side by side ── */}
            {settings.rank&&settings.service&&(()=>{
              const proj = totals.projectedAnnualGross;
              const ytd  = totals.combinedGrossYTD;
              const taxYearFraction = Math.max(1/365, Math.min(1, totals.taxYearDaysElapsed/365));

              // Pension contributions come off pay BEFORE income tax is worked
              // out (a "net pay arrangement"), which is why they reduce the
              // taxable figure — and therefore the £100k assessment itself —
              // but never touch National Insurance. Pensionable pay is basic
              // salary + London Weighting only; London Allowance and all
              // overtime/PA are non-pensionable, so they play no part here.
              const pensionablePayA = totals.salaryYTD + totals.lwYTD;
              const pensionA = calcPensionContribution(pensionablePayA, taxYearFraction);

              // Forecast — full year, matches how the rest of the app already
              // treats projections (yearFraction = 1). Sourced from the
              // shared taxForecast memo (see its own definition above)
              // rather than computed inline here.
              const { pensionablePayF, pensionF, taxableGrossF, overF, paLostF, paRemainingF, extraTaxF, breakdownF, niF, netF } = taxForecast;

              // Actual — year to date, same principle: taxable (post-pension)
              // YTD figure drives the taper assessment. Personal Allowance is
              // always an annual concept, so the taper is still judged on the
              // annualised run-rate; but the amount of that annual allowance
              // genuinely "used up" by money already banked is the pro-rated
              // slice.
              const taxableYTD = Math.max(0, ytd - pensionA.amount);
              const annualisedFromYTD = taxableYTD / taxYearFraction;
              const overA = annualisedFromYTD > 100000;
              const paLostAnnualA = overA ? Math.min(12570, Math.floor((annualisedFromYTD-100000)/2)) : 0;
              const paRemainingA = 12570 - paLostAnnualA;
              const paLostProRatedA = paLostAnnualA * taxYearFraction;
              const extraTaxA = overA ? (calcUKIncomeTax(taxableYTD, taxYearFraction) - calcUKIncomeTaxNoTaper(taxableYTD, taxYearFraction)) : 0;
              const breakdownA = computeTaxBandBreakdown(taxableYTD, taxYearFraction);
              const niA = totals.ytdNI; // reuse the real, period-summed figure rather than a lump estimate — unaffected by pension
              const netA = ytd - pensionA.amount - breakdownA.totalTax - niA;

              const over = overA || overF; // header icon reflects risk from either view

              const col = (label, value) => (
                <div style={{background:'#f8fafc',borderRadius:'11px',padding:'10px',textAlign:'center'}}>
                  <div style={{fontSize:'9px',fontWeight:700,color:'#94a3b8',marginBottom:'3px'}}>{label}</div>
                  <div style={{fontSize:'14px',fontWeight:900,color:'#0f172a'}}>{value}</div>
                </div>
              );

              return (
                <div ref={taxImpactCardRef} style={S.card}>
                  <div onClick={()=>setTaxImpactExpanded(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom:taxImpactExpanded?'12px':0,cursor:'pointer'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <div style={{background:over?'#fef2f2':'#f0fdf4',padding:isWide?'11px':'9px',borderRadius:'11px'}}><Ico n="calc" s={isWide?21:17} c={over?'#dc2626':'#059669'}/></div>
                      <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Tax & 100K+ Calculator</div>
                    </div>
                    <span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',flexShrink:0}}>{taxImpactExpanded?'Tap to Close':'Tap to expand'}</span>
                  </div>
                  {taxImpactExpanded&&(
                    <>
                      <div style={{display:'flex',alignItems:'flex-start',gap:'8px',marginBottom:'13px'}}>
                        <Ico n="shield" s={13} c="#94a3b8"/>
                        <span style={{fontSize:'11px',fontWeight:600,color:'#64748b',lineHeight:1.5}}>Tax is calculated automatically using real UK income tax bands, applied cumulatively across your salary, allowances and overtime — no manual rate needed.</span>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                        <div style={{fontSize:'9px',fontWeight:900,color:overA?'#dc2626':'#059669',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',background:overA?'#fef2f2':'#f0fdf4',borderRadius:'8px',padding:'5px 0'}}>Actual (YTD)</div>
                        <div style={{fontSize:'9px',fontWeight:900,color:overF?'#dc2626':'#059669',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',background:overF?'#fef2f2':'#f0fdf4',borderRadius:'8px',padding:'5px 0'}}>Forecast</div>
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                        {col('Gross', fmtGBP(ytd))}
                        {col('Gross', fmtGBP(proj))}
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'11px',padding:'10px',textAlign:'center'}}>
                          <div style={{fontSize:'9px',fontWeight:700,color:'#2563eb',marginBottom:'3px'}}>Pension ({(pensionA.rate*100).toFixed(2)}%)</div>
                          <div style={{fontSize:'13px',fontWeight:900,color:'#1e40af'}}>−{fmtGBP(pensionA.amount)}</div>
                        </div>
                        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'11px',padding:'10px',textAlign:'center'}}>
                          <div style={{fontSize:'9px',fontWeight:700,color:'#2563eb',marginBottom:'3px'}}>Pension ({(pensionF.rate*100).toFixed(2)}%)</div>
                          <div style={{fontSize:'13px',fontWeight:900,color:'#1e40af'}}>−{fmtGBP(pensionF.amount)}</div>
                        </div>
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                        {col('Personal Allowance Remaining', fmtGBP(paRemainingA))}
                        {col('Personal Allowance Remaining', fmtGBP(paRemainingF))}
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                        <div style={{background:overA?'#fef2f2':'#f0fdf4',border:`1px solid ${overA?'#fecaca':'#bbf7d0'}`,borderRadius:'11px',padding:'11px 10px',textAlign:'center'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:overA?'#991b1b':'#166534',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'3px'}}>Extra Tax</div>
                          <div style={{fontSize:'17px',fontWeight:900,color:overA?'#991b1b':'#166534'}}>{fmtGBP(extraTaxA)}</div>
                        </div>
                        <div style={{background:overF?'#fef2f2':'#f0fdf4',border:`1px solid ${overF?'#fecaca':'#bbf7d0'}`,borderRadius:'11px',padding:'11px 10px',textAlign:'center'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:overF?'#991b1b':'#166534',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'3px'}}>Extra Tax</div>
                          <div style={{fontSize:'17px',fontWeight:900,color:overF?'#991b1b':'#166534'}}>{fmtGBP(extraTaxF)}</div>
                        </div>
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                        <div onClick={()=>{ setTaxCalcActualDetailOpen(v=>!v); setTaxCalcForecastDetailOpen(false); }} style={{background:overA?'#fef2f2':'#f0fdf4',border:`1px solid ${overA?'#fecaca':'#bbf7d0'}`,borderRadius:'11px',padding:'10px',cursor:'pointer'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:overA?'#991b1b':'#166534',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'6px'}}>Calculations</div>
                          {overA ? (
                            <div style={{fontSize:'9.5px',color:'#991b1b',lineHeight:1.7}}>
                              Run-rate: {fmtGBP(annualisedFromYTD)}/yr<br/>
                              {fmtGBP(annualisedFromYTD-100000)} over £100k<br/>
                              → {fmtGBP(paLostProRatedA)} allowance used so far<br/>
                              → at {((extraTaxA/paLostProRatedA)*100).toFixed(1)}% = {fmtGBP(extraTaxA)}
                            </div>
                          ) : (
                            <div style={{fontSize:'9.5px',color:'#166534',lineHeight:1.7}}>Under £100k so far this year (after pension) — no allowance used yet.</div>
                          )}
                          <div style={{fontSize:'8.5px',fontWeight:800,color:overA?'#dc2626':'#059669',textDecoration:'underline',marginTop:'8px',textAlign:'center'}}>{taxCalcActualDetailOpen?'Showing full breakdown below':'Tap to see full breakdown'}</div>
                        </div>
                        <div onClick={()=>{ setTaxCalcForecastDetailOpen(v=>!v); setTaxCalcActualDetailOpen(false); }} style={{background:overF?'#fef2f2':'#f0fdf4',border:`1px solid ${overF?'#fecaca':'#bbf7d0'}`,borderRadius:'11px',padding:'10px',cursor:'pointer'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:overF?'#991b1b':'#166534',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'6px'}}>Calculations</div>
                          {overF ? (
                            <div style={{fontSize:'9.5px',color:'#991b1b',lineHeight:1.7}}>
                              {fmtGBP(taxableGrossF)} taxable (after pension)<br/>
                              {fmtGBP(taxableGrossF-100000)} over £100k<br/>
                              → {fmtGBP(paLostF)} allowance lost<br/>
                              → at {((extraTaxF/paLostF)*100).toFixed(1)}% = {fmtGBP(extraTaxF)}
                            </div>
                          ) : (
                            <div style={{fontSize:'9.5px',color:'#166534',lineHeight:1.7}}>Projected to stay under £100k (after pension) — {fmtGBP(100000-taxableGrossF)} of headroom at this pace.</div>
                          )}
                          <div style={{fontSize:'8.5px',fontWeight:800,color:overF?'#dc2626':'#059669',textDecoration:'underline',marginTop:'8px',textAlign:'center'}}>{taxCalcForecastDetailOpen?'Showing full breakdown below':'Tap to see full breakdown'}</div>
                        </div>
                      </div>

                      {taxCalcActualDetailOpen&&(
                        <div style={{borderTop:'2px solid #fecaca',marginTop:'12px',paddingTop:'12px'}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                            <div style={{fontWeight:900,fontSize:'12px',color:'#0f172a'}}>Full Calculation — Actual (YTD)</div>
                            <span onClick={()=>setTaxCalcActualDetailOpen(false)} style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',cursor:'pointer'}}>Show less</span>
                          </div>
                          <div style={{background:'#f8fafc',borderRadius:'11px',padding:'12px 14px',marginBottom:'10px'}}>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Gross (YTD)</span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(ytd)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #bfdbfe',background:'#eff6ff',margin:'0 -14px',paddingLeft:'14px',paddingRight:'14px'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#1e40af'}}>Pension Contribution <span style={{color:'#3b82f6',fontWeight:600}}>({(pensionA.rate*100).toFixed(2)}% of {fmtGBP(pensionablePayA)} pensionable pay)</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#1e40af'}}>−{fmtGBP(pensionA.amount)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>= Taxable Gross (YTD)</span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(taxableYTD)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Personal Allowance <span style={{color:'#94a3b8',fontWeight:600}}>(0%, pro-rated)</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#059669'}}>{fmtGBP(breakdownA.pa)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Basic Rate <span style={{color:'#94a3b8',fontWeight:600}}>(20% on {fmtGBP(breakdownA.basicAmt)})</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(breakdownA.basicTax)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Higher Rate <span style={{color:'#94a3b8',fontWeight:600}}>(40% on {fmtGBP(breakdownA.higherAmt)})</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(breakdownA.higherTax)}</span></div>
                            {breakdownA.additionalAmt>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Additional Rate <span style={{color:'#94a3b8',fontWeight:600}}>(45% on {fmtGBP(breakdownA.additionalAmt)})</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(breakdownA.additionalTax)}</span></div>}
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'11px',padding:'11px 14px',marginBottom:'8px'}}>
                            <span style={{fontSize:'11.5px',fontWeight:800,color:'#991b1b'}}>Total Income Tax (YTD)</span>
                            <span style={{fontSize:'13px',fontWeight:900,color:'#991b1b'}}>{fmtGBP(breakdownA.totalTax)}</span>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',background:'#f8fafc',borderRadius:'11px',padding:'10px 14px',marginBottom:'8px'}}>
                            <span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>National Insurance (YTD) <span style={{color:'#94a3b8',fontWeight:600}}>(on full gross)</span></span>
                            <span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(niA)}</span>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'11px',padding:'11px 14px'}}>
                            <span style={{fontSize:'11.5px',fontWeight:800,color:'#166534'}}>Estimated Net (YTD)</span>
                            <span style={{fontSize:'14px',fontWeight:900,color:'#166534'}}>{fmtGBP(netA)}</span>
                          </div>
                          <div style={{fontSize:'9px',color:'#94a3b8',lineHeight:1.5,marginTop:'8px'}}>What's owed on money genuinely banked so far — not a projection. Pension tier is estimated from your current pay rate, not last scheme year's actual earnings, which is what the real rule technically uses.</div>
                        </div>
                      )}

                      {taxCalcForecastDetailOpen&&(
                        <div style={{borderTop:'2px solid #fecaca',marginTop:'12px',paddingTop:'12px'}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                            <div style={{fontWeight:900,fontSize:'12px',color:'#0f172a'}}>Full Calculation — Forecast</div>
                            <span onClick={()=>setTaxCalcForecastDetailOpen(false)} style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',cursor:'pointer'}}>Show less</span>
                          </div>
                          <div style={{background:'#f8fafc',borderRadius:'11px',padding:'12px 14px',marginBottom:'10px'}}>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Gross (projected annual)</span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(proj)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #bfdbfe',background:'#eff6ff',margin:'0 -14px',paddingLeft:'14px',paddingRight:'14px'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#1e40af'}}>Pension Contribution <span style={{color:'#3b82f6',fontWeight:600}}>({(pensionF.rate*100).toFixed(2)}% of {fmtGBP(pensionablePayF)} pensionable pay)</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#1e40af'}}>−{fmtGBP(pensionF.amount)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>= Taxable Gross</span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(taxableGrossF)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Personal Allowance <span style={{color:'#94a3b8',fontWeight:600}}>(0%)</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#059669'}}>{fmtGBP(breakdownF.pa)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Basic Rate <span style={{color:'#94a3b8',fontWeight:600}}>(20% on {fmtGBP(breakdownF.basicAmt)})</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(breakdownF.basicTax)}</span></div>
                            <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:breakdownF.additionalAmt>0?'1px solid #f1f5f9':'none'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Higher Rate <span style={{color:'#94a3b8',fontWeight:600}}>(40% on {fmtGBP(breakdownF.higherAmt)})</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(breakdownF.higherTax)}</span></div>
                            {breakdownF.additionalAmt>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'7px 0'}}><span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>Additional Rate <span style={{color:'#94a3b8',fontWeight:600}}>(45% on {fmtGBP(breakdownF.additionalAmt)})</span></span><span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(breakdownF.additionalTax)}</span></div>}
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'11px',padding:'11px 14px',marginBottom:'8px'}}>
                            <span style={{fontSize:'11.5px',fontWeight:800,color:'#991b1b'}}>Total Income Tax</span>
                            <span style={{fontSize:'13px',fontWeight:900,color:'#991b1b'}}>{fmtGBP(breakdownF.totalTax)}</span>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',background:'#f8fafc',borderRadius:'11px',padding:'10px 14px',marginBottom:'8px'}}>
                            <span style={{fontSize:'11.5px',fontWeight:700,color:'#64748b'}}>National Insurance <span style={{color:'#94a3b8',fontWeight:600}}>(est., on full gross)</span></span>
                            <span style={{fontSize:'12.5px',fontWeight:900,color:'#0f172a'}}>{fmtGBP(niF)}</span>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'11px',padding:'11px 14px'}}>
                            <span style={{fontSize:'11.5px',fontWeight:800,color:'#166534'}}>Estimated Net Pay</span>
                            <span style={{fontSize:'14px',fontWeight:900,color:'#166534'}}>{fmtGBP(netF)}</span>
                          </div>
                          <div style={{fontSize:'9px',color:'#94a3b8',lineHeight:1.5,marginTop:'8px'}}>The full income tax and NI computation for the whole year, not just the extra caused by crossing £100k. Pension tier is estimated from your current pay rate, not last scheme year's actual earnings, which is what the real rule technically uses.</div>
                        </div>
                      )}

                      <div style={{fontSize:'9.5px',color:'#94a3b8',lineHeight:1.5,marginTop:'10px'}}>Based on your current pay rate projected across the tax year. Pension figures follow the 2015 Police Pension Scheme (England & Wales) rates effective 1 April 2026. Please do your own due diligence and if needs be consult an accountant/HMRC or your pension provider.</div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── Financial Years — generated calendar, every past year with data is browsable ── */}
            <div style={S.card}>
              <div onClick={()=>setFinancialYearsExpanded(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom:financialYearsExpanded?'11px':0,cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <div style={{background:'#eff6ff',padding:isWide?'11px':'9px',borderRadius:'11px'}}><Ico n="cal" s={isWide?21:17} c="#2563eb"/></div>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Archived Financial Years</div>
                </div>
                <span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',flexShrink:0}}>{financialYearsExpanded?'Tap to Close':'Tap to expand'}</span>
              </div>
              {financialYearsExpanded&&(
                <>
                  <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                    {[CURRENT_FY_YEAR, ...yearsWithData].map(y=>{
                      const yPeriods = generateFYPeriods(y);
                      const isCurrent = y===CURRENT_FY_YEAR;
                      const label = `${y} / ${(y+1).toString().slice(-2)}`;
                      return (
                        <div key={y} onClick={()=>{ if(!isCurrent){ setArchiveExpandedPeriod(null); setFySummaryPrintMode(false); setFySummaryYear(y); } }} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'12px',background:isCurrent?'#eff6ff':'#f8fafc',border:isCurrent?'2px solid #2563eb':'1px solid #f1f5f9',cursor:isCurrent?'default':'pointer'}}>
                          <div>
                            <div style={{fontWeight:800,fontSize:'13px',color:'#0f172a'}}>{label}</div>
                            <div style={{fontSize:'10px',color:'#94a3b8',marginTop:'1px'}}>{yPeriods[0].month} – {yPeriods[11].month}</div>
                          </div>
                          {isCurrent
                            ? <span style={{fontSize:'8px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.5px',padding:'2px 7px',borderRadius:'20px',background:'#2563eb',color:'#fff'}}>Current</span>
                            : <Ico n="cR" s={14} c="#94a3b8"/>}
                        </div>
                      );
                    })}
                    {yearsWithData.length===0&&<div style={{fontSize:'10.5px',color:'#94a3b8',textAlign:'center',padding:'6px 0'}}>Past years will appear here once you have entries from before this financial year.</div>}
                  </div>
                  <div style={{fontSize:'9.5px',color:'#94a3b8',textAlign:'center',marginTop:'10px',lineHeight:1.5}}>Dates are generated from your confirmed pay pattern (4-4-5 weeks, 52 weeks/year). Archived data is only retained for 4 years.</div>
                </>
              )}
            </div>

            {/* ── Export to spreadsheet — separate from backup ── */}
            <div style={S.card}>
              <div onClick={()=>setExportDataExpanded(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom:exportDataExpanded?'11px':0,cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <div style={{background:'#fffbeb',padding:isWide?'11px':'9px',borderRadius:'11px'}}><Ico n="share" s={isWide?21:17} c="#d97706"/></div>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Financial Reports &amp; Export</div>
                </div>
                <span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',flexShrink:0}}>{exportDataExpanded?'Tap to Close':'Tap to expand'}</span>
              </div>
              {exportDataExpanded&&(
                <>
                  <button onClick={()=>{setExportFormat(null);setPayslipMode('period');setPayslipPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0);setPayslipFYYear(CURRENT_FY_YEAR);setPayslipModalOpen(true);}} disabled={entries.length===0} style={{width:'100%',padding:'12px',background: entries.length===0 ? '#f1f5f9' : '#2563eb',border:'none',borderRadius:'11px',color: entries.length===0 ? '#94a3b8' : '#fff',fontWeight:900,fontSize:'11px',fontFamily:'inherit',cursor: entries.length===0 ? 'default' : 'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',textTransform:'uppercase',letterSpacing:'1px',boxShadow: entries.length===0 ? 'none' : '0 4px 14px rgba(37,99,235,0.3)'}}><Ico n="share" s={13} c={entries.length===0?'#94a3b8':'#fff'}/> Export to PDF or Spreadsheet</button>
                  {entries.length===0&&<div style={{fontSize:'10px',color:'#94a3b8',textAlign:'center',marginTop:'8px',fontWeight:600}}>Log a shift first to enable export</div>}
                  <div style={{fontSize:'9.5px',color:'#94a3b8',textAlign:'center',marginTop:'8px',lineHeight:1.5}}>Archived data is only retained for 4 years.</div>
                </>
              )}
            </div>

            {/* ── Account & Data Management — merged into one card, keeping
                 Data Management's dark styling throughout (including the
                 Delete Account section, restyled from its old light-card
                 look to match the same dark-theme conventions Wipe All
                 Data's own confirm flow already uses). One shared expand
                 toggle now, not two. ── */}
            <div style={{background:'#fff',borderRadius:'18px',padding:'19px',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',border:'1px solid #f1f5f9',marginBottom:'10px',position:'relative',overflow:'hidden'}}>
              <div onClick={()=>setDataManagementExpanded(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',cursor:'pointer',marginBottom:dataManagementExpanded?'13px':0}}>
                <div style={{display:'flex',alignItems:'center',gap:'11px'}}>
                  <div style={{background:'#eff6ff',padding:'11px',borderRadius:'13px'}}><Ico n="user" s={21} c="#2563eb"/></div>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Account &amp; Data Management</div>
                </div>
                <span style={{fontSize:'9px',fontWeight:800,color:'#2563eb',textDecoration:'underline',flexShrink:0}}>{dataManagementExpanded?'Tap to Close':'Tap to expand'}</span>
              </div>
              {dataManagementExpanded&&(
                <div style={{background:'#f8fafc',borderRadius:'13px',padding:'13px'}}>
                  {session&&<div style={{fontSize:'12px',color:'#0f172a',fontWeight:700,marginBottom:'11px'}}>Signed in as {session.user?.email}</div>}
                  <div style={{fontSize:'11px',color:'#64748b',marginBottom:'11px',lineHeight:1.5}}>Data is automatically synced and backed up to a secure cloud. To create a hard downloadable backup, select BACKUP. To restore from a previous hard copy, select RESTORE.</div>
                  <div style={{display:'flex',gap:'6px',marginBottom:'11px'}}>
                    <button onClick={handleExport} className={pulseBackupBtn?'backup-pulse':''} style={{flex:1,padding:'10px',background:'#2563eb',border:'none',borderRadius:'10px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="dl" s={12} c="#fff"/> Backup</button>
                    <button onClick={()=>setRestoreConfirmOpen(true)} style={{flex:1,padding:'10px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:'10px',color:'#475569',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="ul" s={12} c="#475569"/> Restore</button>
                    <input type="file" ref={fileRef} style={{display:'none'}} accept=".json" onChange={handleImport}/>
                  </div>

                  <div style={{borderTop:'1px solid #e2e8f0',paddingTop:'11px'}}>
                    {!wipeConf
                      ?<button onClick={()=>setWipeConf(true)} style={{width:'100%',padding:'10px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',color:'#b91c1c',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="trash" s={12} c="#b91c1c"/> Wipe All Data</button>
                      :<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'12px',padding:'12px'}}>
                          <div style={{textAlign:'center',color:'#b91c1c',fontWeight:700,fontSize:'12px',marginBottom:'9px',lineHeight:1.4}}>Are you absolutely sure?<br/><span style={{fontSize:'10px',fontWeight:400,color:'#dc2626'}}>{session ? 'Deletes every logged shift and all TOIL data — on this device and in the cloud. ' : 'Deletes every logged shift and all TOIL data on this device. '}This cannot be undone unless you have downloaded a backup file to your device.</span></div>
                          <div style={{display:'flex',gap:'6px'}}>
                            <button onClick={handleWipe} disabled={wipingData} style={{flex:1,padding:'9px',background:'#dc2626',border:'none',borderRadius:'8px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:wipingData?'not-allowed':'pointer',textTransform:'uppercase',letterSpacing:'1px',opacity:wipingData?0.7:1}}>{wipingData?'Wiping…':'Yes, Delete'}</button>
                            <button onClick={()=>setWipeConf(false)} disabled={wipingData} style={{flex:1,padding:'9px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:'8px',color:'#475569',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Cancel</button>
                          </div>
                        </div>
                    }
                  </div>

                  {session&&(
                    <div style={{borderTop:'1px solid #e2e8f0',marginTop:'11px',paddingTop:'11px'}}>
                      {!deleteAcctConf ? (
                        <button onClick={()=>setDeleteAcctConf(true)} style={{width:'100%',padding:'10px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',color:'#b91c1c',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="trash" s={12} c="#b91c1c"/> Delete Account</button>
                      ) : (
                        <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'12px',padding:'12px'}}>
                          <div style={{fontSize:'11.5px',color:'#b91c1c',lineHeight:1.5,fontWeight:700,marginBottom:'10px'}}>This permanently deletes your account and email registration, and all data stored in the cloud under it. Data already on this device isn't touched. Your email becomes available for a brand new account afterward. This can't be undone.</div>
                          <div style={{fontSize:'10.5px',color:'#dc2626',fontWeight:700,marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.5px'}}>Type your email to confirm: {session.user?.email}</div>
                          <input
                            value={deleteAcctTyped}
                            onChange={e=>setDeleteAcctTyped(e.target.value)}
                            placeholder={session.user?.email}
                            style={{width:'100%',background:'#fff',border:'1px solid #e2e8f0',padding:'10px 12px',borderRadius:'10px',fontWeight:700,fontSize:'14px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a',marginBottom:'10px'}}
                          />
                          <div style={{display:'flex',gap:'6px'}}>
                            <button
                              onClick={handleDeleteAccount}
                              disabled={deleteAcctTyped !== session.user?.email || deletingAcct}
                              style={{flex:1,padding:'9px',background:(deleteAcctTyped===session.user?.email)?'#dc2626':'#fca5a5',border:'none',borderRadius:'8px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:(deleteAcctTyped===session.user?.email)?'pointer':'not-allowed',textTransform:'uppercase',letterSpacing:'1px'}}
                            >{deletingAcct?'Deleting…':'Delete Permanently'}</button>
                            <button onClick={()=>{ setDeleteAcctConf(false); setDeleteAcctTyped(''); }} style={{flex:1,padding:'9px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:'8px',color:'#475569',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Sign Out — its own full box-button, same size/shape as the
                 other cards, matching how Help & Suggestions below is
                 itself the clickable element rather than a button inside
                 a static box. ── */}
            {session&&(
              <button onClick={()=>setSignOutConfirmOpen(true)} style={{...S.card,width:'100%',display:'flex',alignItems:'center',gap:'12px',background:'#059669',border:'1px solid #059669',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                <div style={{background:'rgba(255,255,255,0.15)',padding:'11px',borderRadius:'13px',flexShrink:0}}><FireExitIcon size={19}/></div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#fff'}}>Sign Out</div>
                </div>
                <Ico n="cR" s={16} c="rgba(255,255,255,0.7)"/>
              </button>
            )}

            {/* ── Help & suggestions ── */}
            <div style={S.card}>
              <a href="mailto:ajstephe@me.com?subject=Overtime%20Tracker%20—%20Feedback" style={{display:'flex',alignItems:'center',gap:'12px',textDecoration:'none',cursor:'pointer'}}>
                <div style={{background:'#eff6ff',padding:isWide?'13px':'11px',borderRadius:'13px',flexShrink:0}}><Ico n="mail" s={isWide?23:19} c="#2563eb"/></div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Help & Suggestions</div>
                  <div style={{fontSize:'11px',color:'#3b82f6',fontWeight:700,marginTop:'2px'}}>ajstephe@me.com</div>
                </div>
                <Ico n="cR" s={16} c="#94a3b8"/>
              </a>
              <div style={{borderTop:'1px solid #f1f5f9',margin:'14px 0'}}/>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                <Ico n="coffee" s={16} c="#d97706"/>
                <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>Want to say thanks?</div>
              </div>
              <div style={{fontSize:'11.5px',color:'#64748b',fontWeight:600,lineHeight:1.6}}>
                A lot of late nights, caffeine, and swearing went into building and hosting this. If it's making your life easier and you'd like to say thanks, you can{' '}
                <a href="https://settleup.starlingbank.com/adam-stephens-2b95aa" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb',fontWeight:800,textDecoration:'underline'}}>Buy me a coffee</a> (via Starling Bank).
              </div>
              <div style={{fontSize:'11.5px',color:'#64748b',fontWeight:600,marginTop:'8px'}}>Cheers for the support!</div>
            </div>
          </div>
        )}
      </main>

      {/* ── Desktop secondary column — gives the empty space beside the
           main column on a wide screen an actual job, rather than just
           being padding around a phone-width layout. Shown on every tab
           for continuity, including CARMS/PA and TOIL themselves — even
           though some of what it shows overlaps with the main content on
           those two, having the column consistently present throughout
           the app was judged more valuable than trimming a duplicate
           figure on two screens. ── */}
      {isWide && (
        <aside className="no-print" style={{width:'320px',flexShrink:0,padding:'24px 24px 24px 0',overflowY:'auto'}}>
          <div style={{fontSize:'11px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'12px',padding:'0 2px'}}>At a Glance</div>

          {(()=>{
            const pb = currPeriodIdx>=0 ? totals.periodBreakdown[currPeriodIdx] : null;
            return (
              <div style={{background:'#fff',borderRadius:'16px',padding:'16px',border:'1px solid #f1f5f9',boxShadow:'0 1px 6px rgba(0,0,0,0.04)',marginBottom:'12px'}}>
                <div style={{fontWeight:900,fontSize:'10.5px',color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'8px'}}>Gross &amp; Net OT — Current Period</div>
                <div style={{display:'flex',justifyContent:'space-between',gap:'12px'}}>
                  <div>
                    <div style={{fontSize:'9.5px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</div>
                    <div style={{fontSize:'18px',fontWeight:900,color:'#0f172a',marginTop:'1px'}}>{pb?fmtGBP(pb.combinedGross):'£0.00'}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:'9.5px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Net</div>
                    <div style={{fontSize:'18px',fontWeight:900,color:'#059669',marginTop:'1px'}}>{pb?fmtGBP(pb.combinedNet):'£0.00'}</div>
                  </div>
                </div>
                <div style={{fontSize:'10.5px',color:'#94a3b8',marginTop:'8px'}}>{pb?pb.month:'—'} · submitted only</div>
              </div>
            );
          })()}

          <div style={{background:'#fff',borderRadius:'16px',padding:'16px',border:'1px solid #f1f5f9',boxShadow:'0 1px 6px rgba(0,0,0,0.04)',marginBottom:'12px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'4px'}}>
              <span style={{fontWeight:900,fontSize:'10.5px',color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px'}}>CARMS &amp; PA Outstanding</span>
              {carmsOutstanding.totalClaims>0&&<span onClick={()=>setTab('carms')} style={{fontSize:'10px',fontWeight:800,color:'#2563eb',cursor:'pointer'}}>View all →</span>}
            </div>
            {carmsOutstanding.totalClaims===0
              ? <div style={{fontSize:'11px',color:'#94a3b8',fontWeight:600,padding:'6px 0'}}>Nothing outstanding right now.</div>
              : (()=>{
                  // One row per CLAIM, not per entry: an entry with both
                  // overtime and PA outstanding is two separate submissions
                  // (CARMS and MetHR), so it gets a row each with its own
                  // amount — mirroring the CARMS/PA tab, and keeping the row
                  // count consistent with the "claims to submit" total below,
                  // which has always counted them separately.
                  const allClaims = [];
                  carmsOutstanding.groups.forEach(g=>g.items.forEach(it=>{
                    if (it.otOutstanding) allClaims.push({ entry:it.entry, kind:'Overtime', amount:it.otAmt, key:it.entry.id+'-ot' });
                    if (it.paOutstanding) allClaims.push({ entry:it.entry, kind:it.entry.paRate, amount:it.paAmt, key:it.entry.id+'-pa' });
                  }));
                  const LIMIT = 4;
                  const shown = allClaims.slice(0, LIMIT);
                  const hidden = allClaims.length - shown.length;
                  return (
                    <>
                      {shown.map((cl,i)=>(
                        <div key={cl.key} onClick={()=>setTab('carms')} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',padding:'9px 0',borderTop:i===0?'none':'1px solid #f1f5f9',cursor:'pointer'}}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:'11.5px',fontWeight:700,color:'#0f172a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cl.entry.reason||'Shift'}</div>
                            <div style={{fontSize:'9.5px',color:'#94a3b8'}}>{cl.kind} · {new Date(cl.entry.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
                          </div>
                          <div style={{fontSize:'12.5px',fontWeight:900,color:'#d97706',flexShrink:0}}>{fmtGBP(cl.amount)}</div>
                        </div>
                      ))}
                      {hidden>0&&(
                        <div onClick={()=>setTab('carms')} style={{fontSize:'10px',fontWeight:800,color:'#2563eb',padding:'8px 0 0',cursor:'pointer',borderTop:'1px solid #f1f5f9',marginTop:'2px'}}>
                          +{hidden} more claim{hidden!==1?'s':''} →
                        </div>
                      )}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fffbeb',borderRadius:'10px',padding:'9px 11px',marginTop:'8px'}}>
                        <span style={{fontSize:'10px',fontWeight:800,color:'#92400e'}}>{carmsOutstanding.totalClaims} CLAIM{carmsOutstanding.totalClaims!==1?'S':''} TO SUBMIT</span>
                        <span style={{fontSize:'14px',fontWeight:900,color:'#d97706'}}>{fmtGBP(carmsOutstanding.totalAmount)}</span>
                      </div>
                    </>
                  );
                })()
            }
          </div>
        </aside>
      )}
      </div>

      {/* Financial Reports & Export — shared modal for both PDF and Spreadsheet formats */}
      {payslipModalOpen&&(()=>{
        const periodChoices = (currPeriodIdx>=0 ? PAY_PERIODS.slice(0,currPeriodIdx+1) : PAY_PERIODS).map((p,i)=>({...p,idx:i})).reverse();
        const rangeValid = payslipStart && payslipEnd && payslipEnd>=payslipStart;
        const canGenerate = payslipMode==='period' ? payslipPeriodIdx!=null : payslipMode==='financialYear' ? payslipFYYear!=null : rangeValid;
        const formatLabel = exportFormat==='csv' ? 'Spreadsheet' : 'PDF';
        return (
          <div onClick={()=>setPayslipModalOpen(false)} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.55)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:60}}>
            <div onClick={e=>e.stopPropagation()} className="fi" style={{background:'#fff',borderRadius:isWide?'20px':'20px 20px 0 0',width:'100%',maxWidth:'430px',padding:'20px',maxHeight:'85%',overflowY:'auto',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
              {!isWide && <div style={{width:'36px',height:'4px',background:'#e2e8f0',borderRadius:'4px',margin:'0 auto 14px'}}/>}
              {exportFormat===null ? (
                <>
                  <div style={{fontSize:'15px',fontWeight:900,marginBottom:'4px'}}>Financial Reports &amp; Export</div>
                  <div style={{fontSize:'11px',color:'#94a3b8',marginBottom:'18px'}}>Choose a format to continue</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    <button onClick={()=>setExportFormat('pdf')} style={{display:'flex',alignItems:'center',gap:'12px',padding:'16px',borderRadius:'14px',border:'1.5px solid #dbeafe',background:'#eff6ff',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                      <div style={{background:'#dbeafe',padding:'10px',borderRadius:'11px',flexShrink:0}}><Ico n="doc" s={18} c="#2563eb"/></div>
                      <div>
                        <div style={{fontWeight:900,fontSize:'13.5px',color:'#0f172a'}}>PDF</div>
                        <div style={{fontSize:'10.5px',color:'#64748b',marginTop:'1px'}}>A formatted, printable summary</div>
                      </div>
                    </button>
                    <button onClick={()=>setExportFormat('csv')} style={{display:'flex',alignItems:'center',gap:'12px',padding:'16px',borderRadius:'14px',border:'1.5px solid #d1fae5',background:'#f0fdf4',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                      <div style={{background:'#d1fae5',padding:'10px',borderRadius:'11px',flexShrink:0}}><Ico n="table" s={18} c="#059669"/></div>
                      <div>
                        <div style={{fontWeight:900,fontSize:'13.5px',color:'#0f172a'}}>Spreadsheet</div>
                        <div style={{fontSize:'10.5px',color:'#64748b',marginTop:'1px'}}>An XLSX file for Excel, Sheets or Numbers</div>
                      </div>
                    </button>
                  </div>
                  <button onClick={()=>setPayslipModalOpen(false)} style={{width:'100%',background:'none',border:'none',padding:'14px',fontWeight:800,fontSize:'12px',color:'#64748b',cursor:'pointer',fontFamily:'inherit',marginTop:'8px'}}>Cancel</button>
                </>
              ) : (
              <>
              <div style={{fontSize:'15px',fontWeight:900,marginBottom:'4px'}}>Export to {formatLabel}</div>
              <div style={{fontSize:'11px',color:'#94a3b8',marginBottom:'16px'}}>Choose a period, or set your own date range</div>

              <div style={{display:'flex',gap:'6px',background:'#f1f5f9',borderRadius:'12px',padding:'3px',marginBottom:'16px'}}>
                <button onClick={()=>setPayslipMode('period')} style={{flex:1,textAlign:'center',padding:'9px 4px',borderRadius:'9px',fontWeight:800,fontSize:'11.5px',border:'none',fontFamily:'inherit',cursor:'pointer',background:payslipMode==='period'?'#fff':'transparent',color:payslipMode==='period'?'#2563eb':'#64748b',boxShadow:payslipMode==='period'?'0 2px 6px rgba(0,0,0,0.1)':'none'}}>Pay Period</button>
                <button onClick={()=>setPayslipMode('custom')} style={{flex:1,textAlign:'center',padding:'9px 4px',borderRadius:'9px',fontWeight:800,fontSize:'11.5px',border:'none',fontFamily:'inherit',cursor:'pointer',background:payslipMode==='custom'?'#fff':'transparent',color:payslipMode==='custom'?'#2563eb':'#64748b',boxShadow:payslipMode==='custom'?'0 2px 6px rgba(0,0,0,0.1)':'none'}}>Custom Range</button>
                <button onClick={()=>setPayslipMode('financialYear')} style={{flex:1,textAlign:'center',padding:'9px 4px',borderRadius:'9px',fontWeight:800,fontSize:'11.5px',border:'none',fontFamily:'inherit',cursor:'pointer',background:payslipMode==='financialYear'?'#fff':'transparent',color:payslipMode==='financialYear'?'#2563eb':'#64748b',boxShadow:payslipMode==='financialYear'?'0 2px 6px rgba(0,0,0,0.1)':'none'}}>Financial Year</button>
              </div>

              <div onClick={()=>setSanitiseNotes(v=>!v)} style={{display:'flex',alignItems:'flex-start',gap:'10px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'12px',padding:'12px 14px',marginBottom:'16px',cursor:'pointer'}}>
                <div style={{width:'20px',height:'20px',borderRadius:'6px',border:`2px solid ${sanitiseNotes?'#dc2626':'#cbd5e1'}`,background:sanitiseNotes?'#dc2626':'#fff',flexShrink:0,marginTop:'1px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {sanitiseNotes&&<Ico n="check" s={12} c="#fff" w={3}/>}
                </div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:800,color:'#991b1b'}}>Sanitise Notes Field</div>
                  <div style={{fontSize:'10.5px',color:'#991b1b',marginTop:'2px',lineHeight:1.5}}>Recommended — shift notes may hold operationally sensitive detail.</div>
                </div>
              </div>

              {payslipMode==='period' ? (
                <>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.2px',marginBottom:'8px'}}>Pay Periods</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'7px',marginBottom:'6px'}}>
                    {periodChoices.map(p=>(
                      <div key={p.idx} onClick={()=>setPayslipPeriodIdx(p.idx)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'12px',border:p.idx===payslipPeriodIdx?'1.5px solid #2563eb':'1.5px solid #f1f5f9',background:p.idx===payslipPeriodIdx?'#eff6ff':'#fff',cursor:'pointer'}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:'12.5px',color:'#0f172a'}}>{p.month}{p.idx===currPeriodIdx&&<span style={{color:'#2563eb',fontSize:'9px',marginLeft:'6px'}}>· Current</span>}</div>
                          <div style={{fontSize:'10px',color:'#94a3b8',marginTop:'1px'}}>{fmtD(p.start)} – {fmtD(p.end)}</div>
                        </div>
                        <div style={{width:'18px',height:'18px',borderRadius:'50%',border:`2px solid ${p.idx===payslipPeriodIdx?'#2563eb':'#cbd5e1'}`,flexShrink:0,position:'relative'}}>
                          {p.idx===payslipPeriodIdx&&<div style={{position:'absolute',inset:'3px',background:'#2563eb',borderRadius:'50%'}}/>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : payslipMode==='custom' ? (
                <>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.2px',marginBottom:'8px'}}>Custom Range</div>
                  <div style={{display:'flex',gap:'10px',marginBottom:'6px'}}>
                    <div style={{flex:1}}>
                      <label style={{display:'block',fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'6px'}}>Start</label>
                      <input type="date" value={payslipStart} onChange={e=>setPayslipStart(e.target.value)} style={{width:'100%',boxSizing:'border-box',background:'#f8fafc',border:'1.5px solid #e2e8f0',borderRadius:'11px',padding:'11px 12px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',color:'#0f172a'}}/>
                    </div>
                    <div style={{flex:1}}>
                      <label style={{display:'block',fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'6px'}}>End</label>
                      <input type="date" value={payslipEnd} onChange={e=>setPayslipEnd(e.target.value)} style={{width:'100%',boxSizing:'border-box',background:'#f8fafc',border:'1.5px solid #e2e8f0',borderRadius:'11px',padding:'11px 12px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',color:'#0f172a'}}/>
                    </div>
                  </div>
                  {payslipStart&&payslipEnd&&!rangeValid&&<div style={{fontSize:'10.5px',color:'#dc2626',fontWeight:700,marginTop:'6px'}}>End date must be on or after the start date.</div>}
                </>
              ) : (
                <>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.2px',marginBottom:'8px'}}>Financial Year</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'7px',marginBottom:'6px'}}>
                    {[CURRENT_FY_YEAR, ...yearsWithData].map(y=>{
                      const yPeriods = generateFYPeriods(y);
                      const isCurrent = y===CURRENT_FY_YEAR;
                      return (
                        <div key={y} onClick={()=>setPayslipFYYear(y)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'12px',border:y===payslipFYYear?'1.5px solid #2563eb':'1.5px solid #f1f5f9',background:y===payslipFYYear?'#eff6ff':'#fff',cursor:'pointer'}}>
                          <div>
                            <div style={{fontWeight:800,fontSize:'12.5px',color:'#0f172a'}}>{y} / {(y+1).toString().slice(-2)}{isCurrent&&<span style={{color:'#2563eb',fontSize:'9px',marginLeft:'6px'}}>· Current</span>}</div>
                            <div style={{fontSize:'10px',color:'#94a3b8',marginTop:'1px'}}>{yPeriods[0].month} – {yPeriods[11].month}{!isCurrent&&exportFormat==='pdf'&&' · gross only, no tax/NI'}</div>
                          </div>
                          <div style={{width:'18px',height:'18px',borderRadius:'50%',border:`2px solid ${y===payslipFYYear?'#2563eb':'#cbd5e1'}`,flexShrink:0,position:'relative'}}>
                            {y===payslipFYYear&&<div style={{position:'absolute',inset:'3px',background:'#2563eb',borderRadius:'50%'}}/>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'12px',padding:'11px 14px',margin:'16px 0',fontSize:'12px',color:'#1e40af',fontWeight:700,textAlign:'center'}}>
                {payslipMode==='period'
                  ? (payslipPeriodIdx!=null ? `${fmtD(PAY_PERIODS[payslipPeriodIdx].start)} – ${fmtD(PAY_PERIODS[payslipPeriodIdx].end)}` : 'Pick a pay period')
                  : payslipMode==='financialYear'
                    ? (payslipFYYear!=null ? `${generateFYPeriods(payslipFYYear)[0].month} – ${generateFYPeriods(payslipFYYear)[11].month}` : 'Pick a financial year')
                    : (rangeValid ? `${fmtD(payslipStart)} – ${fmtD(payslipEnd)}` : 'Pick a valid start and end date')}
              </div>

              <button onClick={handleGenerateExport} disabled={!canGenerate} style={{width:'100%',background:canGenerate?'#2563eb':'#cbd5e1',color:'#fff',border:'none',borderRadius:'12px',padding:'14px',fontWeight:900,fontSize:'13px',cursor:canGenerate?'pointer':'default',fontFamily:'inherit'}}>{exportFormat==='csv' ? 'Export Spreadsheet' : payslipMode==='financialYear'&&payslipFYYear!=null&&payslipFYYear!==CURRENT_FY_YEAR ? 'View Year Summary' : 'Generate Payslip'}</button>
              <div style={{display:'flex',gap:'6px',marginTop:'4px'}}>
                <button onClick={()=>setExportFormat(null)} style={{flex:1,background:'none',border:'none',padding:'12px',fontWeight:800,fontSize:'12px',color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>‹ Back</button>
                <button onClick={()=>setPayslipModalOpen(false)} style={{flex:1,background:'none',border:'none',padding:'12px',fontWeight:800,fontSize:'12px',color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              </div>
              </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Payslip preview / print document */}
      {payslipPreview&&(()=>{
        const d = payslipPreview.data;
        const hasOT = d.rateHrs.hours133>0 || d.rateHrs.hours150>0 || d.rateHrs.hours200>0;
        const hasPA = d.paCounts.PA1>0 || d.paCounts.PA2>0 || d.paCounts.PA3>0;
        const rowStyle = {padding:'7px 0',borderBottom:'1px solid #f8fafc'};
        const thStyle = {textAlign:'left',fontSize:'9px',fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.6px',padding:'4px 0',borderBottom:'1px solid #f1f5f9'};
        const sectionTitle = {fontSize:'10.5px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.2px',margin:'20px 0 8px',paddingTop:'14px',borderTop:'1px solid #f1f5f9'};
        return (
          <div className="payslip-print-area" style={{position:'absolute',inset:0,background:'#e2e8f0',zIndex:70,overflowY:'auto',padding:'16px'}}>
            <div className="no-print" style={{display:'flex',gap:'8px',marginBottom:'14px',maxWidth:'560px',margin:'0 auto 14px'}}>
              <button onClick={()=>window.print()} style={{flex:1,background:'#2563eb',color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="dl" s={13} c="#fff"/> Print / Save as PDF</button>
              <button onClick={()=>setPayslipPreview(null)} style={{background:'#fff',color:'#475569',border:'1px solid #e2e8f0',borderRadius:'11px',padding:'12px 18px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit'}}>Close</button>
            </div>

            <div className="payslip-print-doc" style={{maxWidth:'560px',margin:'0 auto',background:'#fff',borderRadius:'6px',boxShadow:'0 4px 24px rgba(0,0,0,0.12)',overflow:'hidden'}}>
              <div style={{background:'#0f2744',color:'#fff',padding:'26px 26px 20px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'18px'}}>
                  <div>
                    <div style={{fontSize:'10px',fontWeight:800,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1.4px'}}>Overtime &amp; Shift Tracker</div>
                    <div style={{fontSize:'19px',fontWeight:900,marginTop:'3px',letterSpacing:'-0.3px'}}>Overtime Summary</div>
                  </div>
                  <div style={{fontSize:'9.5px',color:'#93c5fd',textAlign:'right',lineHeight:1.5,flexShrink:0}}>
                    Generated {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}<br/>at {new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                  <div>
                    <div style={{fontSize:'9px',fontWeight:800,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'3px'}}>Rank / Pay Point</div>
                    <div style={{fontWeight:800,fontSize:'13px'}}>{settings.rank||'—'}, {settings.service||'—'}</div>
                  </div>
                  <div>
                    <div style={{fontSize:'9px',fontWeight:800,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:'3px'}}>Period</div>
                    <div style={{fontWeight:800,fontSize:'13px'}}>{payslipPreview.rangeLabel || `${fmtD(payslipPreview.start)} – ${fmtD(payslipPreview.end)}`}</div>
                  </div>
                </div>
              </div>

              <div style={{padding:'22px 26px 10px'}}>
                {d.clippedFrom&&<div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'10px',padding:'11px 14px',marginBottom:'14px',fontSize:'11px',color:'#92400e',lineHeight:1.5}}>This range crosses 6 April, where the tax year resets. Figures below cover {fmtD(d.clippedFrom)} – {fmtD(payslipPreview.end)} only, since combining two tax years' allowances into one total wouldn't be accurate.</div>}
                {d.rangeEntries.length===0 ? (
                  <div style={{textAlign:'center',padding:'30px 10px',color:'#94a3b8',fontSize:'13px',fontWeight:600}}>No shifts recorded in this range.</div>
                ) : (
                  <>
                    {hasOT&&(
                      <>
                        <div style={sectionTitle}>Overtime Worked</div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                          <thead><tr><th style={thStyle}>Rate</th><th style={{...thStyle,textAlign:'right'}}>Hours</th><th style={{...thStyle,textAlign:'right'}}>Rate/hr</th><th style={{...thStyle,textAlign:'right'}}>Amount</th></tr></thead>
                          <tbody>
                            {d.rateHrs.hours133>0&&<tr><td style={{...rowStyle,fontWeight:700,color:'#334155'}}>Standard (1.33x)</td><td style={{...rowStyle,textAlign:'right'}}>{d.rateHrs.hours133.toFixed(2)}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(d.rates.r133)}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(d.rateHrs.hours133*d.rates.r133)}</td></tr>}
                            {d.rateHrs.hours150>0&&<tr><td style={{...rowStyle,fontWeight:700,color:'#334155'}}>Elevated (1.5x)</td><td style={{...rowStyle,textAlign:'right'}}>{d.rateHrs.hours150.toFixed(2)}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(d.rates.r150)}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(d.rateHrs.hours150*d.rates.r150)}</td></tr>}
                            {d.rateHrs.hours200>0&&<tr><td style={{...rowStyle,fontWeight:700,color:'#334155'}}>Rest Day (2.0x)</td><td style={{...rowStyle,textAlign:'right'}}>{d.rateHrs.hours200.toFixed(2)}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(d.rates.r200)}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(d.rateHrs.hours200*d.rates.r200)}</td></tr>}
                          </tbody>
                        </table>
                      </>
                    )}

                    {hasPA&&(
                      <>
                        <div style={sectionTitle}>Protection Allowance</div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                          <thead><tr><th style={thStyle}>Type</th><th style={{...thStyle,textAlign:'right'}}>Count</th><th style={{...thStyle,textAlign:'right'}}>Rate</th><th style={{...thStyle,textAlign:'right'}}>Amount</th></tr></thead>
                          <tbody>
                            {['PA1','PA2','PA3'].filter(k=>d.paCounts[k]>0).map(k=>(
                              <tr key={k}><td style={{...rowStyle,fontWeight:700,color:'#334155'}}>{k}</td><td style={{...rowStyle,textAlign:'right'}}>{d.paCounts[k]}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(PA_RATES[k])}</td><td style={{...rowStyle,textAlign:'right'}}>{fmtGBP(PA_RATES[k]*d.paCounts[k])}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {d.toilBanked>0&&(
                      <>
                        <div style={sectionTitle}>TOIL Banked This Period</div>
                        <div style={{background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:'10px',padding:'11px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'11.5px',color:'#6d28d9'}}>
                          <span>Not included in the totals below</span>
                          <strong>+{fmtHM(d.toilBanked)}h</strong>
                        </div>
                      </>
                    )}

                    {d.pensionForRange>0&&(
                      <>
                        <div style={sectionTitle}>Pension Contribution (this period)</div>
                        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'10px',padding:'11px 14px',marginBottom:'8px'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'11.5px',color:'#1e40af'}}>
                            <span>{(d.pensionRate*100).toFixed(2)}% of {fmtGBP(d.pensionablePayForRange)} pensionable pay</span>
                            <strong>−{fmtGBP(d.pensionForRange)}</strong>
                          </div>
                          <div style={{fontSize:'9.5px',color:'#3b82f6',marginTop:'4px',lineHeight:1.5}}>Deducted from salary before tax — already reflected in the rate below. Not shown in the overtime total, since pension is never taken from overtime pay itself.</div>
                        </div>
                      </>
                    )}

                    <div style={{background:'#f8fafc',borderRadius:'12px',padding:'16px 18px',margin:'22px 0'}}>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'12.5px',fontWeight:800,color:'#0f172a'}}><span>Gross Overtime &amp; PA</span><span>{fmtGBP(d.gross)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'12.5px',color:'#dc2626'}}><span>Est. Income Tax{d.bandName?` (${d.bandName})`:''}</span><span>−{fmtGBP(d.tax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'12.5px',color:'#dc2626'}}><span>Est. National Insurance</span><span>−{fmtGBP(d.ni)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 0',marginTop:'6px',borderTop:'1px solid #e2e8f0',fontSize:'17px',fontWeight:900,color:'#059669'}}><span>Estimated Net</span><span>{fmtGBP(d.net)}</span></div>
                    </div>
                  </>
                )}
              </div>

              <div style={{fontSize:'9.5px',color:'#94a3b8',lineHeight:1.6,padding:'16px 26px 26px',borderTop:'1px solid #f1f5f9',marginTop:'6px'}}>
                <strong style={{color:'#64748b'}}>This is an unofficial summary</strong> generated from records entered into Overtime &amp; Shift Tracker by Adam Stephens. Tax and National Insurance figures are estimates based on cumulative marginal rates for the tax year and may not exactly match your official payslip, particularly for date ranges spanning more than one pay period. Always verify against payroll before relying on these figures for a dispute or claim.
              </div>
            </div>
          </div>
        );
      })()}

      {/* Financial Years — full-screen archived-year detail, entries grouped by pay period */}
      {fySummaryYear!=null&&(()=>{
        const y = computeArchivedYear(fySummaryYear);
        const label = `${fySummaryYear} / ${(fySummaryYear+1).toString().slice(-2)}`;
        return (
          <div className={fySummaryPrintMode?'payslip-print-area':''} style={{position:'absolute',inset:0,background:'#f8fafc',zIndex:65,overflowY:'auto'}}>
            <div className="no-print" style={{background:'#fef3c7',padding:'8px',fontSize:'10px',fontWeight:800,color:'#92400e',textAlign:'center'}}>📁 Archived — {label} is read-only</div>
            {!fySummaryPrintMode&&(
              <div className="no-print" style={{display:'flex',gap:'8px',padding:'12px 12px 0'}}>
                <button onClick={()=>setFySummaryPrintMode(true)} style={{flex:1,background:'#2563eb',color:'#fff',border:'none',borderRadius:'11px',padding:'11px',fontWeight:900,fontSize:'11.5px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="doc" s={13} c="#fff"/> PDF</button>
                <button onClick={()=>handleExportSpreadsheet(y.start, y.end, sanitiseNotes)} style={{flex:1,background:'#f0fdf4',color:'#059669',border:'1.5px solid #d1fae5',borderRadius:'11px',padding:'11px',fontWeight:900,fontSize:'11.5px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="table" s={13} c="#059669"/> Spreadsheet</button>
              </div>
            )}
            {fySummaryPrintMode&&(
              <div className="no-print" style={{padding:'12px 12px 0'}}>
                <button onClick={()=>window.print()} style={{width:'100%',background:'#2563eb',color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="dl" s={13} c="#fff"/> Print / Save as PDF</button>
              </div>
            )}
            <div className={fySummaryPrintMode?'payslip-print-doc':''} style={{background:'#0f2744',color:'#fff',padding:'16px',margin:fySummaryPrintMode?'12px':0,borderRadius:fySummaryPrintMode?'12px':0}}>
              <button className="no-print" onClick={()=>{ if(fySummaryPrintMode){ setFySummaryPrintMode(false); } else { setFySummaryYear(null); } }} style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:'9px',width:'32px',height:'32px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',cursor:'pointer',marginBottom:'12px'}}><Ico n="back" s={16} c="#fff"/></button>
              <div style={{fontSize:'10px',fontWeight:800,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1.2px'}}>Financial Year</div>
              <div style={{fontSize:'19px',fontWeight:900}}>{label}</div>
              <div style={{fontSize:'10px',color:'#93c5fd',marginTop:'2px'}}>{fmtD(y.start)} – {fmtD(y.end)}</div>
              <div style={{background:'#1e3a5f',borderRadius:'14px',padding:'14px',display:'flex',marginTop:'12px'}}>
                <div style={{flex:1,textAlign:'center'}}>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase'}}>Shifts Logged</div>
                  <div style={{fontSize:'20px',fontWeight:900}}>{y.totalShifts}</div>
                </div>
                <div style={{width:'1px',background:'rgba(255,255,255,0.15)'}}/>
                <div style={{flex:1,textAlign:'center'}}>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase'}}>Gross</div>
                  <div style={{fontSize:'20px',fontWeight:900}}>{fmtGBP(y.totalGross)}</div>
                </div>
              </div>
            </div>

            <div style={{padding:'14px',paddingBottom:'40px'}}>
              <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'10px',padding:'10px 12px',marginBottom:'12px',fontSize:'10.5px',color:'#1e40af',lineHeight:1.5}}>{fySummaryPrintMode ? 'Grouped by pay period. Gross figures only — no tax or NI estimate, since that math needs the current year\'s context to be accurate.' : 'Tap a period to see individual shifts, this is a record not a working copy. Gross figures only'}</div>

              {y.periods.length===0 ? (
                <div style={{textAlign:'center',padding:'30px 10px',color:'#94a3b8',fontSize:'13px',fontWeight:600}}>No entries recorded in this year.</div>
              ) : y.periods.map(p=>{
                const expanded = fySummaryPrintMode || archiveExpandedPeriod===p.short+fySummaryYear;
                return (
                  <div key={p.short} style={{background:'#fff',borderRadius:'14px',padding:'13px',border:'1px solid #f1f5f9',marginBottom:'9px'}}>
                    <div onClick={()=>{ if(!fySummaryPrintMode) setArchiveExpandedPeriod(expanded?null:p.short+fySummaryYear); }} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:fySummaryPrintMode?'default':'pointer'}}>
                      <div>
                        <div style={{fontWeight:900,fontSize:'13px',color:'#0f172a'}}>{p.month}</div>
                        <div style={{fontSize:'10px',color:'#94a3b8',marginTop:'1px'}}>{fmtD(p.start)} – {fmtD(p.end)} · {p.entries.length} shift{p.entries.length===1?'':'s'}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                        <div style={{fontWeight:900,fontSize:'13px',color:'#1e3a5f'}}>{fmtGBP(p.gross)}</div>
                        {!fySummaryPrintMode&&<Ico n={expanded?'cU':'cD'} s={14} c="#94a3b8"/>}
                      </div>
                    </div>
                    {expanded&&(
                      <div>
                        {p.entries.map(e=>(
                          <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderTop:'1px solid #f8fafc',marginTop:'9px'}}>
                            <div>
                              <div style={{fontWeight:800,fontSize:'11.5px',color:'#0f172a'}}>{new Date(e.date+'T12:00:00').toLocaleDateString('en-GB')}</div>
                              <div style={{fontSize:'9.5px',color:'#94a3b8',marginTop:'1px',textTransform:'uppercase'}}>{e.reason||'—'}</div>
                            </div>
                            <div style={{fontWeight:800,fontSize:'11.5px',color:'#1e3a5f'}}>{fmtGBP(e.gross)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Trends — chart enlarge modal, shares render functions with the inline charts */}
      {chartModal&&(
        <div onClick={()=>{setChartModal(null);setChartTap(null);}} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px'}}>
          <div onClick={e=>e.stopPropagation()} className="fi" style={{background:'#fff',borderRadius:'20px',padding:'20px 16px',width:'100%',maxWidth:'480px',maxHeight:'85vh',overflow:'auto',position:'relative'}}>
            <button onClick={()=>{setChartModal(null);setChartTap(null);}} style={{position:'absolute',top:'14px',right:'14px',background:'#f1f5f9',border:'none',borderRadius:'50%',width:'30px',height:'30px',fontSize:'15px',fontWeight:900,color:'#475569',cursor:'pointer'}}>✕</button>
            <div style={{fontSize:'13px',fontWeight:900,color:'#0f172a',marginBottom:'16px',paddingRight:'36px'}}>{chartModal==='cum'?'Cumulative Gross Earnings':'Monthly OT Gross/Net'}</div>
            {chartModal==='cum' ? renderCumulativeChart(true) : renderMonthlyChart(true)}
            {chartModal==='cum' && (
              <div style={{textAlign:'center',marginTop:'10px',fontSize:'12px',fontWeight:700,color:'#64748b'}}>Running total: <strong style={{color:'#1e3a5f'}}>£{totals.totalGross.toFixed(2)}</strong></div>
            )}
            {chartModal==='mon' && (
              <div style={{display:'flex',justifyContent:'center',gap:'20px',marginTop:'14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'15px',height:'3px',background:'#34d399',borderRadius:'2px'}}/><span style={{fontSize:'10px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</span></div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'15px',height:'3px',background:'#f87171',borderRadius:'2px'}}/><span style={{fontSize:'10px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1px'}}>Net</span></div>
              </div>
            )}
            <div style={{textAlign:'center',marginTop:'10px',fontSize:'10px',color:'#94a3b8'}}>Tap any point for that period's figure</div>
          </div>
        </div>
      )}

      {/* Calendar View — empty-day tap confirmation, so a stray tap doesn't
          silently drop you into Log Overtime */}
      {confirmCreateDay&&(
        <div onClick={()=>setConfirmCreateDay(null)} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:41,padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} className="fi" style={{background:'#fff',borderRadius:'18px',padding:'22px',width:'100%',maxWidth:'320px',textAlign:'center'}}>
            <div style={{fontWeight:900,fontSize:'15px',color:'#0f172a',marginBottom:'6px'}}>Create an entry for this day?</div>
            <div style={{fontSize:'12px',fontWeight:600,color:'#64748b',marginBottom:'18px'}}>{new Date(confirmCreateDay+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setConfirmCreateDay(null)} style={{flex:1,padding:'11px',background:'#f1f5f9',border:'none',borderRadius:'10px',fontWeight:900,fontSize:'12px',color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>No</button>
              <button onClick={()=>{ setForm({...blankForm,date:confirmCreateDay}); setEditing(null); setTab('add'); setConfirmCreateDay(null); }} style={{flex:1,padding:'11px',background:'#2563eb',border:'none',borderRadius:'10px',fontWeight:900,fontSize:'12px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar View — day detail popover */}
      {selectedCalDay&&(
        <div onClick={()=>{ setSelectedCalDay(null); setConfirmDel(null); }} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:40}}>
          <div onClick={e=>e.stopPropagation()} className="fi" style={{background:'#fff',borderRadius:isWide?'20px':'20px 20px 0 0',padding:isWide?'28px':'20px',width:'100%',maxWidth:isWide?'580px':'430px',maxHeight:'76%',overflowY:'auto',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
              <div style={{fontWeight:900,fontSize:isWide?'20px':'16px',color:'#0f172a'}}>{new Date(selectedCalDay.ds+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
              <button onClick={()=>{ setSelectedCalDay(null); setConfirmDel(null); }} style={{background:'#f1f5f9',border:'none',borderRadius:'8px',padding:'8px',cursor:'pointer'}}><Ico n="x" s={isWide?20:16} c="#64748b"/></button>
            </div>
            {selectedCalDay.dEntries.map(e=>{
              const c = calcEntry(e);
              const pb = totals.periodBreakdown[selectedCalDay.periodIdx];
              const eOTNet    = c.h1+c.h2+c.h3>0 ? c.ot*(1-pb.otResult.rate/100)       : 0;
              const ePANet    = c.pa>0           ? c.pa*(1-pb.paResult.rate/100)       : 0;
              const eNet = eOTNet+ePANet;
              return (
                <div key={e.id} style={{background:'#f8fafc',borderRadius:'13px',padding:isWide?'17px':'13px',marginBottom:'8px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                    <div style={{flex:1,paddingRight:'8px'}}>
                      <div style={{fontWeight:900,fontSize:isWide?'15px':'12px',color:'#3b82f6',textTransform:'uppercase'}}>Duty / Reason: {e.reason||'Shift'}</div>
                      {e.takeAs==='toil'&&<div style={{display:'inline-block',fontSize:isWide?'10px':'8px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'#f5f3ff',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>TOIL</div>}
                      {e.takeAs==='mix'&&<div style={{display:'inline-block',fontSize:isWide?'10px':'8px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'#f5f3ff',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>Mix — Pay + TOIL</div>}
                      {carmsBadge(e, (isWide?15:12)-1)}
                    </div>
                    <div style={{display:'flex',gap:'10px',alignItems:'center',flexShrink:0}}>
                      <button onClick={()=>{ setConfirmDel(null); setSelectedCalDay(null); startEdit(e); }} style={{background:'#f1f5f9',border:'none',borderRadius:'8px',padding:isWide?'10px':'8px',cursor:'pointer',display:'flex'}}><Ico n="edit" s={isWide?18:14} c="#64748b"/></button>
                      <button onClick={()=>setConfirmDel(confirmDel===e.id?null:e.id)} style={{background:confirmDel===e.id?'#fee2e2':'#fef2f2',border:confirmDel===e.id?'1.5px solid #fca5a5':'1.5px solid transparent',borderRadius:'8px',padding:isWide?'10px':'8px',cursor:'pointer',display:'flex',transition:'all 0.15s'}}><Ico n="trash" s={isWide?18:14} c="#ef4444"/></button>
                    </div>
                  </div>

                  {/* delete confirmation */}
                  {confirmDel===e.id&&(
                    <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',padding:'11px 12px',marginBottom:'9px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                      <span style={{fontSize:isWide?'14px':'12px',fontWeight:700,color:'#991b1b'}}>Delete this record?</span>
                      <div style={{display:'flex',gap:'7px',flexShrink:0}}>
                        <button onClick={()=>setConfirmDel(null)} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:isWide?'7px 15px':'5px 12px',fontSize:isWide?'13px':'11px',fontWeight:900,color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                        <button onClick={()=>{ delEntry(e.id); if(selectedCalDay.dEntries.length<=1) setSelectedCalDay(null); }} style={{background:'#dc2626',border:'none',borderRadius:'8px',padding:isWide?'7px 15px':'5px 12px',fontSize:isWide?'13px':'11px',fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Delete</button>
                      </div>
                    </div>
                  )}

                  {/* notes — sits directly under Duty/Reason, separated from the pay breakdown below.
                      Skipped entirely when there are no notes, so no empty labelled block appears. */}
                  {e.comments&&(
                    <div style={{borderTop:'1px solid #e2e8f0',paddingTop:'10px',marginBottom:'10px'}}>
                      <div style={{fontSize:isWide?'11px':'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>Notes</div>
                      <div style={{fontSize:isWide?'13px':'11px',fontStyle:'italic',color:'#0f172a',borderLeft:'2px solid #bfdbfe',paddingLeft:'8px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.5}}>{e.comments}</div>
                    </div>
                  )}

                  {/* pay breakdown — each line shows its own value, matching List View */}
                  <div style={{borderTop:'1px solid #e2e8f0',paddingTop:'10px'}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                      {c.payH1>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'#475569'}}>{c.payH1}h @ 1.33x {c.toilH>0&&c.otRateTier==='hours133'?'(Pay)':''} <span style={{color:'#94a3b8'}}>(£{c.r.r133.toFixed(2)}/hr)</span></span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'#1e3a5f'}}>£{c.ot1.toFixed(2)}</span>
                        </div>
                      )}
                      {c.payH2>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'#475569'}}>{c.payH2}h @ 1.5x {c.toilH>0&&c.otRateTier==='hours150'?'(Pay)':''} <span style={{color:'#94a3b8'}}>(£{c.r.r150.toFixed(2)}/hr)</span></span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'#1e3a5f'}}>£{c.ot2.toFixed(2)}</span>
                        </div>
                      )}
                      {c.payH3>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'#475569'}}>{c.payH3}h @ 2.0x {c.toilH>0&&c.otRateTier==='hours200'?'(Pay)':''} <span style={{color:'#94a3b8'}}>(£{c.r.r200.toFixed(2)}/hr)</span></span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'#1e3a5f'}}>£{c.ot3.toFixed(2)}</span>
                        </div>
                      )}
                      {c.toilH>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'#6d28d9'}}>{fmtHM(c.toilH)}h @ {RATE_TIER_MULT[c.otRateTier]}x <span style={{color:'#a78bfa'}}>(TOIL{c.takeAs==='mix'?' — part of shift':''})</span></span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'#4c1d95'}}>{fmtHM(c.toilBanked)}h banked</span>
                        </div>
                      )}
                      {e.paRate!=='None'&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'#b45309'}}>{e.paRate} allowance</span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'#92400e'}}>£{c.pa.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',borderTop:'1px solid #e2e8f0',paddingTop:'8px',marginTop:'8px'}}>
                      <div><div style={{fontSize:isWide?'11px':'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</div><div style={{fontWeight:900,fontSize:isWide?'16px':'13px',color:'#1e3a5f'}}>{fmt(c.gross)}</div></div>
                      <div style={{textAlign:'right'}}><div style={{fontSize:isWide?'11px':'9px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px'}}>Net</div><div style={{fontWeight:900,fontSize:isWide?'16px':'13px',color:'#059669'}}>{fmt(eNet)}</div></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CARMS submission-date picker overlay. Also reachable via the
           toggles now, not just the desktop edit-date button — turning a
           toggle on opens this without pre-selecting anything, and the
           toggle itself only actually flips once a day is genuinely
           picked; dismissing without picking leaves both the toggle and
           the date untouched. */}
      {datePickerFor&&(
        <div onClick={()=>setDatePickerFor(null)} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
          {datePickerFor==='ot'
            ? renderDatePickerGrid(form.otSubmittedDate||'', v=>setForm(f=>({...f,otSubmittedDate:v,otSubmitted:true})))
            : datePickerFor==='pa'
            ? renderDatePickerGrid(form.paSubmittedDate||'', v=>setForm(f=>({...f,paSubmittedDate:v,paSubmitted:true})))
            : renderDatePickerGrid(form.date||todayStr, v=>setForm(f=>({...f,date:v})))}
        </div>
      )}

      {/* floating save button — mobile only (Log Shift, once rank/pay point
           are set). Desktop uses the in-flow button at the end of the form
           instead. */}
      {tab==='add'&&!isWide&&settings.rank&&settings.service&&(
        <div style={{position:'absolute',bottom:'72px',left:'14px',right:'14px',zIndex:25}}>
          <button onClick={handleSave} style={{width:'100%',background:'#dc2626',color:'#fff',boxShadow:'0 4px 20px rgba(220,38,38,0.5)',padding:'17px',borderRadius:'16px',border:'none',fontWeight:900,fontSize:'15px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'9px',letterSpacing:'-0.2px'}}>
            <Ico n="save" s={18} c="#fff"/>
            {editing?'Update Record':'Save Record'}
          </button>
        </div>
      )}

      <nav className="no-print" style={{...S.nav, display:isWide?'none':'flex'}}>
        {NAV_TABS.map(t=>(
          <button key={t.id} onClick={()=>{ setEditing(null); if(t.id==='add') { setForm({...blankForm,date:todayStr}); } if(t.id==='months'&&defaultBreakdownView==='list') snapToActiveMonth(false,140); setTab(t.id); }} style={{...S.nBtn(tab===t.id,t.id==='add'),position:'relative'}}>
            {t.id==='carms'&&carmsOutstanding.totalClaims>0&&(
              <div style={{position:'absolute',top:'2px',right:'calc(50% - 16px)',background:'#d97706',color:'#fff',fontSize:'8px',fontWeight:900,width:'14px',height:'14px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{carmsOutstanding.totalClaims>9?'9+':carmsOutstanding.totalClaims}</div>
            )}
            {t.id==='add' ? (
              <span className="nav-add-pulse nav-ico-add" style={{display:'flex'}}><Ico n={t.n} s={21} c="#10b981" w={2.5}/></span>
            ) : (
              <span className="nav-ico" style={{display:'flex'}}><Ico n={t.n} s={18} c={tab===t.id?'#2563eb':'#94a3b8'} w={tab===t.id?2.5:2}/></span>
            )}
            <span style={S.nLbl} className={`nav-lbl${t.id==='add'?' nav-add-pulse':''}`}>{t.lbl}</span>
          </button>
        ))}
      </nav>

      {/* ── wide-screen sidebar — replaces the bottom nav entirely above the
           960px breakpoint; reuses the exact same NAV_TABS array and the
           same tab-switching logic as the bottom nav, just presented as a
           persistent left column instead of a row of buttons. Fixed
           position, since S.wrap keeps its own scroll/height behavior
           unchanged rather than being restructured into a row layout. ── */}
      {isWide&&(
        <div className="no-print" style={{position:'fixed',top:0,left:0,bottom:0,width:'230px',background:'#0f2744',padding:'22px 16px',display:'flex',flexDirection:'column',zIndex:30,boxSizing:'border-box'}}>
          {/* Today's date, in place of the logo — two compact lines so the
              header stays the same height as the icon it replaced and fits
              the fixed 230px column without wrapping awkwardly. */}
          {(()=>{
            const now = new Date();
            const dayName = now.toLocaleDateString('en-GB',{weekday:'long'});
            const dd = now.getDate();
            const suffix = (dd%10===1&&dd!==11)?'st':(dd%10===2&&dd!==12)?'nd':(dd%10===3&&dd!==13)?'rd':'th';
            const monthName = now.toLocaleDateString('en-GB',{month:'long'});
            return (
              <div style={{textAlign:'center',padding:'0 8px 16px',borderBottom:'1px solid rgba(255,255,255,0.1)',marginBottom:'16px'}}>
                <div style={{fontSize:'11px',fontWeight:800,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1.5px'}}>{dayName}</div>
                <div style={{fontSize:'15px',fontWeight:900,color:'#fff',marginTop:'2px',whiteSpace:'nowrap'}}>{dd}{suffix} {monthName}</div>
              </div>
            );
          })()}
          {NAV_TABS.map(t=>{
            const isAdd = t.id==='add';
            const isActive = tab===t.id;
            return (
              <button key={t.id} onClick={()=>{ setEditing(null); if(t.id==='add') { setForm({...blankForm,date:todayStr}); } if(t.id==='months'&&defaultBreakdownView==='list') snapToActiveMonth(false,140); setTab(t.id); }} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 12px',borderRadius:'11px',background:isActive&&!isAdd?'rgba(255,255,255,0.1)':'transparent',color:isAdd?'#10b981':(isActive?'#fff':'#93c5fd'),fontWeight:700,fontSize:'14.5px',fontFamily:'inherit',border:'none',cursor:'pointer',marginBottom:'3px',textAlign:'left'}}>
                {isAdd ? (
                  <span className="nav-add-pulse" style={{display:'flex'}}><Ico n={t.n} s={20} c="#10b981" w={2.5}/></span>
                ) : (
                  <Ico n={t.n} s={20} c={isActive?'#fff':'#93c5fd'} w={isActive?2.5:2}/>
                )}
                <span className={isAdd?'nav-add-pulse':''}>{t.lbl}</span>
                {t.id==='carms'&&carmsOutstanding.totalClaims>0&&(
                  <span style={{marginLeft:'auto',background:'#d97706',color:'#fff',fontSize:'10px',fontWeight:900,padding:'1px 7px',borderRadius:'10px'}}>{carmsOutstanding.totalClaims>99?'99+':carmsOutstanding.totalClaims}</span>
                )}
              </button>
            );
          })}
          {session&&(
            <button onClick={handleManualSync} disabled={manualSyncing} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'7px',background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'10px',padding:'11px',fontSize:'12.5px',fontWeight:800,color:'#fff',cursor:manualSyncing?'default':'pointer',fontFamily:'inherit',marginTop:'auto'}}>
              <span style={{display:'flex',animation:manualSyncing?'spin 0.8s linear infinite':'none'}}><Ico n="refresh" s={14} c="#fff"/></span> Sync
            </button>
          )}
          {session&&(
            <button onClick={()=>setSignOutConfirmOpen(true)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'7px',background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'10px',padding:'11px',fontSize:'12.5px',fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:'inherit',marginTop:'10px'}}>
              <FireExitIcon size={14}/> Sign Out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
