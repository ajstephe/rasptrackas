import { useEffect, useRef, useState } from 'react';

// Tweens an array of chart points from their previous numeric values to new
// ones whenever the underlying data actually changes, instead of the line/
// dots snapping straight to their new shape — the point-based sibling of
// useCountUp, which does the same thing for a single number.
//
// `keys` names which fields on each point are the ones to interpolate (e.g.
// ['yG','yN'] for the monthly chart's two line heights) — everything else on
// the point (labels, raw values for the tooltip, etc.) just passes through
// unchanged. A signature built from those fields (not the points array
// itself, which is a fresh object every render regardless of whether the
// numbers moved) is what actually gates the effect, so an unrelated
// re-render elsewhere in the app doesn't restart the tween.
//
// Falls back to snapping straight to the target — no tween — on the very
// first render, when prefers-reduced-motion is set, or when the point count
// itself changes (a different number of pay periods can't be meaningfully
// interpolated point-for-point).
export function useAnimatedPoints(points, keys, duration = 500) {
  const [display, setDisplay] = useState(points);
  const prevPointsRef = useRef(points);
  const prevSigRef = useRef(null);
  const frameRef = useRef(null);
  const firstRef = useRef(true);

  const sig = points.map(pt => keys.map(k => pt[k]).join(',')).join('|');

  useEffect(() => {
    if (sig === prevSigRef.current) return;

    const reduced = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sameLength = prevPointsRef.current.length === points.length;

    if (firstRef.current || reduced || !sameLength) {
      firstRef.current = false;
      prevSigRef.current = sig;
      prevPointsRef.current = points;
      setDisplay(points);
      return;
    }

    const start = prevPointsRef.current;
    const t0 = performance.now();
    cancelAnimationFrame(frameRef.current);

    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(points.map((pt, i) => {
        const merged = { ...pt };
        keys.forEach(k => { merged[k] = start[i][k] + (pt[k] - start[i][k]) * eased; });
        return merged;
      }));
      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevPointsRef.current = points;
        prevSigRef.current = sig;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return display;
}
