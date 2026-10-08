import { describe, it, expect } from 'vitest';
import { fmt, fmtGBP, fmtHrs, payLabel, shiftSpan } from './format.js';

describe('fmtHrs', () => {
  it('reads as hours and minutes, dropping whichever part is zero', () => {
    expect(fmtHrs(1.25)).toBe('1h 15m');
    expect(fmtHrs(2)).toBe('2h');
    expect(fmtHrs(2/3)).toBe('40m');
    expect(fmtHrs(0)).toBe('0h');
    expect(fmtHrs(21.75)).toBe('21h 45m');
  });
  it('rounds 59.5+ minutes up into the next hour', () => {
    expect(fmtHrs(1.9999999999999998)).toBe('2h');
    expect(fmtHrs(0.9999)).toBe('1h');
  });
  it('marks negatives with a real minus sign and ignores float drift', () => {
    expect(fmtHrs(-1.5)).toBe('\u22121h 30m');
    expect(fmtHrs(-1e-13)).toBe('0h');
  });
});

describe('pay period labels', () => {
  it('names the pay month and the shift dates it covers', () => {
    expect(payLabel('November 2026')).toBe('November pay');
    expect(shiftSpan('2026-09-07','2026-10-11')).toBe('Shifts 7 Sept – 11 Oct');
  });
});

describe('fmt', () => {
  it('writes money with a thousands comma, the same as fmtGBP', () => {
    expect(fmt(4948.9)).toBe('£4,948.90');
    expect(fmt(22338.96)).toBe('£22,338.96');
    expect(fmt(82.925)).toBe(fmtGBP(82.925));
    expect(fmt(0)).toBe('£0.00');
  });
});
