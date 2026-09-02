// ── Privacy notice versioning ────────────────────────────────────────────────
// Bump this whenever PrivacyNotice.jsx's content changes in any way that
// affects what someone agreed to (new data collected, new recipient, changed
// retention, etc.) — purely cosmetic edits don't need a bump. Sign-up records
// whichever version was current at the moment the consent checkbox was
// ticked (user_keys.privacy_version), so a bump here only changes what NEW
// sign-ups are recorded against; it never rewrites anyone's existing record.
export const PRIVACY_VERSION = '2026-09-02';

// Sign-up (AuthScreens.handleSignUp, in App.jsx) can't always write straight
// to user_keys — if email confirmation is required there's no session yet
// to write under. The consent tick itself still happens at the checkbox, at
// the real moment of collection; this just carries that moment across the
// gap until handleRecoverySetup's upsert can actually persist it, the same
// deferral pattern the DEK setup itself already uses for the same reason.
const PENDING_KEY = 'ot_pending_privacy_consent';

export function stashPendingConsent() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ version: PRIVACY_VERSION, acceptedAt: new Date().toISOString() }));
  } catch { /* best-effort — worst case the fallback below still records something */ }
}

export function takePendingConsent() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to the default below */ }
  return { version: PRIVACY_VERSION, acceptedAt: new Date().toISOString() };
}
