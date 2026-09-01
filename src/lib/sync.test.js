import { describe, it, expect } from 'vitest';
import { mergeRemoteRows } from './sync.js';

// isWithinCloudRetention stubs — the real one only matters for the
// "synced before, now gone remotely" branch, so tests that don't touch
// that branch use a stub that would fail loudly if it were ever consulted.
const neverCalled = () => { throw new Error('isWithinCloudRetention should not have been called'); };
const alwaysWithin = () => true;
const neverWithin = () => false;

describe('mergeRemoteRows — cold-start (device has never synced before)', () => {
  it('takes the remote copy when a fresh device has a different local value for the same id — the round-12 bug', () => {
    // This is exactly the scenario that shipped broken: a device whose
    // lastSyncedMap is empty (real account, first sign-in on this browser)
    // has a locally-stale row sharing an id with a different, correct
    // remote row. Before the fix, undefined !== JSON.stringify(local) read
    // as "pending edit" and kept the stale local row, then would have
    // pushed it back over the server on the next push cycle.
    const local = [{ id: 'a1', hours: 4, note: 'stale local guess' }];
    const remoteMap = new Map([['a1', { id: 'a1', hours: 9.5, note: 'correct remote value' }]]);
    const lastSynced = new Map(); // empty — never synced before

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverCalled);

    expect(merged).toEqual([{ id: 'a1', hours: 9.5, note: 'correct remote value' }]);
    // Must also record it as synced now, so the very next push cycle
    // doesn't re-push the (now-discarded) local version.
    expect(lastSynced.get('a1')).toBe(JSON.stringify({ id: 'a1', hours: 9.5, note: 'correct remote value' }));
  });

  it('still takes the remote copy on cold start when local and remote happen to already match', () => {
    const item = { id: 'a1', hours: 9.5 };
    const local = [item];
    const remoteMap = new Map([['a1', { id: 'a1', hours: 9.5 }]]);
    const lastSynced = new Map();

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverCalled);

    expect(merged).toEqual([{ id: 'a1', hours: 9.5 }]);
    expect(lastSynced.has('a1')).toBe(true);
  });

  it('keeps a genuinely new local row on cold start when the id does not exist remotely at all', () => {
    const local = [{ id: 'new1', hours: 3 }];
    const remoteMap = new Map(); // nothing on the server yet
    const lastSynced = new Map();

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverCalled);

    expect(merged).toEqual([{ id: 'new1', hours: 3 }]);
    // Not marked synced — it hasn't been pushed yet, only kept so the next
    // push cycle picks it up.
    expect(lastSynced.has('new1')).toBe(false);
  });
});

