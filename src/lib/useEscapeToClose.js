import { useEffect } from 'react';

// Shared by every dismissible overlay in the app (confirm dialogs, the
// payslip/chart/date-picker modals, the calendar day-detail popover,
// Settings' desktop popovers) — one place for "Escape closes whatever's
// open" instead of each overlay growing its own copy of the same
// keydown listener. `open` can be a boolean or any truthy/falsy value
// (a modal's own state, e.g. `confirmCreateDay` itself); `onClose` only
// gets called while it's truthy, and the listener is only attached at all
// while something's actually open.
export function useEscapeToClose(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}
