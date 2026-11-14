import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildStatement, statementPdf } from '../lib/statement.js';

// The pay statement behind Export › PDF. The preview is the PDF itself:
// each page is drawn as an A4 sheet (SVG, from the same drawing as the file
// — see lib/pdfDoc.js) that scales to the width of any screen, so nothing
// can run off the edge, and what you see is exactly what's saved. Pinch to
// zoom on a phone.
//
// It never takes the app theme: fixed light colours, its own fonts.
const BODY = "'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif";

// Hands the PDF over: the share sheet on a phone (Save to Files, Mail, ...),
// a normal download elsewhere. Only the file is shared — adding a title or
// text makes iOS save that as a second file alongside the PDF.
const deliver = async (blob, name) => {
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export default function AnnualStatement({ months, settings, calcEntry, todayStr, yearLabel, rangeLabel, onClose, addToast }) {
  const s = useMemo(() => buildStatement({ months, settings, calcEntry, todayStr, yearLabel, rangeLabel }), [months, settings, calcEntry, todayStr, yearLabel, rangeLabel]);
  const pdf = useMemo(() => statementPdf(s), [s]);
  const pages = useMemo(() => pdf.toSVGs(), [pdf]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await deliver(pdf.toBlob(), s.fileName); }
    catch { addToast?.('Could not make the PDF. Try again.', 'warn'); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="print-root" role="dialog" aria-modal="true" aria-label={s.title} style={{ position: 'fixed', inset: 0, background: '#cbd5e1', zIndex: 70, overflowY: 'auto', overscrollBehavior: 'contain', WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%', fontFamily: BODY }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'rgba(203,213,225,0.92)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', padding: '10px 12px', paddingTop: 'calc(10px + env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', gap: '8px', maxWidth: '794px', margin: '0 auto' }}>
          <button onClick={save} disabled={busy} style={{ flex: 1, background: '#0f2744', color: '#fff', border: 'none', borderRadius: '11px', padding: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: BODY, opacity: busy ? 0.6 : 1 }}>{busy ? 'Making PDF…' : 'Save as PDF'}</button>
          <button onClick={onClose} style={{ background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '11px', padding: '12px 18px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: BODY }}>Close</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '4px 12px 24px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {pages.map((svg, i) => (
          <div key={i} aria-label={`Page ${i + 1} of ${pages.length}`} className="acct-statement"
            style={{ width: '100%', maxWidth: '794px', aspectRatio: '210 / 297', background: '#fff', boxShadow: '0 4px 18px rgba(15,23,42,0.18)', lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg width="100%" height="100%" ') }}/>
        ))}
      </div>
    </div>,
    document.body
  );
}
