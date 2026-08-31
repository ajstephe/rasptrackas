import { Component } from 'react';

// Top-level safety net. Without this, any render-time exception anywhere in
// the app unmounts the whole tree and leaves a blank white screen — a bad
// failure mode for something people check on payday. This catches it and
// shows a plain, actionable message instead. It deliberately does NOT try to
// recover in place (React error boundaries can't reliably re-render past a
// thrown error) — "reload" is the one thing guaranteed to work, and local
// data survives a reload since it lives in localStorage, not component state.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Logged for anyone looking at the browser console after the fact —
    // there's no remote error reporting wired up, so this is the only trace.
    console.error('Unhandled error in app:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    // Deliberately reads the theme directly (data-theme attribute, falling
    // back to prefers-color-scheme when it's unset for "system") rather
    // than through the app's own CSS custom properties — this fallback
    // screen stays self-contained on purpose, in case whatever crashed the
    // app somehow implicated its normal styling. Same three-state logic
    // used everywhere else in the app (explicit light/dark beats system),
    // just read straight from the platform instead of via a var().
    const themeAttr = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = themeAttr === 'dark' || (themeAttr !== 'light' && prefersDark);
    const c = dark
      ? { page:'#0b1220', card:'#14171f', iconBg:'#2c1613', icon:'#f3a9a9', heading:'#eef2f7', body:'#93a4bb', button:'#3b9cff', buttonText:'#0b1220', footer:'#64789a' }
      : { page:'#eceef1', card:'#ffffff', iconBg:'#fef2f2', icon:'#dc2626', heading:'#0f172a', body:'#64748b', button:'#2563eb', buttonText:'#ffffff', footer:'#cbd5e1' };

    return (
      <div style={{
        minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
        background:c.page, fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        padding:'24px',
      }}>
        <div style={{
          maxWidth:'420px', width:'100%', background:c.card, borderRadius:'20px',
          padding:'32px 28px', boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(15,23,42,0.08)', textAlign:'center',
        }}>
          <div style={{
            width:'52px', height:'52px', borderRadius:'16px', background:c.iconBg,
            display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div style={{fontSize:'18px', fontWeight:900, color:c.heading, marginBottom:'8px'}}>
            Something went wrong
          </div>
          <div style={{fontSize:'13.5px', fontWeight:600, color:c.body, lineHeight:1.5, marginBottom:'22px'}}>
            The app hit an unexpected error and couldn't continue. Your saved
            overtime, PA, and TOIL records are untouched — they're stored on
            this device, not in the part of the app that crashed.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              width:'100%', background:c.button, color:c.buttonText, border:'none',
              borderRadius:'12px', padding:'13px', fontSize:'14.5px', fontWeight:800,
              fontFamily:'inherit', cursor:'pointer',
            }}
          >
            Reload the app
          </button>
          <div style={{fontSize:'11px', fontWeight:600, color:c.footer, marginTop:'16px'}}>
            If this keeps happening, check the browser console for the error, or let Adam know what you were doing when it happened.
          </div>
        </div>
      </div>
    );
  }
}
