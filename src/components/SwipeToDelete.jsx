import { useEffect, useRef, useState } from 'react';
import { Ico } from './Icons.jsx';

// ─── Swipe-to-delete row wrapper ─────────────────────────────────────────────
// Wraps a list row so a leftward swipe reveals a red Delete action behind
// it, iOS Mail/Reminders-style — a faster alternative to tapping a trash
// icon then confirming, for rows where that path already exists (both
// still work side by side; this is additive, not a replacement). Callers
// pass `disabled` for desktop (isWide) — there's no touch gesture there,
// and the always-visible edit/delete buttons already cover it, so this
// just renders `children` unwrapped in that case.
//
// onDelete fires the instant the revealed action is tapped — no separate
// "are you sure" here, matching real iOS swipe-delete conventions; callers
// are expected to offer their own Undo toast afterwards instead (every
// delete handler in this app already does), so the safety net is "undo
// what just happened" rather than "confirm before it happens."
//
// Same axis-lock + real non-passive touchmove technique as TabSummary's
// calendar-view swipe (see its own comment for why a JSX onTouchMove prop
// can't call preventDefault effectively) — a couple of pixels of "is this
// even a drag yet" dead zone before commiting to horizontal vs. vertical,
// so a normal vertical scroll starting on a row never gets hijacked.
const REVEAL = 76; // px — width of the revealed Delete action
const OPEN_THRESHOLD = REVEAL * 0.4; // drag past this far to snap open on release
// Same check the calendar-view swipe (TabSummary.jsx) already makes before
// its own snap-back transition — missed here originally. The live drag
// itself tracks the finger 1:1 regardless (that's direct manipulation, not
// a decorative animation), but the settle afterwards should jump straight
// to its resting position rather than spring there.
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SwipeToDelete({ id, onDelete, deleteLabel='Delete', disabled=false, style, children }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const elRef = useRef(null);
  // Mutated directly during the gesture (read every frame, so state-lag
  // doesn't matter) — only the settled result at touchend goes through
  // setDragX/setDragging to actually trigger a re-render.
  const gestureRef = useRef({ x: 0, y: 0, openAt: 0, axis: null, live: 0 });

  useEffect(() => {
    const el = elRef.current;
    if (!el || disabled) return;
    const onStart = (ev) => {
      const t = ev.touches[0];
      gestureRef.current = { x: t.clientX, y: t.clientY, openAt: gestureRef.current.live, axis: null, live: gestureRef.current.live };
    };
    const onMove = (ev) => {
      const t = ev.touches[0];
      const dx = t.clientX - gestureRef.current.x;
      const dy = t.clientY - gestureRef.current.y;
      if (gestureRef.current.axis === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        gestureRef.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (gestureRef.current.axis === 'x') setDragging(true);
      }
      if (gestureRef.current.axis !== 'x') return;
      ev.preventDefault();
      // small rubber band (14px) past fully open; never past fully closed
      const next = Math.max(-REVEAL - 14, Math.min(0, gestureRef.current.openAt + dx));
      gestureRef.current.live = next;
      setDragX(next);
    };
    const onEnd = () => {
      setDragging(false);
      if (gestureRef.current.axis === 'x') {
        const settled = gestureRef.current.live <= -OPEN_THRESHOLD ? -REVEAL : 0;
        gestureRef.current.live = settled;
        setDragX(settled);
      }
      gestureRef.current.axis = null;
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled]);

  if (disabled) return children;

  // No overflow:hidden here on purpose — the revealed button is already
  // fully contained within this box at rest (inset:0, painted underneath
  // the sliding content per normal DOM order), and clipping the sliding
  // content's own leftward overshoot while dragging is left to the shared
  // <main> scroll container, which already sets overflowX:'hidden' for
  // every tab (S.main in App.jsx). Clipping it again here would also cut
  // off anything a row draws outside its own box on purpose — e.g.
  // Summary's "Planned" ribbon, which pokes a few px above the row.
  return (
    <div style={{ position: 'relative', ...style }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { gestureRef.current.live = 0; setDragX(0); onDelete(id); }}
          aria-label={deleteLabel}
          style={{ width: REVEAL + 'px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Ico n="trash" s={16} c="#fff"/>
          {deleteLabel}
        </button>
      </div>
      <div ref={elRef} style={{ transform: `translateX(${dragX}px)`, transition: (dragging || prefersReducedMotion()) ? 'none' : 'transform 0.22s cubic-bezier(.32,.72,0,1)', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}
