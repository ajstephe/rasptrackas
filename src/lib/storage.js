// ─── storage ──────────────────────────────────────────────────────────────────
export const KEYS = {
  entries:'ajs_ot_entries', settings:'ajs_ot_settings',
  backupCount:'ajs_ot_backupCount', backedUpAt:'ajs_ot_backedUpAt',
  lastBackupReminder:'ajs_ot_lastBackupReminder',
  defaultBreakdownView:'ajs_ot_defaultBreakdownView',
  themeMode:'ajs_ot_themeMode',
  toilTaken:'ajs_ot_toilTaken',
  lastSeenFYYear:'ajs_ot_lastSeenFYYear',
  lastSyncedEntries:'ajs_ot_lastSyncedEntries',
  lastSyncedToilTaken:'ajs_ot_lastSyncedToilTaken',
  lastSyncedSettings:'ajs_ot_lastSyncedSettings',
  lastCloudPruneCheck:'ajs_ot_lastCloudPruneCheck',
  // Distinct from the three lastSynced* keys above, which store per-row
  // sync bookkeeping (snapshots used to detect pending local edits) — this
  // is just a plain timestamp of the last successful sync of any kind, for
  // the "Synced 4 minutes ago" display under the Sync button.
  lastSyncedAt:'ajs_ot_lastSyncedAt',
};

// Every value is wrapped with a write timestamp (__t) before being
// stringified — see dualRead below for why. __v/__t rather than plainer
// names like v/t specifically to make an accidental collision with a
// genuine stored shape (an object value that happens to itself have a `v`
// or `t` key) implausible.
const wrap = (val) => ({ __v: val, __t: Date.now() });

// Recognises the wrapper shape written by the current dualWrite, but also
// accepts a bare, unwrapped value with no real timestamp — every key
// written before this change is stored that way, and this can't assume a
// clean slate on a real device. An unwrapped legacy value gets -Infinity
// so a wrapped value from the other store, which always carries a real
// timestamp, wins the freshness comparison in dualRead below.
const unwrap = (parsed) => {
  if (parsed && typeof parsed === 'object' && '__v' in parsed && '__t' in parsed) return parsed;
  return { __v: parsed, __t: -Infinity };
};

export const dualWrite = (key, val) => {
  const s = JSON.stringify(wrap(val));
  // A failure here used to be swallowed with no trace at all. If
  // localStorage ever stops persisting silently (quota exceeded is the
  // realistic case for an app that's been logging years of encrypted shift
  // data) while sessionStorage keeps working, dualRead's old fixed
  // priority — always trust localStorage if anything is there — meant
  // every future read stayed stuck on whatever stale value made it through
  // before the failures started, forever, with nothing anywhere to notice.
  // Logging doesn't prevent that on its own; the __t-based freshness check
  // in dualRead below is what actually stops reads from getting stuck, but
  // a real occurrence should still be discoverable rather than invisible.
  try { localStorage.setItem(key,s); }   catch(e){ console.error(`[storage] localStorage write failed for ${key}:`, e.message||e); }
  try { sessionStorage.setItem(key,s); } catch(e){ console.error(`[storage] sessionStorage write failed for ${key}:`, e.message||e); }
};

export const dualRead = (key, fb) => {
  let local, session;
  try { const raw=localStorage.getItem(key);   if(raw) local=unwrap(JSON.parse(raw));   } catch(e){ console.error(`[storage] localStorage read failed for ${key}:`, e.message||e); }
  try { const raw=sessionStorage.getItem(key); if(raw) session=unwrap(JSON.parse(raw)); } catch(e){ console.error(`[storage] sessionStorage read failed for ${key}:`, e.message||e); }
  // Prefer whichever store actually has the newer write, rather than
  // localStorage unconditionally — this is the fix for the scenario above:
  // once localStorage starts silently rejecting writes, its __t stops
  // advancing, so a still-working sessionStorage naturally overtakes it
  // and gets read instead, rather than being permanently shadowed by a
  // localStorage value that merely exists.
  if (local && session) return (local.__t >= session.__t ? local : session).__v;
  if (local) return local.__v;
  if (session) return session.__v;
  return fb;
};
