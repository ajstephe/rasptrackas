import { useLayoutEffect, useRef, useState } from 'react';

// ─── Sliding segmented-control indicator ────────────────────────────────────
// Same mechanism as the bottom nav's sliding pill (App.jsx), generalised: one
// shared indicator measures whichever child carries a matching data-seg-key
// and glides there, instead of every button swapping its own fill the moment
// it's tapped. Wrap an existing row of option buttons/divs with this, give
// each one data-seg-key={itsOwnKey}, and drop their per-option background —
// onClick/behaviour/keys are untouched, this only supplies the moving fill.
export function SegSlider({ activeKey, indicatorStyle, trackStyle, className, children }) {
  const [containerEl, setContainerEl] = useState(null);
  const [rect, setRect] = useState({ left: 0, width: 0 });
  const firstRef = useRef(true);

  useLayoutEffect(() => {
    if (!containerEl) return;
    const place = () => {
      const btn = containerEl.querySelector(`[data-seg-key="${CSS.escape(String(activeKey))}"]`);
      if (!btn) return;
      setRect({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [containerEl, activeKey]);

  // No slide-in on first paint — the indicator should just appear where
  // the already-selected option is, not glide in from the top-left corner.
  const skipTransition = firstRef.current;
  useLayoutEffect(() => { firstRef.current = false; }, []);

  return (
    <div ref={setContainerEl} className={className} style={{ position: 'relative', ...trackStyle }}>
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0,
          left: rect.left + 'px', width: rect.width + 'px',
          transition: skipTransition ? 'none' : 'left 0.32s cubic-bezier(.4,0,.2,1), width 0.32s cubic-bezier(.4,0,.2,1)',
          pointerEvents: 'none', zIndex: 0,
          ...indicatorStyle,
        }}
      />
      {children}
    </div>
  );
}
