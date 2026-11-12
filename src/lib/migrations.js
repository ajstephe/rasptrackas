import { PAY_RATES } from './payRates.js';

// Migrate settings if they contain old rank names from a previous version
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const validPayPoint = (rank, service) => !!PAY_RATES[rank]?.[service];

export const migrateSettings = s => {
  const def = { rank:'', service:'' };
  if (!s || typeof s !== 'object') return def;
  // The last theme picked, synced so a new device opens in it (App checks
  // it's a real theme id before using it).
  const theme = typeof s.theme === 'string' && /^[a-z0-9]{2,24}$/.test(s.theme) ? s.theme : null;
  // When it was picked (ms), so the newest pick wins between devices.
  const themeAt = theme && Number.isFinite(Number(s.themeAt)) && Number(s.themeAt) > 0 ? Number(s.themeAt) : null;
  const withTheme = o => { if (theme) { o.theme = theme; if (themeAt) o.themeAt = themeAt; } return o; };
  if (!validPayPoint(s.rank, s.service)) return withTheme({ ...def });
  const out = { rank:s.rank, service:s.service };
  // Dated pay point changes (see payPointOn in payRates.js), kept only if
  // every step is a real pay point with a sensible date.
  if (Array.isArray(s.payHistory)) {
    const h = s.payHistory.filter(x => x && typeof x === 'object' && validPayPoint(x.rank, x.service) && (x.from === '' || validDate(x.from)));
    if (h.length) out.payHistory = h.map(x => ({ from:x.from, rank:x.rank, service:x.service }));
  }
  // "Overtime already paid this tax year" (see importedShares in payroll.js).
  const imp = s.paidImport;
  if (imp && typeof imp === 'object' && Number.isInteger(Number(imp.taxYear)) && Number(imp.gross) > 0 && Number(imp.amount) > 0
      && (imp.basis === 'gross' || imp.basis === 'net') && validDate(imp.upTo)) {
    out.paidImport = { taxYear:Number(imp.taxYear), amount:Number(imp.amount), basis:imp.basis, gross:Number(imp.gross), upTo:imp.upTo };
  }
  // Monthly deductions (Federation subs, ATOC, savings…), each named with a
  // monthly amount, taken off after tax or before tax and NI. The amount is
  // kept as typed so a half-entered "12." survives a save.
  if (Array.isArray(s.deductions)) {
    const d = s.deductions.filter(x => x && typeof x === 'object' && typeof x.id === 'string' && x.id.length <= 40)
      .slice(0, 30)
      .map(x => ({ id:x.id, name: typeof x.name === 'string' ? x.name.slice(0, 40) : '',
        amount: typeof x.amount === 'string' && /^\d{0,6}(\.\d{0,2})?$/.test(x.amount) ? x.amount : '',
        when: x.when === 'before' ? 'before' : 'after',
        // Pay months it's skipped, by their label ("January 2027").
        off: Array.isArray(x.off) ? x.off.filter(m => typeof m === 'string' && /^[A-Za-z]+ \d{4}$/.test(m)).slice(0, 60) : [],
        // Amount changes from a given pay month onwards.
        changes: Array.isArray(x.changes) ? x.changes.filter(c => c && typeof c.from === 'string' && /^[A-Za-z]+ \d{4}$/.test(c.from)
          && typeof c.amount === 'string' && /^\d{0,6}(\.\d{0,2})?$/.test(c.amount)).slice(0, 24).map(c => ({ from:c.from, amount:c.amount })) : [] }));
    if (d.length) out.deductions = d;
  }
  return withTheme(out);
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
