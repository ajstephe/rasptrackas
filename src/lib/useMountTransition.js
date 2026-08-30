import { useEffect, useRef, useState } from 'react';

// Mirrors the trick ToastStack's useAnimatedToasts already uses for the
// toast array (see ToastStack.jsx) onto a single open/closed overlay:
// `{open && <Modal/>}` hard-unmounts the instant `open` flips false, so
// whatever CSS pop-in animation played on the way in never gets a chance
// to play in reverse on the way out. This keeps the thing mounted for one
// more beat after `open` goes false — long enough for the caller to swap
// in a reverse ("-out") animation class — then actually drops it.
//
// Usage: const mounted = useMountTransition(open, 220);
//        {mounted && <div className={open?'alert-pop':'alert-pop pop-out'}>…}
// `exitMs` should match the CSS exit animation's own duration so the node
// doesn't vanish mid-animation or linger invisibly after it finishes.
export function useMountTransition(open, exitMs = 220) {
  const [mounted, setMounted] = useState(open);
  const timerRef = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (open) {
      setMounted(true);
    } else {
      timerRef.current = setTimeout(() => setMounted(false), exitMs);
    }
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return mounted;
}

// Companion for overlays whose *content* (not just whether it's shown) comes
// from the value itself — e.g. `chartModal` is 'cum'/'mon'/null, and the
// modal's body switches on which. useMountTransition keeps the overlay
// mounted for one extra beat after the value goes null so the exit
// animation can play, but by then the value itself is already null — reading
// it directly during that tail would render the wrong branch (or throw, for
// values the JSX dereferences like `selectedCalDay.dEntries`). This instead
// holds onto the last truthy value seen, so content stays exactly what it
// was right up until the node is actually removed.
export function useLastTruthy(value) {
  const ref = useRef(value);
  if (value !== null && value !== undefined && value !== false) ref.current = value;
  return ref.current;
}
