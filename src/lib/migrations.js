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

// Parses and validates an uploaded backup file before any of it reaches
// state — handleImport in App.jsx used to hand d.entries straight to
// setEntries with no check at all, unlike the two lines right next to it
// (migrateSettings already defends against a falsy/invalid settings
// object; d.toilTaken||[] already falls back explicitly). An entries value
// that's missing or not actually an array — the wrong file was picked, or
// a valid-JSON file that just isn't a backup — used to set entries to
// undefined, which is fatal, not silent: every entries.filter/.map/.forEach
// throughout the app assumes an array, and the very next render crashes.
// toilTaken is checked the same way but not migrated — it never had a
// CARMS-submission concept, so running migrateEntries over it would just
// bolt on fields (otSubmitted, otSubmittedDate...) that don't belong on a
// TOIL record at all.
export const parseBackupFile = jsonText => {
  let d;
  try { d = JSON.parse(jsonText); }
  catch (e) { return { ok:false, error:"That file isn't valid — it doesn't look like a backup at all." }; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.entries)) {
    return { ok:false, error:"That doesn't look like an Overtime & Shift Tracker backup file." };
  }
  return {
    ok: true,
    entries: migrateEntries(d.entries),
    settings: migrateSettings(d.settings),
    toilTaken: Array.isArray(d.toilTaken) ? d.toilTaken : [],
  };
};
