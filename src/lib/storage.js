// ─── storage ──────────────────────────────────────────────────────────────────
export const KEYS = {
  entries:'ajs_ot_entries', settings:'ajs_ot_settings',
  backupCount:'ajs_ot_backupCount', backedUpAt:'ajs_ot_backedUpAt',
  lastBackupReminder:'ajs_ot_lastBackupReminder',
  defaultBreakdownView:'ajs_ot_defaultBreakdownView',
  toilTaken:'ajs_ot_toilTaken',
  lastSeenFYYear:'ajs_ot_lastSeenFYYear',
  lastSyncedEntries:'ajs_ot_lastSyncedEntries',
  lastSyncedToilTaken:'ajs_ot_lastSyncedToilTaken',
  lastSyncedSettings:'ajs_ot_lastSyncedSettings',
  lastCloudPruneCheck:'ajs_ot_lastCloudPruneCheck',
};
export const dualWrite = (key, val) => {
  const s = JSON.stringify(val);
  try { localStorage.setItem(key,s); }   catch(_){}
  try { sessionStorage.setItem(key,s); } catch(_){}
};
export const dualRead = (key, fb) => {
  try { const v=localStorage.getItem(key);   if(v) return JSON.parse(v); } catch(_){}
  try { const v=sessionStorage.getItem(key); if(v) return JSON.parse(v); } catch(_){}
  return fb;
};
