import { describe, it, expect } from 'vitest';
import { migrateSettings, migrateEntries } from './migrations.js';
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
