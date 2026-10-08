import { describe, it, expect } from 'vitest';
import { submitWindow, daysUntil } from './deadline.js';
import { PAY_PERIODS, generateFYPeriods, CURRENT_FY_YEAR } from './payPeriods.js';

describe('submitWindow', () => {
  it('gives the pay month whose shift window holds the date, its deadline and the month after', () => {
    const p = PAY_PERIODS[7]; // November
    const w = submitWindow(p.start);
    expect(w.month).toBe('November pay');
    expect(w.by).toBe(p.end);
    expect(w.next).toBe('December pay');
  });
  it('the last day of a window still counts for that month; the day after is the next', () => {
    const p = PAY_PERIODS[7];
    expect(submitWindow(p.end).month).toBe('November pay');
    const after = new Date(p.end + 'T12:00:00Z'); after.setUTCDate(after.getUTCDate() + 1);
    expect(submitWindow(after.toISOString().slice(0, 10)).month).toBe('December pay');
  });
  it("March's window points on to next year's April", () => {
    const w = submitWindow(PAY_PERIODS[11].start);
    expect(w.month).toBe('March pay');
    expect(w.next).toBe('April pay');
  });
  it('counts days to the deadline', () => {
    expect(daysUntil('2026-10-03', '2026-10-11')).toBe(8);
    expect(daysUntil('2026-10-11', '2026-10-11')).toBe(0);
  });
  it('still knows the deadline for a claim from an earlier or later pay year', () => {
    const last = generateFYPeriods(CURRENT_FY_YEAR - 1)[7], next = generateFYPeriods(CURRENT_FY_YEAR + 1)[11];
    expect(submitWindow(last.start)?.by).toBe(last.end);
    expect(submitWindow(next.start)?.by).toBe(next.end);
    expect(submitWindow(next.start)?.next).toBe('April pay');
  });
});
