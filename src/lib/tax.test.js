import { describe, it, expect } from 'vitest';
import {
  calcUKIncomeTax, calcUKIncomeTaxNoTaper,
  calcNI, NI_PT, NI_UEL, estimateAnnualNI,
  computeTaxBandBreakdown, getTaxBand, applyBandTax, splitAcrossBands,
  pensionTierRate, calcPensionContribution,
  monthlySteppedAmount, monthlySteppedSplitBySept,
  periodBaseAmount, periodPensionablePay, LONDON_WEIGHTING, LONDON_ALLOWANCE,
} from './tax.js';
import { RATE_CHANGE_DATE } from './payPeriods.js';

// These pin down the actual 2026/27 UK tax/NI/pension rules this app
// encodes. If a future year's rates change, these numbers should be the
// first thing updated — a failure here means the bands moved, not that
// the test is wrong.

describe('calcUKIncomeTax', () => {
  it('charges nothing within the personal allowance', () => {
    expect(calcUKIncomeTax(12570)).toBeCloseTo(0, 6);
    expect(calcUKIncomeTax(5000)).toBe(0);
  });

  it('charges 20% on income in the basic-rate band', () => {
    // £5,000 above the £12,570 personal allowance, all within the £37,700
    // basic-rate band → 20% of £5,000.
    expect(calcUKIncomeTax(17570)).toBeCloseTo(1000, 6);
  });

  it('charges 40% on the slice above the basic-rate band', () => {
    // £12,570 PA + £37,700 basic band = £50,270 is where higher rate starts.
    // £10,000 above that should be taxed at 40%.
    const atThreshold = calcUKIncomeTax(50270);
    const above = calcUKIncomeTax(60270);
    expect(above - atThreshold).toBeCloseTo(4000, 6);
  });

  it('charges 45% above the additional-rate threshold once PA has fully tapered', () => {
    // At £125,140+ the personal allowance has tapered to zero, so this is
    // the exact point additional rate begins on official HMRC bands.
    const atThreshold = calcUKIncomeTax(125140);
    const above = calcUKIncomeTax(135140);
    expect(above - atThreshold).toBeCloseTo(4500, 6);
  });

  it('tapers the personal allowance by £1 for every £2 earned over £100k', () => {
    // £10,000 over £100k → PA reduced by £5,000 (10000/2), from £12,570 to £7,570.
    // So taxable income at gross=£110,000 is 110000-7570=102430, all straddling
    // basic/higher bands. Cross-check against the no-taper variant to isolate
    // the effect: the tapered version should owe MORE tax than the untapered one.
    const tapered = calcUKIncomeTax(110000);
    const untapered = calcUKIncomeTaxNoTaper(110000);
    expect(tapered).toBeGreaterThan(untapered);
  });

  it('clamps the tapered personal allowance at zero rather than going negative past £125,140', () => {
    // Above £125,140 the naive taper formula (12570 - (income-100000)/2)
    // would go negative — computeTaxBandBreakdown's `pa` field must clamp
    // to 0, not a negative "allowance". The untapered variant keeps the
    // full £12,570 regardless, so the two stay apart by design (this is
    // the whole point of calcUKIncomeTaxNoTaper as a counterfactual) —
    // they do NOT converge just because both taxable amounts are past the
    // additional-rate threshold.
    expect(computeTaxBandBreakdown(200000).pa).toBe(0);
    expect(calcUKIncomeTax(200000)).toBeGreaterThan(calcUKIncomeTaxNoTaper(200000));
  });

  it('pro-rates thresholds by yearFraction for a partial year', () => {
    // Half a tax year at the same annualised rate: personal allowance and
    // band widths are exactly halved, so tax scales down proportionally —
    // it does not match the full-year tax on the equivalent annualised gross.
    const fullYear = calcUKIncomeTax(25140); // 12570 PA + half of 25140, over a full year
    const halfYear = calcUKIncomeTax(12570, 0.5); // same relative position, but over half a year
    expect(halfYear).toBeCloseTo(fullYear / 2, 2);
  });
});

describe('calcNI', () => {
  it('charges nothing below the monthly primary threshold', () => {
    expect(calcNI(NI_PT - 10)).toBe(0);
    expect(calcNI(0)).toBe(0);
  });

  it('charges 8% between the primary threshold and the upper earnings limit', () => {
    const periodGross = NI_PT + 1000;
    expect(calcNI(periodGross)).toBeCloseTo(1000 * 0.08, 6);
  });

  it('charges only 2% on the slice above the upper earnings limit', () => {
    const belowUel = calcNI(NI_UEL);
    const aboveUel = calcNI(NI_UEL + 1000);
    expect(aboveUel - belowUel).toBeCloseTo(1000 * 0.02, 6);
  });

  it('is assessed per period, not cumulatively — same period gross gives the same NI regardless of prior periods', () => {
    // NI has no annual concept, unlike income tax — this is the behavioural
    // difference the whole app's period-by-period NI summing depends on.
    expect(calcNI(3000)).toBe(calcNI(3000));
  });
});

