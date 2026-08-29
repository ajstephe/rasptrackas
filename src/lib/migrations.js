import { PAY_RATES } from './payRates.js';

// Migrate settings if they contain old rank names from a previous version
export const migrateSettings = s => {
  const def = { rank:'', service:'' };
  if (!s) return def;
  const validRanks = Object.keys(PAY_RATES);
  if (!validRanks.includes(s.rank)) return def;
  const validServices = Object.keys(PAY_RATES[s.rank]||{});
  if (!validServices.includes(s.service)) return def;
  return { rank:s.rank, service:s.service };
};

// CARMS submission tracking predates this migration for any entry already
// on the device — defaulting those to "submitted" rather than suddenly
// flagging years of past shifts as outstanding. Only entries created going
// forward start out genuinely unsubmitted (see blankForm). Submission dates
// default to the shift's own date for the same reason — there's no real
// record of when a pre-existing entry was actually submitted, and falling
// back to the shift date keeps historical period attribution exactly where
// it already was rather than silently reshuffling old pay periods.
export const migrateEntries = list => (list||[]).map(e => ({
  ...e,
  otSubmitted: e.otSubmitted===undefined ? true : e.otSubmitted,
  paSubmitted: e.paSubmitted===undefined ? true : e.paSubmitted,
  otSubmittedDate: e.otSubmittedDate || e.date,
  paSubmittedDate: e.paSubmittedDate || e.date,
}));
