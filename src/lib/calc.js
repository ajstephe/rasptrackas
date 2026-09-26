import { getRates, RATE_TIER_MULT, PA_RATES, payPointOn } from './payRates.js';
import { PAY_PERIODS, getFYStartYearFor, generateFYPeriods } from './payPeriods.js';

// ── entry calculator ───────────────────────────────────────────────────────
// Returns the gross pay components for a single entry using date-correct rates.
// Net is NOT calculated here — each pay month is taxed as a PAYE month,
// cumulatively, in lib/payroll.js, since a flat personal tax rate can't
// reflect where each pound sits in the tax bands.
//
// Takes `settings` (rank/service) explicitly rather than closing over
// component state — this is what makes it a plain, unit-testable function.
// App.jsx wraps this in a `useCallback` that supplies the current settings,
// so every existing call site there is unaffected.
export const calcEntry = (e, settings) => {
  const pp = payPointOn(settings, e.date);   // the pay point in force on the shift's date
  const r  = getRates(pp.rank, pp.service, e.date);
  const h1 = parseFloat(e.hours133)||0;
  const h2 = parseFloat(e.hours150)||0;
  const h3 = parseFloat(e.hours200)||0;
  // TOIL hours (worked at e.otRateTier's rate, taken as time instead of
  // pay) reduce the CASH overtime calculation only — h1/h2/h3 still
  // reflect hours actually worked, so hours-worked totals stay correct.
  const toilH = e.otRateTier ? (parseFloat(e.toilHours)||0) : 0;
  const payH1 = e.otRateTier==='hours133' ? Math.max(0,h1-toilH) : h1;
  const payH2 = e.otRateTier==='hours150' ? Math.max(0,h2-toilH) : h2;
  const payH3 = e.otRateTier==='hours200' ? Math.max(0,h3-toilH) : h3;
  // Each rate's pay is rounded to the penny, as a claim is paid, so every
  // total built from these adds up to exactly the pence shown on screen.
  // Worked in whole pence, so a half penny always rounds up (1.5h at £22.43
  // is £33.645 → £33.65) rather than falling foul of binary decimals.
  const pay = (h, rate) => Math.round(h * Math.round(rate*100) + 1e-6) / 100;
  const pence = x => Math.round(x*100 + 1e-6)/100;
  const ot1 = pay(payH1, r.r133), ot2 = pay(payH2, r.r150), ot3 = pay(payH3, r.r200);
  const ot  = pence(ot1+ot2+ot3);
  const toilBanked = e.otRateTier ? toilH * RATE_TIER_MULT[e.otRateTier] : 0;
  const pa    = PA_RATES[e.paRate]||0;
  const gross = pence(ot + pa);
  return { h1, h2, h3, payH1, payH2, payH3, ot1, ot2, ot3, ot, pa, gross, r, toilH, toilBanked, otRateTier:e.otRateTier, takeAs:e.takeAs };
};

// Whether a component counts as submitted — defensive against undefined
// (older/synced entries that predate this field) rather than relying on
// every single entry point — initial load, cloud pull, backup restore —
// remembering to migrate it. Anything except an explicit false counts.
export const isOtSubmitted = e => e.otSubmitted !== false;
export const isPaSubmitted = e => e.paSubmitted !== false;

// Shared by every place that needs an entry's actually-counted gross —
// the export, the PDF payslip preview, and the archived-year view all
// used to compute this same formula independently, which is exactly the
// kind of duplication that lets one copy drift out of sync with the
// others after a future change. One definition here, reused everywhere.
export const submittedGross = (e, settings) => {
  const c = calcEntry(e, settings);
  const hasPA = e.paRate && e.paRate!=='None';
  const otPart = c.h1+c.h2+c.h3 > 0 && isOtSubmitted(e) ? c.ot : 0;
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
export const effectiveOtDate = e => e.otSubmittedDate || e.date;
export const effectivePaDate = e => e.paSubmittedDate || e.date;

// Which pay period a given date falls into, by index into PAY_PERIODS.
// Shared helper — several places used to inline this same lookup
// independently, which is exactly the kind of duplication that drifts.
export const periodIdxForDate = d => PAY_PERIODS.findIndex(p=>d>=p.start&&d<=p.end);

// Detects a shift whose money lands in a different pay period than the
// one it was actually worked in — a late submission that crosses a
// period boundary. Only meaningful once submitted, since unsubmitted
// money isn't attributed to any period yet. Returns the target month
// label so the UI can say where it actually counts.
export const crossPeriodInfo = (e, settings) => {
  const c = calcEntry(e, settings);
  const hasOTHours = c.h1+c.h2+c.h3 > 0;
  const hasPA = e.paRate && e.paRate!=='None';
  // Pay months are looked up in each date's own pay year, so a claim made
  // across the year end still gets its month's name.
  const monthOf = d => {
    const fy = getFYStartYearFor(d);
    return generateFYPeriods(fy).find(p=>d>=p.start&&d<=p.end);
  };
  const own = monthOf(e.date);
  const otP = hasOTHours && isOtSubmitted(e) ? monthOf(effectiveOtDate(e)) : null;
  const paP = hasPA && isPaSubmitted(e) ? monthOf(effectivePaDate(e)) : null;
  const otMoved = !!otP && otP.month !== own?.month;
  const paMoved = !!paP && paP.month !== own?.month;
  if (!otMoved && !paMoved) return null;
  // Name the month; add its year when it isn't the shift's own pay year.
  const name = p => getFYStartYearFor(p.start)!==getFYStartYearFor(e.date) ? `${p.short} ${p.month.split(' ')[1]}` : p.short;
  if (otMoved && paMoved && otP.month===paP.month) return { label: name(otP), both: true };
  if (otMoved && !paMoved) return { label: name(otP), ot: true };
  if (paMoved && !otMoved) return { label: name(paP), pa: true };
  return { label: `${name(otP)} / ${name(paP)}`, both: true };
};