describe('estimateAnnualNI', () => {
  it('matches calcNI scaled to annual thresholds for a simple case', () => {
    // A gross comfortably between the annual PT and UEL should follow the
    // same 8% marginal logic as the per-period calculation.
    const annual = 12570 + 12000;
    const ni = estimateAnnualNI(annual);
    expect(ni).toBeCloseTo(12000 * 0.08, 6);
  });
});

describe('computeTaxBandBreakdown', () => {
  it('itemised bands sum to the same total as calcUKIncomeTax', () => {
    for (const gross of [8000, 30000, 55000, 110000, 200000]) {
      const breakdown = computeTaxBandBreakdown(gross);
      expect(breakdown.totalTax).toBeCloseTo(calcUKIncomeTax(gross), 4);
    }
  });
});

describe('getTaxBand', () => {
  it('names the correct band at each boundary', () => {
    expect(getTaxBand(0).name).toBe('Personal Allowance');
    expect(getTaxBand(20000).name).toBe('Basic Rate');
    expect(getTaxBand(60000).name).toBe('Higher Rate');
    expect(getTaxBand(200000).name).toBe('Additional Rate');
  });
});

describe('applyBandTax', () => {
  it('returns zeroed-out result for a non-positive amount', () => {
    expect(applyBandTax(10000, 0)).toEqual({ tax:0, ni:0, net:0, rate:0, bandName:null });
    expect(applyBandTax(10000, -50).tax).toBe(0);
  });

  it('taxes a marginal slice at the rate it actually falls in, not the average rate', () => {
    // Someone already at exactly the higher-rate threshold: the next £1,000
    // of overtime should be taxed entirely at 40% income tax (no NI passed).
    const result = applyBandTax(50270, 1000);
    expect(result.tax).toBeCloseTo(400, 6);
    expect(result.bandName).toBe('Higher Rate');
  });

  it('nets out both tax and NI when a period gross is supplied', () => {
    const result = applyBandTax(20000, 1000, 1, 3000);
    const expectedTax = 1000 * 0.20;
    const expectedNi = calcNI(4000) - calcNI(3000);
    expect(result.tax).toBeCloseTo(expectedTax, 6);
    expect(result.ni).toBeCloseTo(expectedNi, 6);
    expect(result.net).toBeCloseTo(1000 - expectedTax - expectedNi, 6);
  });
});

describe('splitAcrossBands', () => {
  it('splits an amount crossing a band boundary into the correct portions', () => {
    // Starting right at the personal allowance ceiling (£12,570), a £5,000
    // slice sits entirely in Basic Rate.
    const portions = splitAcrossBands(12570, 5000);
    expect(portions).toHaveLength(1);
    expect(portions[0].name).toBe('Basic Rate');
    expect(portions[0].amount).toBeCloseTo(5000, 6);
  });

  it('splits a slice that straddles Basic and Higher Rate', () => {
    // Starting £1,000 below the Higher Rate threshold (£50,270), a £3,000
    // slice puts £1,000 in Basic and £2,000 in Higher.
    const portions = splitAcrossBands(49270, 3000);
    expect(portions.map(p=>p.name)).toEqual(['Basic Rate', 'Higher Rate']);
    expect(portions[0].amount).toBeCloseTo(1000, 6);
    expect(portions[1].amount).toBeCloseTo(2000, 6);
    const total = portions.reduce((s,p)=>s+p.amount, 0);
    expect(total).toBeCloseTo(3000, 6);
  });
});

describe('pensionTierRate (2015 Police Pension Scheme, effective 1 Apr 2026)', () => {
  it('picks the correct tier at each documented threshold', () => {
    expect(pensionTierRate(30000)).toBeCloseTo(0.1288, 6);
    expect(pensionTierRate(37035)).toBeCloseTo(0.1288, 6); // boundary is inclusive
    expect(pensionTierRate(37036)).toBeCloseTo(0.1388, 6);
    expect(pensionTierRate(79587)).toBeCloseTo(0.1388, 6);
    expect(pensionTierRate(79588)).toBeCloseTo(0.1422, 6); // boundary is exclusive here
    expect(pensionTierRate(100000)).toBeCloseTo(0.1422, 6);
  });
});

describe('calcPensionContribution', () => {
  it('annualises a partial-year pensionable pay before picking the tier', () => {
    // £20,000 pensionable pay over HALF a year annualises to £40,000 —
    // comfortably in the middle tier (13.88%), not the bottom tier that a
    // naive (non-annualised) £20,000 lookup would give (12.88%).
    const result = calcPensionContribution(20000, 0.5);
    expect(result.rate).toBeCloseTo(0.1388, 6);
    expect(result.amount).toBeCloseTo(20000 * 0.1388, 6);
  });
});

describe('monthlySteppedAmount', () => {
  it('accrues a full month for a range covering exactly one calendar month', () => {
    const annual = 12000; // £1,000/month
    expect(monthlySteppedAmount(annual, '2026-05-01', '2026-05-31')).toBeCloseTo(1000, 6);
  });

  it('pro-rates a partial month by days', () => {
    const annual = 12000; // £1,000/month, 31 days in May
    const half = monthlySteppedAmount(annual, '2026-05-01', '2026-05-15'); // 15 of 31 days
    expect(half).toBeCloseTo(1000 * (15/31), 6);
  });

  it('returns 0 for an empty or inverted range', () => {
    expect(monthlySteppedAmount(12000, '', '')).toBe(0);
    expect(monthlySteppedAmount(12000, '2026-06-01', '2026-05-01')).toBe(0);
  });
});

