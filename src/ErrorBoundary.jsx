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
    return (
      <div style={{
        minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
        background:'#eceef1', fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        padding:'24px',
      }}>
        <div style={{
          maxWidth:'420px', width:'100%', background:'#fff', borderRadius:'20px',
          padding:'32px 28px', boxShadow:'0 4px 24px rgba(15,23,42,0.08)', textAlign:'center',
        }}>
          <div style={{
            width:'52px', height:'52px', borderRadius:'16px', background:'#fef2f2',
            display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div style={{fontSize:'18px', fontWeight:900, color:'#0f172a', marginBottom:'8px'}}>
            Something went wrong
          </div>
          <div style={{fontSize:'13.5px', fontWeight:600, color:'#64748b', lineHeight:1.5, marginBottom:'22px'}}>
            The app hit an unexpected error and couldn't continue. Your saved
            overtime, PA, and TOIL records are untouched — they're stored on
            this device, not in the part of the app that crashed.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              width:'100%', background:'#2563eb', color:'#fff', border:'none',
              borderRadius:'12px', padding:'13px', fontSize:'14.5px', fontWeight:800,
              fontFamily:'inherit', cursor:'pointer',
            }}
          >
            Reload the app
          </button>
          <div style={{fontSize:'11px', fontWeight:600, color:'#cbd5e1', marginTop:'16px'}}>
            If this keeps happening, check the browser console for the error, or let Adam know what you were doing when it happened.
          </div>
        </div>
      </div>
    );
  }
}
