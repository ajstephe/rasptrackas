import { describe, it, expect } from 'vitest';
import { countSelectedClaims } from './carms.js';

describe('countSelectedClaims — the fix for "1 selected" showing under 2 ticked boxes', () => {
  it('counts zero for no selection', () => {
    expect(countSelectedClaims({})).toBe(0);
    expect(countSelectedClaims(undefined)).toBe(0);
  });

  it('counts one claim per entry when only one of ot/pa is ticked', () => {
    expect(countSelectedClaims({ a1: { ot: true } })).toBe(1);
    expect(countSelectedClaims({ a1: { pa: true } })).toBe(1);
  });

  it('counts both claims on a single entry that has both OT and PA ticked — the exact case that used to read "1 selected" for two checked boxes', () => {
    expect(countSelectedClaims({ a1: { ot: true, pa: true } })).toBe(2);
  });

  it('sums across multiple entries, some with one claim and some with both', () => {
    expect(countSelectedClaims({
      a1: { ot: true, pa: true },
      a2: { ot: true },
      a3: { pa: true },
    })).toBe(4);
  });

  it('ignores a falsy marker rather than counting it', () => {
    expect(countSelectedClaims({ a1: { ot: true, pa: false } })).toBe(1);
  });
});
