import { describe, it, expect } from 'vitest';
import { migrateSettings, migrateEntries, parseBackupFile } from './migrations.js';
import { mergeRemoteRows } from './sync.js';
import { PAY_RATES } from './payRates.js';

// A real, currently-valid rank/service pair, read from PAY_RATES itself
// rather than hardcoded, so this test doesn't silently stop meaning
// anything if the pay scales are ever restructured.
const [validRank] = Object.keys(PAY_RATES);
const [validService] = Object.keys(PAY_RATES[validRank]);

describe('migrateSettings — the app\'s own defence against a rank that no longer exists', () => {
  it('passes through a genuinely valid rank/service pair unchanged', () => {
    expect(migrateSettings({ rank: validRank, service: validService }))
      .toEqual({ rank: validRank, service: validService });
  });

  it('resets to blank defaults when given null (a device that has never set anything)', () => {
    expect(migrateSettings(null)).toEqual({ rank: '', service: '' });
  });

  it('resets to blank when the rank is not a key in the current PAY_RATES table — the exact scenario a rank rename creates', () => {
    expect(migrateSettings({ rank: 'PC (old naming scheme)', service: validService }))
      .toEqual({ rank: '', service: '' });
  });

  it('resets to blank when the rank is valid but the service/pay-point is not', () => {
    expect(migrateSettings({ rank: validRank, service: 'a pay point that no longer exists' }))
      .toEqual({ rank: '', service: '' });
  });

  it('drops any extra fields beyond rank/service — only those two are ever trusted through', () => {
    expect(migrateSettings({ rank: validRank, service: validService, somethingElse: 'should not survive' }))
      .toEqual({ rank: validRank, service: validService });
  });
});

describe('migrateEntries', () => {
  it('defaults missing CARMS submission fields to already-submitted, dated to the shift itself', () => {
    const [migrated] = migrateEntries([{ id: 'a1', date: '2026-01-15', hours133: 2 }]);
    expect(migrated).toMatchObject({
      otSubmitted: true, paSubmitted: true,
      otSubmittedDate: '2026-01-15', paSubmittedDate: '2026-01-15',
    });
  });

  it('leaves an entry that already has these fields untouched', () => {
    const entry = { id: 'a1', date: '2026-01-15', otSubmitted: false, paSubmitted: true, otSubmittedDate: '2026-01-10', paSubmittedDate: '2026-01-12' };
    const [migrated] = migrateEntries([entry]);
    expect(migrated).toEqual(entry);
  });

  it('handles a missing or null list without throwing', () => {
    expect(migrateEntries(null)).toEqual([]);
    expect(migrateEntries(undefined)).toEqual([]);
  });
});

describe('parseBackupFile — the fix for a wrong-file-picked crash', () => {
  it('accepts a genuine backup and migrates entries/settings the same way local boot would', () => {
    const backup = JSON.stringify({
      entries: [{ id: 'a1', date: '2026-01-15', hours133: 2 }], // pre-CARMS-tracking shape
      settings: { rank: validRank, service: validService },
      toilTaken: [{ id: 't1', date: '2026-01-01', hours: 3 }],
    });
    const result = parseBackupFile(backup);
    expect(result.ok).toBe(true);
    expect(result.entries[0]).toMatchObject({ otSubmitted: true, paSubmitted: true, otSubmittedDate: '2026-01-15' });
    expect(result.settings).toEqual({ rank: validRank, service: validService });
    expect(result.toilTaken).toEqual([{ id: 't1', date: '2026-01-01', hours: 3, note: '' }]);
    expect(result.skipped).toBe(0);
  });

  it('does not run toilTaken through migrateEntries — it has no CARMS-submission fields to default', () => {
    const backup = JSON.stringify({ entries: [], toilTaken: [{ id: 't1', date: '2026-01-01', hours: 3 }] });
    const result = parseBackupFile(backup);
    expect(result.toilTaken[0]).not.toHaveProperty('otSubmitted');
    expect(result.toilTaken[0]).not.toHaveProperty('otSubmittedDate');
  });

  it('keeps your current settings when an older backup has none, and defaults toilTaken', () => {
    const result = parseBackupFile(JSON.stringify({ entries: [] }));
    expect(result).toEqual({ ok: true, entries: [], settings: null, toilTaken: [], skipped: 0 });
  });

  it('skips damaged records instead of letting them crash the app, and says how many', () => {
    const result = parseBackupFile(JSON.stringify({
      entries: [null, {}, { id:'e1' }, { id:'e2', date:'2026-05-01', hours133:'1' }],
      toilTaken: [{ id:'t1', hours:2 }, { id:'t2', date:'2026-05-02', hours:'1.5' }],
    }));
    expect(result.ok).toBe(true);
    expect(result.entries.map(e=>e.id)).toEqual(['e2']);
    expect(result.toilTaken).toEqual([{ id:'t2', date:'2026-05-02', hours:1.5, note:'' }]);
    expect(result.skipped).toBe(4);
  });

  it('keeps a dated pay point history in settings, dropping any broken steps', () => {
    const s = migrateSettings({ rank: validRank, service: validService, payHistory:[ { from:'', rank:validRank, service:validService }, { from:'nope', rank:validRank, service:validService }, { from:'2026-10-01', rank:'X', service:'Y' } ] });
    expect(s.payHistory).toEqual([{ from:'', rank:validRank, service:validService }]);
  });

  it('rejects text that is not valid JSON at all — the wrong file entirely — instead of throwing', () => {
    const result = parseBackupFile('this is not json');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/backup/i);
  });

  it('rejects valid JSON that is missing entries, or has entries in the wrong shape — the crash this fix exists for', () => {
    expect(parseBackupFile(JSON.stringify({ settings: {} })).ok).toBe(false);
    expect(parseBackupFile(JSON.stringify({ entries: 'not an array' })).ok).toBe(false);
    expect(parseBackupFile(JSON.stringify(null)).ok).toBe(false);
    expect(parseBackupFile(JSON.stringify(42)).ok).toBe(false);
  });
});

describe('migrateEntries applied to a pull result — the fix for entries syncing in unmigrated', () => {
  it('an entry with no otSubmitted field at all, arriving fresh from a pull that has never seen it before, gets backfilled to submitted — matching what local boot and backup restore already did', () => {
    // Mirrors exactly what App.jsx's pullAndMergeRows now does: run
    // mergeRemoteRows' result through migrateEntries for the entries table.
    // Before this fix that second step didn't happen, so an entry like
    // this reached state with otSubmitted still undefined — safe for
    // isOtSubmitted's own dashboard-facing check, but not for the edit
    // form, which reads the field directly.
    const remoteMap = new Map([
      ['a1', { id: 'a1', date: '2020-01-15', hours133: 3 }], // no otSubmitted/paSubmitted at all
    ]);
    const merged = mergeRemoteRows([], remoteMap, new Map(), () => true);
    const result = migrateEntries(merged);
    expect(result[0]).toMatchObject({ otSubmitted: true, paSubmitted: true, otSubmittedDate: '2020-01-15', paSubmittedDate: '2020-01-15' });
  });

  it('does not touch an entry that already has explicit submission fields, migrated or not', () => {
    const remoteMap = new Map([
      ['a1', { id: 'a1', date: '2026-01-15', hours133: 3, otSubmitted: false, paSubmitted: true, otSubmittedDate: '2026-01-10', paSubmittedDate: '2026-01-12' }],
    ]);
    const merged = mergeRemoteRows([], remoteMap, new Map(), () => true);
    const result = migrateEntries(merged);
    expect(result[0]).toEqual(remoteMap.get('a1'));
  });
});