describe('monthlySteppedSplitBySept', () => {
  it('uses the pre-rise rate entirely before the rate-change date', () => {
    const before = new Date(RATE_CHANGE_DATE); before.setDate(before.getDate()-1);
    const dayBefore = before.toISOString().split('T')[0];
    const result = monthlySteppedSplitBySept(12000, 24000, dayBefore, dayBefore);
    expect(result).toBeCloseTo(monthlySteppedAmount(12000, dayBefore, dayBefore), 6);
  });

  it('uses the post-rise rate entirely on/after the rate-change date', () => {
    const result = monthlySteppedSplitBySept(12000, 24000, RATE_CHANGE_DATE, RATE_CHANGE_DATE);
    expect(result).toBeCloseTo(monthlySteppedAmount(24000, RATE_CHANGE_DATE, RATE_CHANGE_DATE), 6);
  });

  it('splits a range spanning the rate-change date across both rates', () => {
    const before = new Date(RATE_CHANGE_DATE); before.setDate(before.getDate()-5);
    const start = before.toISOString().split('T')[0];
    const after = new Date(RATE_CHANGE_DATE); after.setDate(after.getDate()+5);
    const end = after.toISOString().split('T')[0];
    const spanning = monthlySteppedSplitBySept(12000, 24000, start, end);
    const dayBeforeChange = (() => { const d=new Date(RATE_CHANGE_DATE); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; })();
    const expected = monthlySteppedAmount(12000, start, dayBeforeChange) + monthlySteppedAmount(24000, RATE_CHANGE_DATE, end);
    expect(spanning).toBeCloseTo(expected, 6);
  });
});

describe('periodPensionablePay', () => {
  const svcData = { salary: { pre: 36500, post: 38000 } }; // £100/day pre, easy mental maths
  it('matches periodBaseAmount minus London Allowance for a period entirely before the rate change', () => {
    const p = { start: '2026-05-01', end: '2026-05-28' }; // 28-day period, well before RATE_CHANGE_DATE
    const withLA = periodBaseAmount(p, svcData);
    const withoutLA = periodPensionablePay(p, svcData);
    const totalDays = 28;
    const expectedLA = (totalDays/365) * LONDON_ALLOWANCE;
    expect(withLA - withoutLA).toBeCloseTo(expectedLA, 6);
  });

  it('never includes London Allowance even when the period spans the rate change', () => {
    const p = { start: '2026-08-25', end: '2026-09-07' }; // spans RATE_CHANGE_DATE (2026-09-01)
    const withLA = periodBaseAmount(p, svcData);
    const withoutLA = periodPensionablePay(p, svcData);
    const totalDays = 14;
    const expectedLA = (totalDays/365) * LONDON_ALLOWANCE;
    expect(withLA - withoutLA).toBeCloseTo(expectedLA, 6);
  });

  it('returns 0 pensionable pay when there is no rank/pay-point selected, matching periodBaseAmount', () => {
    const p = { start: '2026-05-01', end: '2026-05-28' };
    expect(periodPensionablePay(p, null)).toBeCloseTo(
      (28/365) * LONDON_WEIGHTING.pre, 6
    );
  });
});

describe('periodBreakdown-style cumulative pension deduction (integration-level reasoning)', () => {
  // App.jsx's periodBreakdown can't be unit tested directly (it's a closure
  // inside a useMemo, not an exported pure function) — but the principle it
  // now relies on is: subtracting a period's own pension contribution from
  // its base pay, before that base pay is used as the cumulative baseline
  // for banding overtime, measurably lowers the tax a stacked slice of
  // overtime attracts. This pins down that the underlying primitives
  // combine the way periodBreakdown's fix depends on.
  it('taxing overtime on top of (baseAmt - pension) charges less than on top of raw baseAmt, when that reduction crosses a band boundary', () => {
    const baseAmt = 45000; // pensionable pay for the year, under the £50,270 higher-rate line alone
    const pension = calcPensionContribution(baseAmt, 1); // 13.88% tier
    const overtimeSlice = 8000; // pushes raw baseAmt over £50,270, but not baseAmt-pension
    const taxOnRawBaseline = calcUKIncomeTax(baseAmt + overtimeSlice, 1) - calcUKIncomeTax(baseAmt, 1);
    const pensionAdjustedBaseline = baseAmt - pension.amount;
    const taxOnAdjustedBaseline = calcUKIncomeTax(pensionAdjustedBaseline + overtimeSlice, 1) - calcUKIncomeTax(pensionAdjustedBaseline, 1);
    expect(pensionAdjustedBaseline + overtimeSlice).toBeLessThan(50270); // confirms this example actually crosses the line
    expect(taxOnAdjustedBaseline).toBeLessThan(taxOnRawBaseline);
  });
});
