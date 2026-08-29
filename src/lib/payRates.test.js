import { describe, it, expect } from 'vitest';
import { getRates, PAY_RATES } from './payRates.js';
import { RATE_CHANGE_DATE } from './payPeriods.js';

describe('getRates', () => {
  it('returns the pre-rise rates for a date before the rate-change date', () => {
    const before = new Date(RATE_CHANGE_DATE); before.setDate(before.getDate()-1);
    const dayBefore = before.toISOString().split('T')[0];
    const rates = getRates('Constable', 'PC 1', dayBefore);
    expect(rates).toEqual(PAY_RATES.Constable['PC 1'].pre);
  });

  it('returns the post-rise rates on and after the rate-change date', () => {
    const rates = getRates('Constable', 'PC 1', RATE_CHANGE_DATE);
    expect(rates).toEqual(PAY_RATES.Constable['PC 1'].post);
  });

  it('returns all-zero rates for an unknown rank', () => {
    expect(getRates('Chief Constable', 'PC 1', '2026-08-01')).toEqual({ base:0, r133:0, r150:0, r200:0 });
  });

  it('returns all-zero rates for an unknown pay point within a known rank', () => {
    expect(getRates('Constable', 'PC 99', '2026-08-01')).toEqual({ base:0, r133:0, r150:0, r200:0 });
  });

  it('returns all-zero rates when rank, service, or date is missing', () => {
    expect(getRates('', '', '')).toEqual({ base:0, r133:0, r150:0, r200:0 });
    expect(getRates('Constable', 'PC 1', '')).toEqual({ base:0, r133:0, r150:0, r200:0 });
    expect(getRates(null, null, '2026-08-01')).toEqual({ base:0, r133:0, r150:0, r200:0 });
  });

  it('every published rank/pay-point combination is roughly a 1.33x/1.5x/2.0x multiple of its base rate', () => {
    // These are independently-published, individually-rounded real payslip
    // figures (see the "back-calculated" note in payRates.js), so they land
    // within ~15p of the exact multiple rather than matching it to the
    // penny (the higher pay points drift furthest). This is a sanity net
    // against a gross transcription error (a swapped digit, a rate pasted
    // into the wrong tier) — not a claim that the multiple is exact.
    for (const rank of Object.keys(PAY_RATES)) {
      for (const service of Object.keys(PAY_RATES[rank])) {
        for (const period of ['pre','post']) {
          const r = PAY_RATES[rank][service][period];
          expect(Math.abs(r.r133 - r.base*1.33)).toBeLessThan(0.2);
          expect(Math.abs(r.r150 - r.base*1.5)).toBeLessThan(0.2);
          expect(Math.abs(r.r200 - r.base*2.0)).toBeLessThan(0.2);
        }
      }
    }
  });
});
