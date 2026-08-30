import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";

import {
  CURRENT_FY_YEAR, PAY_PERIODS, FY_START, FY_END, getFYStartYearFor, generateFYPeriods,
  CLOUD_RETENTION_CUTOFF, isWithinCloudRetention, RATE_CHANGE_DATE,
  daysInclusive, buildCalendarWeeks,
  getUKTaxYearStart, addYearMinusOneDay, taxYearFractionForDate,
} from './lib/payPeriods.js';
import {
  PAY_RATES, PA_RATES, PA_LABELS, RATE_TIER_MULT, getRates,
} from './lib/payRates.js';
import {
  LONDON_WEIGHTING, LONDON_ALLOWANCE,
  calcUKIncomeTax, calcUKIncomeTaxNoTaper,
  NI_PT, NI_UEL, calcNI, estimateAnnualNI,
  computeTaxBandBreakdown, pensionTierRate, calcPensionContribution,
  TAX_BANDS, getTaxBand, applyBandTax, splitAcrossBands,
  monthlySteppedAmount, monthlySteppedSplitBySept, periodBaseAmount,
} from './lib/tax.js';
import { fmt, fmtHM, fmtGBP, fmtD, fmtDDMM } from './lib/format.js';
import {
  toMinutesOfDay, fmtShiftRange, SHIFT_TIMES_MARKER, generateShiftTimesLine,
  shiftDurationMinutes, calcAutoOTHours, syncShiftTimesIntoForm,
} from './lib/shiftTimes.js';
import { KEYS, dualWrite, dualRead } from './lib/storage.js';
import { migrateSettings, migrateEntries } from './lib/migrations.js';
import {
  calcEntry as calcEntryPure, submittedGross as submittedGrossPure,
  crossPeriodInfo as crossPeriodInfoPure,
  isOtSubmitted, isPaSubmitted, effectiveOtDate, effectivePaDate, periodIdxForDate,
} from './lib/calc.js';
import { Ico, ClockCashIcon, FireExitIcon } from './components/Icons.jsx';
import { ToastStack } from './components/ToastStack.jsx';
import { SegSlider } from './components/SegSlider.jsx';
import { MonthlyChart } from './components/MonthlyChart.jsx';
import { useEscapeToClose } from './lib/useEscapeToClose.js';
import { useBackButtonCloses } from './lib/useBackButtonCloses.js';
import { useMountTransition, useLastTruthy } from './lib/useMountTransition.js';
import { haptic } from './lib/haptics.js';
import { useCountUp } from './lib/useCountUp.js';
// ── tabs are code-split, not bundled up front ───────────────────────────────
// Only one of these six is ever on screen at a time (via `tab` state below),
// so there's no reason all six ship in the initial JS payload. Each becomes
// its own chunk, fetched the first time its tab is opened and cached by the
// browser after that — same components, same props, just loaded on demand.
const TabToil = lazy(() => import('./components/TabToil.jsx').then(m => ({ default: m.TabToil })));
const TabCarms = lazy(() => import('./components/TabCarms.jsx').then(m => ({ default: m.TabCarms })));
const TabDashboard = lazy(() => import('./components/TabDashboard.jsx').then(m => ({ default: m.TabDashboard })));
const TabLogOvertime = lazy(() => import('./components/TabLogOvertime.jsx').then(m => ({ default: m.TabLogOvertime })));
const TabSummary = lazy(() => import('./components/TabSummary.jsx').then(m => ({ default: m.TabSummary })));
const TabSettings = lazy(() => import('./components/TabSettings.jsx').then(m => ({ default: m.TabSettings })));

// ─── ledger redesign tokens ────────────────────────────────────────────────
// The "one statement, not six boxes" visual direction: a single brass accent
// standing in for what used to be blue/purple/amber used purely for
// wayfinding (nav highlights, rate-tier selectors, hero underlines), and a
// tabular monospace face for every money/hours figure so columns of numbers
// actually line up like a real payslip. True semantic colour (green =
// settled, red = overdrawn/danger) is untouched — this only replaces
// decoration, never state. Kept as plain constants (not swapped into every
// existing blue literal app-wide) so this stays a scoped, reversible pass —
// see the ledger-redesign branch notes for what's in vs. out of scope.
const MONO  = "'IBM Plex Mono',monospace";
const BRASS = '#b8823f';

// Shared by both the mobile bottom nav and the wide-screen sidebar — one
// list, so the two can never disagree about what the tabs are.
const NAV_TABS = [
  {id:'dashboard',n:'home', lbl:'Home'},
  {id:'add',      n:'plus', lbl:'Log Overtime'},
  {id:'months',   n:'cal',  lbl:'Summary'},
  {id:'carms',    n:'check', lbl:'CARMS/PA'},
  {id:'graph',    n:'clock', lbl:'TOIL'},
  {id:'settings', n:'cog',  lbl:'More..'},
];

// ─── auth: supabase client ─────────────────────────────────────────────────────
// PHASE 1 SCOPE: sign in / sign up / sign out / local-only mode only.
// Entries, toilTaken and settings still live purely in localStorage at this
// stage — nothing is encrypted or synced to Supabase yet. That's phase 2,
// once the data-key wrap/unwrap functions exist, so a signed-in account
// doesn't imply "your data is backed up" until that lands.
let supabaseUrl, supabaseAnonKey;
try {
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
} catch(_){}
// If the environment variables are missing or malformed, supabase stays null
// rather than throwing — the app falls back to local-only behaviour instead
// of a blank white screen. Every call site below checks for this.
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// ─── crypto: data key wrap/unwrap ──────────────────────────────────────────
// Every user's shift data is encrypted with a single random "data key" (DEK),
// generated once at sign-up. The DEK itself never leaves the device in the
// clear — it's wrapped (encrypted) by a key derived from the login password,
// AND separately wrapped again by a key derived from the recovery word.
// Either secret alone is enough to unwrap the same DEK; losing one doesn't
// affect the other. Supabase only ever stores the wrapped (still-encrypted)
// copies — it never sees the DEK, the password, or the recovery word.
// Verified independently (round-trip via both paths, wrong-secret rejection,
// uniqueness of salts/IVs) before being wired in here — see build notes.
const _enc = new TextEncoder();
const _dec = new TextDecoder();
const b64encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const b64decode = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function deriveKekFromSecret(secret, saltB64, iterations) {
  const salt = b64decode(saltB64);
  const keyMaterial = await crypto.subtle.importKey('raw', _enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['wrapKey', 'unwrapKey']
  );
}
const randomSaltB64 = () => b64encode(crypto.getRandomValues(new Uint8Array(16)));
const generateDataKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

// Wraps dataKey under a secret (password or recovery word). Returns a single
// base64 blob (IV + wrapped key bytes, concatenated) plus the salt used —
// matches the schema's wrapped_dek / kek_salt columns exactly, no extra IV
// column needed.
async function wrapDataKey(dataKey, secret, iterations) {
  const salt = randomSaltB64();
  const kek = await deriveKekFromSecret(secret, salt, iterations);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedBytes = new Uint8Array(await crypto.subtle.wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv }));
  const combined = new Uint8Array(iv.length + wrappedBytes.length);
  combined.set(iv, 0);
  combined.set(wrappedBytes, iv.length);
  return { wrapped: b64encode(combined), salt };
}

async function unwrapDataKey(wrappedB64, saltB64, secret, iterations) {
  const kek = await deriveKekFromSecret(secret, saltB64, iterations);
  const combined = b64decode(wrappedB64);
  const iv = combined.slice(0, 12);
  const wrappedBytes = combined.slice(12);
  return crypto.subtle.unwrapKey(
    'raw', wrappedBytes, kek, { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}

// Encrypts/decrypts the actual row payloads (entries, toilTaken, settings)
// under the (already-unwrapped, in-memory) data key. Same IV-bundled blob
// pattern, matching the ciphertext text column.
async function encryptWithDataKey(dataKey, plainObj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = _enc.encode(JSON.stringify(plainObj));
  const ctBytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, plaintextBytes));
  const combined = new Uint8Array(iv.length + ctBytes.length);
  combined.set(iv, 0);
  combined.set(ctBytes, iv.length);
  return b64encode(combined);
}

async function decryptWithDataKey(dataKey, blobB64) {
  const combined = b64decode(blobB64);
  const iv = combined.slice(0, 12);
  const ctBytes = combined.slice(12);
  const plaintextBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dataKey, ctBytes);
  return JSON.parse(_dec.decode(plaintextBytes));
}

// Recovery-word validation: 5+ characters, not on a short blocklist of
// obviously-guessable words. At this length the blocklist is doing most of
// the real work, not the length check — deliberate trade-off, not an
// oversight.
const RECOVERY_MIN_LENGTH = 5;
const RECOVERY_BLOCKLIST = ['password','overtime','shift','shift1','police','london','metro','12345','qwerty','letmein','admin','welcome','abcde','testy'];
const PASSWORD_KDF_ITERATIONS = 210000; // used every sign-in, cost stays invisible
const RECOVERY_KDF_ITERATIONS = 600000; // used maybe once ever, so it can afford to be slower


