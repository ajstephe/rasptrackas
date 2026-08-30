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
export function useBackButtonCloses(open, onClose) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (open && !pushedRef.current) {
      window.history.pushState({ modalOpen: true }, '');
      pushedRef.current = true;
    } else if (!open && pushedRef.current) {
      pushedRef.current = false;
      if (window.history.state && window.history.state.modalOpen) {
        window.history.back();
      }
    }
  }, [open]);

  useEffect(() => {
    const onPopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        onClose();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [onClose]);
}
