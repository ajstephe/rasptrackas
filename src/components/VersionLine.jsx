import { useEffect, useState } from 'react';
import { layoutFor, screenSize } from '../lib/layout.js';

/* global __BUILD_TIME__ */
// When this copy of the app was built, so you can tell whether a device has
// picked up the latest update. Tap it for a live readout of the screen sizes
// the device reports, which shows why it picked the phone or desktop layout.
const built = typeof __BUILD_TIME__ !== 'undefined' ? new Date(__BUILD_TIME__) : null;
const label = built ? built.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'development';

function read() {
  const d = document.documentElement;
  const used = screenSize();
  const l = layoutFor(used.w, used.h);
  return {
    'Layout': l.isWide ? 'Desktop' : l.tabletP ? 'Phone (wide)' : 'Phone',
    'Used': `${used.w} × ${used.h}`,
    'Page': `${d.clientWidth} × ${d.clientHeight}`,
    'Window': `${window.innerWidth} × ${window.innerHeight}`,
    'Screen': `${window.screen?.width} × ${window.screen?.height}`,
    'Orientation': window.screen?.orientation?.type || (window.matchMedia?.('(orientation: landscape)').matches ? 'landscape (media)' : 'portrait (media)'),
    'Viewport': window.visualViewport ? `${Math.round(window.visualViewport.width)} × ${Math.round(window.visualViewport.height)}` : 'n/a',
  };
}

export function VersionLine() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!open) return;
    const tick = () => setInfo(read());
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [open]);
  return (
    <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', padding: '6px 10px', fontFamily: 'inherit', fontSize: '11px', fontWeight: 700, color: 'var(--quiet)', cursor: 'pointer' }}>
        Version {label}
      </button>
      {open && info && (
        <div style={{ margin: '4px auto 0', maxWidth: '320px', background: 'var(--surface-2)', borderRadius: '11px', padding: '8px 12px', textAlign: 'left' }}>
          {Object.entries(info).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11.5px', padding: '2px 0', color: 'var(--ink)' }}>
              <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{k}</span>
              <span style={{ fontFamily: 'var(--num-font)', fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
