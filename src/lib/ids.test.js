import { describe, it, expect, vi, afterEach } from 'vitest';
import { genRecordId } from './ids.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('genRecordId — the fix for the same-millisecond collision', () => {
  it('produces a different id even when Date.now() returns the exact same millisecond twice — the collision this exists to prevent', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1735689600123);
    const a = genRecordId();
    const b = genRecordId();
    expect(a).not.toBe(b);
  });

  it('starts with the millisecond timestamp, so it stays sortable/inspectable the way the old bare Date.now().toString() id was', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1735689600123);
    expect(genRecordId().startsWith('1735689600123-')).toBe(true);
  });

  it('is generated in enough real bulk without a collision to be confident in practice', () => {
    const ids = new Set(Array.from({ length: 10000 }, () => genRecordId()));
    expect(ids.size).toBe(10000);
  });

  describe('does not break the one place two ids get compared for order (App.jsx\'s same-date cross-period tiebreak, x.id<e.id)', () => {
    it('an id from an earlier millisecond still sorts before one from a later millisecond', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const earlier = genRecordId();
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      const later = genRecordId();
      expect(earlier < later).toBe(true);
    });

    it('two ids from the exact same millisecond still compare consistently one way or the other (a stable tiebreak, not undefined behaviour)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1735689600123);
      const a = genRecordId();
      const b = genRecordId();
      // Whichever direction it goes, it must be consistent and mutually exclusive.
      expect(a < b || b < a).toBe(true);
      expect(a < b && b < a).toBe(false);
    });
  });
});
