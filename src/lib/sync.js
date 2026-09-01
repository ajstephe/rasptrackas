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
      // A device with no sync history at all for this id (never synced
      // before — a fresh sign-in, or the very first sync after this app was
      // installed) isn't the same case as "synced before, edited since":
      // lastSyncedMap.get(id) comes back undefined either way, and
      // undefined === JSON.stringify(localItem) is always false, which used
      // to make a cold start look identical to a genuine pending edit and
      // keep the local row over the server's — silently, since the else
      // branch below never touches lastSyncedMap, so the next push would
      // then write that stale local row back over the correct remote one
      // for real. Matches pullAndMergeSettings's already-correct
      // neverSynced handling.
      const neverSynced = !lastSyncedMap.has(localItem.id);
      const noPendingLocalEdit = neverSynced || lastSyncedMap.get(localItem.id) === JSON.stringify(localItem);
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
