import { getRates, RATE_TIER_MULT, PA_RATES } from './payRates.js';
import { PAY_PERIODS } from './payPeriods.js';

// ── entry calculator ───────────────────────────────────────────────────────
// Returns the gross pay components for a single entry using date-correct rates.
// Net is NOT calculated here — tax is applied per pay period on a cumulative
// marginal basis (see periodBreakdown in App.jsx), since a flat personal
// tax rate can't correctly reflect where each pound sits in the tax bands.
//
// Takes `settings` (rank/service) explicitly rather than closing over
// component state — this is what makes it a plain, unit-testable function.
// App.jsx wraps this in a `useCallback` that supplies the current settings,
// so every existing call site there is unaffected.
export const calcEntry = (e, settings) => {
  const r  = getRates(settings?.rank, settings?.service, e.date);
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
  const ownIdx = periodIdxForDate(e.date);
  const hasOTHours = c.h1+c.h2+c.h3 > 0;
  const hasPA = e.paRate && e.paRate!=='None';
  const otMoved = hasOTHours && isOtSubmitted(e) && periodIdxForDate(effectiveOtDate(e)) !== ownIdx;
  const paMoved = hasPA && isPaSubmitted(e) && periodIdxForDate(effectivePaDate(e)) !== ownIdx;
  if (!otMoved && !paMoved) return null;
  const otIdx = otMoved ? periodIdxForDate(effectiveOtDate(e)) : null;
  const paIdx = paMoved ? periodIdxForDate(effectivePaDate(e)) : null;
  // Common case: everything that moved, moved to the same period —
  // one combined label. The rare case (OT and PA submitted weeks apart,
  // landing in two different other periods) falls back to a slightly
  // longer combined label rather than needing two separate pills.
  if (otMoved && paMoved && otIdx===paIdx) {
    return { label: PAY_PERIODS[otIdx]?.short || PAY_PERIODS[otIdx]?.month, both: true };
  }
  if (otMoved && !paMoved) return { label: PAY_PERIODS[otIdx]?.short || PAY_PERIODS[otIdx]?.month, ot: true };
  if (paMoved && !otMoved) return { label: PAY_PERIODS[paIdx]?.short || PAY_PERIODS[paIdx]?.month, pa: true };
  return { label: `${PAY_PERIODS[otIdx]?.short||PAY_PERIODS[otIdx]?.month} / ${PAY_PERIODS[paIdx]?.short||PAY_PERIODS[paIdx]?.month}`, both: true };
};
