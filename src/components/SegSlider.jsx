import { useLayoutEffect, useRef, useState } from 'react';

// ─── Sliding segmented-control indicator ────────────────────────────────────
// Same mechanism as the bottom nav's sliding pill (App.jsx), generalised: one
// shared indicator measures whichever child carries a matching data-seg-key
// and glides there, instead of every button swapping its own fill the moment
// it's tapped. Wrap an existing row of option buttons/divs with this, give
// each one data-seg-key={itsOwnKey}, and drop their per-option background —
// onClick/behaviour/keys are untouched, this only supplies the moving fill.
//
// orientation="vertical" is the same idea turned 90° — for the desktop
// sidebar's nav list, which stacks its options rather than laying them in a
// row. Tracks offsetTop/offsetHeight instead of offsetLeft/offsetWidth, and
// the indicator spans left:0/right:0 with an animated top/height instead of
// top:0/bottom:0 with an animated left/width.
export function SegSlider({ activeKey, indicatorStyle, trackStyle, className, orientation='horizontal', children }) {
  const [containerEl, setContainerEl] = useState(null);
  const [rect, setRect] = useState({ start: 0, size: 0 });
  const firstRef = useRef(true);
  const vertical = orientation==='vertical';

  useLayoutEffect(() => {
    if (!containerEl) return;
    const place = () => {
      const btn = containerEl.querySelector(`[data-seg-key="${CSS.escape(String(activeKey))}"]`);
      if (!btn) return;
      setRect(vertical
        ? { start: btn.offsetTop, size: btn.offsetHeight }
        : { start: btn.offsetLeft, size: btn.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [containerEl, activeKey, vertical]);

  const skipTransition = firstRef.current;
  useLayoutEffect(() => { firstRef.current = false; }, []);

  const transition = skipTransition
    ? 'none'
    : vertical
      ? 'top 0.32s cubic-bezier(.4,0,.2,1), height 0.32s cubic-bezier(.4,0,.2,1)'
      : 'left 0.32s cubic-bezier(.4,0,.2,1), width 0.32s cubic-bezier(.4,0,.2,1)';

  return (
    <div ref={setContainerEl} className={className} style={{ position: 'relative', ...trackStyle }}>
      <div
        style={vertical ? {
          position: 'absolute', left: 0, right: 0,
          top: rect.start + 'px', height: rect.size + 'px',
          transition, pointerEvents: 'none', zIndex: 0,
          ...indicatorStyle,
        } : {
          position: 'absolute', top: 0, bottom: 0,
          left: rect.start + 'px', width: rect.size + 'px',
          transition, pointerEvents: 'none', zIndex: 0,
          ...indicatorStyle,
        }}
      />
      {children}
    </div>
  );
}
