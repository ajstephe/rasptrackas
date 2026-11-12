import { describe, it, expect } from 'vitest';
import { deductionFor, deductionsFor, monthOrdinal } from './deductions.js';
import { buildPayYear } from './payroll.js';
import { generateFYPeriods } from './payPeriods.js';
import { migrateSettings } from './migrations.js';

const PERIODS = generateFYPeriods(2026);
const BASE = { rank:'Constable', service:'PC 4' };

describe('deductionFor', () => {
  const d = { id:'a', name:'Police Mutual', amount:'28.50', when:'after', off:['December 2026'], changes:[{ from:'February 2027', amount:'30' }, { from:'October 2026', amount:'29.00' }] };
  it('uses the starting amount before any change', () => expect(deductionFor(d, 'June 2026')).toBe(28.5));
  it('uses the newest change on or before the month', () => {
    expect(deductionFor(d, 'October 2026')).toBe(29);
    expect(deductionFor(d, 'January 2027')).toBe(29);
    expect(deductionFor(d, 'March 2027')).toBe(30);
  });
  it('takes nothing in a skipped month', () => expect(deductionFor(d, 'December 2026')).toBe(0));
  it('orders months across the year end', () => expect(monthOrdinal('January 2027')).toBeGreaterThan(monthOrdinal('December 2026')));
  it('splits a month by before and after tax', () => {
    const s = { deductions:[d, { id:'b', name:'Cycle', amount:'50', when:'before' }] };
    expect(deductionsFor(s, 'June 2026')).toEqual({ before:50, after:28.5, total:78.5 });
  });
});

describe('salary sacrifice in the payroll run', () => {
  const plain = buildPayYear({ periods: PERIODS, entries: [], settings: BASE });
  const sac = buildPayYear({ periods: PERIODS, entries: [], settings: { ...BASE, deductions:[{ id:'c', name:'Cycle to work', amount:'50', when:'before', off:['May 2026'] }] } });
  it('lowers tax by 20% and NI by 8% of the sacrifice for a basic rate PC', () => {
    expect(plain[0].monthTax - sac[0].monthTax).toBeCloseTo(10, 1);
    expect(plain[0].monthNI - sac[0].monthNI).toBeCloseTo(4, 1);
    // so £50 sacrificed costs £36 of take-home, and monthNet already has it off
    expect(sac[0].sacrifice).toBe(50);
    expect(sac[0].monthNet - plain[0].monthNet).toBeCloseTo(-36, 0);
  });
  it('leaves pension and a skipped month alone', () => {
    expect(sac[0].periodPension).toBe(plain[0].periodPension);
    expect(sac[1].monthNI).toBeCloseTo(plain[1].monthNI, 2);
  });
  it('after-tax deductions do not change the payslip', () => {
    const after = buildPayYear({ periods: PERIODS, entries: [], settings: { ...BASE, deductions:[{ id:'f', name:'Fed', amount:'23.94', when:'after' }] } });
    expect(after[0].monthNet).toBe(plain[0].monthNet);
  });
});

describe('migrateSettings keeps deductions', () => {
  it('keeps valid ones and drops junk', () => {
    const out = migrateSettings({ ...BASE, deductions:[
      { id:'a', name:'Fed', amount:'23.94', when:'after', off:['May 2026','bad'], changes:[{ from:'June 2026', amount:'25' }, { from:'x', amount:'1' }] },
      { id:5, name:'no id' }, 'junk' ] });
    expect(out.deductions).toEqual([{ id:'a', name:'Fed', amount:'23.94', when:'after', off:['May 2026'], changes:[{ from:'June 2026', amount:'25' }] }]);
  });
});

describe('audit fixes', () => {
  it('keeps deductions saved before rank and pay point are set', () => {
    const out = migrateSettings({ rank:'', service:'', deductions:[{ id:'a', name:'Fed', amount:23.94, when:'after' }] });
    expect(out.rank).toBe('');
    expect(out.deductions[0].amount).toBe('23.94');
  });
  it('caps a sacrifice larger than the pay can bear and never goes below zero take-home from it', () => {
    const y = buildPayYear({ periods: PERIODS, entries: [], settings: { ...BASE, deductions:[{ id:'x', name:'Big', amount:'9000', when:'before' }] } });
    expect(y[0].sacrifice).toBeLessThan(9000);
    expect(y[0].monthNet).toBeGreaterThanOrEqual(-0.01);
  });
  it('salary, LW and LA nets plus overtime add up to the month net with a sacrifice', () => {
    const y = buildPayYear({ periods: PERIODS, entries: [], settings: { ...BASE, deductions:[{ id:'c', name:'Cycle', amount:'50', when:'before' }] } });
    const pb = y[0];
    expect(pb.salaryNet + pb.lwNet + pb.laNet + pb.otResult.net + pb.paResult.net).toBeCloseTo(pb.monthNet, 2);
  });
});
