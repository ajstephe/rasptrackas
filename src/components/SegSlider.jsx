import { useLayoutEffect, useRef, useState } from 'react';
import { springValue } from '../lib/spring.js';

export function SegSlider({ activeKey, indicatorStyle, trackStyle, className, orientation='horizontal', children }) {
  const [containerEl, setContainerEl] = useState(null);
  const [rect, setRect] = useState({ start: 0, size: 0 });
  const rectRef = useRef(rect);
  const cancelRef = useRef([() => {}, () => {}]);
  const firstRef = useRef(true);
  const vertical = orientation==='vertical';

  useLayoutEffect(() => {
    if (!containerEl) return;
    const place = () => {
      const btn = containerEl.querySelector(`[data-seg-key="${CSS.escape(String(activeKey))}"]`);
      if (!btn) return;
      const target = vertical
        ? { start: btn.offsetTop, size: btn.offsetHeight }
        : { start: btn.offsetLeft, size: btn.offsetWidth };

      cancelRef.current[0]();
      cancelRef.current[1]();

      if (firstRef.current) {
        rectRef.current = target;
        setRect(target);
        return;
      }

      const from = rectRef.current;
      // Same spring feel as the "Ledger in Motion" mockup's segmented
      // control demo — start and size spring independently so a pill
      // that's both moving and resizing (e.g. jumping between unevenly
      // sized segments) doesn't look like two mismatched tweens.
      cancelRef.current[0] = springValue(from.start, target.start, {
        stiffness: 260, damping: 22,
        onUpdate: (v) => { rectRef.current = { ...rectRef.current, start: v }; setRect(r => ({ ...r, start: v })); },
      });
      cancelRef.current[1] = springValue(from.size, target.size, {
        stiffness: 260, damping: 22,
        onUpdate: (v) => { rectRef.current = { ...rectRef.current, size: v }; setRect(r => ({ ...r, size: v })); },
      });
    };
    place();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (containerEl) place(); });
    }
    const ro = new ResizeObserver(place);
    ro.observe(containerEl);
    return () => { ro.disconnect(); cancelRef.current[0](); cancelRef.current[1](); };
  }, [containerEl, activeKey, vertical]);

  useLayoutEffect(() => { firstRef.current = false; }, []);

  return (
    <div ref={setContainerEl} className={className} style={{ position: 'relative', ...trackStyle }}>
      <div
        style={vertical ? {
          position: 'absolute', left: 0, right: 0,
          top: rect.start + 'px', height: rect.size + 'px',
          pointerEvents: 'none', zIndex: 0,
          ...indicatorStyle,
        } : {
          position: 'absolute', top: 0, bottom: 0,
          left: rect.start + 'px', width: rect.size + 'px',
          pointerEvents: 'none', zIndex: 0,
          ...indicatorStyle,
        }}
      />
      {children}
    </div>
  );
}
