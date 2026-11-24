// Recovery words are forgiving about capitals and stray spaces: phones
// capitalise first letters and add trailing spaces, and someone who
// remembers the word shouldn't be locked out of their data over that.
//
// New recovery words are stored in this normalised form. Words set before
// this change were stored exactly as typed, so unlocking tries the exact
// text first, then the normalised one.
export const normaliseRecoveryWord = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

// The secrets to try when unlocking, most specific first, without repeats.
export const recoveryWordCandidates = (typed) => {
  const raw = String(typed || '');
  return [...new Set([raw, raw.trim(), normaliseRecoveryWord(raw)])].filter(Boolean);
};
