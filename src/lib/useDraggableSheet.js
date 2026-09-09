import { useEffect, useRef, useState } from 'react';
import { springValue } from './spring.js';
import { haptic } from './haptics.js';

// Wires a grabber pill to real drag-to-dismiss physics for the mobile
// bottom sheets (Sign Out, Restore Backup, Generate Payslip, Day Detail) —
// the same real spring integrator pull-to-refresh already uses, rather than
// a canned CSS transition. Desktop's centred alert-pop dialogs never call
// this; they have no grabber and no bottom edge to drag from.
//
// `open` mirrors the sheet's own confirmOpen/modalOpen boolean and `onClose`
// is whatever setter already closes it (the same one the backdrop and ×
// button already call) — dragging past `dismissAt` just calls that setter
// early, so the existing useMountTransition/pop-out unmount timing is
// untouched. What this hook adds on top is purely the live drag position
// and, if released past the threshold, one more spring carrying the sheet
// the rest of the way off-screen so it doesn't just vanish mid-drag; if
// released short of it, a spring back to resting position.
//
// isDragClosing tells the caller to render plain 'sheet-pop' rather than
// '...pop-out' for one beat: sheetPopOut's own keyframes always animate
// transform/opacity from their 0% values regardless of whatever the
// element's inline style already says, so letting both apply at once would
// snap the sheet back to translateY(0) for a frame before re-animating —
// visible as a flicker. Suppressing pop-out here means this hook's own
// spring is the only thing moving the sheet for a drag-initiated close.
export function useDraggableSheet(open, onClose, { dismissAt = 130 } = {}) {
  const [dragY, setDragY] = useState(0);
  const [dragOpacity, setDragOpacity] = useState(1);
  const [isDragClosing, setIsDragClosing] = useState(false);
  const cancelRef = useRef(() => {});
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const armedRef = useRef(false);

  // A fresh open should never inherit the drag-closed position of whatever
  // this same sheet showed last time — without this, reopening right after
  // a drag-dismiss would render it stuck off-screen and invisible.
  useEffect(() => {
    if (open) {
      cancelRef.current();
      draggingRef.current = false;
      armedRef.current = false;
      setDragY(0);
      setDragOpacity(1);
      setIsDragClosing(false);
    }
  }, [open]);

  useEffect(() => () => cancelRef.current(), []);

  const onPointerDown = (e) => {
    cancelRef.current();
    draggingRef.current = true;
    armedRef.current = false;
    startYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    const dy = Math.max(0, e.clientY - startYRef.current);
    setDragY(dy);
    const nowArmed = dy > dismissAt;
    if (nowArmed && !armedRef.current) haptic();
    armedRef.current = nowArmed;
  };
  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (armedRef.current) {
      setIsDragClosing(true);
      onClose();
      cancelRef.current = springValue(dragY, 900, {
        stiffness: 300, damping: 30,
        onUpdate: (v) => { setDragY(v); setDragOpacity(Math.max(0, 1 - v / 480)); },
      });
    } else {
      cancelRef.current = springValue(dragY, 0, {
        stiffness: 340, damping: 26,
        onUpdate: setDragY,
      });
    }
  };

  return {
    dragY, isDragClosing,
    grabberProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    sheetDragStyle: (dragY > 0 || isDragClosing)
      ? { transform: `translateY(${dragY}px)`, opacity: isDragClosing ? dragOpacity : undefined }
      : undefined,
  };
}
