// Shared safety check behind every place remote data is allowed to
// overwrite something local: is there a real, unsynced local edit sitting
// on this item right now, or is it safe to take the remote copy?
//
// "Safe to take the remote copy" covers two genuinely different cases that
// are easy to conflate (conflating them was exactly the round-12 cold-start
// bug): a device with no local copy of this item at all (currentItem is
// null/undefined — nothing to protect), and a device that HAS a local copy
// but has never synced this id before (priorSyncedJson is undefined — a
// fresh sign-in, or the very first sync after install, not a pending
// edit). Only when priorSyncedJson is a real prior value that no longer
// matches the current local item is there something worth protecting.
export function hasNoPendingLocalEdit(currentItem, priorSyncedJson) {
  if (!currentItem) return true;
  if (priorSyncedJson === undefined) return true;
  return priorSyncedJson === JSON.stringify(currentItem);
}

// What pushRowChanges needs to upload: local items whose JSON no longer
// matches what this device last believes it pushed (toUpsert), and ids
// this device used to track but no longer has locally (toDelete — a local
// deletion still waiting to be soft-deleted server-side).
//
// Deliberately naive about lastSyncedMap being empty: on a device with no
// sync history at all, every local item's JSON fails to match (there's
// nothing to match against), so every one of them comes back as needing
// upsert — including ones the caller may be about to overwrite with a
// pull that just hasn't reconciled them yet. This function can't tell
// that apart from a genuinely new item; only the caller can, by not
// calling this until the initial pull has actually finished (see
// initialSyncDoneRef in App.jsx). That's a caller responsibility, not a
// bug in the diff itself — it's exactly why the guard exists.
export function computeRowPushDiff(items, lastSyncedMap) {
  const currentIds = new Set(items.map(it => it.id));
  const toUpsert = items.filter(it => lastSyncedMap.get(it.id) !== JSON.stringify(it));
  const toDelete = Array.from(lastSyncedMap.keys()).filter(id => !currentIds.has(id));
  return { toUpsert, toDelete };
}

// Pure merge logic for reconciling a device's local rows (entries /
// toil_taken) against what was just pulled from Supabase. Extracted out of
// App.jsx's pullAndMergeRows so the decision logic — the part that's
// actually easy to get subtly wrong, as the neverSynced bug below proved —
// can be unit tested directly, without spinning up a fake Supabase client.
//
// Mutates lastSyncedMap in place (recording what's now known-synced) and
// returns the merged array, matching pullAndMergeRows' original inline
// behaviour exactly — this is a pure extraction, not a behaviour change.
//
// remoteMap is consumed: rows this device already has locally are deleted
// out of it as they're matched, exactly as pullAndMergeRows relied on, so
// what's left afterward is remote-only rows.
export function mergeRemoteRows(localItems, remoteMap, lastSyncedMap, isWithinCloudRetention) {
  const merged = [];
  for (const localItem of localItems) {
    if (remoteMap.has(localItem.id)) {
      const remoteItem = remoteMap.get(localItem.id);
      const noPendingLocalEdit = hasNoPendingLocalEdit(localItem, lastSyncedMap.get(localItem.id));
      if (noPendingLocalEdit) {
        merged.push(remoteItem);
        lastSyncedMap.set(localItem.id, JSON.stringify(remoteItem));
      } else {
        merged.push(localItem);
      }
      remoteMap.delete(localItem.id);
    } else if (!lastSyncedMap.has(localItem.id)) {
      merged.push(localItem); // never synced yet — keep, will push shortly
    } else if (!isWithinCloudRetention(localItem.date)) {
      // Was synced before, now gone from the cloud — but this item is older
      // than the retention window, so its absence is expected (pruned for
      // storage, not a deletion on another device). Kept locally without
      // limit; not re-pushed either, since deliberately pruned data
      // shouldn't just reappear in the cloud on its own.
      merged.push(localItem);
    }
    // else: was synced before, still within the retention window, but gone
    // from the server now — genuinely deleted elsewhere, drop it.
  }
  for (const [id, remoteItem] of remoteMap) {
    // A remote-only row this device's lastSyncedMap already knows about
    // isn't a new row from elsewhere — it's one THIS device deleted
    // locally, whose soft-delete push (deliberately no retry queue) just
    // hasn't landed on the server yet. Pulling in that exact gap — a
    // realtime reconnect, or syncing right after deleting something — used
    // to resurrect it here and re-mark it synced, undoing the deletion for
    // good. A genuinely new row from another device was never in this
    // device's lastSyncedMap to begin with, so this only skips the case
    // it's meant to.
    if (lastSyncedMap.has(id)) continue;
    merged.push(remoteItem);
    lastSyncedMap.set(id, JSON.stringify(remoteItem));
  }
  return merged;
}
