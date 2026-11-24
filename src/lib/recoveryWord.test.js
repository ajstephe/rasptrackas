import { describe, it, expect } from 'vitest';
import { normaliseRecoveryWord, recoveryWordCandidates } from './recoveryWord.js';

describe('normaliseRecoveryWord', () => {
  it('ignores capitals and outer spaces', () => {
    expect(normaliseRecoveryWord('  Toffee2011 ')).toBe('toffee2011');
  });
  it('collapses inner runs of spaces', () => {
    expect(normaliseRecoveryWord('Kettle   Moss\tOrbit')).toBe('kettle moss orbit');
  });
  it('handles empty input', () => {
    expect(normaliseRecoveryWord(undefined)).toBe('');
  });
});

describe('recoveryWordCandidates', () => {
  it('tries exact, then trimmed, then normalised', () => {
    expect(recoveryWordCandidates(' Toffee ')).toEqual([' Toffee ', 'Toffee', 'toffee']);
  });
  it('does not repeat identical candidates', () => {
    expect(recoveryWordCandidates('toffee')).toEqual(['toffee']);
  });
});
