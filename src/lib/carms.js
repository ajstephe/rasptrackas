// ── CARMS bulk-select helpers — pure, no React/DOM dependency ───────────────
// carmsSelected (App.jsx) maps entry id -> which of that row's own claim
// types are ticked, e.g. { ot: true, pa: true } — an entry can carry both an
// outstanding OT and PA claim, selected independently, since CARMS
// (overtime) and MetHR (PA) are separate systems people often submit to on
// different schedules.
//
// Object.keys(carmsSelected).length counts ENTRIES, not claims, so it
// undercounts the moment a single entry has both its OT and PA boxes
// ticked — two visibly-checked rows read back as "1 selected". This counts
// markers instead, so it always matches the number of claim checkboxes
// actually ticked on screen, the same way the bulk bar's £ total already
// summed both markers on a shared entry correctly.
export const countSelectedClaims = (carmsSelected) =>
  Object.values(carmsSelected || {}).reduce((n, m) => n + (m?.ot ? 1 : 0) + (m?.pa ? 1 : 0), 0);
