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
export const FY_ANCHOR_YEAR    = 2026;              // the "April" label's calendar year for the anchor
export const FY_ANCHOR_START   = '2026-02-09';      // verified: start of "April 2026", from the user's own spreadsheet
export const FY_WEEK_PATTERN   = [4,5,4,4,5,4,4,5,4,4,5,4]; // weeks per period, in order
export const FY_MONTH_LABELS   = ['April','May','June','July','August','September','October','November','December','January','February','March'];
export const FY_SHORT_LABELS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

// Known corrections for years where the simple 364-day rule doesn't hold —
// e.g. a 53-week year. Empty for now since no such year has been confirmed;
// add an entry here (fyStartCalendarYear -> explicit period list) if/when one is.
export const FY_OVERRIDES = {};

export const addDaysToISO = (iso, days) => {
  const d = new Date(iso+'T12:00:00Z'); // noon UTC sidesteps DST edge cases
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
};

export const generateFYPeriods = (fyStartCalendarYear) => {
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
export const getFYStartYearFor = (dateISO) => {
  const daysSinceAnchor = Math.floor((new Date(dateISO+'T12:00:00Z') - new Date(FY_ANCHOR_START+'T12:00:00Z')) / 86400000);
  return FY_ANCHOR_YEAR + Math.floor(daysSinceAnchor/364);
};

export const CURRENT_FY_YEAR = getFYStartYearFor(new Date().toISOString().split('T')[0]);
export const PAY_PERIODS = generateFYPeriods(CURRENT_FY_YEAR);
export const FY_START = PAY_PERIODS[0].start;
export const FY_END   = PAY_PERIODS[11].end;

// Cloud retention: current financial year plus the 3 most recent (4 FYs
// total). This is a CLOUD-ONLY policy — local storage on the device is
// never pruned and can hold data indefinitely, however far back it goes.
export const CLOUD_RETENTION_CUTOFF = generateFYPeriods(CURRENT_FY_YEAR - 3)[0].start;
export const isWithinCloudRetention = (dateISO) => dateISO >= CLOUD_RETENTION_CUTOFF;

export const RATE_CHANGE_DATE = '2026-09-01'; // new pay rates + night enhancement from here — a real pay-award date, not a pattern to generate

export const daysInclusive = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

// Builds a Monday-start week grid for a pay period, with null padding cells
// before/after so the days line up correctly under Mo-Su column headers.
export const buildCalendarWeeks = (period) => {
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
export const getUKTaxYearStart = dateStr => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const apr6ThisYear = `${y}-04-06`;
  return dateStr >= apr6ThisYear ? apr6ThisYear : `${y-1}-04-06`;
};
export const addYearMinusOneDay = dateStr => {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear()+1);
  d.setDate(d.getDate()-1);
  return d.toISOString().split('T')[0];
};
// How far into the UK tax year CONTAINING this date we are, as a continuous
// 0-1 fraction (6 Apr = just past 0, 5 Apr next year = 1). Used to pro-rate
// annual PA/band thresholds for a specific date, regardless of which pay
// period it happens to fall in.
export const taxYearFractionForDate = dateStr => {
  const tys = getUKTaxYearStart(dateStr);
  const days = Math.max(0, (new Date(dateStr) - new Date(tys))/86400000) + 1;
  return Math.max(1/365, Math.min(1, days/365));
};
