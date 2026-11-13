// A small A4 PDF writer for the pay statement: text, lines and filled boxes
// in the PDF standard fonts (Helvetica family, WinAnsi encoding), so no font
// files are embedded, the text stays selectable, and the output is the same
// A4 document on any phone or computer.
//
// Coordinates are in points from the top-left of the page.

export const A4 = { w: 595.28, h: 841.89 };

// Helvetica and Helvetica-Bold advance widths (per 1000 em), from the Adobe
// core font metrics. Oblique faces share the upright widths.
const W_REG = {32:278,33:278,34:355,35:556,36:556,37:889,38:667,39:191,40:333,41:333,42:389,43:584,44:278,45:333,46:278,47:278,58:278,59:278,60:584,61:584,62:584,63:556,64:1015,65:667,66:667,67:722,68:722,69:667,70:611,71:778,72:722,73:278,74:500,75:667,76:556,77:833,78:722,79:778,80:667,81:778,82:722,83:667,84:611,85:722,86:667,87:944,88:667,89:667,90:611,91:278,92:278,93:278,94:469,95:556,96:333,97:556,98:556,99:500,100:556,101:556,102:278,103:556,104:556,105:222,106:222,107:500,108:222,109:833,110:556,111:556,112:556,113:556,114:333,115:500,116:278,117:556,118:500,119:722,120:500,121:500,122:500,123:334,124:260,125:334,126:584,
  0xA3:556,0x96:556,0x97:1000,0xB7:278,0xD7:584,0x9B:333,0x92:222,0x91:222,0x93:333,0x94:333,0xE9:556};
const W_BOLD = {32:278,33:333,34:474,35:556,36:556,37:889,38:722,39:238,40:333,41:333,42:389,43:584,44:278,45:333,46:278,47:278,58:333,59:333,60:584,61:584,62:584,63:611,64:975,65:722,66:722,67:722,68:722,69:667,70:611,71:778,72:722,73:278,74:556,75:722,76:611,77:833,78:722,79:778,80:667,81:778,82:722,83:667,84:611,85:722,86:667,87:944,88:667,89:667,90:611,91:333,92:278,93:333,94:584,95:556,96:333,97:556,98:611,99:556,100:611,101:556,102:333,103:611,104:611,105:278,106:278,107:556,108:278,109:889,110:611,111:611,112:611,113:611,114:389,115:556,116:333,117:611,118:556,119:778,120:556,121:556,122:500,123:389,124:280,125:389,126:584,
  0xA3:556,0x96:556,0x97:1000,0xB7:278,0xD7:584,0x9B:333,0x92:278,0x91:278,0x93:500,0x94:500,0xE9:556};
for (let d = 48; d <= 57; d++) { W_REG[d] = 556; W_BOLD[d] = 556; }

// Unicode → WinAnsi byte. Anything outside it becomes the nearest plain character.
const MAP = { '£':0xA3, '–':0x96, '—':0x97, '·':0xB7, '×':0xD7, '›':0x9B, '’':0x92, '‘':0x91, '“':0x93, '”':0x94, 'é':0xE9 };
const SUBST = { '−':'-', ' ':' ', '…':'...' };
const bytesOf = str => {
  const out = [];
  for (const ch of String(str)) {
    const c = SUBST[ch] ?? ch;
    if (c.length > 1) { for (const x of c) out.push(x.charCodeAt(0)); continue; }
    const code = MAP[c] ?? c.charCodeAt(0);
    out.push(code >= 32 && code <= 255 ? code : 63);
  }
  return out;
};

export const textWidth = (str, size, bold = false) => {
  const w = bold ? W_BOLD : W_REG;
  return bytesOf(str).reduce((s, b) => s + (w[b] ?? 556), 0) * size / 1000;
};

// Splits text into lines no wider than `width`.
export const wrap = (str, width, size, bold = false) => {
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && textWidth(next, size, bold) > width) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
};

const esc = bytes => bytes.map(b => (b === 40 || b === 41 || b === 92) ? '\\' + String.fromCharCode(b)
  : b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b)).join('');
const n = x => (Math.round(x * 100) / 100).toString();
const rgb = hex => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => n(parseInt(h.slice(i, i + 2), 16) / 255)).join(' '); };

export function createPdf({ title = '', author = '' } = {}) {
  const pages = [];
  let ops = null;
  const page = { add() { ops = []; pages.push(ops); } };
  page.add();

  const api = {
    newPage() { page.add(); },
    get pageCount() { return pages.length; },
    // opts: size, bold, italic, color, align ('left' | 'right' | 'center')
    text(x, y, str, { size = 10, bold = false, italic = false, color = '#0f172a', align = 'left' } = {}) {
      if (str == null || str === '') return;
      const w = textWidth(str, size, bold);
      const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      const font = bold ? (italic ? 'F4' : 'F2') : (italic ? 'F3' : 'F1');
      ops.push(`BT /${font} ${n(size)} Tf ${rgb(color)} rg ${n(x0)} ${n(A4.h - y)} Td (${esc(bytesOf(str))}) Tj ET`);
    },
    line(x1, y1, x2, y2, { width = 0.5, color = '#cbd5e1' } = {}) {
      ops.push(`${n(width)} w ${rgb(color)} RG ${n(x1)} ${n(A4.h - y1)} m ${n(x2)} ${n(A4.h - y2)} l S`);
    },
    rect(x, y, w, h, { fill = null, stroke = null, width = 0.5 } = {}) {
      const r = `${n(x)} ${n(A4.h - y - h)} ${n(w)} ${n(h)} re`;
      if (fill && stroke) ops.push(`${rgb(fill)} rg ${n(width)} w ${rgb(stroke)} RG ${r} B`);
      else if (fill) ops.push(`${rgb(fill)} rg ${r} f`);
      else if (stroke) ops.push(`${n(width)} w ${rgb(stroke)} RG ${r} S`);
    },
    // Runs `fn(pageIndex, pageCount)` on every page, e.g. for page numbers.
    eachPage(fn) { const keep = ops; pages.forEach((p, i) => { ops = p; fn(i, pages.length); }); ops = keep; },
    toBlob() {
      const objs = [];
      const add = s => { objs.push(s); return objs.length; };
      const catalog = add(null), pagesObj = add(null);
      const fonts = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique']
        .map(f => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
      const res = `<< /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R /F4 ${fonts[3]} 0 R >> >>`;
      const kids = pages.map(p => {
        const body = p.join('\n');
        const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
        return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources ${res} /Contents ${content} 0 R >>`);
      });
      objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
      objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
      const info = add(`<< /Title (${esc(bytesOf(title))}) /Author (${esc(bytesOf(author))}) /Producer (Overtime & Shift Tracker) >>`);
      // Every byte here is below 256, so string length = byte length.
      let out = '%PDF-1.4\n%âãÏÓ\n';
      const offsets = [];
      objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
      out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return new Blob([bytes], { type: 'application/pdf' });
    },
  };
  return api;
}