describe('mergeRemoteRows — a device with real sync history', () => {
  it('takes the remote copy when the local row matches what was last synced (no pending edit)', () => {
    const remoteItem = { id: 'a1', hours: 9.5 };
    const local = [{ id: 'a1', hours: 9.5 }];
    const remoteMap = new Map([['a1', remoteItem]]);
    const lastSynced = new Map([['a1', JSON.stringify({ id: 'a1', hours: 9.5 })]]);

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverCalled);

    expect(merged).toEqual([remoteItem]);
  });

  it('keeps the local row when it has a genuine pending edit since the last sync', () => {
    const local = [{ id: 'a1', hours: 5, note: 'edited locally, not pushed yet' }];
    const remoteMap = new Map([['a1', { id: 'a1', hours: 9.5, note: 'older remote value' }]]);
    // lastSynced reflects what this device last knew the row to be BEFORE
    // the local edit — proof there was a real prior sync, and the local
    // copy has since diverged from it.
    const lastSynced = new Map([['a1', JSON.stringify({ id: 'a1', hours: 9.5, note: 'older remote value' })]]);

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverCalled);

    expect(merged).toEqual([{ id: 'a1', hours: 5, note: 'edited locally, not pushed yet' }]);
    // A real pending edit must not be marked synced against the remote
    // value it's trying to overwrite.
    expect(lastSynced.get('a1')).toBe(JSON.stringify({ id: 'a1', hours: 9.5, note: 'older remote value' }));
  });

  it('drops a row that was synced before, is now gone remotely, and is within the retention window — genuine deletion elsewhere', () => {
    const local = [{ id: 'a1', date: '2026-08-01', hours: 5 }];
    const remoteMap = new Map(); // deleted on another device
    const lastSynced = new Map([['a1', JSON.stringify({ id: 'a1', date: '2026-08-01', hours: 5 })]]);

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, alwaysWithin);

    expect(merged).toEqual([]);
  });

  it('keeps a row that was synced before, is now gone remotely, but is outside the retention window — expected pruning, not a deletion', () => {
    const local = [{ id: 'old1', date: '2020-01-01', hours: 5 }];
    const remoteMap = new Map(); // pruned server-side for storage
    const lastSynced = new Map([['old1', JSON.stringify({ id: 'old1', date: '2020-01-01', hours: 5 })]]);

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverWithin);

    expect(merged).toEqual([{ id: 'old1', date: '2020-01-01', hours: 5 }]);
  });

  it('does not resurrect a row this device already deleted locally and is still waiting to push', () => {
    // Row is gone from local state (already deleted here) but the
    // soft-delete push hasn't landed yet, so it's still on the server and
    // still shows up in remoteMap. lastSynced still has the id from before
    // the deletion — that's the signal this device already knows about it
    // and shouldn't treat it as new.
    const local = []; // deleted locally
    const remoteMap = new Map([['a1', { id: 'a1', hours: 9.5, deleted_at: null }]]);
    const lastSynced = new Map([['a1', JSON.stringify({ id: 'a1', hours: 9.5 })]]);

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverCalled);

    expect(merged).toEqual([]);
  });

  it('pulls in a genuinely new row from another device', () => {
    const local = [];
    const remoteItem = { id: 'fromOtherDevice', hours: 6 };
    const remoteMap = new Map([['fromOtherDevice', remoteItem]]);
    const lastSynced = new Map(); // never seen this id before, on an otherwise-experienced device

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, neverCalled);

    expect(merged).toEqual([remoteItem]);
    expect(lastSynced.get('fromOtherDevice')).toBe(JSON.stringify(remoteItem));
  });
});

describe('mergeRemoteRows — mixed, multi-row scenarios', () => {
  it('resolves every branch correctly in a single pass across several rows at once', () => {
    const local = [
      { id: 'coldStartConflict', hours: 1 },       // cold start, differs from remote → remote wins
      { id: 'pendingEdit', hours: 2 },              // real pending edit → local wins
      { id: 'deletedElsewhere', date: '2026-08-01', hours: 3 }, // gone remotely, within retention → dropped
      { id: 'prunedOld', date: '2020-01-01', hours: 4 },        // gone remotely, outside retention → kept
    ];
    const remoteMap = new Map([
      ['coldStartConflict', { id: 'coldStartConflict', hours: 99 }],
      ['pendingEdit', { id: 'pendingEdit', hours: 88 }],
      ['newFromOtherDevice', { id: 'newFromOtherDevice', hours: 77 }],
    ]);
    const lastSynced = new Map([
      // coldStartConflict absent — never synced
      ['pendingEdit', JSON.stringify({ id: 'pendingEdit', hours: 88 })],
      ['deletedElsewhere', JSON.stringify({ id: 'deletedElsewhere', date: '2026-08-01', hours: 3 })],
      ['prunedOld', JSON.stringify({ id: 'prunedOld', date: '2020-01-01', hours: 4 })],
      // newFromOtherDevice absent — genuinely new
    ]);
    const isWithinCloudRetention = (date) => date === '2026-08-01'; // only the recent one is "within"

    const merged = mergeRemoteRows(local, remoteMap, lastSynced, isWithinCloudRetention);

    expect(merged).toEqual(expect.arrayContaining([
      { id: 'coldStartConflict', hours: 99 },
      { id: 'pendingEdit', hours: 2 },
      { id: 'prunedOld', date: '2020-01-01', hours: 4 },
      { id: 'newFromOtherDevice', hours: 77 },
    ]));
    expect(merged).toHaveLength(4); // deletedElsewhere correctly dropped
  });
});
