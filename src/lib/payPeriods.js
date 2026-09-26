// ─── financial year — generated, not hardcoded ────────────────────────────────
// Pay periods follow a fixed 4-5-4-4-5-4-4-5-4-4-5-4 week cycle (52 weeks/364
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
const FY_WEEK_PATTERN   = [4,5,4,4,5,4,4,5,4,4,5,4]; // weeks per period, in order
const FY_MONTH_LABELS   = ['April','May','June','July','August','September','October','November','December','January','February','March'];
const FY_SHORT_LABELS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

// Known corrections for years where the simple 364-day rule doesn't hold —
// e.g. a 53-week year. Empty for now since no such year has been confirmed;
// add an entry here (fyStartCalendarYear -> explicit period list) if/when one is.
// Only read internally (generateFYPeriods) — not exported.
const FY_OVERRIDES = {};

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

// Today's date as YYYY-MM-DD on the phone's own clock. toISOString() is UTC,
// which in summer (BST) is still yesterday until 1am — after a night shift
// that put new shifts and TOIL on the wrong day.
export const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export const CURRENT_FY_YEAR = getFYStartYearFor(localDateStr());
export const PAY_PERIODS = generateFYPeriods(CURRENT_FY_YEAR);
export const FY_START = PAY_PERIODS[0].start;
export const FY_END   = PAY_PERIODS[11].end;

// Cloud retention: current financial year plus the 3 most recent (4 FYs
// total). This is a CLOUD-ONLY policy — local storage on the device is
// never pruned and can hold data indefinitely, however far back it goes.
export const CLOUD_RETENTION_CUTOFF = generateFYPeriods(CURRENT_FY_YEAR - 3)[0].start;
export const isWithinCloudRetention = (dateISO) => dateISO >= CLOUD_RETENTION_CUTOFF;

export const RATE_CHANGE_DATE = '2026-09-01'; // the 2026 pay award takes effect — a real date, not a pattern to generate

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
// Pay lands on the 20th of each pay month's named month, so a pay year's
// twelve paydays fall in one tax year: April pay (20 Apr) is tax month 1 and
// March pay tax month 12. This works out which tax year a date sits in.
export const getUKTaxYearStart = dateStr => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const apr6ThisYear = `${y}-04-06`;
  return dateStr >= apr6ThisYear ? apr6ThisYear : `${y-1}-04-06`;
};
