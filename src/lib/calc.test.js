import { describe, it, expect } from 'vitest';
import {
  calcEntry, isOtSubmitted, isPaSubmitted, submittedGross,
  effectiveOtDate, effectivePaDate, periodIdxForDate, crossPeriodInfo,
} from './calc.js';
import { PAY_PERIODS, RATE_CHANGE_DATE } from './payPeriods.js';
import { getRates } from './payRates.js';

const SETTINGS = { rank:'Constable', service:'PC 1' };

// A minimal valid entry, overridable per test — mirrors blankForm's shape
// in App.jsx closely enough for calcEntry's purposes.
const baseEntry = (overrides={}) => ({
  date: '2026-08-15',
  hours133: '', hours150: '', hours200: '',
  paRate: 'None',
  otRateTier: null,
  toilHours: '',
  takeAs: 'pay',
  otSubmitted: true,
  paSubmitted: true,
  otSubmittedDate: '',
  paSubmittedDate: '',
  ...overrides,
});

describe('calcEntry', () => {
  it('computes gross overtime pay using the rate for the entry\'s own date', () => {
    const rates = getRates(SETTINGS.rank, SETTINGS.service, '2026-08-15'); // pre-rise
    const e = baseEntry({ hours133: '4' });
    const c = calcEntry(e, SETTINGS);
    expect(c.h1).toBe(4);
    expect(c.ot1).toBeCloseTo(4 * rates.r133, 6);
    expect(c.gross).toBeCloseTo(4 * rates.r133, 6);
  });

  it('picks the post-rise rate for a date on/after the rate-change date', () => {
    const preRates = getRates(SETTINGS.rank, SETTINGS.service, '2026-08-15');
    const postRates = getRates(SETTINGS.rank, SETTINGS.service, RATE_CHANGE_DATE);
    expect(postRates.r133).not.toBeCloseTo(preRates.r133, 6);
    const e = baseEntry({ date: RATE_CHANGE_DATE, hours133: '1' });
    const c = calcEntry(e, SETTINGS);
    expect(c.ot1).toBeCloseTo(postRates.r133, 6);
  });

  it('sums all three overtime tiers into one gross figure', () => {
    const rates = getRates(SETTINGS.rank, SETTINGS.service, '2026-08-15');
    const e = baseEntry({ hours133:'2', hours150:'1', hours200:'0.5' });
    const c = calcEntry(e, SETTINGS);
    expect(c.gross).toBeCloseTo(2*rates.r133 + 1*rates.r150 + 0.5*rates.r200, 6);
  });

  it('adds a PA enhancement flat rate on top of overtime pay', () => {
    const rates = getRates(SETTINGS.rank, SETTINGS.service, '2026-08-15');
    const e = baseEntry({ hours133:'1', paRate:'PA2' });
    const c = calcEntry(e, SETTINGS);
    expect(c.pa).toBe(90);
    expect(c.gross).toBeCloseTo(rates.r133 + 90, 6);
  });

  it('treats an entry with no rank/service configured as earning zero', () => {
    const c = calcEntry(baseEntry({ hours133:'5' }), { rank:'', service:'' });
    expect(c.gross).toBe(0);
  });

  describe('TOIL banking', () => {
    it('reduces the CASH portion of overtime by the TOIL hours taken, but not the hours-worked total', () => {
      const rates = getRates(SETTINGS.rank, SETTINGS.service, '2026-08-15');
      // Worked 4h at the 1.33x tier, but banked 3h of it as TOIL instead of pay.
      const e = baseEntry({ hours133:'4', otRateTier:'hours133', toilHours:'3', takeAs:'toil' });
      const c = calcEntry(e, SETTINGS);
      expect(c.h1).toBe(4);        // hours WORKED stays the full 4
      expect(c.payH1).toBe(1);     // hours PAID drops to 4-3=1
      expect(c.ot1).toBeCloseTo(1 * rates.r133, 6);
    });

    it('banks TOIL hours at the multiplier for the tier they were worked at', () => {
      const e150 = baseEntry({ hours150:'2', otRateTier:'hours150', toilHours:'2', takeAs:'toil' });
      const c150 = calcEntry(e150, SETTINGS);
      expect(c150.toilBanked).toBeCloseTo(2 * 1.5, 6); // 3.0 banked hours

      const e200 = baseEntry({ hours200:'2', otRateTier:'hours200', toilHours:'2', takeAs:'toil' });
      const c200 = calcEntry(e200, SETTINGS);
      expect(c200.toilBanked).toBeCloseTo(2 * 2.0, 6); // 4.0 banked hours
    });

    it('never reduces pay below zero even if toilHours exceeds the worked hours for that tier', () => {
      const e = baseEntry({ hours133:'2', otRateTier:'hours133', toilHours:'5' });
      const c = calcEntry(e, SETTINGS);
      expect(c.payH1).toBe(0);
    });

    it('only reduces the tier matching otRateTier — the other tiers are paid in full', () => {
      const e = baseEntry({ hours133:'2', hours150:'2', otRateTier:'hours133', toilHours:'2' });
      const c = calcEntry(e, SETTINGS);
      expect(c.payH1).toBe(0); // 2h - 2h TOIL
      expect(c.payH2).toBe(2); // untouched — TOIL only applies to the 1.33x tier here
    });
  });
});