// ─── auth screens ───────────────────────────────────────────────────────────
// Phase 1 scope: sign in, sign up, forgot-password request, and the
// local-only escape hatch. Recovery-secret setup and real cloud sync of
// entries/toilTaken/settings are phase 2, once the data-key wrap/unwrap
// functions exist — signing up here does not yet mean data is backed up.
function AuthScreens({ supabase, addToast, setAuthFlowBusy, onUnlocked, startInPasswordRecovery, onRecoveryComplete, isWide }) {
  const [screen, setScreen]         = useState(startInPasswordRecovery ? 'set-new-password' : 'signin'); // 'signin' | 'signup' | 'forgot' | 'recovery-setup' | 'set-new-password' | 'recovery-unlock'
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [password2, setPassword2]   = useState('');
  const [recoveryWord, setRecoveryWord] = useState('');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [noRecoveryWarning, setNoRecoveryWarning] = useState(false);
  // Show/hide toggles for the two password fields — shared across screens
  // (only one screen is ever mounted at a time, so there's no cross-talk
  // between e.g. signup's password and set-new-password's).
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const AS = {
    // Dark blue page — deliberately different from the rest of the app's
    // light theme, matching the brand-moment treatment requested for this
    // screen specifically. #0f2744 matches the app's own theme-color, so
    // it's not a new colour being introduced, just used at page-scale here.
    page: {display:'flex',flexDirection:'column',minHeight:'100dvh',maxWidth:isWide?'none':'430px',margin:'0 auto',background:'var(--navy)',fontFamily:"'DM Sans',system-ui,sans-serif",color:'var(--ink)',boxSizing:'border-box',position:'relative',overflowY:'auto',overscrollBehavior:'contain'},
    cardWrap: {flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',position:'relative',zIndex:1,minHeight:0},
    card: {width:'100%',maxWidth:isWide?'460px':'none',background:'var(--surface)',borderRadius:'18px',padding:isWide?'34px 30px 28px':'26px 22px 22px',boxShadow:'0 12px 34px rgba(0,0,0,0.28)',boxSizing:'border-box'},
    label:{display:'block',fontSize:'9px',color:'var(--muted)',margin:'0 0 6px',fontWeight:900,textTransform:'uppercase',letterSpacing:'1.5px'},
    input:{width:'100%',background:'var(--surface-2)',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',boxSizing:'border-box',color:'var(--ink)',marginBottom:'14px'},
    err:{fontSize:'12px',color:'#dc2626',margin:'-10px 0 14px',fontWeight:700},
    btn:{width:'100%',padding:'13px 0',borderRadius:'13px',border:'none',fontFamily:'inherit',fontSize:'11px',fontWeight:900,cursor:'pointer',background:'#2563eb',color:'#fff',textTransform:'uppercase',letterSpacing:'1px'},
    btnGhost:{width:'100%',padding:'13px 0',borderRadius:'13px',border:'1px solid var(--border-2)',fontFamily:'inherit',fontSize:'11px',fontWeight:900,cursor:'pointer',background:'var(--surface)',color:'var(--muted)',marginTop:'10px',textTransform:'uppercase',letterSpacing:'1px'},
    linkRow:{textAlign:'center',marginTop:'14px',fontSize:'13px',color:'var(--quiet)',fontWeight:700},
    link:{color:'#2563eb',cursor:'pointer'},
    note:{display:'flex',gap:'9px',background:'var(--tint-purple)',borderRadius:'13px',padding:'12px 13px',marginBottom:'16px',fontSize:'12.5px',lineHeight:1.5,color:'#6d28d9',fontWeight:600},
    divider:{display:'flex',alignItems:'center',justifyContent:'center',gap:'10px',margin:'14px 0',fontSize:'11.5px',color:'var(--quiet)',fontWeight:700},
  };

  const validEmail = /\S+@\S+\.\S+/.test(email);

  const handleSignIn = async () => {
    setError('');
    if (!validEmail) { setError('Enter a valid email address'); return; }
    setBusy(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setBusy(false); setError(err.message); return; }
    // Covers an account that signed up but never finished recovery-secret
    // setup (e.g. email confirmation delayed the first real session).
    const { data: keyRow } = await supabase.from('user_keys')
      .select('wrapped_dek, kek_salt, kek_iterations')
      .eq('user_id', data.user.id).maybeSingle();
    if (!keyRow) {
      setBusy(false);
      if (setAuthFlowBusy) setAuthFlowBusy(true);
      setScreen('recovery-setup');
      return;
    }
    try {
      const dek = await unwrapDataKey(keyRow.wrapped_dek, keyRow.kek_salt, password, keyRow.kek_iterations);
      setBusy(false);
      setPassword('');
      if (onUnlocked) onUnlocked(dek);
    } catch (e) {
      // Password was accepted by Supabase Auth but couldn't unwrap the data
      // key — should only happen if the row's been corrupted or tampered
      // with, not from a normal wrong-password case (that fails at
      // signInWithPassword, above, before this point is ever reached).
      setBusy(false);
      setError('Signed in, but couldn\u2019t unlock your data — contact support rather than retrying blindly.');
    }
  };

  const handleSignUp = async () => {
    setError('');
    if (!validEmail) { setError('Enter a valid email address'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== password2) { setError('Passwords do not match'); return; }
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (!data.session) {
      // Email confirmation required — no session yet, nowhere safe to write
      // key material. Setup resumes on first sign-in instead, above.
      if (addToast) addToast('Check your email to confirm your account, then sign in.', 'success', null, 6000, 'Almost there');
      setScreen('signin');
      return;
    }
    if (setAuthFlowBusy) setAuthFlowBusy(true);
    setScreen('recovery-setup');
    // password intentionally stays in state — it's needed to wrap the data key next
  };

  const recoveryTooCommon = RECOVERY_BLOCKLIST.includes(recoveryWord.toLowerCase());

  const handleRecoverySetup = async () => {
    setError('');
    if (recoveryWord.length < RECOVERY_MIN_LENGTH) { setError(`Must be at least ${RECOVERY_MIN_LENGTH} letters`); return; }
    if (recoveryTooCommon) { setError('Too common — choose something less predictable'); return; }
    setBusy(true);
    try {
      const dek = await generateDataKey();
      const passWrap = await wrapDataKey(dek, password, PASSWORD_KDF_ITERATIONS);
      const recWrap  = await wrapDataKey(dek, recoveryWord, RECOVERY_KDF_ITERATIONS);
      const { data: sessionData } = await supabase.auth.getSession();
      const { error: err } = await supabase.from('user_keys').upsert({
        user_id: sessionData.session.user.id,
        wrapped_dek: passWrap.wrapped,
        kek_salt: passWrap.salt,
        kek_iterations: PASSWORD_KDF_ITERATIONS,
        wrapped_dek_recovery: recWrap.wrapped,
        recovery_salt: recWrap.salt,
        recovery_iterations: RECOVERY_KDF_ITERATIONS,
      });
      setBusy(false);
      if (err) { setError(err.message); return; }
      setPassword(''); setRecoveryWord('');
      if (addToast) addToast('Recovery secret saved — you\u2019re all set', 'success', null, 4000, 'Ready to go');
      if (setAuthFlowBusy) setAuthFlowBusy(false);
      if (onUnlocked) onUnlocked(dek);
      if (onRecoveryComplete) onRecoveryComplete();
    } catch (e) {
      setBusy(false);
      setError('Something went wrong setting up encryption \u2014 try again');
    }
  };

  const handleForgotRequest = async () => {
    setError('');
    if (!validEmail) { setError('Enter a valid email address'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setForgotSent(true);
  };

  // Reached after clicking the link in a reset email. Supabase already has
  // a temporary session at this point (see the PASSWORD_RECOVERY handling
  // in the parent) — this just sets the actual new password. The old data
  // key is still wrapped under the OLD password after this succeeds; that's
  // resolved next, in handleRecoveryUnlock.
  const handleSetNewPassword = async () => {
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== password2) { setError('Passwords do not match'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setPassword2('');
    setScreen('recovery-unlock');
    // `password` intentionally stays in state — it's the new password,
    // needed below to re-wrap the data key once the recovery word unlocks it.
  };

  // Unwraps the existing data key via the recovery-word path, then re-wraps
  // that SAME key under the new password. The data key itself never
  // changes here — only which secrets can unwrap it — so nothing already
  // encrypted under it needs touching.
  const handleRecoveryUnlock = async () => {
    setError('');
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session.user.id;
      const { data: keyRow, error: fetchErr } = await supabase.from('user_keys')
        .select('wrapped_dek_recovery, recovery_salt, recovery_iterations')
        .eq('user_id', uid).maybeSingle();
      if (fetchErr || !keyRow) throw new Error('missing key row');
      const dek = await unwrapDataKey(keyRow.wrapped_dek_recovery, keyRow.recovery_salt, recoveryWord, keyRow.recovery_iterations);
      const newPassWrap = await wrapDataKey(dek, password, PASSWORD_KDF_ITERATIONS);
      const { error: updateErr } = await supabase.from('user_keys').update({
        wrapped_dek: newPassWrap.wrapped,
        kek_salt: newPassWrap.salt,
        kek_iterations: PASSWORD_KDF_ITERATIONS,
      }).eq('user_id', uid);
      if (updateErr) throw updateErr;
      setBusy(false);
      setPassword(''); setRecoveryWord('');
      if (onUnlocked) onUnlocked(dek);
      if (onRecoveryComplete) onRecoveryComplete();
      if (addToast) addToast('Password reset and data unlocked', 'success', null, 4000, 'All set');
    } catch (e) {
      setBusy(false);
      setError('That recovery word didn\u2019t work \u2014 try again, or continue without your old data below.');
    }
  };

  // Show/hide toggle, take two — a single input whose type flips between
  // 'password' and 'text', following the pattern browser vendors document
  // as safe for password managers (e.g. web.dev's sign-in-form-best-
  // practices): the *identity* of the field (id/name/autocomplete) must
  // stay stable across the toggle, which our first attempt at this never
  // had (no id/name at all on any auth field). A dual-input version
  // (one type="password", one type="text", mirrored via display:none)
  // was tried in between to chase a Safari/Keychain regression, but two
  // fields sharing one autocomplete token confused desktop Chrome/Edge's
  // save-password heuristics instead. This can't be verified against a
  // real browser's native password-manager UI from this environment —
  // it needs a real-device check (mobile Safari + desktop Chrome/Safari)
  // before we call it fixed.
  const pwField = (value, onChange, placeholder, autoComplete, fieldId, show, setShow, autoFocus=false) => (
    <div style={{position:'relative',marginBottom:'14px'}}>
      <input
        id={fieldId} name={fieldId}
        style={{...AS.input,marginBottom:0,paddingRight:'44px'}}
        type={show?'text':'password'} placeholder={placeholder} value={value} onChange={onChange}
        autoComplete={autoComplete} autoFocus={autoFocus}
      />
      <button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Hide password':'Show password'} style={{position:'absolute',right:'4px',top:0,bottom:0,background:'none',border:'none',padding:'0 10px',cursor:'pointer',display:'flex',alignItems:'center',color:'var(--quiet)'}}>
        <Ico n={show?'eyeOff':'eye'} s={16} c="var(--quiet)"/>
      </button>
    </div>
  );

  return (
    <div style={AS.page}>
      {/* This screen is an early return, before the main app's own <style>
          block (which defines .fi) ever mounts — without its own copy here,
          the className="fi" on each screen below would silently do nothing. */}
      <style>{`
        @keyframes authFi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fi{animation:authFi 0.22s ease}
        @media (prefers-reduced-motion: reduce){.fi{animation-duration:0.001ms}}
      `}</style>
      <div style={AS.cardWrap}>
      <div style={AS.card}>
        {/* Title lives inside the card itself on this screen, rather than
            as a page-level header above it — colours suited to the card's
            white background, unlike the page's dark backdrop. */}
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'20px'}}>
          <ClockCashIcon width={26} height={18}/>
          <div style={{display:'flex',flexDirection:'column',lineHeight:1.2,minWidth:0}}>
            <span style={{fontSize:'17px',fontWeight:900,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',letterSpacing:'-0.4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Overtime &amp; Shift Tracker</span>
            <span style={{fontSize:'12px',fontWeight:700,color:'var(--quiet)',letterSpacing:'0.2px'}}>by Adam Stephens</span>
          </div>
        </div>

        {screen === 'signin' && (
          <div className="fi">
            <form onSubmit={e=>{e.preventDefault(); handleSignIn();}}>
              <label style={AS.label}>Email</label>
              <input style={AS.input} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" autoFocus={isWide}/>
              <label style={AS.label}>Password</label>
              {pwField(password, e=>setPassword(e.target.value), '••••••••', 'current-password', 'current-password', showPw, setShowPw)}
              {error && <div style={AS.err}>{error}</div>}
              <button type="submit" style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
            </form>
            <div style={AS.divider}>or</div>
            <button type="button" style={AS.btnGhost} onClick={()=>{ setScreen('signup'); setError(''); }}>Create account</button>
            <div style={AS.linkRow}><span style={AS.link} onClick={()=>{ setScreen('forgot'); setError(''); setForgotSent(false); }}>Forgot password?</span></div>
          </div>
        )}

        {screen === 'signup' && (
          <div className="fi">
            <form onSubmit={e=>{e.preventDefault(); handleSignUp();}}>
              <label style={AS.label}>Email</label>
              <input style={AS.input} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" autoFocus={isWide}/>
              <label style={AS.label}>Password</label>
              {pwField(password, e=>setPassword(e.target.value), 'At least 8 characters', 'new-password', 'new-password', showPw, setShowPw)}
              <label style={AS.label}>Confirm password</label>
              {pwField(password2, e=>setPassword2(e.target.value), '••••••••', 'new-password', 'new-password-confirm', showPw2, setShowPw2)}
              <div style={AS.note}>
                <span>↻</span>
                <span><b>You'll set up a recovery secret next.</b> That protects your data if you ever forget your password.</span>
              </div>
              {error && <div style={AS.err}>{error}</div>}
              <button type="submit" style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy}>{busy?'Creating…':'Create account'}</button>
            </form>
            <div style={AS.linkRow}>Already have an account? <span style={AS.link} onClick={()=>{ setScreen('signin'); setError(''); }}>Sign in</span></div>
          </div>
        )}

        {screen === 'recovery-setup' && (
          <div className="fi">
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Save your recovery secret</div>
            <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>If you ever forget your password, this word is the only other way back into your data. Nobody else has a copy of it — not even us.</div>

            <form onSubmit={e=>{e.preventDefault(); handleRecoverySetup();}}>
              <label style={AS.label}>Your recovery word</label>
              <input style={AS.input} type="text" placeholder="Something only you'd think of" autoComplete="off" value={recoveryWord} onChange={e=>setRecoveryWord(e.target.value)} autoFocus={isWide}/>
              <div style={{fontSize:'12px',color:recoveryWord.length>=RECOVERY_MIN_LENGTH?'#16a34a':'var(--quiet)',margin:'-10px 0 6px',fontWeight:700}}>{recoveryWord.length} / {RECOVERY_MIN_LENGTH} characters minimum</div>
              {recoveryTooCommon && recoveryWord.length>0 && <div style={AS.err}>Too common — choose something less predictable</div>}
              {error && <div style={{...AS.err,marginTop:recoveryTooCommon?0:'-4px'}}>{error}</div>}

              <button type="submit" style={{...AS.btn,opacity:busy?0.7:1,marginTop:'8px'}} disabled={busy}>{busy?'Saving…':'Save and continue'}</button>
            </form>
          </div>
        )}

        {screen === 'forgot' && !forgotSent && (
          <div className="fi">
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Reset your password</div>
            <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>We'll email you a secure link to set a new password.</div>
            <form onSubmit={e=>{e.preventDefault(); handleForgotRequest();}}>
              <label style={AS.label}>Email</label>
              <input style={AS.input} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" autoFocus={isWide}/>
              {error && <div style={AS.err}>{error}</div>}
              <button type="submit" style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy}>{busy?'Sending…':'Send reset link'}</button>
            </form>
            <div style={AS.linkRow}><span style={AS.link} onClick={()=>{ setScreen('signin'); setError(''); }}>Back to sign in</span></div>
          </div>
        )}

        {screen === 'forgot' && forgotSent && (
          <div className="fi">
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Check your email</div>
            <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>A reset link's on its way to {email}. Follow it to set a new password.</div>
            <button style={AS.btnGhost} onClick={()=>{ setScreen('signin'); setError(''); setForgotSent(false); }}>Back to sign in</button>
          </div>
        )}

        {screen === 'set-new-password' && (
          <div className="fi">
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Set a new password</div>
            <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>Choose a new password for your account.</div>
            <form onSubmit={e=>{e.preventDefault(); handleSetNewPassword();}}>
              <label style={AS.label}>New password</label>
              {pwField(password, e=>setPassword(e.target.value), 'At least 8 characters', 'new-password', 'new-password', showPw, setShowPw, isWide)}
              <label style={AS.label}>Confirm new password</label>
              {pwField(password2, e=>setPassword2(e.target.value), '••••••••', 'new-password', 'new-password-confirm', showPw2, setShowPw2)}
              {error && <div style={AS.err}>{error}</div>}
              <button type="submit" style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy}>{busy?'Saving…':'Set new password'}</button>
            </form>
          </div>
        )}

        {screen === 'recovery-unlock' && (
          <div className="fi">
            <div style={{fontSize:'19px',fontWeight:900,letterSpacing:'-0.5px',marginBottom:'6px'}}>Unlock your existing data</div>
            <div style={{fontSize:'13px',color:'var(--muted)',lineHeight:1.5,marginBottom:'18px',fontWeight:600}}>Your password's been reset. Enter your recovery word to restore access to your previous shifts and TOIL.</div>
            <form onSubmit={e=>{e.preventDefault(); handleRecoveryUnlock();}}>
              <label style={AS.label}>Recovery word</label>
              <input style={AS.input} type="text" placeholder="Enter your recovery word" autoComplete="off" value={recoveryWord} onChange={e=>setRecoveryWord(e.target.value)} autoFocus={isWide}/>
              {error && <div style={AS.err}>{error}</div>}
              <button type="submit" style={{...AS.btn,opacity:busy?0.7:1}} disabled={busy}>{busy?'Unlocking…':'Unlock my data'}</button>
            </form>
            <div style={AS.linkRow}><span style={AS.link} onClick={()=>setNoRecoveryWarning(true)}>I don't have my recovery word</span></div>
            {noRecoveryWarning && (
              <div style={{marginTop:'12px'}} className="fi">
                <div style={{fontSize:'11.5px',color:'#dc2626',lineHeight:1.5,fontWeight:700,marginBottom:'10px'}}>Without it, your existing shifts and TOIL can't be recovered by anyone. You can continue and set up a fresh recovery word, but everything logged before this reset will be gone for good.</div>
                <button type="button" style={AS.btnGhost} onClick={()=>{ setError(''); setRecoveryWord(''); setNoRecoveryWarning(false); setScreen('recovery-setup'); }}>Continue without my old data</button>
              </div>
            )}
          </div>
        )}

      </div>
      </div>
    </div>
  );
}


// ─── app ──────────────────────────────────────────────────────────────────────
export default function App() {
  const todayStr      = new Date().toISOString().split('T')[0];
  const currPeriodIdx = PAY_PERIODS.findIndex(p=>todayStr>=p.start&&todayStr<=p.end);

  // The Android home-screen shortcut (manifest.json) launches with
  // ?shortcut=log so it can open straight onto Log Overtime — the one
  // thing people actually open this app to do most — instead of always
  // landing on Home first. iOS has no equivalent (Safari doesn't support
  // manifest shortcuts at all), so this only ever fires on Android.
  const [tab,          setTab]          = useState(()=>
    new URLSearchParams(window.location.search).get('shortcut')==='log' ? 'add' : 'dashboard'
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('shortcut')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  // ── directional tab-switch entrance ─────────────────────────────────────
  // Bottom-nav taps already have a sense of direction (the sliding pill),
  // but the tab content itself just cut-and-faded regardless of which way
  // you navigated. Reading which side of NAV_TABS the new tab sits on
  // relative to the one you were just on gives the incoming tab a matching
  // left/right entrance instead of the generic one every other reveal in
  // the app uses. Deliberately entrance-only, same call as the accordions —
  // the outgoing tab still just unmounts, rather than restructuring all six
  // tabs to stay mounted through their own exit animation for a fuller
  // two-panel slide.
  // Computed (and locked in) during render rather than via a ref updated
  // in an effect — an effect-based ref update races every other thing in
  // this component that re-renders shortly after a tab switch (the
  // useCountUp tweens on Dashboard alone fire a dozen re-renders in the
  // 700ms after mount), which would silently overwrite fi-right/fi-left
  // back to plain fi mid-animation. Guarding on tab !== tabAnimState.tab
  // means this only ever recomputes on an actual tab change, and then
  // holds steady through every re-render that follows until the next one.
  const [tabAnimState, setTabAnimState] = useState({ forTab: tab, cls: 'fi' });
  if (tab !== tabAnimState.forTab) {
    const newIdx = NAV_TABS.findIndex(t=>t.id===tab);
    const oldIdx = NAV_TABS.findIndex(t=>t.id===tabAnimState.forTab);
    setTabAnimState({ forTab: tab, cls: newIdx===oldIdx ? 'fi' : (newIdx>oldIdx ? 'fi-right' : 'fi-left') });
  }
  const tabAnimClass = tabAnimState.cls;
  const [entries,      setEntries]      = useState(()=>migrateEntries(dualRead(KEYS.entries,[])));
  const [toilTaken,    setToilTaken]    = useState(()=>dualRead(KEYS.toilTaken,[]));
  const [settings,     setSettings]     = useState(()=>migrateSettings(dualRead(KEYS.settings,null)));
  const [expanded,     setExpanded]     = useState(null);
  const [chartTap, setChartTap] = useState(null);     // {chart:'cum'|'mon', i, big}
  const [chartModal, setChartModal] = useState(null); // 'cum' | 'mon' | null
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState(null); // null (choosing) | 'pdf' | 'csv'
  const [payslipMode, setPayslipMode] = useState('period'); // 'period' | 'custom' | 'financialYear'
  const [payslipPeriodIdx, setPayslipPeriodIdx] = useState(null);
  const [payslipFYYear, setPayslipFYYear] = useState(null); // calendar FY-start-year selected in 'financialYear' export mode
  const [payslipStart, setPayslipStart] = useState('');
  const [payslipEnd, setPayslipEnd] = useState('');
  const [payslipPreview, setPayslipPreview] = useState(null); // { start, end, label, data } | null
  const [sanitiseNotes, setSanitiseNotes] = useState(true); // blank the Notes column on CSV export by default — safer given notes may hold operationally sensitive detail
  // 'light' | 'dark' | 'system' — 'system' means no data-theme attribute at
  // all, so the plain CSS prefers-color-scheme rule in index.html drives it
  // (and keeps following the OS live, no listener needed here).
  const [themeMode, setThemeMode] = useState(()=>dualRead(KEYS.themeMode,'system'));
  useEffect(()=>{
    if(themeMode==='system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', themeMode);
  },[themeMode]);
  const setTheme = v => { setThemeMode(v); dualWrite(KEYS.themeMode, v); };

  // ── Android's status bar follows theme-color, and it's a solid colour
  // (not translucent like iOS's), so a value that's only ever right for one
  // theme leaves a mismatched stripe above the header in the other one.
  // Keeps it in sync with themeMode, including 'system' — where it has to
  // watch prefers-color-scheme itself, since nothing else in the app does. ──
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const LIGHT = '#ffffff', DARK = '#111c2e';
    const apply = () => {
      const dark = themeMode==='dark' || (themeMode==='system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      meta.setAttribute('content', dark ? DARK : LIGHT);
    };
    apply();
    if (themeMode!=='system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themeMode]);

  const [defaultBreakdownView, setDefaultBreakdownView] = useState(()=>dualRead(KEYS.defaultBreakdownView,'calendar'));
  const [breakdownView, setBreakdownView] = useState(()=>dualRead(KEYS.defaultBreakdownView,'calendar')); // 'list' | 'calendar'
  const [calPeriodIdx, setCalPeriodIdx] = useState(null); // set to currPeriodIdx on first render
  const [selectedCalDay, setSelectedCalDay] = useState(null);
  const [confirmCreateDay, setConfirmCreateDay] = useState(null);
  const [focusEntryId, setFocusEntryId] = useState(null);
  const [focusCarmsToggle, setFocusCarmsToggle] = useState(false);

  // Which period group in CARMS Outstanding should scroll into view and
  // pulse, set when jumping there from a "CARMS & MetHR pending" panel in
  // Summary — same scroll-and-fade pattern as focusEntryId/focusCarmsToggle.
  const [pulsePeriodIdx, setPulsePeriodIdx] = useState(null);
  const [editing,      setEditing]      = useState(null);
  const [wipeConf,     setWipeConf]     = useState(false);
  const [wipingData,   setWipingData]   = useState(false);
  const [deleteAcctConf, setDeleteAcctConf] = useState(false);
  const [deleteAcctTyped, setDeleteAcctTyped] = useState('');
  const [deletingAcct, setDeletingAcct] = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(null);
  const [toasts,       setToasts]       = useState([]);
  const [savedBadge,   setSavedBadge]   = useState(false);
  const [session,      setSession]      = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [dataKey,      setDataKey]      = useState(null); // unwrapped CryptoKey, in memory only, never persisted
  const [manualSyncing, setManualSyncing] = useState(false);
  const [syncJustSucceeded, setSyncJustSucceeded] = useState(false);
  // Briefly shows the Save button as a checkmark before handing off to
  // handleSave's own navigation (which switches tabs immediately) — the
  // navigation is delayed by the same amount so the confirmation is
  // actually seen rather than replaced before it can render.
  const [justSaved, setJustSaved] = useState(false);

  // Width-based desktop detection — 960px chosen as "narrow laptop and up",
  // matching what the reviewed mockups were built against. This is purely
  // presentational: it changes which shell renders (sidebar+glance vs the
  // existing mobile chrome), never the underlying tab/data logic, which
  // stays identical either way.
  // isWide also covers phones/tablets rotated to landscape — without this,
  // a phone in landscape stays under the 960px desktop threshold and just
  // shows the narrow 430px mobile column centred in a lot of empty grey
  // space either side, rather than actually using the width it has.
  const computeIsWide = () => window.innerWidth>=960 || (window.innerWidth>window.innerHeight && window.innerWidth>=650);
  const [isWide, setIsWide] = useState(()=>typeof window!=='undefined' && computeIsWide());
  useEffect(()=>{
    const onResize = () => setIsWide(computeIsWide());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  },[]);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [showFYRollover, setShowFYRollover] = useState(false);
  // Which of the two dismissible top banners is mid-exit — 'backup' | 'fy' |
  // null. The show* flag above flips off immediately (nothing else reads it
  // once dismissed), but this keeps the banner on screen for one more beat
  // so .banner-collapsing can play instead of the row's height (and
  // everything below it) just snapping away.
  const [bannerClosing, setBannerClosing] = useState(null);
  const [fySummaryYear, setFySummaryYear] = useState(null); // calendar FY-start-year of the archived year being viewed, or null
  const [fySummaryPrintMode, setFySummaryPrintMode] = useState(false); // true when opened via Financial Year export (all periods expanded, Print button shown)
  const [archiveExpandedPeriod, setArchiveExpandedPeriod] = useState(null); // short label of the expanded period within that year, or null
  const [taxImpactExpanded, setTaxImpactExpanded] = useState(false);
  const [dataManagementExpanded, setDataManagementExpanded] = useState(false);
  // Starts open on desktop (there's room), collapsed on mobile — matches
  // the same isWide-only default the redesigned Home tile row assumes.
  const [salaryBreakdownExpanded, setSalaryBreakdownExpanded] = useState(isWide);
  // Navigating away from Home resets this back to its starting state —
  // collapsed on mobile, open on desktop — so returning to Home later
  // doesn't leave something open from a previous visit that's easy to
  // forget was expanded (mobile), while desktop keeps its always-open default.
  useEffect(()=>{ if (tab!=='dashboard') setSalaryBreakdownExpanded(isWide); },[tab]);
  // Desktop never shows a tap-to-expand affordance on this card at all
  // (it's meant to just always be open there) — so if it was collapsed
  // while narrow and the window is then widened past the breakpoint
  // without changing tabs, there'd be nothing left to tap it back open
  // with. Re-opening it the moment isWide flips true closes that gap;
  // narrowing back doesn't need the same treatment since mobile's own
  // tap-to-expand header is always available regardless of prior state.
  useEffect(()=>{ if (isWide) setSalaryBreakdownExpanded(true); },[isWide]);
  // Mobile-only: the Calendar View colour key is collapsed by default,
  // since it otherwise eats a big chunk of the screen right after the
  // grid on first load. Desktop still shows it inline unconditionally.
  const [calLegendExpanded, setCalLegendExpanded] = useState(false);
  const [taxCalcActualDetailOpen, setTaxCalcActualDetailOpen] = useState(false);
  const [taxCalcForecastDetailOpen, setTaxCalcForecastDetailOpen] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(false);
  const [exportDataExpanded, setExportDataExpanded] = useState(false);

  // Configuration must stay visibly open for as long as rank/pay point
  // setup is incomplete — that's the critical first-run flow, not
  // something a collapse toggle should be able to hide. The moment setup
  // actually completes, it's left open rather than snapping shut, since
  // the person was just looking at it.
  const configSetupIncomplete = !settings.rank || !settings.service;
  const prevConfigSetupIncompleteRef = useRef(configSetupIncomplete);
  useEffect(()=>{
    if (prevConfigSetupIncompleteRef.current && !configSetupIncomplete) {
      setConfigExpanded(true);
    }
    prevConfigSetupIncompleteRef.current = configSetupIncomplete;
  },[configSetupIncomplete]);
  const configShown = configExpanded || configSetupIncomplete;
  const [financialYearsExpanded, setFinancialYearsExpanded] = useState(false);
  const [pulseBackupBtn, setPulseBackupBtn] = useState(false);

  const mainRef   = useRef(null);
  // Portal target for the More.. tab's desktop popup cards — rendering
  // into this node (a sibling of <main>, not a descendant) means the
  // popups escape <main>'s own overflowY:auto scroll container entirely,
  // so they're never clipped or dragged around by its internal scroll.
  const contentWrapRef = useRef(null);
  const fileRef   = useRef(null);
  const monthRefs = useRef({});
  // ── bottom mobile nav's sliding pill — measured against the real
  // button layout (fluid via clamp(), see the nav CSS) rather than
  // assumed to be 1/6th width, so it stays correct at any phone size.
  // A state-backed callback ref (not a plain useRef) so mounting the nav
  // itself — which happens after the auth/loading gate resolves, well
  // after this component's first render — reliably re-triggers the
  // placement effect below rather than firing once too early and never
  // again.
  const [navEl, setNavEl] = useState(null);
  const navBtnRefs = useRef({});
  const [navPillRect, setNavPillRect] = useState({ left: 0, width: 0 });
  const stickyRef = useRef(null);
  const entryRefs = useRef({});
  const carmsToggleRef = useRef(null);
  const periodGroupRefs = useRef({});
  const calSwipeStartX = useRef(null);

  // Desktop-only custom date picker for the CARMS submission-date fields —
  // native <input type="date"> stays exactly as-is on mobile, where it
  // already works well. datePickerFor is null (closed) or 'ot'/'pa'
  // (which field it's editing); datePickerMonth is the YYYY-MM currently
  // shown, independent of the selected value so browsing doesn't move it.
  const [datePickerFor, setDatePickerFor] = useState(null);
  const [datePickerMonth, setDatePickerMonth] = useState(todayStr.slice(0,7));

  // ── Escape closes whatever's open ───────────────────────────────────────
  // Every dismissible overlay in the app could so far only be closed by
  // clicking its backdrop or an explicit button — a standard desktop
  // affordance (and this app genuinely has a desktop layout, not just
  // mobile) that had only ever been built for the time wheel picker.
  // Mirrors each overlay's own backdrop-click behaviour exactly, including
  // the Settings popovers closing all five expand flags at once.
  useEscapeToClose(signOutConfirmOpen, () => setSignOutConfirmOpen(false));
  useEscapeToClose(restoreConfirmOpen, () => setRestoreConfirmOpen(false));
  useEscapeToClose(payslipModalOpen, () => setPayslipModalOpen(false));
  useEscapeToClose(chartModal, () => { setChartModal(null); setChartTap(null); });
  useEscapeToClose(confirmCreateDay, () => setConfirmCreateDay(null));
  useEscapeToClose(selectedCalDay, () => { setSelectedCalDay(null); setConfirmDel(null); });
  useEscapeToClose(datePickerFor, () => setDatePickerFor(null));
  useEscapeToClose(
    configExpanded || taxImpactExpanded || financialYearsExpanded || exportDataExpanded || dataManagementExpanded,
    () => { setConfigExpanded(false); setTaxImpactExpanded(false); setFinancialYearsExpanded(false); setExportDataExpanded(false); setDataManagementExpanded(false); }
  );
  // ── Android back closes whatever's open ─────────────────────────────────
  // Same overlay list as the Escape handling above, collapsed into one
  // combined "is anything open" check and one "close everything" — only one
  // of these is ever realistically open at a time, so there's no need to
  // track which specific one for this. See useBackButtonCloses for why this
  // needs pushState/popstate rather than something simpler.
  useBackButtonCloses(
    !!(signOutConfirmOpen || restoreConfirmOpen || payslipModalOpen || chartModal || confirmCreateDay || selectedCalDay || datePickerFor
      || configExpanded || taxImpactExpanded || financialYearsExpanded || exportDataExpanded || dataManagementExpanded),
    () => {
      setSignOutConfirmOpen(false); setRestoreConfirmOpen(false); setPayslipModalOpen(false);
      setChartModal(null); setChartTap(null);
      setConfirmCreateDay(null);
      setSelectedCalDay(null); setConfirmDel(null);
      setDatePickerFor(null);
      setConfigExpanded(false); setTaxImpactExpanded(false); setFinancialYearsExpanded(false); setExportDataExpanded(false); setDataManagementExpanded(false);
    }
  );
  // ── mirrored close for the same seven overlays ──────────────────────────
  // Each one currently pops in with .alert-pop/.sheet-pop but hard-unmounts
  // the instant it closes — no reverse animation ever plays. Keeps each
  // overlay mounted for one more beat after it closes so its JSX below can
  // swap in the matching "-out" class instead of just vanishing. 220ms here
  // matches the CSS exit animations' own duration (see alertPopOut/
  // sheetPopOut below); Settings' modal-pop/accordion-in popovers are
  // deliberately left out of this — they already made the opposite call on
  // purpose (see TabSettings.jsx / the accordion-in comment in the
  // stylesheet below) and that reasoning still holds.
  const signOutMounted = useMountTransition(signOutConfirmOpen, 220);
  const restoreMounted = useMountTransition(restoreConfirmOpen, 220);
  const payslipMounted = useMountTransition(payslipModalOpen, 220);
  const chartModalMounted = useMountTransition(!!chartModal, 220);
  const confirmCreateDayMounted = useMountTransition(!!confirmCreateDay, 220);
  const selectedCalDayMounted = useMountTransition(!!selectedCalDay, 220);
  const datePickerMounted = useMountTransition(!!datePickerFor, 220);
  // These four close to null/'' rather than false, and their JSX below reads
  // the value itself to decide what to render — holding the last real value
  // keeps that content stable during the mounted-but-closing tail above.
  const chartModalV = useLastTruthy(chartModal);
  const confirmCreateDayV = useLastTruthy(confirmCreateDay);
  const selectedCalDayV = useLastTruthy(selectedCalDay);
  const datePickerForV = useLastTruthy(datePickerFor);
  const notesRef = useRef(null);
  // What's already been pushed to Supabase, keyed by row id — compared
  // against on every local change so only genuinely new/edited/removed
  // items get pushed, not the whole array on every render. Hydrated from
  // localStorage on mount, and re-persisted on every mutation below —
  // without this, a plain page reload would forget everything this device
  // has ever actually synced, since useRef alone doesn't survive that.
  const lastSyncedEntriesRef = useRef(new Map(Object.entries(dualRead(KEYS.lastSyncedEntries,{}))));
  const lastSyncedToilRef = useRef(new Map(Object.entries(dualRead(KEYS.lastSyncedToilTaken,{}))));
  const lastSyncedSettingsRef = useRef(dualRead(KEYS.lastSyncedSettings,null));
  const persistLastSyncedEntries = () => dualWrite(KEYS.lastSyncedEntries, Object.fromEntries(lastSyncedEntriesRef.current));
  const persistLastSyncedToil = () => dualWrite(KEYS.lastSyncedToilTaken, Object.fromEntries(lastSyncedToilRef.current));
  const persistLastSyncedSettings = () => dualWrite(KEYS.lastSyncedSettings, lastSyncedSettingsRef.current);
  // Always-current mirrors of local state, for the async pull/realtime code
  // below — a value captured at the top of a useEffect can be stale by the
  // time an awaited call or an event callback actually runs.
  const entriesRef = useRef(entries);
  const toilTakenRef = useRef(toilTaken);
  const settingsRef = useRef(settings);
  useEffect(()=>{ entriesRef.current = entries; },[entries]);
  useEffect(()=>{ toilTakenRef.current = toilTaken; },[toilTaken]);
  useEffect(()=>{ settingsRef.current = settings; },[settings]);

  const blankForm = { date:todayStr, reason:'', hours133:'', hours150:'', hours200:'', paRate:'None', comments:'', recordShiftTimes:true, rosteredStart:'', rosteredEnd:'', actualStart:'', actualEnd:'', dutyType:'normal', otRateTier:'hours133', otAuto:true, takeAs:'pay', toilHours:'', otSubmitted:false, paSubmitted:false, otSubmittedDate:'', paSubmittedDate:'' };
  const [form, setForm] = useState(blankForm);

  // ── cloud push sync ──────────────────────────────────────────────────────
  // Local state (via dualWrite, below) stays the instant, source-of-truth
  // write — this only ever runs after that, in the background, and never
  // blocks or slows down anything the person sees. Diffs against what was
  // last pushed so an edit to one entry doesn't reupload every other one.
  // Deliberately no retry queue or offline detection yet — a failed push
  // here is silently dropped rather than lost data, since local storage
  // already has the real copy; that gap is closed by pull-and-merge on
  // sign-in, which is the next piece, not this one.
  async function pushRowChanges(table, items, lastSyncedRef, persistFn) {
    if (!supabase || !session || !dataKey) return;
    const uid = session.user.id;
    const currentIds = new Set(items.map(it => it.id));
    const toUpsert = items.filter(it => lastSyncedRef.current.get(it.id) !== JSON.stringify(it));
    const toDelete = Array.from(lastSyncedRef.current.keys()).filter(id => !currentIds.has(id));
    if (toUpsert.length === 0 && toDelete.length === 0) return;
    const now = new Date().toISOString();
    for (const item of toUpsert) {
      try {
        const ciphertext = await encryptWithDataKey(dataKey, item);
        const { error } = await supabase.from(table).upsert({ id: item.id, user_id: uid, ciphertext, updated_at: now, deleted_at: null });
        if (!error) { lastSyncedRef.current.set(item.id, JSON.stringify(item)); persistFn(); console.log(`[sync] pushed ${table} id=${item.id}`); }
        else console.error(`[sync] push failed for ${table} id=${item.id}:`, error.message || error);
      } catch (e) { console.error(`[sync] push threw for ${table} id=${item.id}:`, e.message || e); }
    }
    for (const id of toDelete) {
      const { error } = await supabase.from(table).update({ deleted_at: now, updated_at: now }).eq('id', id).eq('user_id', uid);
      if (!error) { lastSyncedRef.current.delete(id); persistFn(); }
      else console.error(`[sync] soft-delete failed for ${table} id=${id}:`, error.message || error);
    }
  }

  async function pushSettingsChange(settingsObj) {
    if (!supabase || !session || !dataKey) return;
    const json = JSON.stringify(settingsObj);
    if (lastSyncedSettingsRef.current === json) return;
    try {
      const ciphertext = await encryptWithDataKey(dataKey, settingsObj);
      const { error } = await supabase.from('settings').upsert({ user_id: session.user.id, ciphertext, updated_at: new Date().toISOString() });
      if (!error) { lastSyncedSettingsRef.current = json; persistLastSyncedSettings(); console.log('[sync] pushed settings'); }
      else console.error('[sync] push failed for settings:', error.message || error);
    } catch (e) { console.error('[sync] push threw for settings:', e.message || e); }
  }

  // ── cloud pull + merge ──────────────────────────────────────────────────
  // Runs once when the data key first becomes ready (a fresh sign-in or a
  // freshly-unlocked device), and again every time the realtime channel
  // (re)connects, to close whatever gap opened while disconnected.
  //
  // The merge rule reuses lastSyncedRef rather than needing a separate
  // per-item local timestamp: if a local item's JSON still matches what
  // this device last believes it pushed, there's no unsynced local edit,
  // so it's safe to take whatever the server has (which may be newer, from
  // another device). If the local JSON has since diverged, there's a
  // pending local edit — keep it, and the next push cycle will send it up.
  // An item that WAS synced before but is missing from the server now
  // means another device deleted it — dropped locally too, not resurrected.
  async function pullAndMergeRows(table, itemsRef, setLocalItems, lastSyncedRef, persistFn) {
    if (!supabase || !session || !dataKey) return;
    const uid = session.user.id;
    const { data: rows, error } = await supabase.from(table).select('id, ciphertext, deleted_at').eq('user_id', uid);
    if (error) { console.error(`[sync] pull failed for ${table}:`, error.message || error); return; }
    if (!rows) return;
    console.log(`[sync] pulled ${rows.length} row(s) from ${table}`);
    const remoteMap = new Map();
    let decryptFailures = 0;
    for (const row of rows) {
      if (row.deleted_at) continue;
      try { remoteMap.set(row.id, await decryptWithDataKey(dataKey, row.ciphertext)); }
      catch (e) { decryptFailures++; }
    }
    if (decryptFailures > 0) console.error(`[sync] ${decryptFailures} row(s) in ${table} failed to decrypt with the current key`);
    const merged = [];
    for (const localItem of itemsRef.current) {
      if (remoteMap.has(localItem.id)) {
        const remoteItem = remoteMap.get(localItem.id);
        const noPendingLocalEdit = lastSyncedRef.current.get(localItem.id) === JSON.stringify(localItem);
        if (noPendingLocalEdit) {
          merged.push(remoteItem);
          lastSyncedRef.current.set(localItem.id, JSON.stringify(remoteItem));
        } else {
          merged.push(localItem);
        }
        remoteMap.delete(localItem.id);
      } else if (!lastSyncedRef.current.has(localItem.id)) {
        merged.push(localItem); // never synced yet — keep, will push shortly
      } else if (!isWithinCloudRetention(localItem.date)) {
        // Was synced before, now gone from the cloud — but this item is
        // older than the retention window, so its absence is expected
        // (pruned for storage, not a deletion on another device). Kept
        // locally without limit; not re-pushed either, since deliberately
        // pruned data shouldn't just reappear in the cloud on its own.
        merged.push(localItem);
      }
      // else: was synced before, still within the retention window, but
      // gone from the server now — genuinely deleted elsewhere, drop it.
    }
    for (const [id, remoteItem] of remoteMap) {
      merged.push(remoteItem);
      lastSyncedRef.current.set(id, JSON.stringify(remoteItem));
    }
    persistFn();
    setLocalItems(merged);
  }

  async function pullAndMergeSettings() {
    if (!supabase || !session || !dataKey) return;
    const { data: row, error } = await supabase.from('settings').select('ciphertext').eq('user_id', session.user.id).maybeSingle();
    if (error || !row) return;
    try {
      const remoteSettings = await decryptWithDataKey(dataKey, row.ciphertext);
      // A device that's never synced settings before (lastSyncedSettingsRef
      // still null) only has blank local defaults, not a real pending edit
      // — that's not the same case as "synced before, changed since," and
      // needs to be treated as safe to overwrite, same as no pending edit.
      const neverSynced = lastSyncedSettingsRef.current === null;
      const noPendingLocalEdit = neverSynced || lastSyncedSettingsRef.current === JSON.stringify(settingsRef.current);
      if (noPendingLocalEdit) {
        saveSett(remoteSettings);
        lastSyncedSettingsRef.current = JSON.stringify(remoteSettings);
        persistLastSyncedSettings();
      }
    } catch (e) { /* undecryptable — skip */ }
  }

  // Runs the initial catch-up pull once the data key is actually ready —
  // deliberately keyed on dataKey alone, not on entries/toilTaken/settings,
  // since this should fire once per unlock, not on every local edit.
  useEffect(()=>{
    if (!dataKey) return;
    pullAndMergeRows('entries', entriesRef, setEntries, lastSyncedEntriesRef, persistLastSyncedEntries);
    pullAndMergeRows('toil_taken', toilTakenRef, setToilTaken, lastSyncedToilRef, persistLastSyncedToil);
    pullAndMergeSettings();
    pruneOldCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dataKey]);

  // ── realtime ─────────────────────────────────────────────────────────────
  // Live updates from other signed-in devices while this one's also open.
  // RLS applies to realtime the same as any other query, so the filter
  // below is belt-and-braces, not the actual security boundary. On
  // (re)connect — including the very first connection — a full pull runs
  // first, closing any gap from time spent disconnected before relying on
  // the live stream for anything after that point.
  useEffect(()=>{
    if (!supabase || !session || !dataKey) return;
    const uid = session.user.id;
    // Tracks whether this is a genuine reconnect (channel dropped and came
    // back) versus the very first connection, which the dataKey-ready
    // effect above already pulled for. Re-pulling again immediately after
    // that first pull raced against the push effect it triggers — the
    // push would mark an item as synced between the two pulls, tricking
    // the second one into thinking a genuine pending local edit was safe
    // to overwrite with a stale remote copy.
    let hasConnectedOnce = false;

    const handleRowChange = async (setLocalItems, lastSyncedRef, persistFn, payload) => {
      const row = payload.new;
      if (!row) return;
      if (row.deleted_at) {
        setLocalItems(prev => prev.filter(it => it.id !== row.id));
        lastSyncedRef.current.delete(row.id);
        persistFn();
        return;
      }
      try {
        const decrypted = await decryptWithDataKey(dataKey, row.ciphertext);
        lastSyncedRef.current.set(row.id, JSON.stringify(decrypted));
        persistFn();
        setLocalItems(prev => {
          const idx = prev.findIndex(it => it.id === row.id);
          if (idx === -1) return [...prev, decrypted];
          const copy = [...prev]; copy[idx] = decrypted; return copy;
        });
      } catch (e) { /* undecryptable — skip */ }
    };

    const channel = supabase.channel('sync-'+uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${uid}` }, p => handleRowChange(setEntries, lastSyncedEntriesRef, persistLastSyncedEntries, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toil_taken', filter: `user_id=eq.${uid}` }, p => handleRowChange(setToilTaken, lastSyncedToilRef, persistLastSyncedToil, p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${uid}` }, async (p) => {
        const row = p.new; if (!row) return;
        try {
          const decrypted = await decryptWithDataKey(dataKey, row.ciphertext);
          lastSyncedSettingsRef.current = JSON.stringify(decrypted);
          persistLastSyncedSettings();
          saveSett(decrypted);
        } catch (e) { /* undecryptable — skip */ }
      })
      .subscribe((status)=>{
        if (status === 'SUBSCRIBED') {
          if (hasConnectedOnce) {
            pullAndMergeRows('entries', entriesRef, setEntries, lastSyncedEntriesRef, persistLastSyncedEntries);
            pullAndMergeRows('toil_taken', toilTakenRef, setToilTaken, lastSyncedToilRef, persistLastSyncedToil);
            pullAndMergeSettings();
          }
          hasConnectedOnce = true;
        }
      });

    return () => { supabase.removeChannel(channel); };
  },[supabase, session, dataKey]);

  // ── persist ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    dualWrite(KEYS.entries,entries);
    pushRowChanges('entries', entries, lastSyncedEntriesRef, persistLastSyncedEntries);
  },[entries]);
  useEffect(()=>{ dualWrite(KEYS.toilTaken,toilTaken); pushRowChanges('toil_taken', toilTaken, lastSyncedToilRef, persistLastSyncedToil); },[toilTaken]);
  useEffect(()=>{ dualWrite(KEYS.settings,settings); pushSettingsChange(settings); },[settings]);

  // ── auth session ──────────────────────────────────────────────────────────
  // Checks for an existing session once on mount, then stays subscribed for
  // sign-in/sign-out events for the lifetime of the app. A signed-in session
  // is now required — there's no local-only bypass.
  useEffect(()=>{
    if (!supabase) { setAuthLoading(false); return; }
    let cancelled = false;
    supabase.auth.getSession().then(({data})=>{
      if (cancelled) return;
      setSession(data.session);
      setAuthLoading(false);
    }).catch(()=>{
      // Offline or unreachable — fall through to the auth gate rather than
      // hang on "Loading…" forever.
      if (cancelled) return;
      setSession(null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession)=>{
      // Clicking the emailed reset link lands here as a PASSWORD_RECOVERY
      // event, with a real (temporary) session attached. Without this
      // check that session would satisfy the normal !session gate check
      // below and drop the person straight into the main app with their
      // old password still active — the whole point of the reset link is
      // to make them set a new one first.
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryMode(true);
      setSession(newSession);
    });
    return ()=>{ cancelled = true; listener.subscription.unsubscribe(); };
  },[]);
  useEffect(()=>{ if(mainRef.current) mainRef.current.scrollTop=0; },[tab]);

  // Opening the Breakdown tab always returns to the starred default view.
  // Switching views is treated as a temporary look, not a lasting preference —
  // only the star changes what Breakdown opens on. The ref lets handleSave
  // bypass this, since it deliberately targets a specific view and entry.
  const skipBreakdownReset = useRef(false);
  const taxImpactCardRef = useRef(null);
  const scrollToTaxImpact = useRef(false); // set true only when tapped from Home's Tax Threshold card
  useEffect(()=>{
    if(tab!=='months') return;
    if(skipBreakdownReset.current){ skipBreakdownReset.current=false; return; }
    setBreakdownView(defaultBreakdownView);
    if(defaultBreakdownView==='calendar') setCalPeriodIdx(currPeriodIdx>=0?currPeriodIdx:0);
  },[tab]);

  // Scrolls Settings so the £100k Tax Impact card sits at the top — but only
  // right after tapping through from Home's Tax Threshold tracker, not on an
  // ordinary visit to Options. The small delay lets the card's just-expanded
  // content finish laying out first, so the scroll target is stable.
  useEffect(()=>{
    if(tab!=='settings' || !scrollToTaxImpact.current) return;
    scrollToTaxImpact.current = false;
    setTimeout(()=>{ taxImpactCardRef.current?.scrollIntoView({behavior:'auto',block:'start'}); }, 60);
  },[tab]);

  // Collapse every expandable Options card the moment the person leaves the
  // Options tab, so it's back to a clean, collapsed state next time they
  // arrive — rather than remembering whatever was left open. Same idea for
  // the Home tab's graph toggle.
  const prevTabRef = useRef(tab);
  useEffect(()=>{
    if(prevTabRef.current==='settings' && tab!=='settings'){
      setTaxImpactExpanded(false);
      setTaxCalcActualDetailOpen(false);
      setTaxCalcForecastDetailOpen(false);
      setConfigExpanded(false);
      setExportDataExpanded(false);
      setFinancialYearsExpanded(false);
      setDataManagementExpanded(false);
    }
    if(prevTabRef.current==='carms' && tab!=='carms'){
      setCarmsFilter('all');
    }
    prevTabRef.current = tab;
  },[tab]);

  // ── snap zoom back to default when switching tabs ───────────────────────────
  // Pinch-zoom is allowed while browsing a tab. When the person switches tabs,
  // this forces the browser to reprocess the viewport at scale=1. Simply
  // mutating the meta tag's content attribute in place is often ignored by
  // mobile browsers if they judge nothing "changed" — removing the tag from
  // the DOM and reinserting it forces a genuine reprocess, which is the more
  // reliable version of this technique. Held briefly before restoring the
  // zoomable viewport so pinch still works next time.
  useEffect(()=>{
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport || !viewport.parentNode) return;
    const parent = viewport.parentNode;
    const zoomable = 'width=device-width,initial-scale=1.0,maximum-scale=5.0,user-scalable=yes';
    const locked   = 'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no';

    const forceReprocess = content => {
      parent.removeChild(viewport);
      viewport.setAttribute('content', content);
      parent.appendChild(viewport);
    };

    forceReprocess(locked);
    window.scrollTo(0,0);
    const t = setTimeout(()=>{ forceReprocess(zoomable); }, 450);
    return ()=>clearTimeout(t);
  },[tab]);

  // ── monthly backup reminder ──────────────────────────────────────────────────
  // Optional and dismissible — never blocks the app. Fires roughly every 30
  // days, measured from whichever happened more recently: an actual backup,
  // or the last time this reminder was shown/dismissed. First-ever use just
  // sets a baseline rather than nagging immediately. Monthly rather than
  // more frequent, since data now syncs to the cloud automatically — this
  // is just a periodic nudge for a downloadable hard copy, not a safety net.
  useEffect(()=>{
    if (entries.length === 0) return;
    const REMINDER_INTERVAL = 30*24*60*60*1000;
    const lastReminder = dualRead(KEYS.lastBackupReminder, null);
    const lastBackup   = dualRead(KEYS.backedUpAt, null);
    const baseline = Math.max(lastReminder||0, lastBackup||0);
    if (baseline === 0) { dualWrite(KEYS.lastBackupReminder, Date.now()); return; }
    if (Date.now() - baseline >= REMINDER_INTERVAL) setShowBackupReminder(true);
  },[]);

  const dismissBackupReminder = () => {
    dualWrite(KEYS.lastBackupReminder, Date.now());
    setBannerClosing('backup');
    setShowBackupReminder(false);
    setTimeout(()=>setBannerClosing(c=>c==='backup'?null:c), 340);
  };

  const goBackupNow = () => {
    dualWrite(KEYS.lastBackupReminder, Date.now());
    setBannerClosing('backup');
    setShowBackupReminder(false);
    setTimeout(()=>setBannerClosing(c=>c==='backup'?null:c), 340);
    setTab('settings');
    setPulseBackupBtn(true);
    setTimeout(()=>setPulseBackupBtn(false), 6000);
  };

  // ── financial year rollover ─────────────────────────────────────────────────
  // Compares the FY the person last had the app open in against today's actual
  // current FY (computed above). First-ever use just sets the baseline rather
  // than announcing a "rollover" that never happened.
  useEffect(()=>{
    const lastSeen = dualRead(KEYS.lastSeenFYYear, null);
    if (lastSeen === null) { dualWrite(KEYS.lastSeenFYYear, CURRENT_FY_YEAR); return; }
    if (lastSeen < CURRENT_FY_YEAR) setShowFYRollover(true);
  },[]);

  const dismissFYRollover = () => {
    dualWrite(KEYS.lastSeenFYYear, CURRENT_FY_YEAR);
    setBannerClosing('fy');
    setShowFYRollover(false);
    setTimeout(()=>setBannerClosing(c=>c==='fy'?null:c), 340);
  };

  // ── toasts ─────────────────────────────────────────────────────────────────
  const addToast = useCallback((msg,type='success',action=null,dur=3500,title=null)=>{
    const id=Date.now()+Math.random();
    // dur is carried onto the toast itself (not just used for the timeout
    // below) so ToastStack can render a countdown bar timed to match —
    // an actionable toast (Undo, Reload…) otherwise gives no sense of how
    // long that action stays live before it's gone.
    setToasts(t=>[...t,{id,message:msg,type,action,title,dur}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),dur);
  },[]);

  const dismissToast = useCallback(id=>setToasts(t=>t.filter(x=>x.id!==id)),[]);

  // ── offline resilience ────────────────────────────────────────────────────
  // The service worker (vite-plugin-pwa, see vite.config.js) precaches the
  // app shell so opening this with no signal shows your last-synced data
  // instead of a blank/failed load. registerType:'prompt' means an update
  // never silently swaps the running app out from under you mid-shift-entry
  // — it sits waiting until this toast's Reload is tapped. Runs once, register
  // in dev is a harmless no-op since the SW itself is production-build-only.
  useEffect(() => {
    let cancelled = false;
    import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      // updateSW(true) is the correct way to apply a waiting worker — it
      // tells that worker to skipWaiting and reloads once it's taken
      // control, rather than a plain reload that could keep serving the
      // old cached version until every other open tab closes.
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          addToast('A new version is ready', 'warn', { label: 'Reload', fn: () => updateSW(true) }, 30000);
        },
      });
    }).catch(() => { /* dev server / unsupported browser — app works exactly as before, just without offline caching */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSett = s=>{ setSettings(s); setSavedBadge(true); setTimeout(()=>setSavedBadge(false),2200); };

  // ── entry calculator ───────────────────────────────────────────────────────
  // The actual math (calcEntry, submittedGross, crossPeriodInfo, and the
  // submitted/effective-date helpers) lives in src/lib/calc.js as plain,
  // unit-tested functions that take `settings` explicitly instead of closing
  // over component state. These are thin wrappers supplying that state, so
  // every existing call site below (`calcEntry(e)`, `submittedGross(e)`, …)
  // is unaffected.
  const calcEntry = useCallback((e)=>calcEntryPure(e, settings), [settings]);
  const submittedGross = useCallback((e)=>submittedGrossPure(e, settings), [settings]);
  const crossPeriodInfo = useCallback((e)=>crossPeriodInfoPure(e, settings), [settings]);

  // Renders a tier's date list. Green means the shift was worked AND its
  // money counted within this same pay period — a normal, on-time
  // submission. Amber means the shift was actually worked in a different
  // pay period but its money landed here via a late submission crossing
  // a period boundary — same situation the calendar's own split-shaded
  // cell flags. A date whose money isn't counted in this period's total
  // at all (shouldn't normally occur, since only counted entries are ever
  // pushed, but kept as a safety fallback) shows in a lighter shade
  // instead. Used by both the List View and Calendar View period-
  // breakdown boxes. `normalColor` is unused now that the scheme is a
  // fixed green/amber, kept only so call sites don't need updating.
  const renderDatePills = (dates, normalColor) => dates.map((x,i)=>(
    <span key={i} style={{color: !x.counted?'#cbd5e1':x.cross?'#d97706':'#059669'}}>{x.d}{i<dates.length-1?', ':''}</span>
  ));

  // Shared by the List View entry row and the calendar day popup — same
  // four states, same colours, just a different font size for each
  // context. Extracted so the two can't quietly drift apart the way two
  // separately-maintained copies of the same logic eventually do.
  const carmsBadge = (e, fontSize) => {
    const c = calcEntry(e);
    // An entry with zero claimable OT hours (actual shift matched the
    // roster — logged for the record, not as an overtime claim) has
    // nothing to submit on the OT side, so it's never treated as
    // outstanding on that account — same principle as carmsOutstanding
    // and the calendar's own isFullySubmitted check.
    const hasOTHours = c.h1+c.h2+c.h3 > 0;
    const otOK = !hasOTHours || isOtSubmitted(e);
    const hasPA = e.paRate && e.paRate!=='None';
    const paOK = !hasPA || isPaSubmitted(e);
    const style = {display:'inline-block',fontSize:fontSize+'px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',marginLeft:'4px',textTransform:'uppercase',letterSpacing:'0.5px'};
    if (otOK && paOK) {
      // Nothing was ever submittable on this entry at all (no OT hours,
      // no PA) — the shift is purely a record, so a "Submitted" badge
      // would be as misleading as an "outstanding" one. Show neither.
      if (!hasOTHours && !hasPA) return null;
      return <div style={{...style,background:'var(--tint-green)',color:'#059669'}}>✓ Submitted</div>;
    }
    const goToEntry = (ev) => { ev.stopPropagation(); setSelectedCalDay(null); setConfirmDel(null); startEdit(e); setFocusCarmsToggle(true); };
    const clickable = {...style,border:'1px solid var(--border-2)',background:'var(--tint-red)',color:'var(--text-red-deep)',cursor:'pointer'};
    if (otOK && !paOK) return <div onClick={goToEntry} style={clickable}>✗ PA not submitted</div>;
    if (!otOK && paOK) return <div onClick={goToEntry} style={clickable}>✗ Overtime not submitted</div>;
    return <div onClick={goToEntry} style={clickable}>✗ Overtime &amp; PA not submitted</div>;
  };

  // Desktop-only custom calendar picker for the CARMS submission-date
  // fields, in place of the native <input type="date"> which renders
  // quite small on desktop browsers. Deliberately generous sizing — this
  // exists specifically because the native picker felt too small here;
  // mobile keeps the native input untouched, where it already works well.
  const renderDatePickerGrid = (currentValue, onSelect, closing=false) => {
    const [y, m] = datePickerMonth.split('-').map(Number);
    const firstDay = new Date(y, m-1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startOffset = (firstDay.getDay()+6)%7; // Monday-start week
    const monthLabel = firstDay.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const cells = Array(startOffset).fill(null).concat(Array.from({length:daysInMonth},(_,i)=>i+1));
    const changeMonth = (delta) => {
      const d = new Date(y, m-1+delta, 1);
      setDatePickerMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    };
    return (
      <div onClick={ev=>ev.stopPropagation()} className={'alert-pop'+(closing?' pop-out':'')} style={{background:'var(--surface)',borderRadius:'18px',boxShadow:'0 24px 64px rgba(0,0,0,0.28)',border:'1px solid var(--border)',padding:'22px',width:'360px',maxWidth:'calc(100vw - 32px)',boxSizing:'border-box'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'18px'}}>
          <button onClick={()=>changeMonth(-1)} style={{background:'var(--chip-bg)',border:'none',borderRadius:'10px',width:'38px',height:'38px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Ico n="cL" s={18} c="#475569"/></button>
          <div style={{fontWeight:900,fontSize:'17px',color:'var(--ink)'}}>{monthLabel}</div>
          <button onClick={()=>changeMonth(1)} style={{background:'var(--chip-bg)',border:'none',borderRadius:'10px',width:'38px',height:'38px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><Ico n="cR" s={18} c="#475569"/></button>
        </div>
        <div style={{fontSize:'12.5px',fontWeight:700,color:'var(--muted)',textAlign:'center',marginBottom:'14px'}}>
          {datePickerForV==='ot' ? 'Select the date you submitted this OT to CARMS' : datePickerForV==='pa' ? 'Select the date you submitted this PA claim to MetHR' : datePickerForV==='carmsBulk' ? `Select the date you submitted ${Object.keys(carmsSelected).length} claim${Object.keys(carmsSelected).length!==1?'s':''}` : 'Select the date of this shift'}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'6px'}}>
          {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=><div key={d} style={{textAlign:'center',fontSize:'11.5px',fontWeight:800,color:'var(--quiet)',padding:'4px 0'}}>{d}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}}>
          {cells.map((d,i)=>{
            if (d===null) return <div key={i}/>;
            const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isSelected = dateStr===currentValue;
            const isToday = dateStr===todayStr;
            return (
              <button key={i} onClick={()=>{ onSelect(dateStr); setDatePickerFor(null); }} style={{aspectRatio:'1',border:isToday&&!isSelected?'1.5px solid #2563eb':'none',borderRadius:'10px',background:isSelected?'#2563eb':'transparent',color:isSelected?'#fff':'var(--ink)',fontWeight:isSelected?900:700,fontSize:'14.5px',cursor:'pointer',fontFamily:'inherit'}}>{d}</button>
            );
          })}
        </div>
      </div>
    );
  };


  // ── derived totals ─────────────────────────────────────────────────────────
  // Includes an entry if its shift date, OR either component's effective
  // (submission) date, falls in this financial year — a shift worked right
  // at the end of one FY but not submitted until the next needs to still be
  // visible here so its pay gets attributed to the FY it actually lands in.
  const fyEntries = useMemo(()=>entries.filter(e=>
    (e.date>=FY_START&&e.date<=FY_END) ||
    (effectiveOtDate(e)>=FY_START&&effectiveOtDate(e)<=FY_END) ||
    (effectivePaDate(e)>=FY_START&&effectivePaDate(e)<=FY_END)
  ),[entries]);
  const yearsWithData = useMemo(()=>{
    const set = new Set();
    entries.forEach(e=>set.add(getFYStartYearFor(e.date)));
    return [...set].filter(y=>y<CURRENT_FY_YEAR).sort((a,b)=>b-a);
  },[entries]);

  const totals = useMemo(()=>{
    const svcData = settings.rank && settings.service ? PAY_RATES[settings.rank]?.[settings.service] : null;

    // Anchored to the REAL UK tax year (6 Apr – 5 Apr), not the force's pay
    // year (which starts 9 Feb) — HMRC resets personal allowance/bands on
    // 6 April regardless of when the police pay calendar happens to start.
    // Computed up front so the cascade below can use it.
    const taxYearStart = getUKTaxYearStart(todayStr);
    const taxYearEnd    = addYearMinusOneDay(taxYearStart);
    const ytdRangeEnd   = todayStr <= taxYearEnd ? todayStr : taxYearEnd;

    // ── build the period-by-period cumulative marginal cascade ────────────────
    // For each period, in chronological order: add salary+LW+LA, then layer this
    // period's overtime, then night enhancement, then PA on top of the running
    // cumulative total. Each layer's tax is the difference in cumulative tax
    // before/after it — i.e. the true marginal rate for that slice of income.
    //
    // The running total only ever accumulates periods that belong to the
    // CURRENT UK tax year — a period is treated as belonging to whichever tax
    // year contains its end date (matching how PAYE actually works: tax
    // follows the pay date, not a smooth day-by-day split). The pay calendar
    // starts 9 Feb, so exactly one period each year (the one ending before
    // 6 April) falls in the previous, already-closed tax year; its own
    // marginal tax is estimated as a fresh start from zero rather than folded
    // into this year's cumulative, since this view has no visibility into
    // whatever else was earned earlier in that prior year.
    let cum = 0;
    let totalGross=0, totalHrs=0;

    // Computed once per entry rather than once per entry PER period — the
    // loop below checks all 13 periods for every entry, so without this,
    // calcEntry (and the date lookups) would re-run up to 13x more than
    // necessary for the exact same result.
    const entryCalc = new Map(fyEntries.map(e=>[e, calcEntry(e)]));
    const entryOtDate = new Map(fyEntries.map(e=>[e, effectiveOtDate(e)]));
    const entryPaDate = new Map(fyEntries.map(e=>[e, effectivePaDate(e)]));

    const periodBreakdown = PAY_PERIODS.map((p,pIdx)=>{
      // Hours worked this period — tracks the shift's own date regardless
      // of submission timing, since this is a factual record of when the
      // work happened, not when it gets paid.
      const pE = fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
      let hrs=0;
      pE.forEach(e=>{ const c=entryCalc.get(e); hrs+=c.h1+c.h2+c.h3; });

      // Money earned this period — attributed by each component's own
      // submission date, not the shift date, since OT and PA can be
      // submitted on different days and each lands in whichever period
      // its own submission date falls in, matching the real payslip.
      let ot=0, night=0, pa=0;
      fyEntries.forEach(e=>{
        const c = entryCalc.get(e);
        const otDate = entryOtDate.get(e);
        // Night allowance is automatic and only waits on the OT toggle when
        // there are genuine overtime hours on the entry too — see
        // submittedGross for the full reasoning. A night-only entry's
        // allowance lands in its own period unconditionally.
        const hasOTHours = c.h1 + c.h2 + c.h3 > 0;
        if (!hasOTHours) {
          if (otDate>=p.start && otDate<=p.end) night+=c.night;
        } else if (isOtSubmitted(e) && otDate>=p.start && otDate<=p.end) {
          ot+=c.ot; night+=c.night;
        }
        const hasPA = e.paRate && e.paRate!=='None';
        const paDate = entryPaDate.get(e);
        if (hasPA && isPaSubmitted(e) && paDate>=p.start && paDate<=p.end) { pa+=c.pa; }
      });

      const baseAmt = periodBaseAmount(p, svcData); // salary + London Weighting + London Allowance
      const inCurrentTaxYear = p.end >= taxYearStart;

      // How far into the relevant tax year this period's end falls, as a
      // continuous 0-1 fraction — used to pro-rate the annual PA/band
      // thresholds down to "so far this year", exactly as cumulative PAYE
      // does it. A period outside the current tax year gets its own span as
      // the reference instead (there's no larger year to measure against).
      const daysForFraction = inCurrentTaxYear
        ? Math.max(0, (new Date(p.end) - new Date(taxYearStart))/86400000) + 1
        : daysInclusive(p.start, p.end);
      const yearFraction = Math.max(1/365, Math.min(1, daysForFraction/365));

      let periodCum = inCurrentTaxYear ? cum : 0; // fresh start for a prior-tax-year period
      periodCum += baseAmt;                        // taxed first, so OT stacks on top of it
      let pGross = baseAmt;                         // this period's gross so far, for NI (unaffected by the tax-year split — NI has no annual concept)

      const otResult    = applyBandTax(periodCum, ot,    yearFraction, pGross); periodCum += ot;    pGross += ot;
      const nightResult = applyBandTax(periodCum, night, yearFraction, pGross); periodCum += night; pGross += night;
      const paResult    = applyBandTax(periodCum, pa,    yearFraction, pGross); periodCum += pa;

      if (inCurrentTaxYear) cum = periodCum; // only carry forward into the next period if this one belongs to the current tax year

      totalGross += ot+night+pa; totalHrs += hrs;

      return {
        month:p.month, start:p.start, end:p.end,
        baseAmt, ot, night, pa,
        otResult, nightResult, paResult,
        combinedGross: ot+night+pa,
        combinedNet: otResult.net+nightResult.net+paResult.net,
        cumAfter: periodCum,
        inCurrentTaxYear,
      };
    });

    const totalNet = periodBreakdown.reduce((s,pb)=>s+pb.combinedNet,0);
    // Per-component YTD figures — same underlying otResult/nightResult/paResult
    // used everywhere else, just summed by component instead of combined, so
    // totalOTGross+totalNightGross+totalPAGross === totalGross by construction
    // (same for the net figures), keeping this consistent with every other tab.
    const totalOTGross    = periodBreakdown.reduce((s,pb)=>s+pb.ot,0);
    const totalOTNet      = periodBreakdown.reduce((s,pb)=>s+pb.otResult.net,0);
    const totalNightGross = periodBreakdown.reduce((s,pb)=>s+pb.night,0);
    const totalNightNet   = periodBreakdown.reduce((s,pb)=>s+pb.nightResult.net,0);
    const totalPAGross    = periodBreakdown.reduce((s,pb)=>s+pb.pa,0);
    const totalPANet      = periodBreakdown.reduce((s,pb)=>s+pb.paResult.net,0);

    const getP=i=>{
      if(i<0||i>=periodBreakdown.length) return null;
      const pb=periodBreakdown[i];
      return{month:pb.month,start:pb.start,end:pb.end,gross:pb.combinedGross,net:pb.combinedNet};
    };

    const cumData = periodBreakdown.map(pb=>({short:PAY_PERIODS.find(p=>p.month===pb.month).short,cumulative:pb.cumAfter}));

    // ── salary + allowances YTD (for the top Home summary card) ───────────────
    // Anchored to the REAL UK tax year (6 Apr – 5 Apr), not the force's pay
    // year (which starts 9 Feb) — HMRC resets personal allowance/bands on
    // 6 April regardless of when the police pay calendar happens to start.
    // Salary/allowances accrue in proper monthly instalments (stepping up
    // once per completed month) rather than a smooth daily creep.
    const todayD      = new Date(todayStr);
    const fyStartD    = new Date(FY_START);
    const fyEndD      = new Date(FY_END);
    const effectiveEnd = todayD <= fyEndD ? todayD : fyEndD;
    const daysElapsed  = Math.max(0, (effectiveEnd - fyStartD) / 86400000); // still used for "days into FY" label (police pay-year)

    const taxYearDaysElapsed = Math.max(0, (new Date(ytdRangeEnd) - new Date(taxYearStart)) / 86400000);

    const salaryYTD = svcData ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, taxYearStart, ytdRangeEnd) : 0;
    const lwYTD     = monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStart, ytdRangeEnd);
    const laYTD     = monthlySteppedAmount(LONDON_ALLOWANCE, taxYearStart, ytdRangeEnd);

    // Overtime/PA actually earned so far THIS TAX YEAR — excludes future-dated
    // "Planned" entries, and excludes anything dated before the tax year
    // started (which belongs to the previous tax year's allowance/bands).
    // Hours use the shift's own date; money uses each component's own
    // submission date, same split as periodBreakdown above and for the
    // same reason — OT and PA can each land in a different YTD window.
    let otPaidToDate = 0, otNightPaidToDate = 0, hrsToDate = 0;
    fyEntries.forEach(e=>{
      const c = entryCalc.get(e);
      if (e.date >= taxYearStart && e.date <= todayStr) {
        hrsToDate += c.h1 + c.h2 + c.h3;
      }
      const otDate = entryOtDate.get(e);
      // Same principle as periodBreakdown above — night allowance from a
      // night-only entry counts unconditionally, since there's no OT to
      // wait on.
      const hasOTHoursYTD = c.h1 + c.h2 + c.h3 > 0;
      if (!hasOTHoursYTD) {
        if (otDate >= taxYearStart && otDate <= todayStr) {
          otPaidToDate += c.night;
          otNightPaidToDate += c.night;
        }
      } else if (isOtSubmitted(e) && otDate >= taxYearStart && otDate <= todayStr) {
        otPaidToDate += c.ot + c.night;
        otNightPaidToDate += c.ot + c.night; // hourly-earned only, excludes flat PA
      }
      const hasPA = e.paRate && e.paRate!=='None';
      const paDate = entryPaDate.get(e);
      if (hasPA && isPaSubmitted(e) && paDate >= taxYearStart && paDate <= todayStr) {
        otPaidToDate += c.pa;
      }
    });

    // Break the to-date overtime/night money down by which tax band it falls
    // in (stacked on top of salary+allowances), then convert each band's
    // portion back to hours using the blended average £/hr for that money.
    const avgHourlyRate = hrsToDate > 0 ? otNightPaidToDate / hrsToDate : 0;
    const hoursByBand = splitAcrossBands(salaryYTD+lwYTD+laYTD, otNightPaidToDate)
      .map(b => ({ ...b, hours: avgHourlyRate > 0 ? b.amount / avgHourlyRate : 0 }));

    // Full UK tax year totals (for showing "earned so far / full year" progress),
    // matching the same tax-year window and monthly-stepped method as above.
    const lwAnnualTotal = monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStart, taxYearEnd);
    const laAnnualTotal = monthlySteppedAmount(LONDON_ALLOWANCE, taxYearStart, taxYearEnd);
    const salaryAnnualTotal = svcData ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, taxYearStart, taxYearEnd) : 0;

    const combinedGrossYTD = salaryYTD + lwYTD + laYTD + otPaidToDate;

    // Deductions on what's actually been earned so far — no projection or
    // extrapolation. Thresholds are pro-rated to how far through the UK tax
    // year we are (6 Apr onward), not how far through the force's pay year
    // (which starts 9 Feb, ~2 months earlier) — using the pay-year count here
    // would overstate how much of the tax year has elapsed and understate
    // every YTD-based figure below.
    const taxYearFraction = Math.max(1/365, Math.min(1, taxYearDaysElapsed/365));
    const ytdTax = calcUKIncomeTax(combinedGrossYTD, taxYearFraction);
    // NI is assessed per pay period in isolation (no annual concept), so sum
    // only the periods that actually fall within the current UK tax year —
    // slicing by pay-period position would pull in periods 1-2 of the pay
    // year, which run 9 Feb – ~5 Apr and belong to the previous tax year.
    const ytdNI = periodBreakdown
      .filter(pb => pb.end >= taxYearStart && pb.start <= todayStr)
      .reduce((s,pb)=>s + calcNI(pb.baseAmt + pb.ot + pb.night + pb.pa), 0);
    const combinedNetYTD = combinedGrossYTD - ytdTax - ytdNI;

    const currentBand   = getTaxBand(combinedGrossYTD, taxYearFraction);
    const taxBand        = currentBand.name;
    const taxBandRate    = currentBand.rate;

    // Same annualisation the tax functions use internally, surfaced here so
    // the £100k tracker and the tax figures always agree with each other.
    const projectedAnnualGross = combinedGrossYTD / taxYearFraction;
    const taperExtraTax = projectedAnnualGross > 100000
      ? calcUKIncomeTax(projectedAnnualGross, 1) - calcUKIncomeTaxNoTaper(projectedAnnualGross, 1)
      : 0;

    return{
      totalGross, totalNet, totalHrs, cumData, periodBreakdown,
      totalOTGross, totalOTNet, totalNightGross, totalNightNet, totalPAGross, totalPANet,
      prev:getP(currPeriodIdx-1), curr:getP(currPeriodIdx), next:getP(currPeriodIdx+1),
      salaryYTD, lwYTD, laYTD, lwAnnualTotal, laAnnualTotal, salaryAnnualTotal, combinedGrossYTD, combinedNetYTD,
      ytdTax, ytdNI, taxBand, taxBandRate, daysElapsed, taxYearDaysElapsed, taxYearStart, hoursByBand,
      projectedAnnualGross, taperExtraTax,
    };
  },[fyEntries,calcEntry,settings,currPeriodIdx,todayStr]);

  // Desktop's "At a Glance" sidebar (below, in the JSX) shows this same
  // current-period Gross/Net pair Dashboard's own hero row does — but
  // unlike every other headline figure in the app, it used to just snap to
  // a new value instead of counting there. Declared here at the top level
  // (rather than inside the aside's own render, which only ever runs while
  // isWide is true) so the hook itself is called unconditionally regardless
  // of screen width, same reasoning as every other top-level hook in here.
  const glancePb = currPeriodIdx>=0 ? totals.periodBreakdown[currPeriodIdx] : null;
  const animatedGlanceGross = useCountUp(glancePb ? glancePb.combinedGross : 0);
  const animatedGlanceNet = useCountUp(glancePb ? glancePb.combinedNet : 0);

  // Full-year tax forecast, pension-adjusted and taper-aware — pulled out
  // of the Tax & 100K+ Calculator card's own render so the actual formula
  // lives in one place, kept separate from the JSX that displays it.
  const taxForecast = useMemo(()=>{
    if (!(settings.rank && settings.service)) return null;
    const proj = totals.projectedAnnualGross;
    const pensionablePayF = totals.salaryAnnualTotal + totals.lwAnnualTotal;
    const pensionF = calcPensionContribution(pensionablePayF, 1);
    const taxableGrossF = Math.max(0, proj - pensionF.amount);
    const overF = taxableGrossF > 100000;
    const paLostF = overF ? Math.min(12570, Math.floor((taxableGrossF-100000)/2)) : 0;
    const paRemainingF = 12570 - paLostF;
    const extraTaxF = overF ? (calcUKIncomeTax(taxableGrossF,1) - calcUKIncomeTaxNoTaper(taxableGrossF,1)) : 0;
    const breakdownF = computeTaxBandBreakdown(taxableGrossF, 1);
    const niF = estimateAnnualNI(proj);
    const netF = proj - pensionF.amount - breakdownF.totalTax - niF;
    const band = getTaxBand(taxableGrossF, 1);
    return { proj, pensionablePayF, pensionF, taxableGrossF, overF, paLostF, paRemainingF, extraTaxF, breakdownF, niF, netF, bandName: band.name };
  },[settings, totals]);

  // ── CARMS outstanding claims ──────────────────────────────────────────────
  // Grouped by pay period (matching how Archived Financial Years and the
  // month pills already frame things), each entry that has anything
  // outstanding shows once, with however much of it — OT, PA, or both —
  // hasn't been submitted yet. Fully-submitted entries and entries with no
  // pay component at all (pure TOIL-only days with no PA) never appear here.
  const carmsOutstanding = useMemo(()=>{
    const groups = [];
    let totalAmount = 0, totalClaims = 0, totalOtAmount = 0, totalPaAmount = 0;
    PAY_PERIODS.forEach((p,pIdx)=>{
      const pE = entries.filter(e=>e.date>=p.start&&e.date<=p.end);
      const items = [];
      pE.forEach(e=>{
        const hasPA = e.paRate && e.paRate!=='None';
        const c = calcEntry(e);
        // Night allowance is paid automatically and never needs its own
        // CARMS submission — only genuine overtime hours (the 1.33x/1.5x/2.0x
        // tiers) do. An entry with only night hours (no OT hours) has
        // nothing to claim, so it should never show as outstanding here,
        // regardless of what its own otSubmitted flag happens to be — that
        // toggle is disabled for exactly this reason on the Log Overtime
        // form (see hasOTHours there).
        const hasOTHours = c.h1 + c.h2 + c.h3 > 0;
        const otOK = !hasOTHours || isOtSubmitted(e);
        const paOK = !hasPA || isPaSubmitted(e);
        if (otOK && paOK) return; // nothing outstanding on this entry
        // !otOK can only be true when hasOTHours is true (otOK is always
        // true otherwise), so night allowance tied to genuinely unsubmitted
        // OT hours is correctly still part of the outstanding amount here —
        // it's only excluded for night-only entries, which never reach
        // !otOK at all.
        const otAmt = !otOK ? (c.ot + c.night) : 0;
        const paAmt = (hasPA && !paOK) ? c.pa : 0;
        const amount = otAmt + paAmt;
        if (amount <= 0 && otOK && paOK) return; // defensive, shouldn't happen given the check above
        // TOIL doesn't have its own submit toggle — it rides on otSubmitted,
        // same as the banking gate built earlier. An entry only has TOIL at
        // stake if it's actually taking TOIL (or a mix) AND the overtime
        // side is what's outstanding.
        const takesToil = e.takeAs==='toil' || e.takeAs==='mix';
        const toilOutstanding = !otOK && takesToil;
        const toilHrs = toilOutstanding ? c.toilBanked : 0;
        items.push({ entry: e, otOutstanding: !otOK, paOutstanding: hasPA && !paOK, toilOutstanding, toilHrs, otAmt, paAmt, amount });
        totalOtAmount += otAmt;
        totalPaAmount += paAmt;
      });
      if (items.length) {
        const periodTotal = items.reduce((s,it)=>s+it.amount,0);
        groups.push({ period: p, periodIdx: pIdx, items, periodTotal });
        totalAmount += periodTotal;
        // Overtime and TOIL share one toggle (otSubmitted) so they count as
        // a single item together; PA is independent and counts separately —
        // a day with both outstanding is genuinely two claims to submit,
        // not one, since they go to two different systems (CARMS/MetHR).
        totalClaims += items.reduce((s,it)=>s+(it.otOutstanding?1:0)+(it.paOutstanding?1:0),0);
      }
    });
    return { groups, totalAmount, totalClaims, totalOtAmount, totalPaAmount, periodCount: groups.length };
  },[entries, calcEntry]);

  // Which subset of the outstanding list is currently shown — All /
  // Overtime / PA. Overtime and PA are inclusive of each other (an item
  // outstanding on both counts shows under either filter), since there's
  // no longer a separate "Both" option to catch that overlap.
  const [carmsFilter, setCarmsFilter] = useState('all');
  // ── CARMS bulk submit ─────────────────────────────────────────────────────
  // The real workflow this screen exists for — submitting a stack of claims
  // to CARMS in one sitting — used to mean visiting each shift's own edit
  // screen and flipping its toggle individually, once per claim. Select mode
  // lets several rows (or a whole period at once) get marked submitted
  // together, asking for one shared submission date instead of one per shift.
  // carmsSelected maps entry id -> which of that row's own pieces were
  // actually showing (and therefore selected) at the moment it was picked —
  // {ot,pa} rather than a flat id set, since one entry can carry both an
  // outstanding OT and PA claim, and a filtered view might only be showing
  // one of the two. Nothing here touches the existing single-tap-to-edit
  // flow — it only exists while carmsSelectMode is on.
  const [carmsSelectMode, setCarmsSelectMode] = useState(false);
  const [carmsSelected, setCarmsSelected] = useState({});
  const toggleCarmsSelectMode = () => { setCarmsSelectMode(v=>!v); setCarmsSelected({}); };
  useEscapeToClose(carmsSelectMode, toggleCarmsSelectMode);
  useBackButtonCloses(carmsSelectMode, toggleCarmsSelectMode);
  // Toggles ONE claim-type on ONE entry — not the whole entry at once.
  // An entry with both OT and PA outstanding used to select/deselect both
  // together as a single unit, forcing them into the same bulk submission
  // even though CARMS (overtime) and MetHR (PA) are separate systems people
  // often don't submit to on the same schedule. 'key' is 'ot' or 'pa';
  // the entry drops out of carmsSelected entirely once neither is set,
  // rather than lingering as an empty {} that would still count towards
  // "N selected".
  const toggleCarmsClaim = (entryId, key) => {
    setCarmsSelected(prev => {
      const existing = prev[entryId] || {};
      const updated = {...existing, [key]: !existing[key]};
      const next = {...prev};
      if (!updated.ot && !updated.pa) delete next[entryId];
      else next[entryId] = updated;
      return next;
    });
  };
  const toggleCarmsGroup = (rows) => { // rows: [{id, markers}]
    setCarmsSelected(prev => {
      // "fully selected" means every row's *required* markers (whichever of
      // ot/pa that row's own r.markers says actually applies) are already
      // set — not just that the entry has any marker at all. Otherwise a
      // row selected for PA only would count as "done" here even with its
      // own OT still outstanding, and clicking the group header would
      // deselect everything instead of finishing the job.
      const allSelected = rows.every(r => {
        const sel = prev[r.id] || {};
        return (!r.markers.ot || sel.ot) && (!r.markers.pa || sel.pa);
      });
      // r.markers only ever carries the keys actually relevant to this row
      // under whatever filter produced it (see TabCarms' required()), never
      // an explicit false — so merging (rather than replacing) an entry's
      // existing markers here can't clobber a key this particular group
      // toggle isn't concerned with, e.g. an OT claim already selected on
      // its own while this toggle only cares about PA.
      const next = {...prev};
      rows.forEach(r => {
        const existing = prev[r.id] || {};
        if (allSelected) {
          const cleared = {...existing};
          Object.keys(r.markers).forEach(k => delete cleared[k]);
          if (cleared.ot || cleared.pa) next[r.id] = cleared; else delete next[r.id];
        } else {
          next[r.id] = {...existing, ...r.markers};
        }
      });
      return next;
    });
  };
  const openCarmsBulkConfirm = () => {
    setDatePickerMonth(todayStr.slice(0,7));
    setDatePickerFor('carmsBulk');
  };
  const bulkMarkCarmsSubmitted = (dateStr) => {
    const selectedIds = Object.keys(carmsSelected);
    if (selectedIds.length===0) return;
    // Snapshot only the fields this action is about to touch on each
    // entry, not the whole entry — matching the same "the toast can put
    // this back" convention delEntry/deleteToilTaken already use, just
    // per-field instead of whole-item since this changes several entries
    // at once rather than removing one.
    const before = {};
    entries.forEach(e => {
      const markers = carmsSelected[e.id];
      if (!markers) return;
      before[e.id] = {
        ...(markers.ot ? { otSubmitted: e.otSubmitted, otSubmittedDate: e.otSubmittedDate } : {}),
        ...(markers.pa ? { paSubmitted: e.paSubmitted, paSubmittedDate: e.paSubmittedDate } : {}),
      };
    });
    setEntries(prev => prev.map(e => {
      const markers = carmsSelected[e.id];
      if (!markers) return e;
      const updates = {};
      if (markers.ot) { updates.otSubmitted = true; updates.otSubmittedDate = dateStr; }
      if (markers.pa) { updates.paSubmitted = true; updates.paSubmittedDate = dateStr; }
      return { ...e, ...updates };
    }));
    const undoBulkSubmit = () => setEntries(prev => prev.map(e => before[e.id] ? { ...e, ...before[e.id] } : e));
    addToast(`${selectedIds.length} claim${selectedIds.length!==1?'s':''} marked as submitted`, 'undo', {label:'Undo', fn:undoBulkSubmit}, 7000);
    haptic();
    setDatePickerFor(null);
    toggleCarmsSelectMode();
  };
  // Sequential numbering for the CARMS/PA list — oldest claim is #1, and the
  // numbers shift automatically as claims get submitted, since this is
  // recomputed fresh from whatever's still outstanding rather than being
  // assigned once and stuck to an entry. Numbers whatever the current filter
  // actually shows: Overtime and PA are two separate claims on the same
  // entry (matching how the CARMS/PA badge itself counts them), while TOIL
  // rides on the same toggle as Overtime and only gets its own number when
  // the TOIL filter is the one actually displaying it.
  const carmsClaimNumbers = useMemo(()=>{
    const flat = [];
    carmsOutstanding.groups.forEach(g=>{
      g.items.forEach(it=>{
        if (carmsFilter==='toil') {
          if (it.toilOutstanding) flat.push({ key: it.entry.id+'-toil', date: it.entry.date });
        } else {
          // TOIL never gets its own key here — outside the dedicated TOIL
          // filter it's shown merged into the same row as Overtime (they're
          // the same submission), so it borrows the '-ot' number rather
          // than needing one of its own.
          if (it.otOutstanding && carmsFilter!=='pa') flat.push({ key: it.entry.id+'-ot', date: it.entry.date });
          if (it.paOutstanding && carmsFilter!=='ot') flat.push({ key: it.entry.id+'-pa', date: it.entry.date });
        }
      });
    });
    flat.sort((a,b)=> a.date===b.date ? 0 : (a.date<b.date ? -1 : 1));
    const map = new Map();
    flat.forEach((f,i)=>map.set(f.key, i+1));
    return map;
  },[carmsOutstanding, carmsFilter]);

  // ── TOIL balance ───────────────────────────────────────────────────────────
  // All-time running balance: every hour ever banked as TOIL (from any logged
  // shift, in any year) minus every hour ever logged as taken. Deliberately
  // NOT scoped to the financial year the way pay figures are — TOIL carries
  // over, it doesn't reset with the tax year.
  const toilLedger = useMemo(()=>{
    const earned = entries
      .filter(e=>e.otRateTier && (parseFloat(e.toilHours)||0) > 0 && isOtSubmitted(e))
      .map(e=>{
        const worked = parseFloat(e.toilHours)||0;
        const dLabel = new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
        return {
          id:'earn-'+e.id, date:e.date, type:'earned',
          hours: calcEntry(e).toilBanked,
          note: `${fmtHM(worked)}h OT @ ${RATE_TIER_MULT[e.otRateTier]}x — ${e.reason||'shift'} ${dLabel}`,
        };
      });
    const taken = toilTaken.map(t=>({
      id:'take-'+t.id, rawId:t.id, date:t.date, type:'taken',
      hours: -(parseFloat(t.hours)||0), note: t.note||'TOIL taken',
    }));
    const combined = [...earned, ...taken].sort((a,b)=>a.date.localeCompare(b.date));
    let running = 0;
    const rows = combined.map(l=>{ running += l.hours; return {...l, balanceAfter:running}; });
    return { rows, balance: running };
  },[entries, toilTaken, calcEntry]);

  // ── auto-calc effects for Record Shift Times ────────────────────────────────
  // Keep the Overtime Hours figure in sync with rostered/actual times and duty
  // type, unless the person has manually overridden it (form.otAuto false) —
  // e.g. to add hours for a recall the times themselves don't capture.
  //
  // Skip the very next pass whenever a different record gets loaded into the
  // form (opening an entry to edit it, or clearing back to a blank new one).
  // Without this, the effect below reruns the instant startEdit() populates
  // the form — and if its freshly-computed figure doesn't exactly match what
  // was actually saved (e.g. a record logged before this auto-calc existed,
  // or with the Overtime Hours nudged by hand under an older app version
  // that didn't flip otAuto off), it silently overwrites the saved hours
  // right as the record opens, reading as the overtime having vanished. It
  // should only ever recalculate in response to the person actually
  // changing a time picker, never as a side effect of switching which
  // record is loaded.
  const skipAutoCalcRef = useRef(false);
  useEffect(()=>{ skipAutoCalcRef.current = true; },[editing]);

  useEffect(()=>{
    if (skipAutoCalcRef.current) { skipAutoCalcRef.current = false; return; }
    if (!form.recordShiftTimes || !form.otAuto || !form.otRateTier) return;
    const auto = Math.round(calcAutoOTHours(form)*100)/100;
    const current = parseFloat(form[form.otRateTier])||0;
    if (current===auto) return;
    setForm(f=>({ ...f, [form.otRateTier]: auto ? String(auto) : '' }));
  },[form.rosteredStart, form.rosteredEnd, form.actualStart, form.actualEnd, form.dutyType, form.otAuto, form.otRateTier, form.recordShiftTimes]);

  // Which rate tier TOIL banking applies to — in auto-calc mode this is just
  // form.otRateTier; in manual mode there's no rate-pill selector, so we look
  // at which single hours133/150/200 box actually has something in it. If
  // more than one tier is populated there's no single clear rate, so TOIL
  // doesn't apply (Take As stays hidden and any TOIL split gets reset).
  const manualSingleTier = (()=>{
    const populated = ['hours133','hours150','hours200'].filter(k=>(parseFloat(form[k])||0)>0);
    return populated.length===1 ? populated[0] : null;
  })();
  const effectiveTier = form.recordShiftTimes ? form.otRateTier : manualSingleTier;

  // Keep toilHours tracking the Pay/TOIL/Mix choice: 'pay' → 0, 'toil' → the
  // full total, 'mix' → whatever's been split, clamped if the total shrinks
  // (e.g. the overtime hours were edited down after a Mix split was made).
  useEffect(()=>{
    if (!effectiveTier) {
      if ((form.toilHours && form.toilHours!=='0') || form.takeAs!=='pay') {
        setForm(f=>({...f, toilHours:'0', takeAs:'pay'}));
      }
      return;
    }
    // in manual mode, keep otRateTier pointing at whichever tier is actually
    // populated, so the saved entry and calcEntry agree on which tier TOIL
    // was taken from
    if (form.otRateTier !== effectiveTier) { setForm(f=>({...f, otRateTier:effectiveTier})); return; }
    const total = parseFloat(form[effectiveTier])||0;
    const currentToil = parseFloat(form.toilHours)||0;
    let target = currentToil;
    if (form.takeAs==='pay') target = 0;
    else if (form.takeAs==='toil') target = total;
    else target = Math.min(currentToil, total); // mix — just clamp
    if (target!==currentToil) setForm(f=>({ ...f, toilHours: target ? String(target) : '0' }));
  },[effectiveTier, form.takeAs, form.hours133, form.hours150, form.hours200, form.toilHours, form.otRateTier]);

  // ── live form preview ──────────────────────────────────────────────────────
  // Shows the net for this shift as if logged right now — using the tax band
  // that applies once this shift's total is added to everything already
  // earned this FY (salary, allowances, other OT/PA).
  const preview = useMemo(()=>{
    const r  = getRates(settings.rank, settings.service, form.date||todayStr);
    const h1 = parseFloat(form.hours133)||0;
    const h2 = parseFloat(form.hours150)||0;
    const h3 = parseFloat(form.hours200)||0;
    const toilH = form.otRateTier ? (parseFloat(form.toilHours)||0) : 0;
    const payH1 = form.otRateTier==='hours133' ? Math.max(0,h1-toilH) : h1;
    const payH2 = form.otRateTier==='hours150' ? Math.max(0,h2-toilH) : h2;
    const payH3 = form.otRateTier==='hours200' ? Math.max(0,h3-toilH) : h3;
    const ot    = payH1*r.r133 + payH2*r.r150 + payH3*r.r200;
    const toilBanked = form.otRateTier ? toilH * RATE_TIER_MULT[form.otRateTier] : 0;
    const night = 0; // night hours no longer factor into any calculation
    const pa    = PA_RATES[form.paRate]||0;
    const gross = ot + night + pa;
    // Use the pay period this shift falls in for NI (period-based, no annual
    // concept), and the shift's own date for pro-rating tax thresholds —
    // reflecting the right point in the UK tax year, not the pay calendar.
    const d = form.date||todayStr;
    const pIdx = PAY_PERIODS.findIndex(p=>d>=p.start&&d<=p.end);
    const pb = pIdx>=0 ? totals.periodBreakdown[pIdx] : null;
    const periodGrossBefore = pb ? pb.baseAmt + pb.ot + pb.night + pb.pa : 0;
    const result = applyBandTax(totals.combinedGrossYTD, gross, taxYearFractionForDate(d), periodGrossBefore);
    return { gross, net:result.net, night, toilBanked, has:gross>0||toilBanked>0 };
  },[form, settings, todayStr, totals.combinedGrossYTD, totals.periodBreakdown, currPeriodIdx]);

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleSave=()=>{
    if(!form.date) return;

    // One entry per date — if the date is already taken, point the person at
    // the existing record rather than silently creating a second one.
    const dupe = entries.find(e=>e.date===form.date && (!editing || e.id!==editing.id));
    if(dupe){
      const dStr = new Date(form.date+'T12:00:00').toLocaleDateString('en-GB');
      addToast(
        `You've already logged overtime for ${dStr}. Edit that record instead of creating a second one.`,
        'alert',
        {label:'Edit existing entry',fn:()=>startEdit(dupe)},
        8000,
        'Entry already exists'
      );
      return;
    }

    const targetDate = form.date;
    // Trim trailing whitespace so the blank line left for the cursor after
    // Record Shift Times doesn't get saved if the person never typed into it.
    const cleanForm = { ...form, comments: (form.comments||'').replace(/\s+$/,'') };

    // Past both guards, so this click is definitely going to save — show
    // the button's own checkmark confirmation for a beat before actually
    // committing the entry and navigating away (which happens instantly,
    // so without this delay the confirmation would never be seen).
    setJustSaved(true);
    haptic();
    setTimeout(() => {
      let savedId, updatedEntries;
      if(editing){
        savedId = editing.id;
        updatedEntries = entries.map(e=>e.id===editing.id?{...cleanForm,id:e.id}:e);
        setEntries(updatedEntries);
        addToast('Record updated');
      } else {
        savedId = Date.now().toString();
        updatedEntries = [...entries,{...cleanForm,id:savedId}];
        setEntries(updatedEntries);
        addToast('Overtime logged');
        // nudge backup every 5 entries
        const count=(dualRead(KEYS.backupCount,0)||0)+1;
        dualWrite(KEYS.backupCount,count);
        if(count%5===0) setTimeout(()=>addToast(`${count} records logged — download a backup?`,'warn',{label:'Backup now',fn:handleExport},8000),800);
      }

      // Show the person the record they just saved, in whichever Breakdown view
      // they've set as their default.
      const periodIdx = PAY_PERIODS.findIndex(p=>targetDate>=p.start&&targetDate<=p.end);
      const period = periodIdx>=0 ? PAY_PERIODS[periodIdx] : null;
      skipBreakdownReset.current = true; // this navigation targets a specific entry

      if(defaultBreakdownView==='calendar' && period){
        setBreakdownView('calendar');
        setCalPeriodIdx(periodIdx);
        // open that day's detail popover so the entry is visible straight away
        const dEntries = updatedEntries.filter(e=>e.date===targetDate);
        const dayTotals = dEntries.reduce((acc,e)=>{
          const c=calcEntry(e);
          acc.hrs += c.h1+c.h2+c.h3;
          if(e.paRate && e.paRate!=='None') acc.pa = true;
          return acc;
        },{hrs:0,pa:false});
        setSelectedCalDay({
          ds: targetDate, dEntries, periodIdx,
          totalHrs: dayTotals.hrs, hasPA: dayTotals.pa, hasOT: true,
        });
        if(mainRef.current) mainRef.current.scrollTo({top:0,behavior:'auto'});
      } else {
        setBreakdownView('list');
        if(period) setExpanded(period.month);
        setFocusEntryId(savedId);
      }
      setTab('months');

      setForm({...blankForm,date:todayStr}); setEditing(null);
      setJustSaved(false);
    }, 480);
  };

  const startEdit=e=>{ setForm(e); setEditing(e); setTab('add'); };
  const delEntry=id=>{
    const d=entries.find(e=>e.id===id);
    setEntries(prev=>prev.filter(x=>x.id!==id));
    setConfirmDel(null);
    addToast('Record deleted','undo',{label:'Undo',fn:()=>setEntries(prev=>[...prev,d])},7000);
  };

  const [toilTakenForm, setToilTakenForm] = useState({date:todayStr, hours:'', minutes:'00', note:''});
  const addToilTaken = () => {
    const wholeHours = parseInt(toilTakenForm.hours,10)||0;
    const mins = parseInt(toilTakenForm.minutes,10)||0;
    const hrs = wholeHours + mins/60;
    if (!toilTakenForm.date || hrs<=0) { addToast('Enter a date and a positive number of hours','warn'); return; }
    const resultingBalance = toilLedger.balance - hrs;
    setToilTaken(prev=>[...prev, { id:Date.now().toString(), date:toilTakenForm.date, hours:hrs, note:toilTakenForm.note||'' }]);
    setToilTakenForm({date:todayStr, hours:'', minutes:'00', note:''});
    if (resultingBalance < 0) {
      addToast(`Logged — balance is now ${fmtHM(resultingBalance)} h (more taken than earned)`,'warn');
    } else {
      addToast('TOIL taken logged');
    }
  };
  const deleteToilTaken = id => {
    const d = toilTaken.find(t=>t.id===id);
    setToilTaken(prev=>prev.filter(t=>t.id!==id));
    addToast('Entry removed','undo',{label:'Undo',fn:()=>setToilTaken(prev=>[...prev,d])},7000);
  };

  // Standard backup filename convention: OTbackup + day + 3-letter month +
  // 2-digit year. e.g. 21 Sept 2026 -> "OTbackup21Sep26"
  // Deliberately date-only: a second backup on the same day replaces the
  // first, so you keep one current file per day rather than a cluttered folder.
  const backupFileStamp = () => {
    const d = new Date();
    const pad = n => String(n).padStart(2,'0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${pad(d.getDate())}${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
  };

  async function handleExport(){
    const now=Date.now();
    const filename = `OTbackup${backupFileStamp()}.json`;
    const json = JSON.stringify({entries,settings,toilTaken,exportedAt:new Date().toISOString()}, null, 2);

    const markSaved = () => {
      dualWrite(KEYS.backupCount,0); dualWrite(KEYS.backedUpAt,now);
      dualWrite(KEYS.lastBackupReminder,now); setPulseBackupBtn(false);
      addToast('Backup saved');
    };

    // Where supported (Chrome/Edge desktop), let the person choose the folder
    // and confirm the filename. iOS Safari doesn't implement this API, so we
    // fall back to a normal download — which on iOS still opens the share
    // sheet and lets you pick Files/iCloud anyway.
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description:'Overtime & Shift Tracker backup', accept:{ 'application/json':['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        markSaved();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // person cancelled the dialog
        // any other failure falls through to the standard download below
      }
    }

    const blob = new Blob([json], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'),{href:url,download:filename}).click();
    URL.revokeObjectURL(url);
    markSaved();
  }

  // ExcelJS is loaded from a CDN at the moment it's actually needed, rather
  // than as an npm dependency — keeps the deploy to just this one file,
  // same as everything else here, no package.json/build step involved.
  // Using ExcelJS specifically rather than the more common SheetJS here,
  // because SheetJS's free tier doesn't reliably write cell styling (fills,
  // fonts) into the file — confirmed by testing it directly — whereas
  // ExcelJS's free/open-source build genuinely supports it.
  const loadExcelJSLib = () => new Promise((resolve, reject) => {
    if (window.ExcelJS) { resolve(window.ExcelJS); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(script);
  });

  // Exports all logged shifts as an .xlsx workbook — opens directly in
  // Excel/Google Sheets/Numbers. Gross/Net are real numeric cells here
  // (not formatted text like a CSV would need), so they sum and format
  // correctly if someone builds on top of the export in Excel.
  async function handleExportSpreadsheet(start, end, sanitise){
    const headers = [
      'Pay Period','Date','Duty/Reason','1.33x Hours','1.5x Hours','2.0x Hours',
      'PA Rate','Submitted','Breakdown','Gross (£)',
      'Cumulative Taxable Income Before This Entry (£)','Net (£)','Rate Applied','Notes'
    ];
    // DD/MM/YYYY as plain text — deliberately not a real date cell, since
    // date-serial conversion between JS and Excel can silently shift by a
    // day around timezone boundaries. A formatted string always shows
    // exactly what it says, with no risk of that.
    const fmtDDMMYYYY = dateStr => {
      const [y,m,d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    };
    const submittedLabel = e => {
      const hasPA = e.paRate && e.paRate!=='None';
      const otOK = isOtSubmitted(e), paOK = !hasPA || isPaSubmitted(e);
      if (otOK && paOK) return 'Yes';
      if (otOK && !paOK) return 'OT only (PA pending)';
      if (!otOK && paOK) return hasPA ? 'PA only (OT pending)' : 'No';
      return 'No';
    };
    // Which entries fall "within" a date range for export purposes is based
    // on submission date, not the shift's own date — same principle as
    // periodBreakdown's own FY attribution. A shift worked in late March but
    // submitted in April belongs to the new financial year's export, since
    // that's when it actually became real money on CARMS/MetHR, matching
    // how the Home screen's own totals already treat it. An entry qualifies
    // if EITHER its OT or PA submission date falls in range — an entry with
    // only one side submitted still needs to show up once that side lands.
    const inRange = e => {
      if (!start && !end) return true;
      const hasPA = e.paRate && e.paRate!=='None';
      const otDate = isOtSubmitted(e) ? effectiveOtDate(e) : null;
      const paDate = (hasPA && isPaSubmitted(e)) ? effectivePaDate(e) : null;
      const dateInRange = d => d!=null && (!start || d>=start) && (!end || d<=end);
      if (dateInRange(otDate) || dateInRange(paDate)) return true;
      // An entry with nothing submitted at all has no submission date to go
      // by — fall back to its own shift date, so unsubmitted work already
      // sitting in this window still shows up (as £0, same as everywhere
      // else) rather than silently vanishing from the export entirely.
      if (otDate==null && paDate==null) return (!start || e.date>=start) && (!end || e.date<=end);
      return false;
    };
    const sorted = [...entries].filter(inRange).sort((a,b)=>new Date(a.date)-new Date(b.date));
    const rowPeriodIdx = []; // parallel array, one entry per data row (not padding), tracks which pay period it belongs to
    const rows = sorted.map(e=>{
      const c = calcEntry(e);
      const gross = submittedGross(e);
      const pIdx = PAY_PERIODS.findIndex(p=>e.date>=p.start&&e.date<=p.end);
      rowPeriodIdx.push(pIdx);
      const p = pIdx>=0 ? PAY_PERIODS[pIdx] : null;
      const pb = pIdx>=0 ? totals.periodBreakdown[pIdx] : null;
      // Every other entry within this SAME pay period, dated before this
      // one — these stack on top of base salary within the period, same
      // as the main app's own period-by-period calculation does.
      const priorInPeriod = p ? entries.filter(x=>x.date>=p.start && x.date<=p.end && (x.date<e.date || (x.date===e.date && x.id<e.id)))
        .reduce((sum,x)=>sum+submittedGross(x),0) : 0;
      // Cumulative taxable income BEFORE this entry — base salary is taxed
      // first, so overtime stacks on top of it, same as everywhere else in
      // the app. pb.cumAfter is the proven-correct running total (base +
      // all overtime) through the END of this period; subtracting this
      // period's own combinedGross backs it out to "just after this
      // period's base salary, before any of this period's overtime" —
      // then priorInPeriod adds back only what's already been claimed
      // earlier in this same period, ahead of this specific entry.
      const cumulativeBefore = pb ? (pb.cumAfter - pb.combinedGross + priorInPeriod) : 0;
      const periodGrossBefore = (pb ? pb.baseAmt : 0) + priorInPeriod;
      // Year-fraction uses the PERIOD's end date, same as the main app's own
      // periodBreakdown calculation — tax is assessed at the point the whole
      // period gets paid out, not on each shift's own date within it.
      const yearFraction = p ? taxYearFractionForDate(p.end) : taxYearFractionForDate(e.date);
      const result = applyBandTax(cumulativeBefore, gross, yearFraction, periodGrossBefore);
      // A plain-language breakdown of exactly how the Gross figure was made
      // up — e.g. "4hr@1.5x=£60.00 + PA2@£90.00". Respects submission
      // status the same way Gross itself does, so the parts shown here
      // always add up to the Gross value in the next column, rather than
      // showing OT/PA components that haven't actually been claimed yet.
      const hasPA = e.paRate && e.paRate!=='None';
      const breakdownParts = [];
      if (isOtSubmitted(e)) {
        if (c.payH1>0) breakdownParts.push(`${c.payH1}hr@1.33x=£${c.ot1.toFixed(2)}`);
        if (c.payH2>0) breakdownParts.push(`${c.payH2}hr@1.5x=£${c.ot2.toFixed(2)}`);
        if (c.payH3>0) breakdownParts.push(`${c.payH3}hr@2.0x=£${c.ot3.toFixed(2)}`);
      }
      if (hasPA && isPaSubmitted(e)) breakdownParts.push(`${e.paRate}@£${c.pa.toFixed(2)}`);
      const breakdown = breakdownParts.join(' + ') || '—';
      // Leading '' reserves column A for the merged, rotated pay-period
      // label set separately below — this row array only ever fills
      // columns B onward.
      return [
        '', fmtDDMMYYYY(e.date), e.reason||'', c.h1||'', c.h2||'', c.h3||'',
        e.paRate!=='None'?e.paRate:'',
        submittedLabel(e), breakdown,
        Math.round(gross*100)/100,
        Math.round(cumulativeBefore*100)/100,
        Math.round(result.net*100)/100,
        result.bandName ? `${result.bandName} (${result.rate.toFixed(1)}%)` : '',
        sanitise ? '' : (e.comments||'')
      ];
    });

    // Group the chronologically-sorted rows into consecutive blocks by pay
    // period (they're already sorted, so same-period rows are always
    // contiguous), then pad short blocks with blank rows — split before
    // and after — so the merged, rotated month label always has enough
    // vertical room to read comfortably rather than looking cramped or
    // overflowing past its own block.
    const blocks = [];
    for (let i=0; i<rows.length; i++){
      if (i===0 || rowPeriodIdx[i]!==rowPeriodIdx[i-1]) blocks.push({ pIdx: rowPeriodIdx[i], rows: [rows[i]] });
      else blocks[blocks.length-1].rows.push(rows[i]);
    }
    const blankRow = () => Array(headers.length).fill('');
    // A period's own subtotal row — 1.33x/1.5x/2.0x hours, Gross and Net
    // summed across every real entry in that block. Everything else
    // (PA rate, submitted status, cumulative income, rate band, notes)
    // doesn't have a meaningful sum, so those stay blank.
    const totalRowFor = block => {
      const sum = colIdx => block.rows.reduce((s,r)=>s+(parseFloat(r[colIdx])||0),0);
      const row = blankRow();
      row[2] = 'Period Total';
      row[3] = sum(3) || ''; row[4] = sum(4) || ''; row[5] = sum(5) || '';
      row[9] = Math.round(sum(9)*100)/100;
      row[11] = Math.round(sum(11)*100)/100;
      return row;
    };
    const expandedRows = [];
    const expandedRowPeriodIdx = []; // parallel to expandedRows — which period each row (including its padding) belongs to
    const totalRowIndices = []; // which expandedRows indices are subtotal rows, for distinct styling below
    const mergeRanges = []; // { label, startRow, endRow } — 1-indexed spreadsheet row numbers, filled in once expandedRows is built
    blocks.forEach(block => {
      const p = block.pIdx>=0 ? PAY_PERIODS[block.pIdx] : null;
      const label = p ? p.month : '';
      // Rough estimate of rows needed for the rotated label to fit
      // comfortably: character count × font size × a width-to-height
      // factor for rotated proportional text, divided by the default row
      // height — deliberately generous rather than exact, since font
      // metrics vary slightly by viewer. +1 accounts for the subtotal row
      // always present at the end of the block, which also contributes
      // real height, reducing how much blank padding is actually needed.
      const minRowsNeeded = label ? Math.ceil((label.length * 10 * 0.68) / 15) : 0;
      const padTotal = Math.max(0, minRowsNeeded - (block.rows.length + 1));
      const padBefore = Math.floor(padTotal/2), padAfter = padTotal - padBefore;
      const startRow = expandedRows.length + 2; // +2: header is row 1, data starts at row 2
      for (let i=0;i<padBefore;i++) { expandedRows.push(blankRow()); expandedRowPeriodIdx.push(block.pIdx); }
      block.rows.forEach(r => { expandedRows.push(r); expandedRowPeriodIdx.push(block.pIdx); });
      expandedRows.push(totalRowFor(block)); expandedRowPeriodIdx.push(block.pIdx);
      totalRowIndices.push(expandedRows.length - 1);
      for (let i=0;i<padAfter;i++) { expandedRows.push(blankRow()); expandedRowPeriodIdx.push(block.pIdx); }
      const endRow = expandedRows.length + 1;
      if (label) mergeRanges.push({ label, startRow, endRow });
    });

    const suffix = start&&end ? `_${start}_to_${end}` : `_${new Date().toISOString().split('T')[0]}`;
    try {
      const ExcelJS = await loadExcelJSLib();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Overtime Records');

      ws.addRow(headers);
      expandedRows.forEach(r => ws.addRow(r));

      // Header row — grey-blue fill, white bold text, frozen so it stays
      // visible while scrolling through a long list of shifts.
      const headerRow = ws.getRow(1);
      headerRow.height = 24;
      headerRow.eachCell(cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF5C7C99'} };
        cell.font = { bold:true, color:{argb:'FFFFFFFF'}, size:11 };
        cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
        cell.border = { bottom:{style:'medium',color:{argb:'FF3E5A70'}} };
      });
      ws.views = [{ state:'frozen', ySplit:1, xSplit:1 }];

      // Merge and rotate the pay-period label down column A, spanning
      // each period's own block of rows (including its padding, if any).
      mergeRanges.forEach(({label, startRow, endRow}) => {
        ws.mergeCells(`A${startRow}:A${endRow}`);
        const cell = ws.getCell(`A${startRow}`);
        cell.value = label;
        cell.alignment = { textRotation: 90, vertical:'middle', horizontal:'center' };
        cell.font = { bold:true, size:11, color:{argb:'FF3E5A70'} };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} };
        cell.border = { top:{style:'thick',color:{argb:'FF5C7C99'}}, bottom:{style:'thick',color:{argb:'FF5C7C99'}}, left:{style:'thick',color:{argb:'FF5C7C99'}}, right:{style:'thick',color:{argb:'FF5C7C99'}} };
      });

      // Currency columns (J, K, L — Gross/Cumulative/Net, shifted one letter
      // left now that Night Hours has been removed) get the accounting
      // format — aligned £ symbol, thousands separators, a plain dash for
      // zero, matching Excel's own built-in "Accounting" look.
      const acctFmt = '_-£* #,##0.00_-;-£* #,##0.00_-;_-£* "-"??_-;_-@_-';
      const currencyCols = ['J','K','L'];
      const thinGrey = { style:'thin', color:{argb:'FFD9E2E8'} };
      // Thick border wherever the pay period changes from the row above —
      // same grey-blue as the header, so scanning down the list makes it
      // obvious which dates fall within the same pay run. Blank padding
      // rows count as belonging to their surrounding block for this check.
      const periodBoundary = { style:'thick', color:{argb:'FF5C7C99'} };

      const lastDataRow = expandedRows.length + 1;
      const totalRowSet = new Set(totalRowIndices);
      expandedRows.forEach((r, i) => {
        const row = ws.getRow(i+2);
        const isTotalRow = totalRowSet.has(i);
        // Alternating pistachio-tinted stripe for readability on longer
        // exports, rather than a plain flat white background throughout.
        const isStripe = i % 2 === 1;
        const isNewPeriod = i===0 || expandedRowPeriodIdx[i] !== expandedRowPeriodIdx[i-1];
        row.eachCell({ includeEmpty:true }, cell => {
          if (cell.col===1) return; // column A is the merged period label, styled separately above
          if (isTotalRow) {
            // Amber/gold for the period subtotal — a third, clearly distinct
            // colour from the grey-blue header and pistachio stripes, but
            // still part of the app's own established palette (the same
            // amber used for "outstanding" elsewhere), so it reads as
            // intentional rather than random.
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFDF0D5'} };
            cell.font = { bold:true, color:{argb:'FF92400E'} };
            cell.border = { top:{style:'medium',color:{argb:'FFD97706'}}, bottom:thinGrey, left:thinGrey, right:thinGrey };
          } else {
            if (isStripe) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} };
            cell.border = { top:isNewPeriod?periodBoundary:thinGrey, bottom:thinGrey, left:thinGrey, right:thinGrey };
          }
          // Duty/Reason (col 3), Breakdown (col 9) and Notes (col 14) are
          // the three fields most likely to occasionally run longer than
          // the column width comfortably allows — wrap those specifically
          // rather than truncating, so nothing needs manually expanding to read.
          cell.alignment = { vertical:'middle', wrapText: cell.col===3 || cell.col===9 || cell.col===14 };
        });
        currencyCols.forEach(col => { row.getCell(col).numFmt = acctFmt; });
        // A subtle pistachio left-border accent on fully-submitted rows —
        // ties the colour scheme to something functionally meaningful
        // rather than purely decorative. Index 8 is 'Submitted', shifted
        // one place right by the new leading Pay Period column.
        if (!isTotalRow && r[8] === 'Yes') {
          row.getCell('B').border = { ...row.getCell('B').border, left:{style:'medium',color:{argb:'FF8FBC6B'}} };
        }
      });

      // Grand total — one final row summing every real entry across the
      // whole export, not just one period. Same grey-blue as the header
      // rather than the amber used for period subtotals, so it reads as
      // the overall figure rather than another period's total.
      const grandTotalRowNum = lastDataRow + 1;
      const grandTotal = colIdx => rows.reduce((s,r)=>s+(parseFloat(r[colIdx])||0),0);
      const gtRow = ws.getRow(grandTotalRowNum);
      gtRow.getCell('C').value = 'Grand Total';
      gtRow.getCell('D').value = grandTotal(3) || '';
      gtRow.getCell('E').value = grandTotal(4) || '';
      gtRow.getCell('F').value = grandTotal(5) || '';
      gtRow.getCell('J').value = Math.round(grandTotal(9)*100)/100;
      gtRow.getCell('L').value = Math.round(grandTotal(11)*100)/100;
      gtRow.eachCell({ includeEmpty:true }, cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF5C7C99'} };
        cell.font = { bold:true, color:{argb:'FFFFFFFF'}, size:11 };
        cell.border = { top:{style:'thick',color:{argb:'FF3E5A70'}} };
        cell.alignment = { vertical:'middle' };
      });
      ['J','L'].forEach(col => { gtRow.getCell(col).numFmt = acctFmt; });

      // Column widths sized to the longest actual value in each column
      // (header or data), not a guess — genuinely fits the content. Uses
      // getColumn(index) explicitly rather than ws.columns.forEach, since
      // a column with no non-empty data cells (e.g. PA Rate when nothing
      // has PA, or Notes when sanitised) isn't reliably picked up by the
      // implicit columns array otherwise. Floor is 10, not 9 — confirmed
      // by direct testing that a width of exactly 9 gets silently dropped
      // by this version of the library when the file is written.
      headers.forEach((h, i) => {
        if (i===0) { ws.getColumn(1).width = 6; return; } // Pay Period column — narrow, since text is rotated
        let maxLen = String(h).length;
        for (let r=0; r<expandedRows.length; r++){
          const len = String(expandedRows[r][i] ?? '').length;
          if (len > maxLen) maxLen = len;
        }
        ws.getColumn(i+1).width = Math.min(Math.max(maxLen + 2, 10), 65);
      });

      // AutoFilter lets Excel filter/sort directly — e.g. down to just the
      // rows still pending submission. Starts at column B, not A: column A
      // is the merged, rotated Pay Period label, and merged cells inside
      // an AutoFilter range behave unreliably in Excel (a filter action can
      // hide part of a merged block while leaving the rest visible).
      ws.autoFilter = `B1:N${lastDataRow}`;

      // Print setup — landscape and fit-to-width, since this sheet is wide;
      // the header row repeats on every printed page so a multi-page
      // printout still reads correctly without it.
      ws.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left:0.4, right:0.4, top:0.5, bottom:0.5, header:0.2, footer:0.2 }
      };
      ws.pageSetup.printTitlesRow = '1:1';

      // Conditional formatting on the Submitted column — anything still
      // outstanding gets flagged in red at a glance, without needing to
      // scan the whole column manually. Excludes blank cells explicitly,
      // so the always-empty padding and subtotal rows aren't caught by it.
      ws.addConditionalFormatting({
        ref: `H2:H${lastDataRow}`,
        rules: [{
          type: 'expression',
          formulae: [`AND(H2<>"Yes",H2<>"")`],
          style: {
            fill: { type:'pattern', pattern:'solid', bgColor:{argb:'FFFEE2E2'} },
            font: { bold:true, color:{argb:'FFB91C1C'} }
          }
        }]
      });

      // ── Summary worksheet — a second tab giving the headline figures
      // without needing to scroll or add up the detailed sheet by hand.
      const sws = wb.addWorksheet('Summary');
      sws.getColumn(1).width = 22; sws.getColumn(2).width = 20; sws.getColumn(3).width = 20;
      sws.getColumn(4).width = 45; sws.getColumn(5).width = 12;

      const titleCell = sws.getCell('A1');
      titleCell.value = 'Overtime & Shift Tracker — Summary';
      titleCell.font = { bold:true, size:14, color:{argb:'FF0F172A'} };
      sws.mergeCells('A1:C1');
      sws.getCell('A2').value = `Generated ${new Date().toLocaleDateString('en-GB')}`;
      sws.getCell('A2').font = { size:10, color:{argb:'FF64748B'} };

      const sectionHeaderStyle = cell => {
        cell.font = { bold:true, size:12, color:{argb:'FFFFFFFF'} };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF5C7C99'} };
        cell.alignment = { vertical:'middle' };
      };
      const labelValueRow = (r, label, value, isCurrency) => {
        sws.getCell(`A${r}`).value = label;
        sws.getCell(`A${r}`).font = { bold:true, color:{argb:'FF0F172A'} };
        const vc = sws.getCell(`B${r}`);
        vc.value = value;
        if (isCurrency) vc.numFmt = acctFmt;
        vc.font = { color:{argb:'FF0F172A'} };
      };

      // Year to date
      sws.mergeCells('A4:C4');
      sectionHeaderStyle(sws.getCell('A4'));
      sws.getCell('A4').value = 'Year to Date';
      labelValueRow(5, 'Gross YTD', Math.round(totals.combinedGrossYTD*100)/100, true);
      labelValueRow(6, 'Net YTD', Math.round(totals.combinedNetYTD*100)/100, true);
      labelValueRow(7, 'Current TOIL Balance (hrs)', Math.round(toilLedger.balance*100)/100, false);

      // By pay period — reuses the same set of periods that actually
      // appear in the detailed sheet, respecting whatever date range was
      // exported, rather than dumping the whole financial year regardless.
      let r = 9;
      sws.mergeCells(`A${r}:C${r}`);
      sectionHeaderStyle(sws.getCell(`A${r}`));
      sws.getCell(`A${r}`).value = 'By Pay Period';
      r++;
      ['Period','Gross (£)','Net (£)'].forEach((h,i) => {
        const c = sws.getCell(r, i+1);
        c.value = h; c.font = { bold:true, color:{argb:'FF3E5A70'} };
        c.border = { bottom:{style:'thin',color:{argb:'FFD9E2E8'}} };
      });
      r++;
      mergeRanges.forEach(({label}, i) => {
        // Gross/Net shown here are this period's SUBMITTED totals from the
        // detailed sheet's own subtotal row — matches what's actually in
        // the export, not the app's live figures which may have since moved on.
        const periodGross = blocks[i].rows.reduce((s,row)=>s+(parseFloat(row[9])||0),0);
        const periodNet = blocks[i].rows.reduce((s,row)=>s+(parseFloat(row[11])||0),0);
        sws.getCell(r,1).value = label;
        sws.getCell(r,2).value = Math.round(periodGross*100)/100; sws.getCell(r,2).numFmt = acctFmt;
        sws.getCell(r,3).value = Math.round(periodNet*100)/100; sws.getCell(r,3).numFmt = acctFmt;
        if (i%2===1) [1,2,3].forEach(c=>{ sws.getCell(r,c).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} }; });
        r++;
      });

      // TOIL history — the full all-time ledger, same as the TOIL tab in
      // the app itself, since TOIL carries over and isn't scoped to a tax
      // year or the date range picked for this specific export.
      r += 1;
      sws.mergeCells(`A${r}:C${r}`);
      sectionHeaderStyle(sws.getCell(`A${r}`));
      sws.getCell(`A${r}`).value = 'TOIL History (All-Time)';
      r++;
      ['Date','Type','Hours','Note','Balance After'].forEach((h,i) => {
        const c = sws.getCell(r, i+1);
        c.value = h; c.font = { bold:true, color:{argb:'FF3E5A70'} };
        c.border = { bottom:{style:'thin',color:{argb:'FFD9E2E8'}} };
      });
      r++;
      toilLedger.rows.forEach((row, i) => {
        sws.getCell(r,1).value = fmtDDMMYYYY(row.date);
        sws.getCell(r,2).value = row.type==='earned' ? 'Banked' : 'Taken';
        sws.getCell(r,3).value = Math.round(row.hours*100)/100;
        sws.getCell(r,4).value = row.note;
        sws.getCell(r,5).value = Math.round(row.balanceAfter*100)/100;
        if (i%2===1) [1,2,3,4,5].forEach(c=>{ sws.getCell(r,c).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF5E9'} }; });
        r++;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'),{href:url,download:`OvertimeShiftTracker_Records${suffix}.xlsx`}).click();
      URL.revokeObjectURL(url);
      addToast('Spreadsheet exported');
    } catch (err) {
      addToast('Could not reach the spreadsheet library — check your connection and try again');
    }
  }

  const handleImport=ev=>{
    const fr=new FileReader();
    fr.onload=e=>{ const d=JSON.parse(e.target.result); setEntries(d.entries); setSettings(migrateSettings(d.settings)); setToilTaken(d.toilTaken||[]); setTab('dashboard'); addToast('Backup restored'); };
    fr.readAsText(ev.target.files[0]);
  };

  // Clears local data as before, and — new — the same user's rows in
  // Supabase, when there's an active session. Deliberately does NOT delete
  // the auth account/email itself; that's what Delete Account is for,
  // separately. Cloud deletes are attempted first: if any of them fail,
  // local data is left untouched rather than risk local being wiped while
  // stale cloud data silently survives.
  const handleWipe = async () => {
    haptic();
    setWipingData(true);
    if (supabase && session) {
      try {
        const uid = session.user.id;
        const results = await Promise.all([
          supabase.from('entries').delete().eq('user_id', uid),
          supabase.from('toil_taken').delete().eq('user_id', uid),
          supabase.from('settings').delete().eq('user_id', uid),
        ]);
        if (results.some(r => r.error)) {
          setWipingData(false);
          addToast('Couldn\u2019t fully clear cloud data \u2014 check your connection and try again', 'warn', null, 6000);
          return;
        }
      } catch (e) {
        setWipingData(false);
        addToast('Couldn\u2019t clear cloud data \u2014 check your connection and try again', 'warn', null, 6000);
        return;
      }
    }
    setEntries([]); setToilTaken([]); saveSett({rank:'',service:''});
    lastSyncedEntriesRef.current.clear(); persistLastSyncedEntries();
    lastSyncedToilRef.current.clear(); persistLastSyncedToil();
    lastSyncedSettingsRef.current = null; persistLastSyncedSettings();
    setWipingData(false);
    setWipeConf(false);
    setTab('dashboard');
  };
  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setDataKey(null);
    addToast('Signed out', 'success');
    // No manual state changes needed — onAuthStateChange (in the effect above)
    // picks this up and clears session automatically, which sends the app
    // straight back to the sign-in gate.
  };

  // Permanently deletes the Supabase Auth account itself — not just this
  // device's data. This can't be done directly from the browser (deleting
  // an auth user needs the service_role key, which never ships to client
  // code), so it calls a small Edge Function that does it server-side.
  // Deleting the auth user cascades to entries/toil_taken/settings/user_keys
  // automatically via the "on delete cascade" foreign keys in the schema —
  // nothing else needs deleting here. Local data on this device is
  // deliberately untouched — the real distinction from Wipe All Data is
  // that this removes the account and email entirely; Wipe All Data clears
  // everything (local and cloud) but leaves the same account signed in.
  const handleDeleteAccount = async () => {
    if (!supabase) return;
    haptic();
    setDeletingAcct(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDataKey(null);
      setDeleteAcctConf(false);
      setDeleteAcctTyped('');
      addToast('Account deleted', 'success', null, 5000);
      // Session clears via onAuthStateChange once the token this session
      // was using no longer resolves to an existing user, same as sign-out.
    } catch (e) {
      addToast('Couldn\u2019t delete account \u2014 ' + (e.message || 'try again'), 'warn', null, 6000);
    } finally {
      setDeletingAcct(false);
    }
  };

  // Manual "sync now" — the same pull-and-merge already used on unlock and
  // on realtime reconnect, just triggered on demand instead of waiting for
  // one of those moments. Push isn't included deliberately: local changes
  // already push themselves the moment they happen, so there's nothing a
  // manual push would do that hasn't already been attempted.
  // Every path that ends in "the app is now unlocked" — a fresh sign-in,
  // finishing recovery-secret setup, or recovering after a password reset
  // — calls this. Always landing back on Home regardless of which path got
  // here, rather than wherever `tab` happened to be left from an earlier
  // sign-out in the same session.
  const handleUnlocked = (dek) => {
    setDataKey(dek);
    setTab('dashboard');
  };

  // Hard-deletes entries/toil_taken rows older than the 5-financial-year
  // cloud retention window (see isWithinCloudRetention above) — a real
  // DELETE, not a soft-delete, since the goal is to actually reduce what's
  // stored in Supabase. The server has no way to know which rows qualify
  // on its own — dates live inside the encrypted ciphertext, not in a
  // plaintext column — so this decrypts each row client-side first,
  // decides locally, then deletes only those specific rows by id.
  // Throttled to at most once a day; local data is never touched here.
  const pruneOldCloudData = async () => {
    if (!supabase || !session || !dataKey) return;
    const today = new Date().toISOString().split('T')[0];
    if (dualRead(KEYS.lastCloudPruneCheck, null) === today) return;
    const uid = session.user.id;
    try {
      for (const table of ['entries', 'toil_taken']) {
        const { data: rows, error } = await supabase.from(table).select('id, ciphertext, deleted_at').eq('user_id', uid);
        if (error || !rows) continue;
        const idsToDelete = [];
        for (const row of rows) {
          if (row.deleted_at) continue; // already soft-deleted — not this policy's concern
          try {
            const decrypted = await decryptWithDataKey(dataKey, row.ciphertext);
            if (decrypted.date && !isWithinCloudRetention(decrypted.date)) idsToDelete.push(row.id);
          } catch (e) { /* undecryptable — leave it alone rather than guess */ }
        }
        if (idsToDelete.length > 0) {
          const { error: delError } = await supabase.from(table).delete().eq('user_id', uid).in('id', idsToDelete);
          if (delError) console.error(`[retention] failed to prune ${table}:`, delError.message || delError);
          else console.log(`[retention] pruned ${idsToDelete.length} row(s) from ${table} older than ${CLOUD_RETENTION_CUTOFF}`);
        }
      }
      dualWrite(KEYS.lastCloudPruneCheck, today);
    } catch (e) {
      console.error('[retention] prune check failed:', e.message || e);
    }
  };

  const handleManualSync = async () => {
    if (!supabase || !session || !dataKey) { addToast('Not signed in \u2014 nothing to sync', 'warn'); return; }
    setManualSyncing(true);
    try {
      await Promise.all([
        pullAndMergeRows('entries', entriesRef, setEntries, lastSyncedEntriesRef, persistLastSyncedEntries),
        pullAndMergeRows('toil_taken', toilTakenRef, setToilTaken, lastSyncedToilRef, persistLastSyncedToil),
        pullAndMergeSettings(),
      ]);
      pruneOldCloudData();
      addToast('Synced', 'success', null, 2000);
      setSyncJustSucceeded(true);
      setTimeout(()=>setSyncJustSucceeded(false), 1400);
    } catch (e) {
      addToast('Sync failed \u2014 check your connection', 'warn');
    } finally {
      setManualSyncing(false);
    }
  };

  // Scrolls the main container so a month card sits just below the sticky
  // header. The header's height is measured live (it changes between views,
  // since the month pills are only present in List View), so the card is
  // never left partly hidden behind it.
  const scrollToMonth = (month, smooth=true) => {
    const el = monthRefs.current[month];
    const cont = mainRef.current;
    if (!el || !cont) return;
    const stickyH = stickyRef.current ? stickyRef.current.offsetHeight : 58;
    const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - stickyH - 8;
    cont.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  };

  // Snaps List View to whichever period we're currently in. The delay lets
  // React finish rendering first — switching views changes the sticky
  // header's height, and arriving from another tab has to mount it entirely.
  const snapToActiveMonth = (smooth=true, delay=90) => {
    if (currPeriodIdx < 0) return; // today falls outside this financial year
    const month = PAY_PERIODS[currPeriodIdx].month;
    setTimeout(()=>scrollToMonth(month, smooth), delay);
  };

  const jumpTo=month=>{ setExpanded(month); setTimeout(()=>scrollToMonth(month),80); };

  // After saving, scroll the newly created/updated record into view and give it
  // a brief highlight, so the person can see their entry landed correctly.
  useEffect(()=>{
    if(!focusEntryId || tab!=='months' || breakdownView!=='list') return;
    const t = setTimeout(()=>{
      const el = entryRefs.current[focusEntryId];
      const cont = mainRef.current;
      if(el && cont){
        const stickyH = stickyRef.current ? stickyRef.current.offsetHeight : 58;
        const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - stickyH - 12;
        cont.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
      }
      setTimeout(()=>setFocusEntryId(null), 2200);
    }, 220);
    return ()=>clearTimeout(t);
  },[focusEntryId, tab, breakdownView]);

  // Same idea, for jumping from CARMS Outstanding straight to the on/off
  // toggles on the Log Overtime edit screen, rather than just opening the
  // form at the top and leaving the person to scroll down themselves.
  useEffect(()=>{
    if(!focusCarmsToggle || tab!=='add') return;
    const t = setTimeout(()=>{
      const el = carmsToggleRef.current;
      const cont = mainRef.current;
      if(el && cont){
        const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - 12;
        cont.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
      }
      setTimeout(()=>setFocusCarmsToggle(false), 2200);
    }, 220);
    return ()=>clearTimeout(t);
  },[focusCarmsToggle, tab]);

  // Jumping to a specific period group in CARMS Outstanding from a "CARMS &
  // MetHR pending" panel in Summary — same scroll-then-fade shape as the
  // two effects above.
  useEffect(()=>{
    if(pulsePeriodIdx===null || tab!=='carms') return;
    const t = setTimeout(()=>{
      const el = periodGroupRefs.current[pulsePeriodIdx];
      const cont = mainRef.current;
      if(el && cont){
        const top = cont.scrollTop + el.getBoundingClientRect().top - cont.getBoundingClientRect().top - 12;
        cont.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
      }
      setTimeout(()=>setPulsePeriodIdx(null), 2200);
    }, 220);
    return ()=>clearTimeout(t);
  },[pulsePeriodIdx, tab]);

  // Re-measures the active nav button whenever the tab changes, the
  // window resizes (the nav's own clamp()-based sizing means each
  // button's width already shifts continuously with viewport width), or
  // the nav itself changes size for any other reason (fonts finishing
  // load, the very first layout once it mounts past the auth gate).
  useLayoutEffect(() => {
    if (!navEl) return;
    const place = () => {
      const btn = navBtnRefs.current[tab];
      if (!btn) return;
      setNavPillRect({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    place();
    window.addEventListener('resize', place);
    const ro = new ResizeObserver(place);
    ro.observe(navEl);
    return () => { window.removeEventListener('resize', place); ro.disconnect(); };
  }, [navEl, tab, isWide]);

  // ── display helpers ────────────────────────────────────────────────────────

  // Today's effective rates were shown on Home; now only surfaced in Options.

  // ── styles ─────────────────────────────────────────────────────────────────
  const S={
    wrap: {display:'flex',flexDirection:'column',height:'100dvh',maxWidth:'430px',margin:'0 auto',background:'var(--page-bg)',fontFamily:"'DM Sans',system-ui,sans-serif",color:'var(--ink)',position:'relative',boxShadow:'0 0 60px rgba(0,0,0,0.14)',overflow:'hidden'},
    hdr:  {background:'var(--surface)',paddingTop:'calc(13px + env(safe-area-inset-top))',paddingRight:'18px',paddingBottom:'13px',paddingLeft:'18px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,zIndex:10},
    main: {flex:1,overflowY:'auto',overflowX:'hidden',overscrollBehaviorY:'contain',minWidth:0,scrollbarWidth:'none',msOverflowStyle:'none'},
    nav:  {background:'rgba(var(--surface-rgb),0.72)',backdropFilter:'blur(20px) saturate(1.5)',WebkitBackdropFilter:'blur(20px) saturate(1.5)',borderTop:'1px solid var(--border-2)',position:'absolute',bottom:0,width:'100%',paddingTop:'7px',paddingRight:'4px',paddingBottom:'calc(12px + env(safe-area-inset-bottom))',paddingLeft:'4px',display:'flex',justifyContent:'space-between',alignItems:'center',zIndex:20},
    nBtn: (a,add)=>({flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',padding:add?'9px 4px':'6px 4px',background:'transparent',color:add?'#10b981':a?BRASS:'var(--quiet)',borderRadius:add?'13px':'8px',border:'none',cursor:'pointer',transition:'all 0.18s',fontFamily:'inherit',boxShadow:'none'}),
    nLbl: {fontSize:'8px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap'},
    card: {background:'var(--surface)',borderRadius:'18px',padding:'18px',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',border:'1px solid var(--border-2)',marginBottom:'10px'},
    dark: {background:'var(--navy)',borderRadius:'18px',padding:'19px',boxShadow:'0 8px 28px rgba(15,39,68,0.28)',marginBottom:'10px',position:'relative',overflow:'hidden'},
    lbl:  {display:'block',fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'7px'},
    inp:  {width:'100%',background:'var(--surface-2)',border:'none',padding:'12px 15px',borderRadius:'12px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',boxSizing:'border-box',color:'var(--ink)'},
    ta:   {width:'100%',background:'var(--surface-2)',border:'none',padding:'12px 15px',borderRadius:'12px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',resize:'none',boxSizing:'border-box',color:'var(--ink)'},
    sel:  {width:'100%',background:'var(--surface-2)',border:'1px solid var(--border)',padding:'12px 15px',borderRadius:'12px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',boxSizing:'border-box',color:'var(--ink)',appearance:'none'},
  };

  // ── More.. tab, desktop only: an opened settings card becomes a
  // centred, scrollable popup instead of expanding inline and pushing
  // its 2-column grid row-mate taller. Mobile keeps the original inline
  // accordion untouched — this only takes effect when isOpen && isWide.
  // zIndex 56/55 (card/backdrop) is deliberately BELOW 60 — several of
  // these cards open their own follow-on modal (Financial Reports &
  // Export's PDF/Spreadsheet chooser, Account & Data Management's
  // Restore confirm), and those already use zIndex:60. Sitting above
  // them here would bury an unclickable modal behind this one.
  // Rendered as a genuinely separate element from the collapsed grid
  // card (never the same DOM node transformed in place) — the grid
  // card underneath stays permanently in normal flow, so opening,
  // closing, or switching between cards never reflows or moves any of
  // the others. position:'absolute' (not 'fixed') so it centres on the
  // sidebar-excluded content wrapper (see its position:'relative'
  // above) instead of the full browser viewport, and is unaffected by
  // <main>'s own internal scroll.
  const modalBoxStyle = (base) => ({...base, position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', width:'min(640px, 90vw)', maxHeight:'80vh', overflowY:'auto', overscrollBehavior:'contain', zIndex:56, boxShadow:'0 24px 64px rgba(0,0,0,0.35)', cursor:'default'});

  // ── Trends charts — shared between the inline (small) card and the
  // enlarge modal (big), so both stay pixel-for-pixel consistent. Tapping a
  // point shows a value callout; tapping it again (or a different point)
  // swaps it out. Tooltip boxes use dominantBaseline:'middle' per line and
  // explicit padding, rather than guessing baseline offsets, specifically so
  // text can't spill outside the box regardless of font metrics.
  const renderCumulativeChart = (big) => {
    const data = totals.cumData, max = Math.max(...data.map(d=>d.cumulative), 200);
    const W = big?520:330, H = big?260:150, pX = big?46:34, pY = big?20:12;
    const eW = W-pX*2, eH = H-pY*2;
    const fsAxis = big?11:8, fsLbl = big?11:8, ptR = big?6:4, lineW = big?3.5:2.5;
    const pts = data.map((d,i)=>({x:pX+i*(eW/(data.length-1)), y:H-pY-(d.cumulative/max)*eH, val:d.cumulative, lbl:d.short}));
    const path = pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
    const fillPath = `${path} L ${pts[pts.length-1].x} ${H-pY} L ${pts[0].x} ${H-pY} Z`;
    const gradId = big?'cgBig':'cgSmall';
    const tapPt = (chartTap && chartTap.chart==='cum' && chartTap.big===big) ? pts[chartTap.i] : null;
    const toggle = i => setChartTap(t=>(t&&t.chart==='cum'&&t.i===i&&t.big===big)?null:{chart:'cum',i,big});

    let tooltip = null;
    if (tapPt) {
      const tw = big?115:88;
      const padTop = big?17:13, lineH = big?18:14, padBottom = big?10:8;
      const th = padTop + lineH + padBottom;
      let tx = tapPt.x - tw/2; if (tx<2) tx=2; if (tx+tw>W-2) tx=W-2-tw;
      let ty = tapPt.y - th - 10; if (ty<2) ty = tapPt.y + 14;
      tooltip = (
        <g>
          <rect x={tx} y={ty} width={tw} height={th} rx="7" fill="#1e3a5f"/>
          <text x={tx+tw/2} y={ty+padTop} textAnchor="middle" dominantBaseline="middle" style={{fontSize:big?10:8,fontWeight:900,fill:'#93c5fd'}}>{tapPt.lbl}</text>
          <text x={tx+tw/2} y={ty+padTop+lineH} textAnchor="middle" dominantBaseline="middle" style={{fontFamily:MONO,fontSize:big?13:11,fontWeight:600,fill:'#fff'}}>{fmtGBP(tapPt.val)}</text>
        </g>
      );
    }

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',overflow:'visible'}} preserveAspectRatio="none">
        <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
        {[0,0.5,1].map(v=>(<g key={v}><line x1={pX} y1={H-pY-v*eH} x2={W-pX} y2={H-pY-v*eH} stroke="#f1f5f9" strokeWidth="1" strokeDasharray={v===0?'0':'3 4'}/><text x={pX-4} y={H-pY-v*eH} textAnchor="end" dominantBaseline="middle" style={{fontSize:fsAxis,fill:'#cbd5e1',fontWeight:700}}>£{Math.round(max*v)}</text></g>))}
        {pts.map((p,i)=><text key={i} x={p.x} y={H-pY+(big?17:11)} textAnchor="middle" style={{fontSize:fsLbl,fill:'#94a3b8',fontWeight:900}}>{p.lbl}</text>)}
        <path d={fillPath} fill={`url(#${gradId})`} opacity="0.22"/>
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={ptR} fill="#2563eb" stroke="white" strokeWidth="2" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
            <circle cx={p.x} cy={p.y} r={ptR+8} fill="transparent" style={{cursor:'pointer'}} onClick={()=>toggle(i)}/>
          </g>
        ))}
        {tooltip}
      </svg>
    );
  };

  // Full financial year Overtime & PA totals — same card that used to live on
  // Home, now shown at the end of both Summary views instead, since it's a
  // whole-year figure and belongs alongside the rest of the year's detail
  // rather than competing with Home's day-to-day figures.
  const renderFYTotalsCard = () => (
    <div style={{...S.card,background:'#2563eb',border:'none',marginTop:'9px',boxShadow:'0 6px 20px rgba(37,99,235,0.28)'}}>
      <div style={{fontSize:'10px',fontWeight:900,color:'#dbeafe',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'10px'}}>Overtime & PA — FY {CURRENT_FY_YEAR}/{(CURRENT_FY_YEAR+1).toString().slice(-2)}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
        <div>
          <div style={{fontSize:'10px',fontWeight:900,color:'#bfdbfe',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'3px'}}>Gross OT</div>
          <div style={{fontFamily:MONO,fontSize:'18px',fontWeight:600,color:'#fff'}}>{fmt(totals.totalGross)}</div>
        </div>
        <div>
          <div style={{fontSize:'10px',fontWeight:900,color:'var(--border-2)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'3px'}}>Net OT</div>
          <div style={{fontFamily:MONO,fontSize:'18px',fontWeight:600,color:'#dcfce7'}}>{fmt(totals.totalNet)}</div>
        </div>
        <div>
          <div style={{fontSize:'10px',fontWeight:900,color:'#bfdbfe',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'3px'}}>Hours</div>
          <div style={{fontFamily:MONO,fontSize:'18px',fontWeight:600,color:'#fff',display:'flex',alignItems:'center',gap:'5px'}}><Ico n="clock" s={13} c="rgba(255,255,255,0.6)"/>{totals.totalHrs.toFixed(1)}</div>
        </div>
      </div>
    </div>
  );

  // `wide` widens the coordinate system itself (not just the rendered
  // box) for the Home desktop chart — it needs to fill a much wider
  // card than the small variant was designed for, and stretching a
  // narrow viewBox to fit via preserveAspectRatio="none" distorted the
  // line weight and text into an obviously non-uniform squash/stretch.
  // Widening W instead keeps the X:Y scale factor equal (no distortion)
  // while still spreading the same content across the full card width.
  // Actual rendering (and its point-tweening hook) lives in MonthlyChart.jsx
  // now — a plain closure redefined fresh on every App render can't safely
  // call a hook, only a real, stable component can. This wrapper just keeps
  // every existing call site (`renderMonthlyChart(big, dark, wide)`, and the
  // renderMonthlyChart prop handed to TabDashboard) unchanged.
  const renderMonthlyChart = (big, dark=false, wide=false) => (
    <MonthlyChart totals={totals} PAY_PERIODS={PAY_PERIODS} MONO={MONO} chartTap={chartTap} setChartTap={setChartTap} big={big} dark={dark} wide={wide}/>
  );

  // Payslip data for an arbitrary date range. Reuses the same tax/NI approach
  // already used for the Log Overtime live preview: this range's gross is
  // treated as a slice stacked on top of everything else logged this tax
  // year (for cumulative income tax banding) and on top of the rest of its
  // containing pay period (for NI, which resets each period). Whole-period
  // exports are exact since they match how totals.periodBreakdown is built;
  // custom ranges spanning multiple periods are a reasonable estimate.
  const computePayslipData = (start, end) => {
    // If the requested range reaches back before the tax year containing its
    // end date, everything shown is clipped to that tax year only — keeping
    // hours, PA counts, and gross/tax all describing the same scope, and
    // keeping gross consistent with combinedGrossYTD below (which is itself
    // scoped to the current tax year). clippedFrom is exposed so the PDF can
    // show an honest note when this happens.
    const taxYearStartForRange = getUKTaxYearStart(end);
    const clipped = start < taxYearStartForRange;
    const effectiveStart = clipped ? taxYearStartForRange : start;
    const rangeEntries = entries.filter(e=>e.date>=effectiveStart&&e.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
    let ot=0, night=0, pa=0, hrs=0, toilBanked=0;
    const rateHrs = { hours133:0, hours150:0, hours200:0 };
    const paCounts = { PA1:0, PA2:0, PA3:0 };
    // Hours worked stay unconditional and period-local — a factual record
    // of the shift regardless of submission status or where its money
    // ends up, matching how the rest of the app treats hours.
    rangeEntries.forEach(e=>{
      const c = calcEntry(e);
      hrs += c.h1+c.h2+c.h3;
      rateHrs.hours133 += c.payH1; rateHrs.hours150 += c.payH2; rateHrs.hours200 += c.payH3;
    });
    // Money is attributed by submission date, not the shift's own date —
    // same principle as periodBreakdown and the OT Pay/PA boxes. A shift
    // worked just before this range but submitted within it still counts
    // here; one worked within this range but not submitted until after it
    // doesn't count until then. So this iterates every entry in the app,
    // not just rangeEntries above, since a late submission's shift date
    // can fall well outside the window whose money it belongs to.
    entries.forEach(e=>{
      const c = calcEntry(e);
      const hasPA = e.paRate && e.paRate!=='None';
      const hasOTHours = c.h1+c.h2+c.h3 > 0;
      const otDate = effectiveOtDate(e);
      const paDate = effectivePaDate(e);
      const otDateInRange = otDate>=effectiveStart && otDate<=end;
      if (!hasOTHours) {
        if (otDateInRange) night += c.night;
      } else if (isOtSubmitted(e) && otDateInRange) {
        ot += c.ot; night += c.night; toilBanked += c.toilBanked;
      }
      if (hasPA && isPaSubmitted(e) && paDate>=effectiveStart && paDate<=end) {
        pa += c.pa; paCounts[e.paRate] = (paCounts[e.paRate]||0)+1;
      }
    });
    const gross = ot + night + pa;

    // Pension — same principle as the Home £100k Tax Calculator: pensionable
    // pay is basic salary + London Weighting only (overtime/PA/London
    // Allowance are all non-pensionable), the tier is judged on the
    // annualised YTD-through-this-report rate, and the contribution comes
    // off pay BEFORE income tax, which is why it reduces the taxable
    // cumulative baseline below — but never National Insurance.
    const svcData = settings.rank && settings.service ? PAY_RATES[settings.rank]?.[settings.service] : null;
    const tyFracForEnd = taxYearFractionForDate(end);
    const pensionablePayYTDThroughEnd = svcData
      ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, taxYearStartForRange, end) + monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStartForRange, end)
      : 0;
    const pensionablePayForRange = svcData
      ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, effectiveStart, end) + monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, effectiveStart, end)
      : 0;
    const pensionRate = pensionTierRate(pensionablePayYTDThroughEnd / tyFracForEnd);
    const pensionYTDThroughEnd = pensionablePayYTDThroughEnd * pensionRate;
    const pensionForRange = pensionablePayForRange * pensionRate;

    const endIdx = PAY_PERIODS.findIndex(p=>end>=p.start&&end<=p.end);
    const pb = endIdx>=0 ? totals.periodBreakdown[endIdx] : null;
    const cumulativeBefore = Math.max(0, totals.combinedGrossYTD - gross - pensionYTDThroughEnd);
    const periodGrossBefore = pb ? Math.max(0, (pb.baseAmt+pb.ot+pb.night+pb.pa) - gross) : 0; // NI stays on full gross, unaffected by pension
    const result = applyBandTax(cumulativeBefore, gross, tyFracForEnd, periodGrossBefore);
    const r = getRates(settings.rank, settings.service, end);

    return { rangeEntries, ot, night, pa, hrs, toilBanked, rateHrs, paCounts, gross,
      net:result.net, tax:result.tax, ni:result.ni, bandName:result.bandName, rate:result.rate, rates:r,
      pensionForRange, pensionRate, pensionablePayForRange,
      clippedFrom: clipped ? effectiveStart : null };
  };

  const handleGenerateExport = () => {
    if (payslipMode==='financialYear') {
      if (payslipFYYear==null) return;
      const yPeriods = generateFYPeriods(payslipFYYear);
      const start = yPeriods[0].start, end = yPeriods[11].end;
      if (exportFormat==='csv') { handleExportSpreadsheet(start, end, sanitiseNotes); setPayslipModalOpen(false); return; }
      // PDF: the current year's tax/NI figures are accurate (same context the
      // rest of the app uses), so it gets the normal payslip-style report.
      // A past year's cumulative context is stale, so — same reasoning as
      // Archived Financial Years — it opens that gross-only, period-grouped
      // view instead, now with a Print button for exactly this purpose.
      if (payslipFYYear===CURRENT_FY_YEAR) {
        setPayslipPreview({ start, end, rangeLabel: `${yPeriods[0].month} – ${yPeriods[11].month}`, label: `FY ${payslipFYYear}/${(payslipFYYear+1).toString().slice(-2)}`, data: computePayslipData(start, end) });
      } else {
        setArchiveExpandedPeriod(null);
        setFySummaryPrintMode(true);
        setFySummaryYear(payslipFYYear);
      }
      setPayslipModalOpen(false);
      return;
    }
    let start, end, label;
    if (payslipMode==='period' && payslipPeriodIdx!=null) {
      const p = PAY_PERIODS[payslipPeriodIdx];
      start = p.start; end = p.end; label = p.month;
    } else if (payslipMode==='custom' && payslipStart && payslipEnd && payslipEnd>=payslipStart) {
      start = payslipStart; end = payslipEnd; label = `${fmtD(start)} – ${fmtD(end)}`;
    } else return;
    if (exportFormat==='csv') { handleExportSpreadsheet(start, end, sanitiseNotes); setPayslipModalOpen(false); return; }
    setPayslipPreview({ start, end, label, data: computePayslipData(start, end) });
    setPayslipModalOpen(false);
  };

  // Archived-year data — grouped by pay period, individual entries included.
  // Deliberately no tax/NI estimate: that math leans on the CURRENT year's
  // cumulative gross and period breakdown, which isn't the right context for
  // a past year — rather than produce a number that looks precise but isn't,
  // this sticks to what can be stated correctly regardless of year (gross
  // figures, hours, shift counts).
  const computeArchivedYear = (year) => {
    const yPeriods = generateFYPeriods(year);
    let totalShifts = 0, totalGross = 0, totalHrs = 0, totalToilBanked = 0;
    // Same submission-date attribution as periodBreakdown and the
    // spreadsheet export — a shift's OT and PA can each land in a different
    // pay period, depending on when each was actually submitted, same as
    // the real payslip. An entry with nothing submitted yet falls back to
    // its own shift date, so it still shows up (at £0) rather than
    // vanishing. Each period only counts the portion of an entry's gross
    // that actually belongs to it — an entry whose OT and PA submission
    // dates straddle two different periods appears in both, but each period
    // shows only its own share, so nothing gets double-counted overall.
    const periods = yPeriods.map(p=>{
      const pEntries = entries.filter(e=>{
        const hasPA = e.paRate && e.paRate!=='None';
        const otDate = isOtSubmitted(e) ? effectiveOtDate(e) : null;
        const paDate = (hasPA && isPaSubmitted(e)) ? effectivePaDate(e) : null;
        const inP = d => d!=null && d>=p.start && d<=p.end;
        if (inP(otDate) || inP(paDate)) return true;
        if (otDate==null && paDate==null) return e.date>=p.start && e.date<=p.end;
        return false;
      }).sort((a,b)=>a.date.localeCompare(b.date));
      let periodGross = 0;
      const rows = pEntries.map(e=>{
        const c = calcEntry(e);
        const hasPA = e.paRate && e.paRate!=='None';
        const otInThisPeriod = isOtSubmitted(e) && effectiveOtDate(e)>=p.start && effectiveOtDate(e)<=p.end;
        const paInThisPeriod = hasPA && isPaSubmitted(e) && effectivePaDate(e)>=p.start && effectivePaDate(e)<=p.end;
        const rowGross = (otInThisPeriod ? c.ot : 0) + (paInThisPeriod ? c.pa : 0);
        periodGross += rowGross; totalHrs += c.h1+c.h2+c.h3;
        if (otInThisPeriod) totalToilBanked += c.toilBanked;
        return { id:e.id, date:e.date, reason:e.reason, gross:rowGross };
      });
      totalShifts += pEntries.length; totalGross += periodGross;
      return { ...p, entries: rows, gross: periodGross };
    }).filter(p=>p.entries.length>0);
    return { year, start: yPeriods[0].start, end: yPeriods[11].end, totalShifts, totalGross, totalHrs, totalToilBanked, periods };
  };

  // ── auth gate ──────────────────────────────────────────────────────────────
  // Placed after every hook above has already run (React's rules of hooks
  // require that), so it's safe to branch the actual render here. An active
  // session is required to reach the app below. If Supabase itself is
  // unreachable or misconfigured (supabase is null), this still falls back
  // to rendering the app rather than a dead end — see the client setup above.
  if (authLoading) {
    // Same wordmark/icon treatment as the real header below, so the very
    // first thing anyone sees on a cold load already looks like this app
    // rather than a generic "Loading…" placeholder — .fi eases it in
    // instead of it just cutting straight in over whatever was there before.
    return (
      <div className="fi" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'18px',height:'100dvh',background:'var(--surface-2)',fontFamily:"'DM Sans',system-ui,sans-serif"}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'10px'}}>
          <ClockCashIcon width={40} height={27}/>
          <span style={{fontSize:'17px',fontWeight:900,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',letterSpacing:'-0.3px'}}>Overtime &amp; Shift Tracker</span>
        </div>
        <div className="tab-spinner"/>
      </div>
    );
  }
  if (supabase && passwordRecoveryMode) {
    return (
      <AuthScreens
        key="recovery"
        supabase={supabase}
        addToast={addToast}
        onUnlocked={handleUnlocked}
        startInPasswordRecovery={true}
        onRecoveryComplete={()=>setPasswordRecoveryMode(false)}
        isWide={isWide}
      />
    );
  }
  if (supabase && (!session || !dataKey)) {
    return <AuthScreens key="normal" supabase={supabase} addToast={addToast} onUnlocked={handleUnlocked} isWide={isWide} />;
  }

  return (
    <div style={isWide ? {...S.wrap, maxWidth:'1180px', margin:'0 auto 0 250px'} : S.wrap}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        /* ── directional tab entrance — same fade, sliding in from whichever
             side of the nav order the tab you left sits on, instead of
             always rising from below like .fi. See tabAnimClass above. ── */
        @keyframes fiRight{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
        @keyframes fiLeft{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
        .fi-right{animation:fiRight 0.24s ease}
        .fi-left{animation:fiLeft 0.24s ease}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes su{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes urgentPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(220,38,38,0);transform:scale(1)}25%{opacity:0.78;box-shadow:0 0 0 9px rgba(220,38,38,0.38);transform:scale(1.012)}50%{opacity:1;box-shadow:0 0 0 0 rgba(220,38,38,0);transform:scale(1)}75%{opacity:0.78;box-shadow:0 0 0 9px rgba(220,38,38,0.38);transform:scale(1.012)}}
        @keyframes backupPulse{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}30%{box-shadow:0 0 0 8px rgba(37,99,235,0.35)}50%{box-shadow:0 0 0 0 rgba(37,99,235,0)}70%{box-shadow:0 0 0 8px rgba(37,99,235,0.35)}}
        @keyframes subtlePulse{0%{opacity:0.5}20%{opacity:1}40%{opacity:0.5}60%{opacity:1}80%,100%{opacity:0.5}}
        @keyframes entryFlash{0%{box-shadow:0 0 0 0 rgba(37,99,235,0.45)}60%{box-shadow:0 0 0 10px rgba(37,99,235,0)}100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}}
        .entry-flash{animation:entryFlash 1.4s ease-out 2}
        @keyframes carmsPulse{
          0%{box-shadow:0 0 0 0 rgba(37,99,235,0.6); transform:scale(1);}
          20%{box-shadow:0 0 0 16px rgba(37,99,235,0); transform:scale(1.02);}
          40%{box-shadow:0 0 0 0 rgba(37,99,235,0.6); transform:scale(1);}
          60%{box-shadow:0 0 0 16px rgba(37,99,235,0); transform:scale(1.02);}
          100%{box-shadow:0 0 0 0 rgba(37,99,235,0); transform:scale(1);}
        }
        .carms-pulse{animation:carmsPulse 1.6s ease-out;}
        @keyframes navAddPulse{0%,100%{opacity:1}50%{opacity:0.45}}
        .nav-add-pulse{animation:navAddPulse 1.8s ease-in-out infinite;}
        /* ── sliding nav pill (bottom mobile nav) — position/width are set
             inline per-render (measured against the real button layout,
             which itself is fluid via the clamp() rules below), only the
             easing lives here. ── */
        .nav-pill{position:absolute;top:5px;bottom:5px;border-radius:12px;background:var(--tint-brass);transition:left 0.45s cubic-bezier(.65,0,.35,1), width 0.45s cubic-bezier(.65,0,.35,1);pointer-events:none;z-index:0}
        .nav-ico{transition:transform 0.35s cubic-bezier(.34,1.56,.64,1)}
        .nav-ico.active{transform:scale(1.15)}
        @keyframes claimIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        .claim-in{animation:claimIn 0.4s cubic-bezier(.34,1.2,.64,1) both}
        @keyframes saveRingPulse{from{box-shadow:0 4px 20px rgba(220,38,38,0.5),0 0 0 0 rgba(5,150,105,0.55)}to{box-shadow:0 4px 20px rgba(220,38,38,0.5),0 0 0 22px rgba(5,150,105,0)}}
        .save-pulse{animation:saveRingPulse 0.65s ease-out}
        @keyframes badgePop{0%{transform:scale(0)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
        .badge-pop{animation:badgePop 0.4s cubic-bezier(.34,1.56,.64,1)}
        /* ── tap feedback for div-based rows ─────────────────────────────
             button:active (below) already gives real <button>s a press
             state, but most of the app's busiest tap targets — Dashboard's
             statement rows, CARMS claim rows, Settings' accordion headers —
             are <div onClick> instead, which that rule never reaches. This
             is the same press feedback for those. ── */
        .tap-row{transition:transform 0.12s ease, opacity 0.12s ease, filter 0.15s ease}
        .tap-row:active{transform:scale(0.975);opacity:0.7}
        /* ── hover feedback, desktop only ─────────────────────────────────
             Every clickable surface got tap feedback for touch a while
             back; this is the mouse equivalent, which the app never had
             at all — a real gap given how much of it (the sidebar, the
             two-column dashboard, every popover) only exists on desktop.
             hover:hover excludes touch devices, so a tap never leaves a
             phone's row looking artificially "stuck" hovered. A brightness
             filter (rather than a fixed background colour) works the same
             way regardless of what's underneath — a plain row, a tinted
             card, a solid-colour button — without needing its own tuned
             value for every different context. ── */
        @media (hover:hover){
          .tap-row:hover{filter:brightness(0.96)}
          button:not(:disabled):hover{filter:brightness(0.94)}
        }
        /* ── toast enter/exit — ToastStack mirrors the toasts array into
             local state so a dismissed toast plays this leave transition
             before it's actually dropped, instead of vanishing the instant
             its id falls out of the array. ── */
        /* toasts sit near the top of the screen, so they now drop in from
           above with a soft overshoot (like an iOS notification banner
           landing) instead of rising up from below into that position —
           own keyframe rather than reusing .fi's su, since su's direction
           is shared by unrelated fades all over the app. */
        @keyframes toastIn{from{opacity:0;transform:translateY(-22px) scale(0.96)}60%{transform:translateY(3px) scale(1.005)}to{opacity:1;transform:translateY(0) scale(1)}}
        .toast-enter{animation:toastIn 0.42s cubic-bezier(.32,1.1,.4,1)}
        @keyframes toastOut{to{opacity:0;transform:translateY(-14px) scale(0.97)}}
        .toast-leave{animation:toastOut 0.24s ease forwards}
        /* ── actionable-toast countdown — ToastStack draws this only under
             a toast that has an action button (Undo, Reload…), timed via
             the --toast-dur custom property to the same duration that
             toast's own auto-dismiss timeout uses, so the bar actually
             finishing lines up with the toast actually leaving instead of
             a plain fixed wait with zero indication of how much is left.
             Read through a custom property rather than setting
             animation-duration directly inline — an inline style always
             beats a stylesheet rule regardless of specificity, which would
             otherwise defeat the prefers-reduced-motion override below. ── */
        @keyframes toastShrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
        .toast-bar{animation-name:toastShrink;animation-timing-function:linear;animation-fill-mode:forwards;animation-duration:var(--toast-dur,3.5s)}
        /* ── confirmation modals pop in, they don't just appear ──────────
             .alert-pop: centred dialogs (desktop sign-out/restore/export,
             and Settings' inline wipe/delete-account warnings) scale up
             with a touch of overshoot, like an iOS alert.
             .sheet-pop: mobile bottom sheets slide up instead — a sheet
             anchored to the screen edge scaling from its centre would
             look broken.
             .modal-pop: Settings' desktop popover cards — same overshoot
             as alert-pop, but keyframed around the translate(-50%,-50%)
             centering modalBoxStyle already sets inline, so the pop
             doesn't fight that positioning. ── */
        @keyframes alertPop{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
        .alert-pop{animation:alertPop 0.32s cubic-bezier(.34,1.42,.64,1)}
        @keyframes sheetPop{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        .sheet-pop{animation:sheetPop 0.32s cubic-bezier(.32,.72,0,1)}
        @keyframes modalPop{from{opacity:0;transform:translate(-50%,-50%) scale(0.92)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        .modal-pop{animation:modalPop 0.28s cubic-bezier(.34,1.42,.64,1)}
        /* ── …and mirror it on the way out ────────────────────────────────
             Paired with useMountTransition (see useMountTransition.js):
             every alert-pop/sheet-pop overlay above (Sign Out, Restore,
             Export, chart modal, calendar day-detail/create-day confirm,
             the date picker) now keeps rendering for 220ms after it closes
             so this "-out" class can play instead of the dialog just
             hard-cutting away. Reverses the same curve family the entrance
             used rather than a plain fade, so the close reads as the open
             running backward. .ov-in/.ov-out do the same for each
             overlay's semi-transparent backdrop. modal-pop.pop-out below
             extends this to Settings' five desktop popovers too — left out
             of an earlier pass on the mistaken assumption they'd made the
             same "closing loses less" call as accordion-in's own asymmetry;
             re-reading that comment, it's only ever about accordion-in
             itself, so there was no actual reason left to skip these. */
        @keyframes alertPopOut{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0.92)}}
        .alert-pop.pop-out{animation:alertPopOut 0.2s cubic-bezier(.4,0,1,1) forwards}
        @keyframes sheetPopOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(28px)}}
        .sheet-pop.pop-out{animation:sheetPopOut 0.22s cubic-bezier(.4,0,1,1) forwards}
        @keyframes modalPopOut{from{opacity:1;transform:translate(-50%,-50%) scale(1)}to{opacity:0;transform:translate(-50%,-50%) scale(0.92)}}
        .modal-pop.pop-out{animation:modalPopOut 0.2s cubic-bezier(.4,0,1,1) forwards}
        @keyframes ovFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes ovFadeOut{from{opacity:1}to{opacity:0}}
        .ov-in{animation:ovFadeIn 0.22s ease}
        .ov-out{animation:ovFadeOut 0.2s ease forwards}
        /* ── the two dismissible top banners collapse their own height on
             the way out instead of the content underneath jumping up the
             instant they're cut (see dismissBackupReminder/dismissFYRollover
             pairing this with a 340ms setTimeout before the row actually
             unmounts). max-height rather than height since these banners'
             own height is never set explicitly — auto height can't be
             animated directly, and 90px comfortably clears the tallest of
             the two (FY rollover's two-line body) with room to spare. ── */
        @keyframes bannerCollapse{from{max-height:90px;opacity:1;padding-top:12px;padding-bottom:12px}to{max-height:0;opacity:0;padding-top:0;padding-bottom:0}}
        .banner-collapsing{animation:bannerCollapse 0.34s cubic-bezier(.4,0,.2,1) forwards}
        /* ── time wheel picker (TimeSelect.jsx) — hides the scrollbar on
             its two scroll-snap columns; scrollbar-width is set inline
             (works cross-property in React), but hiding WebKit's scrollbar
             needs a real stylesheet rule, not an inline style. ── */
        .time-wheel-col{scrollbar-width:none;-ms-overflow-style:none;}
        .time-wheel-col::-webkit-scrollbar{display:none;}
        /* ── accordion reveal — Settings' five inline sections (mobile) and
             Dashboard's Salary Breakdown pop into view the instant their
             chevron finishes rotating rather than snapping in dead still;
             the desktop popover equivalents already get modal-pop. Only
             the open direction animates — closing loses less by vanishing
             instantly since attention's already moved on by then, and it
             keeps this from needing its own mirrored exit-state plumbing. ── */
        @keyframes accordionIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .accordion-in{animation:accordionIn 0.28s cubic-bezier(.32,.72,0,1)}
        /* ── tab-chunk loading spinner — only ever visible for a beat on
             a slow connection's first visit to a given tab (each tab is
             its own lazy-loaded chunk, cached after that). ── */
        @keyframes tabSpin{to{transform:rotate(360deg)}}
        .tab-spinner{width:28px;height:28px;border-radius:50%;border:3px solid var(--border-2);border-top-color:#b8823f;animation:tabSpin 0.7s linear infinite;}
        @media (prefers-reduced-motion: reduce){
          .nav-pill{transition-duration:0.001ms}
          .nav-ico{transition-duration:0.001ms}
          .claim-in{animation-duration:0.001ms}
          .fi-right{animation-duration:0.001ms}
          .fi-left{animation-duration:0.001ms}
          .save-pulse{animation-duration:0.001ms}
          .badge-pop{animation-duration:0.001ms}
          .tap-row{transition-duration:0.001ms}
          .toast-enter{animation-duration:0.001ms}
          .toast-leave{animation-duration:0.001ms}
          .toast-bar{animation-duration:0.001ms}
          .alert-pop{animation-duration:0.001ms}
          .sheet-pop{animation-duration:0.001ms}
          .modal-pop{animation-duration:0.001ms}
          .accordion-in{animation-duration:0.001ms}
          .alert-pop.pop-out{animation-duration:0.001ms}
          .sheet-pop.pop-out{animation-duration:0.001ms}
          .modal-pop.pop-out{animation-duration:0.001ms}
          .ov-in{animation-duration:0.001ms}
          .ov-out{animation-duration:0.001ms}
          .banner-collapsing{animation-duration:0.001ms}
        }
        /* ── Fluid mobile nav ───────────────────────────────────────────
           Six tabs at fixed sizes leave almost no slack on a 320px phone
           (an iPhone SE) — "Log Overtime" in particular ends up exactly
           filling its slot with nothing to spare, so anything that nudges
           it wider (a longer label, a larger system font) would break the
           row. clamp() scales the icons, labels and padding continuously
           with viewport width instead: small phones get proportionally
           smaller elements, while anything from ~390px up is pinned to the
           original sizes, so nothing changes on the phones that already
           fit comfortably. CSS width/height overrides the SVG's own
           width/height attributes, which can't take clamp() themselves. */
        nav .nav-ico svg{
          width:clamp(15px, 4.6vw, 18px) !important;
          height:clamp(15px, 4.6vw, 18px) !important;
        }
        nav .nav-ico-add svg{
          width:clamp(18px, 5.4vw, 21px) !important;
          height:clamp(18px, 5.4vw, 21px) !important;
        }
        nav .nav-lbl{ font-size:clamp(6.4px, 2.05vw, 8px) !important; letter-spacing:clamp(0.1px, 0.13vw, 0.5px) !important; }
        nav button{ padding-left:clamp(1px, 1vw, 4px) !important; padding-right:clamp(1px, 1vw, 4px) !important; }
        .star-tap{transition:transform 0.12s}
        .star-tap:active{transform:scale(1.35)}
        .hint-pulse{animation:subtlePulse 1.8s ease-in-out infinite}
        .backup-pulse{animation:backupPulse 1.4s ease-in-out infinite}
        .fi{animation:fi 0.22s ease}
        .setup-pulse-urgent{animation:urgentPulse 1.5s ease-in-out infinite}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input:focus,select:focus,textarea:focus{outline:2px solid #2563eb;outline-offset:-2px}
        input,select,textarea{font-size:16px}
        button:active{opacity:0.8;transform:scale(0.96)}
        button{transition:filter 0.15s ease}
        input[type=date]{-webkit-appearance:none;appearance:none;color-scheme:light;line-height:1.2}
        /* Same theme-detection pattern as every custom property in
           index.html — without this, the OS's native date-picker icon and
           popup stay light-themed even in dark mode, exactly the bug the
           old TimeSelect had before it was rebuilt. */
        @media (prefers-color-scheme: dark){
          :root:not([data-theme="light"]) input[type=date]{color-scheme:dark}
        }
        :root[data-theme="dark"] input[type=date]{color-scheme:dark}
        input[type=date]::-webkit-date-and-time-value{text-align:left}
        input[type=date]::-webkit-datetime-edit{padding:0}
        input[type=date]::-webkit-calendar-picker-indicator{background:transparent;cursor:pointer;opacity:0.55;padding:0;margin:0}
        @media print{
          .no-print{display:none !important}
          .payslip-print-area{position:static !important;inset:auto !important;width:100% !important;max-width:none !important;max-height:none !important;overflow:visible !important;background:#fff !important;padding:0 !important}
          .payslip-print-doc{box-shadow:none !important;border-radius:0 !important}
          body,html{background:#fff !important}
        }
      `}</style>

      <div className="no-print"><ToastStack toasts={toasts} onDismiss={dismissToast}/></div>

      {/* ── header ── */}
      <header className="no-print" style={S.hdr}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',minWidth:0}}>
          <ClockCashIcon width={28} height={19}/>
          <div style={{display:'flex',flexDirection:'column',lineHeight:1.2,minWidth:0,overflow:'hidden'}}>
            <span style={{fontSize:'19px',fontWeight:900,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',letterSpacing:'-0.4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Overtime &amp; Shift Tracker</span>
            <span style={{fontSize:'13px',fontWeight:700,color:'var(--quiet)',letterSpacing:'0.2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>by Adam Stephens</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',flexShrink:0}}>
          {session&&(
            <button onClick={handleManualSync} disabled={manualSyncing} aria-label="Sync now" style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 13px',background:syncJustSucceeded?'var(--tint-green)':'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'9px',color:syncJustSucceeded?'#059669':'#2563eb',fontWeight:800,fontSize:'11px',fontFamily:'inherit',cursor:manualSyncing?'default':'pointer',whiteSpace:'nowrap',transition:'background 0.3s, color 0.3s'}}>
              <span style={{display:'flex',animation:manualSyncing?'spin 0.8s linear infinite':'none'}}><Ico n={syncJustSucceeded?'check':'refresh'} s={13} c={syncJustSucceeded?'#059669':'#2563eb'}/></span> {syncJustSucceeded?'Synced':'Sync'}
            </button>
          )}
        </div>
      </header>

      {/* ── sign-out confirmation — bottom sheet, same pattern as the export
           modal, with an explicit close (×) as well as Cancel ── */}
      {signOutMounted&&(
        <div onClick={()=>setSignOutConfirmOpen(false)} className={signOutConfirmOpen?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:60}}>
          <div onClick={e=>e.stopPropagation()} className={(isWide?'alert-pop':'sheet-pop')+(signOutConfirmOpen?'':' pop-out')} style={{overscrollBehavior:'contain',background:'var(--surface)',borderRadius:isWide?'20px':'20px 20px 0 0',width:'100%',maxWidth:'430px',padding:'20px',boxSizing:'border-box',position:'relative',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
            <button onClick={()=>setSignOutConfirmOpen(false)} aria-label="Close" style={{position:'absolute',top:'14px',right:'14px',width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--chip-bg)',border:'none',borderRadius:'50%',cursor:'pointer'}}>
              <Ico n="x" s={14} c="#64748b"/>
            </button>
            {!isWide && <div style={{width:'36px',height:'4px',background:'var(--border)',borderRadius:'4px',margin:'0 auto 14px'}}/>}
            <div style={{fontSize:'15px',fontWeight:900,marginBottom:'6px',textAlign:'center'}}>Sign out?</div>
            <div style={{fontSize:'12px',color:'var(--muted)',textAlign:'center',marginBottom:'18px',lineHeight:1.5}}>You'll need your password again to get back in. Data already synced stays exactly as it is.</div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{ setSignOutConfirmOpen(false); handleSignOut(); }} style={{flex:1,padding:'12px',background:'#2563eb',border:'none',borderRadius:'11px',color:'#fff',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor:'pointer'}}>Sign out</button>
              <button onClick={()=>setSignOutConfirmOpen(false)} style={{flex:1,padding:'12px',background:'transparent',border:'none',borderRadius:'11px',color:'var(--muted)',fontWeight:700,fontSize:'13px',fontFamily:'inherit',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {restoreMounted&&(
        <div onClick={()=>setRestoreConfirmOpen(false)} className={restoreConfirmOpen?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:60}}>
          <div onClick={e=>e.stopPropagation()} className={(isWide?'alert-pop':'sheet-pop')+(restoreConfirmOpen?'':' pop-out')} style={{overscrollBehavior:'contain',background:'var(--surface)',borderRadius:isWide?'20px':'20px 20px 0 0',width:'100%',maxWidth:'430px',padding:'20px',boxSizing:'border-box',position:'relative',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
            <button onClick={()=>setRestoreConfirmOpen(false)} aria-label="Close" style={{position:'absolute',top:'14px',right:'14px',width:'28px',height:'28px',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--chip-bg)',border:'none',borderRadius:'50%',cursor:'pointer'}}>
              <Ico n="x" s={14} c="#64748b"/>
            </button>
            {!isWide && <div style={{width:'36px',height:'4px',background:'var(--border)',borderRadius:'4px',margin:'0 auto 14px'}}/>}
            <div style={{fontSize:'15px',fontWeight:900,marginBottom:'6px',textAlign:'center'}}>Are you sure you want to overwrite the existing data?</div>
            <div style={{fontSize:'12px',color:'var(--muted)',textAlign:'center',marginBottom:'18px',lineHeight:1.5}}>Do you want to create a backup before proceeding?</div>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              <button onClick={async ()=>{ setRestoreConfirmOpen(false); await handleExport(); fileRef.current.click(); }} style={{padding:'12px',background:BRASS,border:'none',borderRadius:'11px',color:'#fff',fontWeight:800,fontSize:'13px',fontFamily:'inherit',cursor:'pointer'}}>Back up, then restore</button>
              <button onClick={()=>{ setRestoreConfirmOpen(false); fileRef.current.click(); }} style={{padding:'12px',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',color:'var(--text-red-deep)',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.06em'}}>Restore Without Backup</button>
              <button onClick={()=>setRestoreConfirmOpen(false)} style={{padding:'12px',background:'transparent',border:'none',borderRadius:'11px',color:'var(--muted)',fontWeight:700,fontSize:'13px',fontFamily:'inherit',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── monthly backup reminder — optional, dismissible, never blocks the app ──
           dismissBackupReminder/dismissFYRollover below play the collapse-and-
           fade exit (see .banner-collapsing) before actually clearing the
           show* flag, instead of the content underneath jumping up the
           instant these are cut. ── */}
      {(showBackupReminder||bannerClosing==='backup')&&(
        <div className={"fi no-print"+(bannerClosing==='backup'?' banner-collapsing':'')} style={{background:'var(--tint-blue)',borderBottom:'1px solid var(--border-2)',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px',flexShrink:0,zIndex:15,overflow:'hidden'}}>
          <div style={{background:'var(--tint-blue-2)',borderRadius:'13px',padding:'7px',flexShrink:0}}><Ico n="shield" s={15} c="#2563eb"/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:'12px',color:'var(--text-navy)',marginBottom:'2px'}}>Time for a backup</div>
            <div style={{fontSize:'11px',color:'#3b82f6',lineHeight:1.4,marginBottom:'8px'}}>It's been a couple of weeks — worth downloading a fresh backup of your records.</div>
            <div style={{display:'flex',gap:'7px'}}>
              <button onClick={goBackupNow} style={{background:'#2563eb',border:'none',borderRadius:'8px',padding:'6px 13px',fontWeight:900,fontSize:'10px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Back Up Now</button>
              <button onClick={dismissBackupReminder} style={{background:'none',border:'none',padding:'6px 4px',fontWeight:700,fontSize:'10px',color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>Not now</button>
            </div>
          </div>
          <button onClick={dismissBackupReminder} style={{background:'none',border:'none',cursor:'pointer',padding:'2px',flexShrink:0}}><Ico n="x" s={15} c="#94a3b8"/></button>
        </div>
      )}

      {/* ── financial year rollover — one-time, dismissible, never blocks the app ── */}
      {(showFYRollover||bannerClosing==='fy')&&(
        <div className={"fi no-print"+(bannerClosing==='fy'?' banner-collapsing':'')} style={{background:'var(--tint-blue)',borderBottom:'1px solid var(--border-2)',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px',flexShrink:0,zIndex:15,overflow:'hidden'}}>
          <div style={{background:'var(--tint-blue-2)',borderRadius:'13px',padding:'7px',flexShrink:0}}><Ico n="star" s={15} c="#2563eb"/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:'12px',color:'var(--text-navy)',marginBottom:'2px'}}>Welcome to FY {CURRENT_FY_YEAR}/{(CURRENT_FY_YEAR+1).toString().slice(-2)}</div>
            <div style={{fontSize:'11px',color:'#3b82f6',lineHeight:1.4,marginBottom:'8px'}}>Your {CURRENT_FY_YEAR-1}/{CURRENT_FY_YEAR.toString().slice(-2)} year is complete — find it any time under Financial Years in Options.</div>
            <div style={{display:'flex',gap:'7px'}}>
              <button onClick={()=>{dismissFYRollover();setTab('settings');}} style={{background:'#2563eb',border:'none',borderRadius:'8px',padding:'6px 13px',fontWeight:900,fontSize:'10px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>View Last Year</button>
              <button onClick={dismissFYRollover} style={{background:'none',border:'none',padding:'6px 4px',fontWeight:700,fontSize:'10px',color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>Got it</button>
            </div>
          </div>
          <button onClick={dismissFYRollover} style={{background:'none',border:'none',cursor:'pointer',padding:'2px',flexShrink:0}}><Ico n="x" s={15} c="#94a3b8"/></button>
        </div>
      )}

      {/* position:relative — the positioning context for the More.. tab's
           desktop popup cards below, so they centre on this sidebar-
           excluded content area (main+aside) rather than the full browser
           viewport, and stay put regardless of main's own internal scroll
           (this row itself never scrolls — only <main> does, internally). ── */}
      <div ref={contentWrapRef} style={{display:'flex',flex:1,overflow:'hidden',position:'relative'}}>
      <main ref={mainRef} className="no-print" style={S.main}>
      <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'50vh'}}><div className="tab-spinner"/></div>}>

        {/* ══════════════════════════════════════════ DASHBOARD */}
        {tab==='dashboard'&&(
          <TabDashboard
            animClass={tabAnimClass}
            isWide={isWide} settings={settings} setTab={setTab} totals={totals}
            currPeriodIdx={currPeriodIdx} toilLedger={toilLedger} carmsOutstanding={carmsOutstanding}
            salaryBreakdownExpanded={salaryBreakdownExpanded} setSalaryBreakdownExpanded={setSalaryBreakdownExpanded}
            scrollToTaxImpact={scrollToTaxImpact} setTaxImpactExpanded={setTaxImpactExpanded}
            skipBreakdownReset={skipBreakdownReset} setBreakdownView={setBreakdownView} setCalPeriodIdx={setCalPeriodIdx}
            renderMonthlyChart={renderMonthlyChart} S={S} MONO={MONO} BRASS={BRASS}
          />
        )}

        {/* ══════════════════════════════════════════ LOG SHIFT */}
        {tab==='add'&&(
          <TabLogOvertime
            animClass={tabAnimClass}
            editing={editing} setEditing={setEditing} setTab={setTab} settings={settings} isWide={isWide}
            S={S} MONO={MONO} BRASS={BRASS} form={form} setForm={setForm} todayStr={todayStr} notesRef={notesRef}
            effectiveTier={effectiveTier} preview={preview} handleSave={handleSave} justSaved={justSaved}
            carmsToggleRef={carmsToggleRef} focusCarmsToggle={focusCarmsToggle}
            setDatePickerMonth={setDatePickerMonth} setDatePickerFor={setDatePickerFor}
            syncShiftTimesIntoForm={syncShiftTimesIntoForm}
          />
        )}

        {/* ══════════════════════════════════════════ BREAKDOWN */}
        {tab==='months'&&(
          <TabSummary
            animClass={tabAnimClass}
            isWide={isWide} S={S} MONO={MONO} BRASS={BRASS}
            stickyRef={stickyRef} mainRef={mainRef} monthRefs={monthRefs} entryRefs={entryRefs} calSwipeStartX={calSwipeStartX}
            breakdownView={breakdownView} setBreakdownView={setBreakdownView} defaultBreakdownView={defaultBreakdownView} setDefaultBreakdownView={setDefaultBreakdownView}
            currPeriodIdx={currPeriodIdx} calPeriodIdx={calPeriodIdx} setCalPeriodIdx={setCalPeriodIdx} expanded={expanded} setExpanded={setExpanded}
            calLegendExpanded={calLegendExpanded} setCalLegendExpanded={setCalLegendExpanded}
            focusEntryId={focusEntryId} confirmDel={confirmDel} setConfirmDel={setConfirmDel} pulsePeriodIdx={pulsePeriodIdx} setPulsePeriodIdx={setPulsePeriodIdx}
            setSelectedCalDay={setSelectedCalDay} setConfirmCreateDay={setConfirmCreateDay}
            PAY_PERIODS={PAY_PERIODS} fyEntries={fyEntries} totals={totals} carmsOutstanding={carmsOutstanding} todayStr={todayStr}
            calcEntry={calcEntry} crossPeriodInfo={crossPeriodInfo} carmsBadge={carmsBadge} renderDatePills={renderDatePills} renderFYTotalsCard={renderFYTotalsCard}
            jumpTo={jumpTo} snapToActiveMonth={snapToActiveMonth} startEdit={startEdit} delEntry={delEntry} setTab={setTab}
          />
        )}

        {/* ══════════════════════════════════════════ CARMS OUTSTANDING */}
        {tab==='carms'&&(
          <TabCarms animClass={tabAnimClass} S={S} MONO={MONO} BRASS={BRASS} isWide={isWide} carmsOutstanding={carmsOutstanding} carmsFilter={carmsFilter} setCarmsFilter={setCarmsFilter} periodGroupRefs={periodGroupRefs} pulsePeriodIdx={pulsePeriodIdx} startEdit={startEdit} setFocusCarmsToggle={setFocusCarmsToggle} carmsClaimNumbers={carmsClaimNumbers}
            carmsSelectMode={carmsSelectMode} toggleCarmsSelectMode={toggleCarmsSelectMode} carmsSelected={carmsSelected} toggleCarmsClaim={toggleCarmsClaim} toggleCarmsGroup={toggleCarmsGroup} openCarmsBulkConfirm={openCarmsBulkConfirm}/>
        )}

        {/* ══════════════════════════════════════════ TOIL */}
        {tab==='graph'&&(
          <TabToil animClass={tabAnimClass} isWide={isWide} S={S} MONO={MONO} toilLedger={toilLedger} toilTakenForm={toilTakenForm} setToilTakenForm={setToilTakenForm} addToilTaken={addToilTaken} deleteToilTaken={deleteToilTaken}/>
        )}

        {/* ══════════════════════════════════════════ SETTINGS */}
        {tab==='settings'&&(
          <TabSettings
            animClass={tabAnimClass}
            isWide={isWide} S={S} MONO={MONO} BRASS={BRASS}
            savedBadge={savedBadge} themeMode={themeMode} setTheme={setTheme}
            configExpanded={configExpanded} setConfigExpanded={setConfigExpanded} configShown={configShown} configSetupIncomplete={configSetupIncomplete}
            taxImpactExpanded={taxImpactExpanded} setTaxImpactExpanded={setTaxImpactExpanded} taxImpactCardRef={taxImpactCardRef}
            taxCalcActualDetailOpen={taxCalcActualDetailOpen} setTaxCalcActualDetailOpen={setTaxCalcActualDetailOpen}
            taxCalcForecastDetailOpen={taxCalcForecastDetailOpen} setTaxCalcForecastDetailOpen={setTaxCalcForecastDetailOpen}
            financialYearsExpanded={financialYearsExpanded} setFinancialYearsExpanded={setFinancialYearsExpanded}
            exportDataExpanded={exportDataExpanded} setExportDataExpanded={setExportDataExpanded}
            dataManagementExpanded={dataManagementExpanded} setDataManagementExpanded={setDataManagementExpanded}
            settings={settings} saveSett={saveSett} totals={totals} taxForecast={taxForecast} entries={entries} currPeriodIdx={currPeriodIdx}
            setExportFormat={setExportFormat} setPayslipMode={setPayslipMode} setPayslipPeriodIdx={setPayslipPeriodIdx} setPayslipFYYear={setPayslipFYYear} setPayslipModalOpen={setPayslipModalOpen}
            session={session} handleExport={handleExport} pulseBackupBtn={pulseBackupBtn} setRestoreConfirmOpen={setRestoreConfirmOpen} fileRef={fileRef} handleImport={handleImport}
            wipeConf={wipeConf} setWipeConf={setWipeConf} handleWipe={handleWipe} wipingData={wipingData}
            deleteAcctConf={deleteAcctConf} setDeleteAcctConf={setDeleteAcctConf} deleteAcctTyped={deleteAcctTyped} setDeleteAcctTyped={setDeleteAcctTyped} handleDeleteAccount={handleDeleteAccount} deletingAcct={deletingAcct}
            setSignOutConfirmOpen={setSignOutConfirmOpen}
            contentWrapRef={contentWrapRef} modalBoxStyle={modalBoxStyle}
            yearsWithData={yearsWithData} setArchiveExpandedPeriod={setArchiveExpandedPeriod} setFySummaryPrintMode={setFySummaryPrintMode} setFySummaryYear={setFySummaryYear}
          />
        )}
      </Suspense>
      </main>

      {/* ── Desktop secondary column — gives the empty space beside the
           main column on a wide screen an actual job, rather than just
           being padding around a phone-width layout. Shown on every tab
           for continuity, including CARMS/PA and TOIL themselves — even
           though some of what it shows overlaps with the main content on
           those two, having the column consistently present throughout
           the app was judged more valuable than trimming a duplicate
           figure on two screens. ── */}
      {isWide && (
        <aside className="no-print" style={{width:'320px',flexShrink:0,padding:'24px 24px 24px 0',overflowY:'auto'}}>
          <div style={{fontFamily:MONO,fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px',padding:'0 2px'}}>At a Glance</div>

          <div style={{background:'var(--surface)',borderRadius:'16px',border:'1px solid var(--border-2)',boxShadow:'0 1px 6px rgba(0,0,0,0.04)',padding:'4px 16px',overflow:'hidden'}}>
          {(()=>{
            const pb = glancePb;
            return (
              <div style={{padding:'14px 0',borderBottom:'1px solid var(--border-2)'}}>
                <div style={{fontWeight:900,fontSize:'10px',color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Gross &amp; Net OT — Current Period</div>
                <div style={{display:'flex',justifyContent:'space-between',gap:'12px'}}>
                  <div>
                    <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross</div>
                    <div style={{fontFamily:MONO,fontSize:'16px',fontWeight:600,color:'var(--ink)',marginTop:'2px'}}>{pb?fmtGBP(animatedGlanceGross):'£0.00'}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Net</div>
                    <div style={{fontFamily:MONO,fontSize:'16px',fontWeight:600,color:'#059669',marginTop:'2px'}}>{pb?fmtGBP(animatedGlanceNet):'£0.00'}</div>
                  </div>
                </div>
                <div style={{fontSize:'10px',color:'var(--quiet)',marginTop:'8px'}}>{pb?pb.month:'—'} · submitted only</div>
              </div>
            );
          })()}

          <div style={{padding:'14px 0 4px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'4px'}}>
              <span style={{fontWeight:900,fontSize:'10px',color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em'}}>CARMS &amp; PA Outstanding</span>
              {carmsOutstanding.totalClaims>0&&<span onClick={()=>setTab('carms')} style={{fontSize:'10px',fontWeight:700,color:BRASS,cursor:'pointer'}}>View all →</span>}
            </div>
            {carmsOutstanding.totalClaims===0
              ? <div style={{fontSize:'11px',color:'var(--quiet)',fontWeight:600,padding:'6px 0 14px'}}>Nothing outstanding right now.</div>
              : (()=>{
                  // One row per CLAIM, not per entry: an entry with both
                  // overtime and PA outstanding is two separate submissions
                  // (CARMS and MetHR), so it gets a row each with its own
                  // amount — mirroring the CARMS/PA tab, and keeping the row
                  // count consistent with the "claims to submit" total below,
                  // which has always counted them separately.
                  const allClaims = [];
                  carmsOutstanding.groups.forEach(g=>g.items.forEach(it=>{
                    if (it.otOutstanding) allClaims.push({ entry:it.entry, kind:'Overtime', amount:it.otAmt, key:it.entry.id+'-ot' });
                    if (it.paOutstanding) allClaims.push({ entry:it.entry, kind:it.entry.paRate, amount:it.paAmt, key:it.entry.id+'-pa' });
                  }));
                  const LIMIT = 5;
                  const shown = allClaims.slice(0, LIMIT);
                  const hidden = allClaims.length - shown.length;
                  return (
                    <>
                      {shown.map((cl,i)=>(
                        <div key={cl.key} onClick={()=>setTab('carms')} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',padding:'9px 0',borderTop:i===0?'none':'1px solid var(--border-2)',cursor:'pointer'}}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:'11.5px',fontWeight:700,color:'var(--ink)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cl.entry.reason||'Shift'}</div>
                            <div style={{fontSize:'9.5px',color:'var(--quiet)'}}>{cl.kind} · {new Date(cl.entry.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
                          </div>
                          <div style={{fontFamily:MONO,fontSize:'12.5px',fontWeight:600,color:BRASS,flexShrink:0}}>{fmtGBP(cl.amount)}</div>
                        </div>
                      ))}
                      {hidden>0&&(
                        <div onClick={()=>setTab('carms')} style={{fontSize:'10px',fontWeight:700,color:BRASS,padding:'8px 0 0',cursor:'pointer',borderTop:'1px solid var(--border-2)',marginTop:'2px'}}>
                          +{hidden} more claim{hidden!==1?'s':''} →
                        </div>
                      )}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--tint-brass)',borderRadius:'13px',padding:'9px 11px',marginTop:'8px'}}>
                        <span style={{fontSize:'10px',fontWeight:700,color:'var(--text-amber-deep)'}}>{carmsOutstanding.totalClaims} CLAIM{carmsOutstanding.totalClaims!==1?'S':''} TO SUBMIT</span>
                        <span style={{fontFamily:MONO,fontSize:'14px',fontWeight:600,color:BRASS}}>{fmtGBP(carmsOutstanding.totalAmount)}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 11px 0'}}>
                        <span style={{fontSize:'9.5px',fontWeight:700,color:'var(--quiet)'}}>Overtime unclaimed</span>
                        <span style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:BRASS}}>{fmtGBP(carmsOutstanding.totalOtAmount)}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'4px 11px 14px'}}>
                        <span style={{fontSize:'9.5px',fontWeight:700,color:'var(--quiet)'}}>PA unclaimed</span>
                        <span style={{fontFamily:MONO,fontSize:'10.5px',fontWeight:600,color:BRASS}}>{fmtGBP(carmsOutstanding.totalPaAmount)}</span>
                      </div>
                    </>
                  );
                })()
            }
          </div>
          </div>
        </aside>
      )}
      </div>

      {/* Financial Reports & Export — shared modal for both PDF and Spreadsheet formats */}
      {payslipMounted&&(()=>{
        const periodChoices = (currPeriodIdx>=0 ? PAY_PERIODS.slice(0,currPeriodIdx+1) : PAY_PERIODS).map((p,i)=>({...p,idx:i})).reverse();
        const rangeValid = payslipStart && payslipEnd && payslipEnd>=payslipStart;
        const canGenerate = payslipMode==='period' ? payslipPeriodIdx!=null : payslipMode==='financialYear' ? payslipFYYear!=null : rangeValid;
        const formatLabel = exportFormat==='csv' ? 'Spreadsheet' : 'PDF';
        return (
          <div onClick={()=>setPayslipModalOpen(false)} className={payslipModalOpen?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:60}}>
            <div onClick={e=>e.stopPropagation()} className={(isWide?'alert-pop':'sheet-pop')+(payslipModalOpen?'':' pop-out')} style={{overscrollBehavior:'contain',background:'var(--surface)',borderRadius:isWide?'20px':'20px 20px 0 0',width:'100%',maxWidth:'430px',padding:'20px',maxHeight:'85%',overflowY:'auto',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
              {!isWide && <div style={{width:'36px',height:'4px',background:'var(--border)',borderRadius:'4px',margin:'0 auto 14px'}}/>}
              {exportFormat===null ? (
                <>
                  <div style={{fontSize:'15px',fontWeight:900,marginBottom:'4px'}}>Financial Reports &amp; Export</div>
                  <div style={{fontSize:'11px',color:'var(--quiet)',marginBottom:'18px'}}>Choose a format to continue</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    <button onClick={()=>setExportFormat('pdf')} style={{display:'flex',alignItems:'center',gap:'12px',padding:'16px',borderRadius:'13px',border:'1.5px solid var(--border-2)',background:'var(--tint-blue)',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                      <div style={{background:'var(--tint-blue-2)',padding:'10px',borderRadius:'13px',flexShrink:0}}><Ico n="doc" s={18} c="#2563eb"/></div>
                      <div>
                        <div style={{fontWeight:900,fontSize:'13.5px',color:'var(--ink)'}}>PDF</div>
                        <div style={{fontSize:'10.5px',color:'var(--muted)',marginTop:'1px'}}>A formatted, printable summary</div>
                      </div>
                    </button>
                    <button onClick={()=>setExportFormat('csv')} style={{display:'flex',alignItems:'center',gap:'12px',padding:'16px',borderRadius:'13px',border:'1.5px solid var(--border-2)',background:'var(--tint-green)',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                      <div style={{background:'var(--tint-green-2)',padding:'10px',borderRadius:'13px',flexShrink:0}}><Ico n="table" s={18} c="#059669"/></div>
                      <div>
                        <div style={{fontWeight:900,fontSize:'13.5px',color:'var(--ink)'}}>Spreadsheet</div>
                        <div style={{fontSize:'10.5px',color:'var(--muted)',marginTop:'1px'}}>An XLSX file for Excel, Sheets or Numbers</div>
                      </div>
                    </button>
                  </div>
                  <button onClick={()=>setPayslipModalOpen(false)} style={{width:'100%',background:'none',border:'none',padding:'14px',fontWeight:800,fontSize:'12px',color:'var(--muted)',cursor:'pointer',fontFamily:'inherit',marginTop:'8px'}}>Cancel</button>
                </>
              ) : (
              <>
              <div style={{fontSize:'15px',fontWeight:900,marginBottom:'4px'}}>Export to {formatLabel}</div>
              <div style={{fontSize:'11px',color:'var(--quiet)',marginBottom:'16px'}}>Choose a period, or set your own date range</div>

              <div style={{display:'flex',gap:'6px',background:'var(--chip-bg)',borderRadius:'12px',padding:'3px',marginBottom:'16px'}}>
                <button onClick={()=>setPayslipMode('period')} style={{flex:1,textAlign:'center',padding:'9px 4px',borderRadius:'9px',fontWeight:800,fontSize:'11.5px',border:'none',fontFamily:'inherit',cursor:'pointer',background:payslipMode==='period'?'#fff':'transparent',color:payslipMode==='period'?'#2563eb':'var(--muted)',boxShadow:payslipMode==='period'?'0 2px 6px rgba(0,0,0,0.1)':'none'}}>Pay Period</button>
                <button onClick={()=>setPayslipMode('custom')} style={{flex:1,textAlign:'center',padding:'9px 4px',borderRadius:'9px',fontWeight:800,fontSize:'11.5px',border:'none',fontFamily:'inherit',cursor:'pointer',background:payslipMode==='custom'?'#fff':'transparent',color:payslipMode==='custom'?'#2563eb':'var(--muted)',boxShadow:payslipMode==='custom'?'0 2px 6px rgba(0,0,0,0.1)':'none'}}>Custom Range</button>
                <button onClick={()=>setPayslipMode('financialYear')} style={{flex:1,textAlign:'center',padding:'9px 4px',borderRadius:'9px',fontWeight:800,fontSize:'11.5px',border:'none',fontFamily:'inherit',cursor:'pointer',background:payslipMode==='financialYear'?'#fff':'transparent',color:payslipMode==='financialYear'?'#2563eb':'var(--muted)',boxShadow:payslipMode==='financialYear'?'0 2px 6px rgba(0,0,0,0.1)':'none'}}>Financial Year</button>
              </div>

              <div onClick={()=>setSanitiseNotes(v=>!v)} style={{display:'flex',alignItems:'flex-start',gap:'10px',background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'12px 14px',marginBottom:'16px',cursor:'pointer'}}>
                <div style={{width:'20px',height:'20px',borderRadius:'6px',border:`2px solid ${sanitiseNotes?'#dc2626':'#cbd5e1'}`,background:sanitiseNotes?'#dc2626':'var(--surface)',flexShrink:0,marginTop:'1px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {sanitiseNotes&&<Ico n="check" s={12} c="#fff" w={3}/>}
                </div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:800,color:'var(--text-red-deep)'}}>Sanitise Notes Field</div>
                  <div style={{fontSize:'10.5px',color:'var(--text-red-deep)',marginTop:'2px',lineHeight:1.5}}>Recommended — shift notes may hold operationally sensitive detail.</div>
                </div>
              </div>

              {payslipMode==='period' ? (
                <>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Pay Periods</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'7px',marginBottom:'6px'}}>
                    {periodChoices.map(p=>(
                      <div key={p.idx} onClick={()=>setPayslipPeriodIdx(p.idx)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'12px',border:p.idx===payslipPeriodIdx?'1.5px solid #2563eb':'1.5px solid var(--border-2)',background:p.idx===payslipPeriodIdx?'var(--tint-blue)':'var(--surface)',cursor:'pointer'}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:'12.5px',color:'var(--ink)'}}>{p.month}{p.idx===currPeriodIdx&&<span style={{color:'#2563eb',fontSize:'9px',marginLeft:'6px'}}>· Current</span>}</div>
                          <div style={{fontFamily:MONO,fontSize:'9.5px',color:'var(--quiet)',marginTop:'1px'}}>{fmtD(p.start)} – {fmtD(p.end)}</div>
                        </div>
                        <div style={{width:'18px',height:'18px',borderRadius:'50%',border:`2px solid ${p.idx===payslipPeriodIdx?'#2563eb':'#cbd5e1'}`,flexShrink:0,position:'relative'}}>
                          {p.idx===payslipPeriodIdx&&<div style={{position:'absolute',inset:'3px',background:'#2563eb',borderRadius:'50%'}}/>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : payslipMode==='custom' ? (
                <>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Custom Range</div>
                  <div style={{display:'flex',gap:'10px',marginBottom:'6px'}}>
                    <div style={{flex:1}}>
                      <label style={{display:'block',fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>Start</label>
                      <input type="date" value={payslipStart} onChange={e=>setPayslipStart(e.target.value)} style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1.5px solid var(--border)',borderRadius:'11px',padding:'11px 12px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',color:'var(--ink)'}}/>
                    </div>
                    <div style={{flex:1}}>
                      <label style={{display:'block',fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>End</label>
                      <input type="date" value={payslipEnd} onChange={e=>setPayslipEnd(e.target.value)} style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1.5px solid var(--border)',borderRadius:'11px',padding:'11px 12px',fontWeight:700,fontSize:'16px',fontFamily:'inherit',color:'var(--ink)'}}/>
                    </div>
                  </div>
                  {payslipStart&&payslipEnd&&!rangeValid&&<div style={{fontSize:'10.5px',color:'#dc2626',fontWeight:700,marginTop:'6px'}}>End date must be on or after the start date.</div>}
                </>
              ) : (
                <>
                  <div style={{fontSize:'10px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Financial Year</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'7px',marginBottom:'6px'}}>
                    {[CURRENT_FY_YEAR, ...yearsWithData].map(y=>{
                      const yPeriods = generateFYPeriods(y);
                      const isCurrent = y===CURRENT_FY_YEAR;
                      return (
                        <div key={y} onClick={()=>setPayslipFYYear(y)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'12px',border:y===payslipFYYear?'1.5px solid #2563eb':'1.5px solid var(--border-2)',background:y===payslipFYYear?'var(--tint-blue)':'var(--surface)',cursor:'pointer'}}>
                          <div>
                            <div style={{fontWeight:800,fontSize:'12.5px',color:'var(--ink)'}}>{y} / {(y+1).toString().slice(-2)}{isCurrent&&<span style={{color:'#2563eb',fontSize:'9px',marginLeft:'6px'}}>· Current</span>}</div>
                            <div style={{fontSize:'10px',color:'var(--quiet)',marginTop:'1px'}}>{yPeriods[0].month} – {yPeriods[11].month}{!isCurrent&&exportFormat==='pdf'&&' · gross only, no tax/NI'}</div>
                          </div>
                          <div style={{width:'18px',height:'18px',borderRadius:'50%',border:`2px solid ${y===payslipFYYear?'#2563eb':'#cbd5e1'}`,flexShrink:0,position:'relative'}}>
                            {y===payslipFYYear&&<div style={{position:'absolute',inset:'3px',background:'#2563eb',borderRadius:'50%'}}/>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',margin:'16px 0',fontSize:'12px',color:'var(--text-blue-deep)',fontWeight:700,textAlign:'center'}}>
                {payslipMode==='period'
                  ? (payslipPeriodIdx!=null ? `${fmtD(PAY_PERIODS[payslipPeriodIdx].start)} – ${fmtD(PAY_PERIODS[payslipPeriodIdx].end)}` : 'Pick a pay period')
                  : payslipMode==='financialYear'
                    ? (payslipFYYear!=null ? `${generateFYPeriods(payslipFYYear)[0].month} – ${generateFYPeriods(payslipFYYear)[11].month}` : 'Pick a financial year')
                    : (rangeValid ? `${fmtD(payslipStart)} – ${fmtD(payslipEnd)}` : 'Pick a valid start and end date')}
              </div>

              <button onClick={handleGenerateExport} disabled={!canGenerate} style={{width:'100%',background:canGenerate?'#2563eb':'#cbd5e1',color:'#fff',border:'none',borderRadius:'12px',padding:'14px',fontWeight:900,fontSize:'13px',cursor:canGenerate?'pointer':'default',fontFamily:'inherit'}}>{exportFormat==='csv' ? 'Export Spreadsheet' : payslipMode==='financialYear'&&payslipFYYear!=null&&payslipFYYear!==CURRENT_FY_YEAR ? 'View Year Summary' : 'Generate Payslip'}</button>
              <div style={{display:'flex',gap:'6px',marginTop:'4px'}}>
                <button onClick={()=>setExportFormat(null)} style={{flex:1,background:'none',border:'none',padding:'12px',fontWeight:800,fontSize:'12px',color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>‹ Back</button>
                <button onClick={()=>setPayslipModalOpen(false)} style={{flex:1,background:'none',border:'none',padding:'12px',fontWeight:800,fontSize:'12px',color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
              </div>
              </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Payslip preview / print document */}
      {payslipPreview&&(()=>{
        const d = payslipPreview.data;
        const hasOT = d.rateHrs.hours133>0 || d.rateHrs.hours150>0 || d.rateHrs.hours200>0;
        const hasPA = d.paCounts.PA1>0 || d.paCounts.PA2>0 || d.paCounts.PA3>0;
        const rowStyle = {padding:'7px 0',borderBottom:'1px solid var(--border-2)'};
        const thStyle = {textAlign:'left',fontSize:'9px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'0.8px',padding:'4px 0',borderBottom:'1px solid var(--border-2)'};
        const sectionTitle = {fontSize:'10.5px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1.2px',margin:'20px 0 8px',paddingTop:'14px',borderTop:'1px solid var(--border-2)'};
        return (
          <div className="payslip-print-area" style={{position:'absolute',inset:0,background:'var(--page-bg)',zIndex:70,overflowY:'auto',overscrollBehavior:'contain',padding:'16px'}}>
            <div className="no-print" style={{display:'flex',gap:'8px',marginBottom:'14px',maxWidth:'560px',margin:'0 auto 14px'}}>
              <button onClick={()=>window.print()} style={{flex:1,background:'#2563eb',color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="dl" s={13} c="#fff"/> Print / Save as PDF</button>
              <button onClick={()=>setPayslipPreview(null)} style={{background:'var(--surface)',color:'var(--muted)',border:'1px solid var(--border)',borderRadius:'11px',padding:'12px 18px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit'}}>Close</button>
            </div>

            <div className="payslip-print-doc" style={{maxWidth:'560px',margin:'0 auto',background:'var(--surface)',borderRadius:'6px',boxShadow:'0 4px 24px rgba(0,0,0,0.12)',overflow:'hidden'}}>
              <div style={{background:'var(--navy)',color:'#fff',padding:'26px 26px 20px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'18px'}}>
                  <div>
                    <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em'}}>Overtime &amp; Shift Tracker</div>
                    <div style={{fontSize:'19px',fontWeight:900,marginTop:'3px',letterSpacing:'-0.3px'}}>Overtime Summary</div>
                    <div style={{fontSize:'10px',color:'#7c93b3',marginTop:'2px'}}>Personal record — not an official payslip</div>
                  </div>
                  <div style={{fontSize:'9.5px',color:'#93c5fd',textAlign:'right',lineHeight:1.5,flexShrink:0}}>
                    Generated {new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}<br/>at {new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                  <div>
                    <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'3px'}}>Rank / Pay Point</div>
                    <div style={{fontWeight:800,fontSize:'13px'}}>{settings.rank||'—'}, {settings.service||'—'}</div>
                  </div>
                  <div>
                    <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'3px'}}>Period</div>
                    <div style={{fontFamily:MONO,fontWeight:600,fontSize:'12.5px'}}>{payslipPreview.rangeLabel || `${fmtD(payslipPreview.start)} – ${fmtD(payslipPreview.end)}`}</div>
                  </div>
                </div>
              </div>

              <div style={{padding:'22px 26px 10px'}}>
                {d.clippedFrom&&<div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',marginBottom:'14px',fontSize:'11px',color:'var(--text-blue-deep)',lineHeight:1.5}}>The tax year restarts on 6 April, so this summary only covers {fmtD(d.clippedFrom)} – {fmtD(payslipPreview.end)} — the part that falls in the current tax year. That's what keeps the figures accurate.</div>}
                {d.rangeEntries.length===0 ? (
                  <div style={{textAlign:'center',padding:'30px 10px',color:'var(--quiet)',fontSize:'13px',fontWeight:600}}>No shifts recorded in this range.</div>
                ) : (
                  <>
                    {hasOT&&(
                      <>
                        <div style={sectionTitle}>Overtime Worked</div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                          <thead><tr><th style={thStyle}>Rate</th><th style={{...thStyle,textAlign:'right'}}>Hours</th><th style={{...thStyle,textAlign:'right'}}>Rate/hr</th><th style={{...thStyle,textAlign:'right'}}>Amount</th></tr></thead>
                          <tbody>
                            {d.rateHrs.hours133>0&&<tr><td style={{...rowStyle,fontWeight:700,color:'var(--muted)'}}>Standard (1.33x)</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{d.rateHrs.hours133.toFixed(2)}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(d.rates.r133)}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(d.rateHrs.hours133*d.rates.r133)}</td></tr>}
                            {d.rateHrs.hours150>0&&<tr><td style={{...rowStyle,fontWeight:700,color:'var(--muted)'}}>Elevated (1.5x)</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{d.rateHrs.hours150.toFixed(2)}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(d.rates.r150)}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(d.rateHrs.hours150*d.rates.r150)}</td></tr>}
                            {d.rateHrs.hours200>0&&<tr><td style={{...rowStyle,fontWeight:700,color:'var(--muted)'}}>Rest Day (2.0x)</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{d.rateHrs.hours200.toFixed(2)}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(d.rates.r200)}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(d.rateHrs.hours200*d.rates.r200)}</td></tr>}
                          </tbody>
                        </table>
                      </>
                    )}

                    {hasPA&&(
                      <>
                        <div style={sectionTitle}>Protection Allowance</div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                          <thead><tr><th style={thStyle}>Type</th><th style={{...thStyle,textAlign:'right'}}>Count</th><th style={{...thStyle,textAlign:'right'}}>Rate</th><th style={{...thStyle,textAlign:'right'}}>Amount</th></tr></thead>
                          <tbody>
                            {['PA1','PA2','PA3'].filter(k=>d.paCounts[k]>0).map(k=>(
                              <tr key={k}><td style={{...rowStyle,fontWeight:700,color:'var(--muted)'}}>{k}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{d.paCounts[k]}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(PA_RATES[k])}</td><td style={{...rowStyle,textAlign:'right',fontFamily:MONO}}>{fmtGBP(PA_RATES[k]*d.paCounts[k])}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {d.toilBanked>0&&(
                      <>
                        <div style={sectionTitle}>TOIL Banked This Period</div>
                        <div style={{background:'var(--tint-purple)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'11.5px',color:'#6d28d9'}}>
                          <span>Not included in the totals below</span>
                          <strong style={{fontFamily:MONO,fontWeight:600}}>+{fmtHM(d.toilBanked)}h</strong>
                        </div>
                      </>
                    )}

                    {d.pensionForRange>0&&(
                      <>
                        <div style={sectionTitle}>Pension Contribution (this period)</div>
                        <div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 14px',marginBottom:'8px'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'11.5px',color:'var(--text-blue-deep)'}}>
                            <span>{(d.pensionRate*100).toFixed(2)}% of {fmtGBP(d.pensionablePayForRange)} pensionable pay</span>
                            <strong style={{fontFamily:MONO,fontWeight:600}}>−{fmtGBP(d.pensionForRange)}</strong>
                          </div>
                          <div style={{fontSize:'9.5px',color:'#3b82f6',marginTop:'4px',lineHeight:1.5}}>Deducted from salary before tax — already reflected in the rate below. Not shown in the overtime total, since pension is never taken from overtime pay itself.</div>
                        </div>
                      </>
                    )}

                    <div style={{background:'var(--surface-2)',borderRadius:'12px',padding:'16px 18px',margin:'22px 0'}}>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'12.5px',fontWeight:800,color:'var(--ink)'}}><span>Gross Overtime &amp; PA</span><span style={{fontFamily:MONO,fontWeight:600}}>{fmtGBP(d.gross)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'12.5px',color:'#dc2626'}}><span>Est. Income Tax{d.bandName?` (${d.bandName})`:''}</span><span style={{fontFamily:MONO}}>−{fmtGBP(d.tax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:'12.5px',color:'#dc2626'}}><span>Est. National Insurance</span><span style={{fontFamily:MONO}}>−{fmtGBP(d.ni)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 0',marginTop:'6px',borderTop:'1px solid var(--border-2)',fontSize:'16px',fontWeight:600,color:'#059669'}}><span>Estimated Net</span><span style={{fontFamily:MONO}}>{fmtGBP(d.net)}</span></div>
                    </div>
                  </>
                )}
              </div>

              <div style={{fontSize:'9.5px',color:'var(--quiet)',lineHeight:1.6,padding:'16px 26px 26px',borderTop:'1px solid var(--border-2)',marginTop:'6px'}}>
                <strong style={{color:'var(--muted)'}}>A note on these figures.</strong> This summary is generated from what you've logged in the app, for your own reference — it isn't an official payslip. Tax and National Insurance are estimated using cumulative marginal rates for the tax year, so they can differ slightly from your actual payslip, especially across date ranges spanning more than one pay period. Worth cross-checking against your payslip if the figures matter to you.
              </div>
            </div>
          </div>
        );
      })()}

      {/* Financial Years — full-screen archived-year detail, entries grouped by pay period */}
      {fySummaryYear!=null&&(()=>{
        const y = computeArchivedYear(fySummaryYear);
        const label = `${fySummaryYear} / ${(fySummaryYear+1).toString().slice(-2)}`;
        return (
          <div className={fySummaryPrintMode?'payslip-print-area':''} style={{position:'absolute',inset:0,background:'var(--surface-2)',zIndex:65,overflowY:'auto',overscrollBehavior:'contain'}}>
            <div className="no-print" style={{background:'var(--tint-amber-2)',padding:'8px',fontSize:'10px',fontWeight:800,color:'var(--text-amber-deep)',textAlign:'center'}}>📁 Archived — {label} is read-only</div>
            {!fySummaryPrintMode&&(
              <div className="no-print" style={{display:'flex',gap:'8px',padding:'12px 12px 0'}}>
                <button onClick={()=>setFySummaryPrintMode(true)} style={{flex:1,background:'#2563eb',color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="doc" s={13} c="#fff"/> PDF</button>
                <button onClick={()=>handleExportSpreadsheet(y.start, y.end, sanitiseNotes)} style={{flex:1,background:'var(--tint-green)',color:'#059669',border:'1.5px solid var(--border-2)',borderRadius:'13px',padding:'12px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="table" s={13} c="#059669"/> Spreadsheet</button>
              </div>
            )}
            {fySummaryPrintMode&&(
              <div className="no-print" style={{padding:'12px 12px 0'}}>
                <button onClick={()=>window.print()} style={{width:'100%',background:'#2563eb',color:'#fff',border:'none',borderRadius:'11px',padding:'12px',fontWeight:900,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}><Ico n="dl" s={13} c="#fff"/> Print / Save as PDF</button>
              </div>
            )}
            <div className={fySummaryPrintMode?'payslip-print-doc':''} style={{background:'var(--navy)',color:'#fff',padding:'16px',margin:fySummaryPrintMode?'12px':0,borderRadius:fySummaryPrintMode?'12px':0}}>
              <button className="no-print" onClick={()=>{ if(fySummaryPrintMode){ setFySummaryPrintMode(false); } else { setFySummaryYear(null); } }} style={{background:'rgba(255,255,255,0.12)',border:'none',borderRadius:'9px',width:'32px',height:'32px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',cursor:'pointer',marginBottom:'12px'}}><Ico n="back" s={16} c="#fff"/></button>
              <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em'}}>Financial Year</div>
              <div style={{fontSize:'19px',fontWeight:900}}>{label}</div>
              <div style={{fontFamily:MONO,fontSize:'9.5px',color:'#93c5fd',marginTop:'2px'}}>{fmtD(y.start)} – {fmtD(y.end)}</div>
              <div style={{background:'var(--text-navy)',borderRadius:'14px',padding:'14px',display:'flex',marginTop:'12px'}}>
                <div style={{flex:1,textAlign:'center'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em'}}>Shifts Logged</div>
                  <div style={{fontSize:'20px',fontWeight:900}}>{y.totalShifts}</div>
                </div>
                <div style={{width:'1px',background:'rgba(255,255,255,0.15)'}}/>
                <div style={{flex:1,textAlign:'center'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross</div>
                  <div style={{fontFamily:MONO,fontSize:'18px',fontWeight:600}}>{fmtGBP(y.totalGross)}</div>
                </div>
              </div>
            </div>

            <div style={{padding:'14px',paddingBottom:'40px'}}>
              <div style={{background:'var(--tint-blue)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'10px 12px',marginBottom:'12px',fontSize:'10.5px',color:'var(--text-blue-deep)',lineHeight:1.5}}>{fySummaryPrintMode ? 'Grouped by pay period. Gross figures only — no tax or NI estimate, since that math needs the current year\'s context to be accurate.' : 'Tap a period to see individual shifts, this is a record not a working copy. Gross figures only'}</div>

              {y.periods.length===0 ? (
                <div style={{textAlign:'center',padding:'30px 10px',color:'var(--quiet)',fontSize:'13px',fontWeight:600}}>No entries recorded in this year.</div>
              ) : y.periods.map(p=>{
                const expanded = fySummaryPrintMode || archiveExpandedPeriod===p.short+fySummaryYear;
                return (
                  <div key={p.short} style={{background:'var(--surface)',borderRadius:'14px',padding:'13px',border:'1px solid var(--border-2)',marginBottom:'9px'}}>
                    <div onClick={()=>{ if(!fySummaryPrintMode) setArchiveExpandedPeriod(expanded?null:p.short+fySummaryYear); }} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:fySummaryPrintMode?'default':'pointer'}}>
                      <div>
                        <div style={{fontWeight:900,fontSize:'13px',color:'var(--ink)'}}>{p.month}</div>
                        <div style={{fontFamily:MONO,fontSize:'9.5px',color:'var(--quiet)',marginTop:'1px'}}>{fmtD(p.start)} – {fmtD(p.end)} · {p.entries.length} shift{p.entries.length===1?'':'s'}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                        <div style={{fontFamily:MONO,fontWeight:600,fontSize:'12.5px',color:'var(--text-navy)'}}>{fmtGBP(p.gross)}</div>
                        {!fySummaryPrintMode&&<Ico n={expanded?'cU':'cD'} s={14} c="#94a3b8"/>}
                      </div>
                    </div>
                    {expanded&&(
                      <div>
                        {p.entries.map(e=>(
                          <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderTop:'1px solid var(--border-2)',marginTop:'9px'}}>
                            <div>
                              <div style={{fontWeight:800,fontSize:'11.5px',color:'var(--ink)'}}>{new Date(e.date+'T12:00:00').toLocaleDateString('en-GB')}</div>
                              <div style={{fontSize:'10px',color:'var(--quiet)',marginTop:'1px',textTransform:'uppercase'}}>{e.reason||'—'}</div>
                            </div>
                            <div style={{fontFamily:MONO,fontWeight:600,fontSize:'11px',color:'var(--text-navy)'}}>{fmtGBP(e.gross)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Trends — chart enlarge modal, shares render functions with the inline charts */}
      {chartModalMounted&&(
        <div onClick={()=>{setChartModal(null);setChartTap(null);}} className={chartModal?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px'}}>
          <div onClick={e=>e.stopPropagation()} className={'alert-pop'+(chartModal?'':' pop-out')} style={{background:'var(--surface)',borderRadius:'20px',padding:'20px 16px',width:'100%',maxWidth:'480px',maxHeight:'85vh',overflow:'auto',position:'relative'}}>
            <button onClick={()=>{setChartModal(null);setChartTap(null);}} style={{position:'absolute',top:'14px',right:'14px',background:'var(--chip-bg)',border:'none',borderRadius:'50%',width:'30px',height:'30px',fontSize:'15px',fontWeight:900,color:'var(--muted)',cursor:'pointer'}}>✕</button>
            <div style={{fontSize:'13px',fontWeight:900,color:'var(--ink)',marginBottom:'16px',paddingRight:'36px'}}>{chartModalV==='cum'?'Cumulative Gross Earnings':'Monthly OT Gross/Net'}</div>
            {chartModalV==='cum' ? renderCumulativeChart(true) : renderMonthlyChart(true)}
            {chartModalV==='cum' && (
              <div style={{textAlign:'center',marginTop:'10px',fontSize:'12px',fontWeight:700,color:'var(--muted)'}}>Running total: <strong style={{color:'var(--text-navy)'}}>£{totals.totalGross.toFixed(2)}</strong></div>
            )}
            {chartModalV==='mon' && (
              <div style={{display:'flex',justifyContent:'center',gap:'20px',marginTop:'14px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'15px',height:'3px',background:'#34d399',borderRadius:'2px'}}/><span style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Gross</span></div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'15px',height:'3px',background:'#f87171',borderRadius:'2px'}}/><span style={{fontSize:'10px',fontWeight:900,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Net</span></div>
              </div>
            )}
            <div style={{textAlign:'center',marginTop:'10px',fontSize:'10px',color:'var(--quiet)'}}>Tap any point for that period's figure</div>
          </div>
        </div>
      )}

      {/* Calendar View — empty-day tap confirmation, so a stray tap doesn't
          silently drop you into Log Overtime */}
      {confirmCreateDayMounted&&(
        <div onClick={()=>setConfirmCreateDay(null)} className={confirmCreateDay?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:41,padding:'20px'}}>
          <div onClick={e=>e.stopPropagation()} className={'alert-pop'+(confirmCreateDay?'':' pop-out')} style={{background:'var(--surface)',borderRadius:'18px',padding:'22px',width:'100%',maxWidth:'320px',textAlign:'center'}}>
            <div style={{fontWeight:900,fontSize:'15px',color:'var(--ink)',marginBottom:'6px'}}>Create an entry for this day?</div>
            <div style={{fontSize:'12px',fontWeight:600,color:'var(--muted)',marginBottom:'18px'}}>{new Date(confirmCreateDayV+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setConfirmCreateDay(null)} style={{flex:1,padding:'11px',background:'var(--chip-bg)',border:'none',borderRadius:'10px',fontWeight:900,fontSize:'12px',color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>No</button>
              <button onClick={()=>{ setForm({...blankForm,date:confirmCreateDayV}); setEditing(null); setTab('add'); setConfirmCreateDay(null); }} style={{flex:1,padding:'11px',background:'#2563eb',border:'none',borderRadius:'10px',fontWeight:900,fontSize:'12px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar View — day detail popover */}
      {selectedCalDayMounted&&(
        <div onClick={()=>{ setSelectedCalDay(null); setConfirmDel(null); }} className={selectedCalDay?'ov-in':'ov-out'} style={{position:'absolute',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:isWide?'center':'flex-end',justifyContent:'center',zIndex:40}}>
          <div onClick={e=>e.stopPropagation()} className={(isWide?'alert-pop':'sheet-pop')+(selectedCalDay?'':' pop-out')} style={{overscrollBehavior:'contain',background:'var(--surface)',borderRadius:isWide?'20px':'20px 20px 0 0',padding:isWide?'28px':'20px',width:'100%',maxWidth:isWide?'580px':'430px',maxHeight:'76%',overflowY:'auto',boxShadow:isWide?'0 24px 64px rgba(0,0,0,0.28)':'none'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
              <div style={{fontWeight:900,fontSize:isWide?'20px':'16px',color:'var(--ink)'}}>{new Date(selectedCalDayV.ds+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
              <button onClick={()=>{ setSelectedCalDay(null); setConfirmDel(null); }} style={{background:'var(--chip-bg)',border:'none',borderRadius:'8px',padding:'8px',cursor:'pointer'}}><Ico n="x" s={isWide?20:16} c="#64748b"/></button>
            </div>
            {selectedCalDayV.dEntries.map(e=>{
              const c = calcEntry(e);
              const pb = totals.periodBreakdown[selectedCalDayV.periodIdx];
              const eOTNet    = c.h1+c.h2+c.h3>0 ? c.ot*(1-pb.otResult.rate/100)       : 0;
              const ePANet    = c.pa>0           ? c.pa*(1-pb.paResult.rate/100)       : 0;
              const eNet = eOTNet+ePANet;
              return (
                <div key={e.id} style={{background:'var(--surface-2)',borderRadius:'13px',padding:isWide?'17px':'13px',marginBottom:'8px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                    <div style={{flex:1,paddingRight:'8px'}}>
                      <div style={{fontWeight:900,fontSize:isWide?'15px':'12px',color:'#3b82f6',textTransform:'uppercase'}}>Duty / Reason: {e.reason||'Shift'}</div>
                      {e.takeAs==='toil'&&<div style={{display:'inline-block',fontSize:isWide?'10px':'8px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--tint-purple)',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>TOIL</div>}
                      {e.takeAs==='mix'&&<div style={{display:'inline-block',fontSize:isWide?'10px':'8px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--tint-purple)',color:'#6d28d9',textTransform:'uppercase',letterSpacing:'0.5px'}}>Mix — Pay + TOIL</div>}
                      {carmsBadge(e, (isWide?15:12)-1)}
                      {/* Grey record-only pill — shown only here in the calendar
                          day view, not in List View, CARMS/PA, or any export.
                          A shift with no claimable OT hours and no PA has
                          nothing to submit, so it gets a neutral label rather
                          than being folded into the submission-tracking system
                          at all. */}
                      {c.h1+c.h2+c.h3===0 && (!e.paRate || e.paRate==='None') && (
                        <div style={{display:'inline-block',fontSize:isWide?'14px':'11px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--border)',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>ⓘ Shift Record — No OT Claim</div>
                      )}
                      {(()=>{ const xp = crossPeriodInfo(e); return xp && (
                        <div style={{display:'inline-block',fontSize:isWide?'14px':'11px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',marginTop:'5px',background:'var(--tint-indigo)',color:'var(--text-indigo-deep)',textTransform:'uppercase',letterSpacing:'0.5px'}}>↷ {xp.both?'OT & PA':xp.ot?'OT':'PA'} Counted in {xp.label}</div>
                      ); })()}
                    </div>
                    <div style={{display:'flex',gap:'10px',alignItems:'center',flexShrink:0}}>
                      <button onClick={()=>{ setConfirmDel(null); setSelectedCalDay(null); startEdit(e); }} style={{background:'var(--chip-bg)',border:'none',borderRadius:'8px',padding:isWide?'10px':'8px',cursor:'pointer',display:'flex'}}><Ico n="edit" s={isWide?18:14} c="#64748b"/></button>
                      <button onClick={()=>setConfirmDel(confirmDel===e.id?null:e.id)} style={{background:confirmDel===e.id?'var(--tint-red)':'var(--tint-red)',border:confirmDel===e.id?'1.5px solid var(--border-2)':'1.5px solid transparent',borderRadius:'8px',padding:isWide?'10px':'8px',cursor:'pointer',display:'flex',transition:'all 0.15s'}}><Ico n="trash" s={isWide?18:14} c="#ef4444"/></button>
                    </div>
                  </div>

                  {/* delete confirmation */}
                  {confirmDel===e.id&&(
                    <div style={{background:'var(--tint-red)',border:'1px solid var(--border-2)',borderRadius:'13px',padding:'11px 12px',marginBottom:'9px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                      <span style={{fontSize:isWide?'14px':'12px',fontWeight:700,color:'var(--text-red-deep)'}}>Delete this record?</span>
                      <div style={{display:'flex',gap:'7px',flexShrink:0}}>
                        <button onClick={()=>setConfirmDel(null)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:isWide?'7px 15px':'5px 12px',fontSize:isWide?'13px':'11px',fontWeight:900,color:'var(--muted)',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                        <button onClick={()=>{ delEntry(e.id); if(selectedCalDayV.dEntries.length<=1) setSelectedCalDay(null); }} style={{background:'#dc2626',border:'none',borderRadius:'8px',padding:isWide?'7px 15px':'5px 12px',fontSize:isWide?'13px':'11px',fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Delete</button>
                      </div>
                    </div>
                  )}

                  {/* notes — sits directly under Duty/Reason, separated from the pay breakdown below.
                      Skipped entirely when there are no notes, so no empty labelled block appears. */}
                  {e.comments&&(
                    <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'10px',marginBottom:'10px'}}>
                      <div style={{fontSize:isWide?'11px':'9px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>Notes</div>
                      <div style={{fontSize:isWide?'13px':'11px',fontStyle:'italic',color:'var(--ink)',borderLeft:'2px solid var(--border-2)',paddingLeft:'8px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',lineHeight:1.5}}>{e.comments}</div>
                    </div>
                  )}

                  {/* pay breakdown — each line shows its own value, matching List View */}
                  <div style={{borderTop:'1px solid var(--border-2)',paddingTop:'10px'}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                      {c.payH1>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'var(--muted)'}}>{c.payH1}h @ 1.33x {c.toilH>0&&c.otRateTier==='hours133'?'(Pay)':''} <span style={{color:'var(--quiet)'}}>(£{c.r.r133.toFixed(2)}/hr)</span></span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'var(--text-navy)'}}>£{c.ot1.toFixed(2)}</span>
                        </div>
                      )}
                      {c.payH2>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'var(--muted)'}}>{c.payH2}h @ 1.5x {c.toilH>0&&c.otRateTier==='hours150'?'(Pay)':''} <span style={{color:'var(--quiet)'}}>(£{c.r.r150.toFixed(2)}/hr)</span></span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'var(--text-navy)'}}>£{c.ot2.toFixed(2)}</span>
                        </div>
                      )}
                      {c.payH3>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'var(--muted)'}}>{c.payH3}h @ 2.0x {c.toilH>0&&c.otRateTier==='hours200'?'(Pay)':''} <span style={{color:'var(--quiet)'}}>(£{c.r.r200.toFixed(2)}/hr)</span></span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'var(--text-navy)'}}>£{c.ot3.toFixed(2)}</span>
                        </div>
                      )}
                      {c.toilH>0&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontFamily:MONO,fontSize:isWide?'12px':'10.5px',fontWeight:600,color:'#6d28d9'}}>{fmtHM(c.toilH)}h @ {RATE_TIER_MULT[c.otRateTier]}x <span style={{color:'#a78bfa'}}>(TOIL{c.takeAs==='mix'?' — part of shift':''})</span></span>
                          <span style={{fontFamily:MONO,fontSize:isWide?'13px':'11px',fontWeight:600,color:'var(--text-purple-deep)'}}>{fmtHM(c.toilBanked)}h banked</span>
                        </div>
                      )}
                      {e.paRate!=='None'&&(
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontSize:isWide?'13px':'11px',fontWeight:700,color:'#b45309'}}>{e.paRate} allowance</span>
                          <span style={{fontSize:isWide?'14px':'12px',fontWeight:900,color:'var(--text-amber-deep)'}}>£{c.pa.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',borderTop:'1px solid var(--border-2)',paddingTop:'8px',marginTop:'8px'}}>
                      <div><div style={{fontSize:isWide?'11px':'9px',fontWeight:900,color:'var(--quiet)',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</div><div style={{fontWeight:900,fontSize:isWide?'16px':'13px',color:'var(--text-navy)'}}>{fmt(c.gross)}</div></div>
                      <div style={{textAlign:'right'}}><div style={{fontSize:isWide?'11px':'9px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px'}}>Net</div><div style={{fontWeight:900,fontSize:isWide?'16px':'13px',color:'#059669'}}>{fmt(eNet)}</div></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CARMS submission-date picker overlay. Also reachable via the
           toggles now, not just the desktop edit-date button — turning a
           toggle on opens this without pre-selecting anything, and the
           toggle itself only actually flips once a day is genuinely
           picked; dismissing without picking leaves both the toggle and
           the date untouched. */}
      {datePickerMounted&&(
        <div onClick={()=>setDatePickerFor(null)} className={datePickerFor?'ov-in':'ov-out'} style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.4)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
          {datePickerForV==='ot'
            ? renderDatePickerGrid(form.otSubmittedDate||'', v=>setForm(f=>({...f,otSubmittedDate:v,otSubmitted:true})), !datePickerFor)
            : datePickerForV==='pa'
            ? renderDatePickerGrid(form.paSubmittedDate||'', v=>setForm(f=>({...f,paSubmittedDate:v,paSubmitted:true})), !datePickerFor)
            : datePickerForV==='carmsBulk'
            ? renderDatePickerGrid(todayStr, v=>bulkMarkCarmsSubmitted(v), !datePickerFor)
            : renderDatePickerGrid(form.date||todayStr, v=>setForm(f=>({...f,date:v})), !datePickerFor)}
        </div>
      )}

      {/* floating save button — mobile only (Log Shift, once rank/pay point
           are set). Desktop uses the in-flow button at the end of the form
           instead. */}
      {tab==='add'&&!isWide&&settings.rank&&settings.service&&(
        <div style={{position:'absolute',bottom:'72px',left:'14px',right:'14px',zIndex:25}}>
          <button onClick={handleSave} disabled={justSaved} className={justSaved?'save-pulse':''} style={{width:'100%',background:justSaved?'#059669':'#dc2626',color:'#fff',boxShadow:justSaved?'0 4px 20px rgba(5,150,105,0.5)':'0 4px 20px rgba(220,38,38,0.5)',padding:'17px',borderRadius:'16px',border:'none',fontWeight:900,fontSize:'15px',fontFamily:'inherit',cursor:justSaved?'default':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'9px',letterSpacing:'-0.2px',transition:'background 0.3s'}}>
            <Ico n={justSaved?'check':'save'} s={18} c="#fff"/>
            {justSaved?'Saved':(editing?'Update Record':'Save Record')}
          </button>
        </div>
      )}

      <nav ref={setNavEl} className="no-print" style={{...S.nav, display:isWide?'none':'flex'}}>
        <div className="nav-pill" style={{left:navPillRect.left+'px', width:navPillRect.width+'px'}}/>
        {NAV_TABS.map(t=>(
          <button key={t.id} ref={el=>navBtnRefs.current[t.id]=el} onClick={()=>{ setEditing(null); setPayslipPreview(null); setFySummaryYear(null); setFySummaryPrintMode(false); if(t.id==='add') { setForm({...blankForm,date:todayStr}); } if(t.id==='months'&&defaultBreakdownView==='list') snapToActiveMonth(false,140); setTab(t.id); }} style={{...S.nBtn(tab===t.id,t.id==='add'),position:'relative'}}>
            {t.id==='carms'&&carmsOutstanding.totalClaims>0&&(
              <div className="badge-pop" style={{position:'absolute',top:'2px',right:'calc(50% - 16px)',background:'#d97706',color:'#fff',fontSize:'8px',fontWeight:900,width:'14px',height:'14px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>{carmsOutstanding.totalClaims>9?'9+':carmsOutstanding.totalClaims}</div>
            )}
            {t.id==='add' ? (
              <span className={`nav-ico-add${tab!==t.id?' nav-add-pulse':''}`} style={{display:'flex'}}><Ico n={t.n} s={21} c="#10b981" w={2.5}/></span>
            ) : (
              <span className={`nav-ico${tab===t.id?' active':''}`} style={{display:'flex'}}><Ico n={t.n} s={18} c={tab===t.id?BRASS:'var(--quiet)'} w={tab===t.id?2.5:2}/></span>
            )}
            {/* the pulse is a "come tap this" nudge — it stops once you're
                actually on the tab it's pointing at, rather than nagging
                the whole time you're using it */}
            <span style={S.nLbl} className={`nav-lbl${t.id==='add'&&tab!==t.id?' nav-add-pulse':''}`}>{t.lbl}</span>
          </button>
        ))}
      </nav>

      {/* ── wide-screen sidebar — replaces the bottom nav entirely above the
           960px breakpoint; reuses the exact same NAV_TABS array and the
           same tab-switching logic as the bottom nav, just presented as a
           persistent left column instead of a row of buttons. Fixed
           position, since S.wrap keeps its own scroll/height behavior
           unchanged rather than being restructured into a row layout. ── */}
      {isWide&&(
        <div className="no-print" style={{position:'fixed',top:0,left:0,bottom:0,width:'230px',background:'var(--navy)',padding:'22px 16px',display:'flex',flexDirection:'column',zIndex:30,boxSizing:'border-box'}}>
          {/* Today's date, in place of the logo — two compact lines so the
              header stays the same height as the icon it replaced and fits
              the fixed 230px column without wrapping awkwardly. */}
          {(()=>{
            const now = new Date();
            const dayName = now.toLocaleDateString('en-GB',{weekday:'long'});
            const dd = now.getDate();
            const suffix = (dd%10===1&&dd!==11)?'st':(dd%10===2&&dd!==12)?'nd':(dd%10===3&&dd!==13)?'rd':'th';
            const monthName = now.toLocaleDateString('en-GB',{month:'long'});
            return (
              <div style={{textAlign:'center',padding:'0 8px 16px',borderBottom:'1px solid rgba(255,255,255,0.1)',marginBottom:'16px'}}>
                <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.06em'}}>{dayName}</div>
                <div style={{fontSize:'15px',fontWeight:900,color:'#fff',marginTop:'2px',whiteSpace:'nowrap'}}>{dd}{suffix} {monthName}</div>
              </div>
            );
          })()}
          <SegSlider activeKey={tab} orientation="vertical" trackStyle={{display:'flex',flexDirection:'column'}} indicatorStyle={{background:'rgba(184,130,63,0.18)',borderRadius:'11px',opacity:tab==='add'?0:1}}>
          {NAV_TABS.map(t=>{
            const isAdd = t.id==='add';
            const isActive = tab===t.id;
            return (
              <button key={t.id} data-seg-key={t.id} onClick={()=>{ setEditing(null); setPayslipPreview(null); setFySummaryYear(null); setFySummaryPrintMode(false); if(t.id==='add') { setForm({...blankForm,date:todayStr}); } if(t.id==='months'&&defaultBreakdownView==='list') snapToActiveMonth(false,140); setTab(t.id); }} style={{position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:'12px',padding:'12px 12px',borderRadius:'11px',background:'transparent',color:isAdd?'#10b981':(isActive?'#fff':'#93c5fd'),fontWeight:700,fontSize:'14.5px',fontFamily:'inherit',border:'none',cursor:'pointer',marginBottom:'3px',textAlign:'left'}}>
                {isAdd ? (
                  <span className={isActive?'':'nav-add-pulse'} style={{display:'flex'}}><Ico n={t.n} s={20} c="#10b981" w={2.5}/></span>
                ) : (
                  <Ico n={t.n} s={20} c={isActive?'#e3bd85':'#93c5fd'} w={isActive?2.5:2}/>
                )}
                {/* stops nudging once you're actually on this tab — see the
                    matching comment on the mobile bottom nav below */}
                <span className={(isAdd&&!isActive)?'nav-add-pulse':''}>{t.lbl}</span>
                {t.id==='carms'&&carmsOutstanding.totalClaims>0&&(
                  <span className="badge-pop" style={{marginLeft:'auto',background:'#d97706',color:'#fff',fontSize:'10px',fontWeight:900,padding:'1px 7px',borderRadius:'10px',display:'inline-block'}}>{carmsOutstanding.totalClaims>99?'99+':carmsOutstanding.totalClaims}</span>
                )}
              </button>
            );
          })}
          </SegSlider>
          {session&&(
            <button onClick={handleManualSync} disabled={manualSyncing} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'7px',background:syncJustSucceeded?'rgba(5,150,105,0.35)':'rgba(255,255,255,0.1)',border:'none',borderRadius:'10px',padding:'11px',fontSize:'12.5px',fontWeight:800,color:'#fff',cursor:manualSyncing?'default':'pointer',fontFamily:'inherit',marginTop:'auto',transition:'background 0.3s'}}>
              <span style={{display:'flex',animation:manualSyncing?'spin 0.8s linear infinite':'none'}}><Ico n={syncJustSucceeded?'check':'refresh'} s={14} c="#fff"/></span> {syncJustSucceeded?'Synced':'Sync'}
            </button>
          )}
          {session&&(
            <button onClick={()=>setSignOutConfirmOpen(true)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'7px',background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'10px',padding:'11px',fontSize:'12.5px',fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:'inherit',marginTop:'10px'}}>
              <FireExitIcon size={14}/> Sign Out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
