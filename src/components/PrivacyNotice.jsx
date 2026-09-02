import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Ico } from './Icons.jsx';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { useEscapeToClose } from '../lib/useEscapeToClose.js';
import { PRIVACY_VERSION } from '../lib/legal.js';

// ─── Privacy notice ──────────────────────────────────────────────────────────
// The one piece of UK GDPR Article 13 disclosure this app didn't have before
// a second officer's data could be in play: who's processing it, why, on
// what legal basis, who else touches it, how long it's kept, and how to
// exercise the rights that follow from that. Rendered two ways by two
// callers — AuthScreens shows it (with the sign-up consent checkbox that
// actually gates on it) before an account exists at all, and TabSettings
// shows it read-only afterward from Account & Data Management — so it's a
// self-contained overlay with its own portal target, not something threaded
// through either screen's existing modal plumbing.
//
// PRIVACY_VERSION (src/lib/legal.js) is what actually gets recorded against
// an account at sign-up. If you edit the substance of any section below,
// bump that constant too — otherwise existing sign-ups' recorded version
// silently stops matching what this component now shows.
export function PrivacyNotice({ onClose }) {
  const boxRef = useRef(null);
  useFocusTrap(true, boxRef);
  useEscapeToClose(true, onClose);

  const sec = { marginBottom: '20px' };
  const h3 = { fontSize: '13px', fontWeight: 900, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' };
  const p = { fontSize: '13.5px', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 8px' };
  const li = { fontSize: '13.5px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '5px' };
  const strong = { color: 'var(--ink)', fontWeight: 700 };

  const body = (
    <div onClick={e => e.stopPropagation()} ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Privacy Notice"
      style={{ background: 'var(--surface)', borderRadius: '18px', width: '100%', maxWidth: '560px', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--border-2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Ico n="shield" s={18} c="#2563eb" />
          <span style={{ fontSize: '15.5px', fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.2px' }}>Privacy Notice</span>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'var(--surface-2)', border: 'none', borderRadius: '10px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Ico n="x" s={14} c="var(--muted)" />
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '18px 20px 4px' }}>
        <p style={{ ...p, fontSize: '12px', color: 'var(--quiet)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Version {PRIVACY_VERSION}</p>

        <div style={sec}>
          <h3 style={h3}>Who's responsible for your data</h3>
          <p style={p}>Overtime &amp; Shift Tracker is built and run by <span style={strong}>Adam Stephens</span>, who's the data controller for everything this notice covers — the person who decides what's collected and why, and who you can contact about it. Reach the controller at <a href="mailto:ajstephe@me.com" style={{ color: '#2563eb', fontWeight: 700 }}>ajstephe@me.com</a>.</p>
        </div>

        <div style={sec}>
          <h3 style={h3}>What's collected</h3>
          <ul style={{ margin: '0 0 8px', paddingLeft: '18px' }}>
            <li style={li}>Your account email address</li>
            <li style={li}>The shifts, overtime, and TOIL you log — dates, times, duty type, and rate tier</li>
            <li style={li}>Your rank, pay point, and force/unit settings, used to calculate pay</li>
            <li style={li}>CARMS and PA claim submission status and dates</li>
          </ul>
          <p style={p}>Nothing beyond this is collected — no location tracking, no device fingerprinting, no analytics or advertising identifiers, and nothing that UK GDPR treats as special category data (health, biometric, etc.).</p>
        </div>

        <div style={sec}>
          <h3 style={h3}>Why, and on what basis</h3>
          <p style={p}>Solely to give you overtime, TOIL, and pay tracking against the pay calendar you've asked to use. The legal basis is your <span style={strong}>consent</span>, given when you tick the box at sign-up — you can withdraw it at any time by deleting your account in Settings, which removes your cloud data immediately.</p>
        </div>

        <div style={sec}>
          <h3 style={h3}>Who else can see it</h3>
          <p style={p}><span style={strong}>Supabase</span> stores your account and data, hosted in the EU (Stockholm) — but every shift, TOIL record, and settings entry is encrypted on your device before it's ever sent, so Supabase only ever holds ciphertext it cannot read. <span style={strong}>Vercel</span> serves the app itself. Neither is paid to do anything with your data beyond that, and neither is a separate controller — both act only on instructions given through this app.</p>
        </div>

        <div style={sec}>
          <h3 style={h3}>How long it's kept</h3>
          <ul style={{ margin: '0 0 8px', paddingLeft: '18px' }}>
            <li style={li}>Cloud copy: entries from the last three complete financial years. Older entries stay on your own device but aren't kept in the cloud.</li>
            <li style={li}>Account data: kept until you delete your account, at which point it's removed within a few minutes, not just marked hidden.</li>
            <li style={li}>Local device copy: stays on your device until you clear it yourself, independent of what's in the cloud.</li>
          </ul>
        </div>

        <div style={sec}>
          <h3 style={h3}>How it's protected</h3>
          <p style={p}>Every entry, TOIL record, and settings object is encrypted on your device (AES-256-GCM) before it's uploaded, using a key derived from your password. This means a breach of the underlying database alone would not expose readable shift data — only your password or recovery word can unlock it, and neither is ever sent anywhere in the clear.</p>
        </div>

        <div style={sec}>
          <h3 style={h3}>Your rights</h3>
          <p style={p}>Most of these are already built into the app, not something you need to email anyone for:</p>
          <ul style={{ margin: '0 0 8px', paddingLeft: '18px' }}>
            <li style={li}><span style={strong}>Access &amp; portability</span> — Settings → Account &amp; Data Management → Backup gives you a full, structured copy of everything held on you.</li>
            <li style={li}><span style={strong}>Rectification</span> — edit any entry or TOIL record directly.</li>
            <li style={li}><span style={strong}>Erasure</span> — Settings → Delete Account removes your account and cloud data permanently.</li>
            <li style={li}><span style={strong}>Object, or raise a concern</span> — email the controller above.</li>
            <li style={li}><span style={strong}>Complain to the regulator</span> — you can also contact the Information Commissioner's Office at <a href="https://ico.org.uk" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700 }}>ico.org.uk</a> or 0303 123 1113, at any time.</li>
          </ul>
        </div>

        <div style={sec}>
          <h3 style={h3}>Changes to this notice</h3>
          <p style={{ ...p, marginBottom: 0 }}>If what's collected, why, or who sees it ever changes materially, this notice is updated and re-versioned above — it isn't quietly rewritten under an unchanged date.</p>
        </div>
      </div>

      <div style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--border-2)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: '100%', padding: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--ink)', fontWeight: 900, fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Close</button>
      </div>
    </div>
  );

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 200, boxSizing: 'border-box' }}>
      {body}
    </div>,
    document.body
  );
}