describe('isOtSubmitted / isPaSubmitted', () => {
  it('treats undefined as submitted (defensive default for legacy entries)', () => {
    expect(isOtSubmitted({})).toBe(true);
    expect(isPaSubmitted({})).toBe(true);
  });

  it('only an explicit false counts as not submitted', () => {
    expect(isOtSubmitted({ otSubmitted:false })).toBe(false);
    expect(isOtSubmitted({ otSubmitted:true })).toBe(true);
    expect(isOtSubmitted({ otSubmitted:null })).toBe(true);
  });
});

describe('effectiveOtDate / effectivePaDate', () => {
  it('uses the submission date when one is recorded', () => {
    expect(effectiveOtDate({ date:'2026-08-01', otSubmittedDate:'2026-08-20' })).toBe('2026-08-20');
  });
  it('falls back to the shift date when no submission date is recorded', () => {
    expect(effectiveOtDate({ date:'2026-08-01', otSubmittedDate:'' })).toBe('2026-08-01');
    expect(effectivePaDate({ date:'2026-08-01' })).toBe('2026-08-01');
  });
});

describe('periodIdxForDate', () => {
  it('finds the period containing a given date', () => {
    const idx = periodIdxForDate(PAY_PERIODS[3].start);
    expect(idx).toBe(3);
  });
  it('returns -1 for a date outside all known periods', () => {
    expect(periodIdxForDate('1900-01-01')).toBe(-1);
  });
});

describe('submittedGross', () => {
  it('counts overtime pay only when the OT toggle is on', () => {
    const rates = getRates(SETTINGS.rank, SETTINGS.service, '2026-08-15');
    const submitted = baseEntry({ hours133:'2', otSubmitted:true });
    const notSubmitted = baseEntry({ hours133:'2', otSubmitted:false });
    expect(submittedGross(submitted, SETTINGS)).toBeCloseTo(2*rates.r133, 6);
    expect(submittedGross(notSubmitted, SETTINGS)).toBe(0);
  });

  it('counts PA pay only when the PA toggle is on, independent of the OT toggle', () => {
    const e = baseEntry({ hours133:'2', paRate:'PA1', otSubmitted:false, paSubmitted:true });
    // OT not submitted (contributes 0) but PA is (contributes flat £40).
    expect(submittedGross(e, SETTINGS)).toBe(40);
  });

  it('always counts an entry that has no overtime hours at all as its (zero) night contribution', () => {
    const e = baseEntry({ paRate:'None' });
    expect(submittedGross(e, SETTINGS)).toBe(0);
  });
});

describe('crossPeriodInfo', () => {
  const ownPeriodIdx = periodIdxForDate('2026-08-15');
  const otherPeriodDate = PAY_PERIODS[(ownPeriodIdx + 1) % PAY_PERIODS.length].start;

  it('returns null when nothing has moved to a different period', () => {
    const e = baseEntry({ hours133:'2', date:'2026-08-15', otSubmittedDate:'2026-08-15' });
    expect(crossPeriodInfo(e, SETTINGS)).toBeNull();
  });

  it('flags overtime submitted into a different period than it was worked in', () => {
    const e = baseEntry({ hours133:'2', date:'2026-08-15', otSubmittedDate: otherPeriodDate });
    const info = crossPeriodInfo(e, SETTINGS);
    expect(info).not.toBeNull();
    expect(info.ot).toBe(true);
    expect(info.pa).toBeUndefined();
  });

  it('flags PA submitted into a different period than it was worked in', () => {
    const e = baseEntry({ paRate:'PA1', date:'2026-08-15', paSubmittedDate: otherPeriodDate });
    const info = crossPeriodInfo(e, SETTINGS);
    expect(info).not.toBeNull();
    expect(info.pa).toBe(true);
  });

  it('never flags a move for money that was never submitted', () => {
    const e = baseEntry({ hours133:'2', date:'2026-08-15', otSubmitted:false, otSubmittedDate: otherPeriodDate });
    expect(crossPeriodInfo(e, SETTINGS)).toBeNull();
  });

  it('combines OT and PA into one label when both moved to the SAME other period', () => {
    const e = baseEntry({
      hours133:'2', paRate:'PA1', date:'2026-08-15',
      otSubmittedDate: otherPeriodDate, paSubmittedDate: otherPeriodDate,
    });
    const info = crossPeriodInfo(e, SETTINGS);
    expect(info.both).toBe(true);
  });
});
