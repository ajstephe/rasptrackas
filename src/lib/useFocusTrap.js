import { useEffect, useRef } from 'react';

// ─── Modal focus management ──────────────────────────────────────────────────
// Every overlay in this app (confirm sheets, popovers, pickers) already
// dismisses on Escape (useEscapeToClose) and animates in/out correctly, but
// none of them did the other three things a real dialog needs for keyboard/
// screen-reader use, because a plain positioned <div> doesn't get any of it
// for free:
//   1. Focus moves INTO the dialog the instant it opens — otherwise it's
//      still sitting on whatever triggered it, now hidden behind the
//      backdrop, and Tab just keeps cycling through the page underneath.
//   2. Tab/Shift+Tab is TRAPPED among the dialog's own controls while it's
//      open — otherwise tabbing can walk focus out of a dialog you can
//      still see on screen and into content behind it.
//   3. Focus is RESTORED to whatever opened it once it closes, so you're
//      not left stranded wherever the dialog happened to leave you.
//
// Usage: const contentRef = useRef(null); useFocusTrap(open, contentRef);
// then render the dialog's actual content box (not its backdrop) with
// ref={contentRef} — same `open` boolean the caller already tracks (the
// real state, not a useMountTransition `mounted` flag — trapping Tab
// inside a dialog that's already mid-close-animation would be wrong).
// The content box itself needs tabIndex={-1} so it's a valid fallback
// focus target on the rare dialog with nothing focusable inside yet.
export function useFocusTrap(open, containerRef) {
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    // Remembered here (not read at cleanup time) since by the time this
    // effect tears down, document.activeElement is whatever's inside the
    // dialog itself, not the trigger that opened it.
    triggerRef.current = document.activeElement;

    const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = (container) => Array.from(container.querySelectorAll(FOCUSABLE))
      .filter(el => el.offsetParent !== null); // skip anything currently display:none

    let cleanedUp = false;
    let container = null;
    let onKeyDown = null;
    let observer = null;
    let fallbackTimer = null;

    const attach = () => {
      if (cleanedUp || container) return;
      container = containerRef.current;
      if (!container) return;
      if (observer) { observer.disconnect(); observer = null; }
      clearTimeout(fallbackTimer);

      const focusables = getFocusable(container);
      (focusables[0] || container).focus({ preventScroll: true });

      onKeyDown = (e) => {
        if (e.key !== 'Tab') return;
        const items = getFocusable(container);
        if (items.length === 0) { e.preventDefault(); return; }
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      };
      container.addEventListener('keydown', onKeyDown);
    };

    // containerRef.current isn't necessarily populated on this same tick —
    // several callers only render their content (and therefore attach the
    // ref) a render cycle after `open` flips true: a useMountTransition
    // `mounted` flag lagging one render behind, a createPortal waiting on
    // its own target ref, etc. A MutationObserver on the document reacts
    // the instant that commit actually lands, rather than guessing how
    // many frames to wait — deliberately not requestAnimationFrame here,
    // since rAF callbacks are suspended outright on a backgrounded/hidden
    // document (a real dialog only ever opens from a tap on a visible tab,
    // but that's not a chance worth taking for something focus depends
    // on). setTimeout below is just a safety net in case the ref is never
    // actually attached at all — the observer disconnects instead of
    // running indefinitely once either fires.
    attach();
    if (!container) {
      observer = new MutationObserver(attach);
      observer.observe(document.body, { childList: true, subtree: true });
      fallbackTimer = setTimeout(() => { if (observer) { observer.disconnect(); observer = null; } }, 4000);
    }

    return () => {
      cleanedUp = true;
      if (observer) observer.disconnect();
      clearTimeout(fallbackTimer);
      if (container && onKeyDown) container.removeEventListener('keydown', onKeyDown);
      const trigger = triggerRef.current;
      if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [open, containerRef]);
}
