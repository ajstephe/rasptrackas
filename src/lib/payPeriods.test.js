import { describe, it, expect } from 'vitest';
import {
  generateFYPeriods, getFYStartYearFor, addDaysToISO,
  daysInclusive, buildCalendarWeeks,
  getUKTaxYearStart, addYearMinusOneDay, taxYearFractionForDate,
  FY_ANCHOR_START, FY_ANCHOR_YEAR,
} from './payPeriods.js';

describe('generateFYPeriods', () => {
  it('produces exactly 12 periods', () => {
    expect(generateFYPeriods(2026)).toHaveLength(12);
  });

  it('starts at the verified anchor date for the anchor year', () => {
    expect(generateFYPeriods(FY_ANCHOR_YEAR)[0].start).toBe(FY_ANCHOR_START);
  });

  it('has no gaps or overlaps — each period starts the day after the previous one ends', () => {
    const periods = generateFYPeriods(2026);
    for (let i=1;i<periods.length;i++) {
      expect(periods[i].start).toBe(addDaysToISO(periods[i-1].end, 1));
    }
  });

  it('covers exactly 364 days (52 weeks) total, per the documented 4-4-5 cycle', () => {
    const periods = generateFYPeriods(2026);
    const total = daysInclusive(periods[0].start, periods[11].end);
    expect(total).toBe(364);
  });

  it('shifts forward exactly 364 days for the following year, keeping periods contiguous', () => {
    const thisYear = generateFYPeriods(2026);
    const nextYear = generateFYPeriods(2027);
    expect(nextYear[0].start).toBe(addDaysToISO(thisYear[11].end, 1));
  });

  it('labels the last 3 periods with the following calendar year', () => {
    const periods = generateFYPeriods(2026);
    expect(periods[8].month).toContain('2026');  // December 2026 (index 8)
    expect(periods[9].month).toContain('2027');  // January 2027
    expect(periods[11].month).toContain('2027'); // March 2027
  });
});

describe('getFYStartYearFor', () => {
  it('returns the anchor year for a date on the anchor start', () => {
    expect(getFYStartYearFor(FY_ANCHOR_START)).toBe(FY_ANCHOR_YEAR);
  });

  it('returns the following FY year exactly 364 days later', () => {
    const nextAnchor = addDaysToISO(FY_ANCHOR_START, 364);
    expect(getFYStartYearFor(nextAnchor)).toBe(FY_ANCHOR_YEAR + 1);
  });

  it('returns the previous FY year for the day before the anchor', () => {
    const dayBefore = addDaysToISO(FY_ANCHOR_START, -1);
    expect(getFYStartYearFor(dayBefore)).toBe(FY_ANCHOR_YEAR - 1);
  });
});

describe('daysInclusive', () => {
  it('counts a single day as 1', () => {
    expect(daysInclusive('2026-08-15', '2026-08-15')).toBe(1);
  });
  it('counts both endpoints', () => {
    expect(daysInclusive('2026-08-15', '2026-08-16')).toBe(2);
  });
});

describe('buildCalendarWeeks', () => {
  it('pads the grid to a multiple of 7 and preserves every real day', () => {
    const period = { start: '2026-08-10', end: '2026-09-06' }; // Monday–Sunday, 4 weeks
    const weeks = buildCalendarWeeks(period);
    expect(weeks).toHaveLength(4);
    weeks.forEach(week => expect(week).toHaveLength(7));
    const realDays = weeks.flat().filter(Boolean);
    expect(realDays).toHaveLength(daysInclusive(period.start, period.end));
  });

  it('pads leading nulls so the first real day lands under its correct weekday column', () => {
    // 2026-08-12 is a Wednesday, so 2 leading nulls (Mon, Tue) are expected.
    const period = { start: '2026-08-12', end: '2026-08-16' };
    const weeks = buildCalendarWeeks(period);
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBeNull();
    expect(weeks[0][2]).not.toBeNull();
  });
});

describe('UK tax year helpers', () => {
  it('getUKTaxYearStart returns 6 April of the same calendar year on/after that date', () => {
    expect(getUKTaxYearStart('2026-04-06')).toBe('2026-04-06');
    expect(getUKTaxYearStart('2026-12-25')).toBe('2026-04-06');
  });

  it('getUKTaxYearStart returns 6 April of the PREVIOUS calendar year before that date', () => {
    expect(getUKTaxYearStart('2026-04-05')).toBe('2025-04-06');
    expect(getUKTaxYearStart('2026-01-01')).toBe('2025-04-06');
  });

  it('addYearMinusOneDay gives the day before the same date next year', () => {
    expect(addYearMinusOneDay('2026-04-06')).toBe('2027-04-05');
  });

  it('taxYearFractionForDate is ~0 just after 6 April and ~1 just before the following 5 April', () => {
    expect(taxYearFractionForDate('2026-04-06')).toBeCloseTo(1/365, 2);
    expect(taxYearFractionForDate('2027-04-05')).toBeCloseTo(1, 2);
  });

  it('taxYearFractionForDate is always clamped between 1/365 and 1', () => {
    for (const d of ['2026-04-06','2026-07-15','2026-12-31','2027-04-05']) {
      const f = taxYearFractionForDate(d);
      expect(f).toBeGreaterThanOrEqual(1/365);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
