import { Children, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../lib/useEscapeToClose.js';
import { useBackButtonCloses } from '../lib/useBackButtonCloses.js';

// Drop-in replacement for <select> that opens the app's own picker instead
// of the phone's: on Android the native one is a system dialog of radio
// buttons in the phone's own font and colours, out of keeping with every
// theme. Takes the same <option> children, value and onChange(e) (called
// with { target: { value } }), so swapping one in is a rename.
//
// Phones get a sheet up from the bottom (thumb-reachable, like the app's
// other pop-ups); a computer gets a compact list under the field.

const flatten = children => {
  const out = [];
  Children.toArray(children).forEach(ch => {
    if (!isValidElement(ch)) return;
    if (ch.type === 'option') {
      out.push({ value: String(ch.props.value ?? ''), label: ch.props.children, disabled: !!ch.props.disabled });
    } else if (ch.props && ch.props.children) out.push(...flatten(ch.props.children));
  });
  return out;
};

const isPhone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 719px), (pointer: coarse) and (max-width: 1024px)').matches;

export function AppSelect({ value, onChange, children, style, disabled, id, title, ...rest }) {
  const options = flatten(children);
  const current = options.find(o => o.value === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const phone = open && isPhone();
  const label = rest['aria-label'] || title;

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); btnRef.current && btnRef.current.focus(); }, 160);
  }, []);
  useEscapeToClose(open && !closing, close, { top: true });
  useBackButtonCloses(open && !closing, close, { top: true });

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const maxH = Math.min(320, Math.max(160, below > 200 ? below : r.top - 12));
    const up = below < 200 && r.top > below;
    setPos({ left: r.left, width: r.width, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined, maxH });
  };
  useLayoutEffect(() => { if (open && !phone) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    // Bring the chosen option into view and focus it.
    const el = listRef.current?.querySelector('[aria-selected="true"]') || listRef.current?.querySelector('[role="option"]');
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
    if (!phone) { const onResize = () => place(); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = v => { if (v !== String(value ?? '')) onChange && onChange({ target: { value: v } }); close(); };
  const onListKey = e => {
    const items = [...listRef.current.querySelectorAll('[role="option"]:not([aria-disabled="true"])')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Tab') close();
  };

  const { appearance, WebkitAppearance, ...btnStyle } = style || {};
  const list = (
    <div ref={listRef} role="listbox" aria-label={label} onKeyDown={onListKey} style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px', ...(phone ? { maxHeight: '60vh' } : { maxHeight: pos ? pos.maxH + 'px' : '320px' }) }}>
      {options.map(o => {
        const on = o.value === String(value ?? '');
        return (
          <button key={o.value} type="button" role="option" aria-selected={on} aria-disabled={o.disabled || undefined} disabled={o.disabled}
            onClick={() => !o.disabled && pick(o.value)} className="tap-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', textAlign: 'left', border: 'none', borderRadius: '10px', padding: phone ? '13px 14px' : '10px 12px', minHeight: phone ? '48px' : '40px', background: on ? 'var(--chip-bg)' : 'transparent', color: o.disabled ? 'var(--quiet)' : 'var(--ink)', fontFamily: 'inherit', fontSize: phone ? '16px' : '14px', fontWeight: on ? 800 : 600, cursor: o.disabled ? 'default' : 'pointer', opacity: o.disabled ? 0.55 : 1 }}>
            <span>{o.label}</span>
            {on && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <button ref={btnRef} type="button" id={id} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={label ? `${label}: ${current ? (typeof current.label === 'string' ? current.label : current.value) : ''}` : undefined}
        onClick={() => !disabled && setOpen(true)}
        style={{ display: 'block', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: disabled ? 'not-allowed' : 'pointer', ...btnStyle }}>
        {current ? current.label : ' '}
      </button>
      {open && createPortal(
        <div style={{ fontFamily: 'var(--app-font)', color: 'var(--ink)' }}>
          <div onClick={close} className={closing ? 'ov-out' : 'ov-in'} style={{ position: 'fixed', inset: 0, zIndex: 90, background: phone ? 'rgba(15,23,42,0.4)' : 'transparent', backdropFilter: phone ? 'blur(4px)' : 'none', WebkitBackdropFilter: phone ? 'blur(4px)' : 'none' }} />
          {phone ? (
            <div role="dialog" aria-modal="true" aria-label={label || 'Choose an option'} className={'app-select-sheet' + (closing ? ' out' : '')}
              style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 91, background: 'var(--surface)', borderRadius: '20px 20px 0 0', boxShadow: '0 -12px 40px rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderBottom: 'none', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
              <div style={{ width: '38px', height: '4px', borderRadius: '2px', background: 'var(--border)', margin: '9px auto 4px' }} />
              {label && <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--quiet)', padding: '6px 20px 4px' }}>{label}</div>}
              {list}
            </div>
          ) : pos && (
            <div className={'app-select-pop' + (closing ? ' out' : '')} style={{ position: 'fixed', zIndex: 91, left: pos.left + 'px', width: Math.max(pos.width, 200) + 'px', ...(pos.top != null ? { top: pos.top + 'px' } : { bottom: pos.bottom + 'px' }), background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 16px 40px rgba(0,0,0,0.22)' }}>
              {list}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
