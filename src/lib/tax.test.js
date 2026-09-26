import { describe, it, expect } from 'vitest';
import {
  calcUKIncomeTax, calcUKIncomeTaxNoTaper, pensionTierRate, taperExtra,
} from './tax.js';

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
    expect(taperExtra(200000).allowanceLeft).toBe(0);
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

describe('taperExtra', () => {
  it('finds no extra tax at or below £100k', () => {
    const t = taperExtra(100000, 1);
    expect(t.over).toBe(false);
    expect(t.extraTax).toBe(0);
    expect(t.allowanceLeft).toBe(12570);
  });

  it('loses £1 of allowance for every £2 over £100k, taxed at 40%', () => {
    const t = taperExtra(110000, 1);
    expect(t.allowanceLeft).toBe(7570);
    expect(t.extraTax).toBeCloseTo(5000 * 0.40, 6);
  });

  it('judges part of a year on its run rate', () => {
    const t = taperExtra(55000, 0.5); // £110k a year
    expect(t.runRate).toBe(110000);
    expect(t.allowanceLostSoFar).toBe(2500);
  });
});
