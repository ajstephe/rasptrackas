// Real damped harmonic oscillator (Hooke's law + damping) — the same
// physical model iOS's own spring animations use, rather than a canned
// easing curve. Drives `onUpdate` every frame via requestAnimationFrame
// until the value settles to within a pixel and a negligible velocity of
// `to`, then snaps exactly onto it and fires `onComplete`.
//
// Snaps straight to `to` with no animation at all when the browser reports
// prefers-reduced-motion, same convention as useCountUp.
//
// Returns a cancel function — call it if a new target arrives before this
// spring settles, so two in-flight springs never fight over the same value.
export function springValue(from, to, { stiffness = 210, damping = 20, mass = 1, velocity = 0, onUpdate, onComplete } = {}) {
  const reduced = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || from === to) {
    onUpdate(to);
    onComplete && onComplete();
    return () => {};
  }

  let v = velocity, x = from, last = performance.now(), frameRef, cancelled = false;

  const tick = (now) => {
    if (cancelled) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const Fs = -stiffness * (x - to);
    const Fd = -damping * v;
    v += (Fs + Fd) / mass * dt;
    x += v * dt;
    if (Math.abs(x - to) > 0.3 || Math.abs(v) > 0.3) {
      onUpdate(x);
      frameRef = requestAnimationFrame(tick);
    } else {
      onUpdate(to);
      onComplete && onComplete();
    }
  };
  frameRef = requestAnimationFrame(tick);

  return () => { cancelled = true; cancelAnimationFrame(frameRef); };
}
