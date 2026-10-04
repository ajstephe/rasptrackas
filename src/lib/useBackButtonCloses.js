import { useEffect, useRef } from 'react';

// Android's hardware/gesture back button is the primary way people dismiss
// things — unlike iOS, there's no equivalent concept — so without this, back
// falls through to the browser's own history navigation, which (depending on
// what's in the stack) can do nothing or leave the app entirely, instead of
// just closing whatever's open. Every other dismissal (backdrop click,
// Escape, an explicit button) already existed; this makes back another one.
//
// Standard pushState/popstate technique: opening pushes one synthetic
// history entry, so a back-press has something of ours to consume first —
// popstate then closes instead of navigating. Closing normally (not via
// back) consumes that same entry with history.back() so it never
// accumulates one per modal opened. The pushedRef guard stops the two paths
// (a real back-press vs. a normal close calling history.back() itself) from
// double-triggering each other.
// A close by button calls history.back() itself, which fires a popstate of
// its own. When pop-ups are stacked (the date picker over the calendar day
// card), that popstate must not reach the layer underneath and close it too,
// so it's swallowed here before any other listener sees it.
let swallowPops = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', e => {
    if (swallowPops > 0) { swallowPops--; e.stopImmediatePropagation(); }
  }, true);
}

// `top: true` is for a pop-up that opens over another one: its back press is
// handled first and stops there, so only the top layer closes.
export function useBackButtonCloses(open, onClose, { top = false } = {}) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (open && !pushedRef.current) {
      window.history.pushState({ modalOpen: true }, '');
      pushedRef.current = true;
    } else if (!open && pushedRef.current) {
      pushedRef.current = false;
      if (window.history.state && window.history.state.modalOpen) {
        swallowPops++;
        window.history.back();
      }
    }
  }, [open]);

  // A pop-up that unmounts while open (e.g. it lives on a tab that's left)
  // takes its history entry with it, so the next back press isn't wasted.
  useEffect(() => () => {
    if (pushedRef.current) {
      pushedRef.current = false;
      if (window.history.state && window.history.state.modalOpen) { swallowPops++; window.history.back(); }
    }
  }, []);

  useEffect(() => {
    const onPopState = e => {
      if (pushedRef.current) {
        pushedRef.current = false;
        if (top) e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('popstate', onPopState, top);
    return () => window.removeEventListener('popstate', onPopState, top);
  }, [onClose, top]);
}
