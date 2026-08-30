import { useEffect, useRef, useState } from 'react';

// Animates a numeric value from whatever it previously was to a new target
// whenever the target changes, easing over `duration` ms — used so headline
// mono figures (Net pay, Total Gross YTD, CARMS Outstanding) count rather
// than jump when the underlying total changes.
//
// The very first render never animates (nothing to count up from yet — the
// figure should just appear at its real value), and the tween is skipped
// entirely, jumping straight to the target, when the browser reports
// prefers-reduced-motion.
export function useCountUp(target, duration = 700) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const frameRef = useRef(null);
  const firstRef = useRef(true);

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (firstRef.current) {
      firstRef.current = false;
      prevRef.current = target;
      setDisplay(target);
      return;
    }
    if (reduced || target === prevRef.current) {
      prevRef.current = target;
      setDisplay(target);
      return;
    }

    const start = prevRef.current;
    const delta = target - start;
    const t0 = performance.now();
    cancelAnimationFrame(frameRef.current);

    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(start + delta * eased);
      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return display;
}
