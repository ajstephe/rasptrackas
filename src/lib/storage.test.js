import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dualWrite, dualRead } from './storage.js';

// This project's tests don't run under jsdom (see vite.config.js) — no
// existing test needed a DOM, so nothing pulled it in — and plain Node has
// no global localStorage/sessionStorage either. A minimal stand-in,
// covering only what dualWrite/dualRead actually call, is enough to
// exercise the real module rather than reimplementing its logic in the
// test.
function makeFakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

let fakeLocal, fakeSession;
beforeEach(() => {
  fakeLocal = makeFakeStorage();
  fakeSession = makeFakeStorage();
  vi.stubGlobal('localStorage', fakeLocal);
  vi.stubGlobal('sessionStorage', fakeSession);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('dualWrite / dualRead — basic round trip', () => {
  it('writes reach both underlying stores and read back the value written', () => {
    dualWrite('k', { a: 1, list: [1, 2, 3] });
    expect(dualRead('k', null)).toEqual({ a: 1, list: [1, 2, 3] });
    expect(fakeLocal.getItem('k')).not.toBeNull();
    expect(fakeSession.getItem('k')).not.toBeNull();
  });

  it('returns the fallback when the key has never been written to either store', () => {
    expect(dualRead('missing', 'fallback')).toBe('fallback');
  });

  it('returns a genuinely falsy stored value rather than mistaking it for "never written"', () => {
    dualWrite('nullKey', null);
    expect(dualRead('nullKey', 'should not see this')).toBeNull();
    dualWrite('falseKey', false);
    expect(dualRead('falseKey', 'nope')).toBe(false);
    dualWrite('zeroKey', 0);
    expect(dualRead('zeroKey', 'nope')).toBe(0);
  });
});

describe('dualWrite / dualRead — the freshness fix', () => {
  it('prefers whichever store holds the newer write, not localStorage unconditionally', () => {
    // Hand-crafted directly rather than via two timed dualWrite calls —
    // this pins down dualRead's actual comparison rule against the wrapper
    // shape dualWrite is documented to produce, independent of timing.
    fakeLocal.setItem('k', JSON.stringify({ __v: 'older value', __t: 100 }));
    fakeSession.setItem('k', JSON.stringify({ __v: 'newer value', __t: 200 }));
    expect(dualRead('k', null)).toBe('newer value');
  });

  it('the exact scenario this fixes: localStorage silently stops persisting, sessionStorage keeps working, reads follow sessionStorage instead of staying stuck', () => {
    dualWrite('k', 'both stores agree, all healthy');
    expect(dualRead('k', null)).toBe('both stores agree, all healthy');

    // localStorage now silently rejects every write (quota exceeded, or
    // any other persistent failure) — sessionStorage is unaffected.
    fakeLocal.setItem = () => { throw new Error('simulated quota exceeded'); };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    dualWrite('k', 'sessionStorage has this, localStorage silently failed to');

    // Before this fix, dualRead trusted localStorage unconditionally and
    // would still return the stale first value forever from here on.
    expect(dualRead('k', null)).toBe('sessionStorage has this, localStorage silently failed to');
  });

  it('logs a write failure instead of swallowing it silently', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeLocal.setItem = () => { throw new Error('simulated quota exceeded'); };
    dualWrite('k', 'value');
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls.some(args => args.join(' ').includes('localStorage write failed'))).toBe(true);
  });

  it('still reads a legacy, pre-wrapper raw value correctly — every key written before this change looks like this', () => {
    fakeLocal.setItem('legacyKey', JSON.stringify({ rank: 'Constable', service: 'PC 1' }));
    expect(dualRead('legacyKey', null)).toEqual({ rank: 'Constable', service: 'PC 1' });
  });

  it('prefers a current-format wrapped value over an unwrapped legacy one sitting in the other store', () => {
    fakeLocal.setItem('k', JSON.stringify('legacy raw value, written before this change, no real timestamp'));
    fakeSession.setItem('k', JSON.stringify({ __v: 'current wrapped value', __t: 123 }));
    expect(dualRead('k', null)).toBe('current wrapped value');
  });
});
