import { generateFYPeriods, getFYStartYearFor } from './payPeriods.js';
import { payDateOf } from './payroll.js';
import { payLabel } from './format.js';

// A pay month takes every claim submitted inside its shift window, so the
// last day of that window is the deadline: submit by then and it's paid in
// that month; submit later and it's paid the month after.
// Every pay year's months are available, not just this one's, so a claim
// left over from an earlier year still knows its deadline after the year
// changes. Each lookup sees that year's twelve months plus the next April.
const yearCache = new Map();
const monthsAround = d => {
  const fy = getFYStartYearFor(d);
  if (!yearCache.has(fy)) yearCache.set(fy, [...generateFYPeriods(fy), generateFYPeriods(fy + 1)[0]]);
  return yearCache.get(fy);
};
const dm = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace(/\bSep\b/, 'Sept');
const wdm = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\bSep\b/, 'Sept');

// The pay month a claim submitted on date `d` is paid in, its deadline,
// payday and the month after it.
export const submitWindow = d => {
  const ALL = monthsAround(d);
  const i = ALL.findIndex(p => d >= p.start && d <= p.end);
  if (i < 0) return null;
  const p = ALL[i], next = ALL[i + 1] || null;
  return { period: p, month: payLabel(p.month), by: p.end, byShort: dm(p.end), byLong: wdm(p.end), payDate: payDateOf(p), paidOn: dm(payDateOf(p)),
    next: next ? payLabel(next.month) : 'the next pay month' };
};
export const daysUntil = (from, to) => Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000);
export { dm as shortDay, wdm as longDay };
