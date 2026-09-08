import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ico } from './Icons.jsx';

// Right-click menu for a CARMS/PA claim row in the desktop "At a Glance"
// aside — a shortcut to actions already reachable elsewhere (edit, mark
// submitted, delete), plus Duplicate, rather than new functionality bolted
// on just for this menu. Pops in with the same spring physics as
// alertPop/modalPop (see App.jsx) — reusing that exact keyframe rather than
// a near-identical duplicate, since a 0.9 vs 0.92 starting scale is
// imperceptible — anchored at the click point instead of centred, so
// transform-origin is set to the corner nearest the cursor rather than the
// dialogs' default center.
export function ContextMenu({ x, y, onClose, items }) {
  const ref = useRef(null);
  // The aside this opens from sits at the far right of the desktop layout,
  // so an unclamped menu would routinely render partway off the window —
  // measured and flipped to the cursor's other side before paint (a
  // useLayoutEffect runs synchronously before the browser paints), so
  // there's no visible jump from an off-screen position to the clamped one.
  const [pos, setPos] = useState({ left: x, top: y, originX: 'left', originY: 'top' });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const margin = 8;
    const overflowsRight = x + w > window.innerWidth - margin;
    const overflowsBottom = y + h > window.innerHeight - margin;
    setPos({
      left: overflowsRight ? Math.max(margin, x - w) : x,
      top: overflowsBottom ? Math.max(margin, y - h) : y,
      originX: overflowsRight ? 'right' : 'left',
      originY: overflowsBottom ? 'bottom' : 'top',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  useEffect(() => {
    const onDocClick = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Deliberately NOT listening for 'contextmenu' here: right-clicking a
    // different claim row while this is open should switch straight to
    // that row's menu (its own onContextMenu handler already replaces
    // claimMenu), and since that native event also bubbles all the way to
    // document, a contextmenu-triggered close here would fire right after
    // and clobber the new state back to closed.
    // Deferred a tick so the contextmenu event that opened this doesn't
    // immediately trigger its own close via the same click.
    const t = setTimeout(() => { document.addEventListener('click', onDocClick); }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const style = {
    position: 'fixed', left: pos.left, top: pos.top, zIndex: 200,
    transformOrigin: `${pos.originY} ${pos.originX}`,
    background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: '12px',
    boxShadow: '0 16px 40px rgba(0,0,0,0.24)', padding: '6px', minWidth: '190px', boxSizing: 'border-box',
  };

  return (
    <div ref={ref} className="alert-pop" style={style} onClick={(e) => e.stopPropagation()}>
      {items.map((it, i) => it.divider ? (
        <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-2)', margin: '5px 2px' }} />
      ) : (
        <button
          key={i}
          className="ctx-menu-item"
          onClick={() => { it.run(); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 10px',
            borderRadius: '8px', border: 'none', background: 'none', fontFamily: 'inherit', fontSize: '12.5px',
            fontWeight: 700, color: it.danger ? '#dc2626' : 'var(--ink)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <Ico n={it.icon} s={14} c={it.danger ? '#dc2626' : 'var(--muted)'} w={2.3} />
          {it.label}
        </button>
      ))}
    </div>
  );
}
