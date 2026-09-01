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
//
// __t alone isn't fine-grained enough: Date.now() is millisecond-resolution,
// and two dualWrite calls in the same tick of the same page (a delete
// immediately followed by an Undo, say) can easily land on the same
// millisecond, especially on a fast engine. __seq is a strictly-increasing
// counter local to this page load, used purely to break an __t tie between
// two writes that happened moments apart in this same session — it's
// meaningless across a reload (it resets to 0), but a tie in __t across two
// genuinely different page loads is astronomically unlikely anyway, since
// that requires two separate real-world moments in time to round to the
// exact same millisecond.
let writeSeq = 0;
const wrap = (val) => ({ __v: val, __t: Date.now(), __seq: ++writeSeq });

// Recognises the wrapper shape written by the current dualWrite, but also
// accepts a bare, unwrapped value with no real timestamp — every key
// written before this change is stored that way, and this can't assume a
// clean slate on a real device. An unwrapped legacy value gets -Infinity
// for both __t and __seq so a wrapped value from the other store, which
// always carries a real timestamp, wins the freshness comparison below.
const unwrap = (parsed) => {
  if (parsed && typeof parsed === 'object' && '__v' in parsed && '__t' in parsed) {
    return { __v: parsed.__v, __t: parsed.__t, __seq: parsed.__seq ?? -Infinity };
  }
  return { __v: parsed, __t: -Infinity, __seq: -Infinity };
};

// True when `a` should be preferred over `b` — newer __t wins outright;
// only on an exact __t tie does __seq decide it.
const isNewerOrEqual = (a, b) => a.__t !== b.__t ? a.__t > b.__t : a.__seq >= b.__seq;

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
  if (local && session) return (isNewerOrEqual(local, session) ? local : session).__v;
  if (local) return local.__v;
  if (session) return session.__v;
  return fb;
};
