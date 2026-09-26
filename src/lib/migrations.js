import { PAY_RATES } from './payRates.js';

// Migrate settings if they contain old rank names from a previous version
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const validPayPoint = (rank, service) => !!PAY_RATES[rank]?.[service];

export const migrateSettings = s => {
  const def = { rank:'', service:'' };
  if (!s || typeof s !== 'object') return def;
  if (!validPayPoint(s.rank, s.service)) return def;
  const out = { rank:s.rank, service:s.service };
  // Dated pay point changes (see payPointOn in payRates.js), kept only if
  // every step is a real pay point with a sensible date.
  if (Array.isArray(s.payHistory)) {
    const h = s.payHistory.filter(x => x && typeof x === 'object' && validPayPoint(x.rank, x.service) && (x.from === '' || validDate(x.from)));
    if (h.length) out.payHistory = h.map(x => ({ from:x.from, rank:x.rank, service:x.service }));
  }
  return out;
};

// Records that could crash the app (not an object, no id, or no proper
// date) are dropped rather than trusted — whether they come from this
// device's storage, a backup file or the cloud.
const isRecord = x => x && typeof x === 'object' && x.id != null && validDate(x.date);
export const cleanToilTaken = list => (Array.isArray(list) ? list : [])
  .filter(t => isRecord(t) && Number.isFinite(Number(t.hours)))
  .map(t => ({ ...t, hours: Number(t.hours), note: typeof t.note === 'string' ? t.note : '' }));

// CARMS submission tracking predates this migration for any entry already
// on the device — defaulting those to "submitted" rather than suddenly
// flagging years of past shifts as outstanding. Only entries created going
// forward start out genuinely unsubmitted (see blankForm). Submission dates
// default to the shift's own date for the same reason — there's no real
// record of when a pre-existing entry was actually submitted, and falling
// back to the shift date keeps historical period attribution exactly where
// it already was rather than silently reshuffling old pay periods.
export const migrateEntries = list => (Array.isArray(list) ? list : []).filter(isRecord).map(e => ({
  ...e,
  otSubmitted: e.otSubmitted===undefined ? true : e.otSubmitted,
  paSubmitted: e.paSubmitted===undefined ? true : e.paSubmitted,
  otSubmittedDate: validDate(e.otSubmittedDate) ? e.otSubmittedDate : e.date,
  paSubmittedDate: validDate(e.paSubmittedDate) ? e.paSubmittedDate : e.date,
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
  const entries = migrateEntries(d.entries);
  const toilTaken = cleanToilTaken(d.toilTaken);
  const skipped = (d.entries.length - entries.length) + ((Array.isArray(d.toilTaken) ? d.toilTaken.length : 0) - toilTaken.length);
  return {
    ok: true,
    entries,
    // An older backup without settings keeps the rank and pay point you
    // already have, rather than blanking them.
    settings: d.settings ? migrateSettings(d.settings) : null,
    toilTaken,
    skipped,
  };
};
