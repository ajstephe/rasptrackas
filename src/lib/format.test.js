import { describe, it, expect } from 'vitest';
import { fmtHM } from './format.js';

describe('fmtHM', () => {
  it('formats whole and fractional hours as H.MM (minutes, not a decimal fraction)', () => {
    expect(fmtHM(21.5)).toBe('21.30');
    expect(fmtHM(0)).toBe('0.00');
    expect(fmtHM(2)).toBe('2.00');
  });

  it('carries a minutes rounding of 60 into the next hour', () => {
    // 1.999999999999998 is exactly the kind of value repeated float
    // addition produces for "really 2 hours" — abs-h*60 rounds to 60,
    // not 59, and that must roll into the hour rather than print "1.60".
    expect(fmtHM(1.9999999999999998)).toBe('2.00');
  });

  it('keeps the sign for a genuine negative amount', () => {
    expect(fmtHM(-1.5)).toBe('-1.30');
  });

  describe('the fix: a value that is mathematically zero plus floating-point drift', () => {
    it('does not print "-0.00" for a tiny negative drift around zero', () => {
      expect(fmtHM(-0.0000000001)).toBe('0.00');
      expect(fmtHM(-1e-13)).toBe('0.00');
    });

    it('does not print a false near-zero for a tiny positive drift either', () => {
      expect(fmtHM(0.0000000001)).toBe('0.00');
    });

    it('still treats a real, deliberately small negative value as negative — the clamp is for float noise, not for genuinely small numbers', () => {
      expect(fmtHM(-0.02)).toBe('-0.01');
    });
  });
});
