import { describe, it, expect } from 'vitest';
import { createPdf, textWidth, wrap } from './pdfDoc.js';
import { buildStatement, statementPdf } from './statement.js';

const pb = (month, payDate, extra = {}) => ({
  month, payDate, parts: [], salary: 4000, lw: 250, la: 500, ot: 0, pa: 0, imported: 0, sacrifice: 50,
  monthGross: 4750, periodPension: 590, monthTax: 700, monthNI: 260, monthNet: 3150, ...extra,
});
const settings = { rank: 'Constable', service: 'PC 4', deductions: [{ id: 'a', name: 'Federation subs', amount: '24', when: 'after' }, { id: 'b', name: 'Cycle2Work', amount: '50', when: 'before' }] };
const calcEntry = () => ({ payH1: 0, payH2: 8, payH3: 0 });

describe('pdfDoc', () => {
  it('writes a valid A4 PDF with one page per newPage', async () => {
    const pdf = createPdf({ title: 'Test' });
    pdf.text(40, 40, 'Total £1,234.56 – 2× (check)');
    pdf.newPage(); pdf.text(40, 40, 'Page two');
    const bytes = new Uint8Array(await pdf.toBlob().arrayBuffer());
    const txt = String.fromCharCode(...bytes);
    expect(txt.startsWith('%PDF-1.4')).toBe(true);
    expect(txt).toContain('/Count 2');
    expect(txt).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(txt).toContain('\\243');            // £ in WinAnsi
    expect(txt).toContain('\\(check\\)');      // brackets escaped
    // xref offsets point at the objects they name
    const xref = Number(txt.match(/startxref\n(\d+)/)[1]);
    const first = txt.slice(xref).split('\n')[3].slice(0, 10);
    expect(txt.slice(Number(first), Number(first) + 7)).toBe('1 0 obj');
  });
  it('measures and wraps text', () => {
    expect(textWidth('0000', 10)).toBeCloseTo(22.24);
    expect(wrap('one two three four', textWidth('one two', 10), 10)).toEqual(['one two', 'three', 'four']);
  });
});

describe('buildStatement', () => {
  const months = [pb('April 2026', '2026-04-20'), pb('May 2026', '2026-05-20'), pb('June 2026', '2026-06-19')];
  const s = buildStatement({ months, settings, calcEntry, todayStr: '2026-05-25', yearLabel: '2026/27', rangeLabel: 'x' });
  it('splits paid to date from the full year', () => {
    expect(s.paidRows.length).toBe(2);
    expect(s.split).toBe(true);
    expect(s.tPaid.gross).toBe(9500);
    expect(s.tAll.gross).toBe(14250);
  });
  it('takes after-tax deductions off net pay and keeps taxable pay after pension and sacrifice', () => {
    expect(s.rows[0].other).toBe(24);
    expect(s.rows[0].net).toBe(3126);
    expect(s.rows[0].taxable).toBe(4110);
    expect(s.dedList.map(d => d.total)).toEqual([72, 150]);
  });
  it('makes a PDF', () => {
    expect(statementPdf(s).size).toBeGreaterThan(2000);
  });
});
