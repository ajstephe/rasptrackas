// Id for a new entries/toil_taken row — this app's actual database primary
// key (id text primary key, no server-side default; the client is entirely
// responsible for uniqueness). Bare Date.now().toString() used to be used
// directly for this: two saves landing on the same millisecond —
// realistically, two signed-in devices logging a shift within the same
// second of each other, which is exactly the multi-device scenario this app
// is built for — would collide, and the second push's upsert would
// silently replace the first shift's row rather than merge with it.
// App.jsx's own addToast already appends Math.random() to its own (much
// lower-stakes, never persisted or synced) ids for the same reason; this
// gives the actual database rows the same protection.
//
// Appended after the timestamp rather than interleaved so the one place two
// ids get compared for order rather than equality (App.jsx's same-date
// cross-period tiebreak, x.id<e.id) keeps working exactly as before: a
// plain string comparison of same-length numeric prefixes still sorts
// chronologically, and only reaches the random suffix when the timestamps
// already tie — precisely the collision this exists to break.
export const genRecordId = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
