import { describe, it, expect } from 'vitest';
import { buildPayYear, payDateOf, monthlyPay, entryNet, partNets, periodNet } from './payroll.js';
import { generateFYPeriods } from './payPeriods.js';
import { PAY_RATES } from './payRates.js';

const SETTINGS = { rank:'Constable', service:'PC 4' };
const SVC = PAY_RATES.Constable['PC 4'];
const PERIODS = generateFYPeriods(2026);
const TODAY = '2026-09-26';

let n = 0;
const shift = (date, o={}) => ({
  id: 's'+(++n), date, reason:'', hours133:'', hours150:'', hours200:'', paRate:'None',
  otRateTier:'hours133', toilHours:'0', takeAs:'pay',
  otSubmitted:true, otSubmittedDate:date, paSubmitted:true, paSubmittedDate:date, ...o,
});
const year = entries => buildPayYear({ periods: PERIODS, entries, settings: SETTINGS, svcData: SVC });
const lookupIn = y => d => y.find(pb=>d>=pb.start&&d<=pb.end) || null;

describe('pay months as PAYE months', () => {
  it('pays on the 20th of the month each pay month is named after', () => {
    expect(payDateOf(PERIODS[0])).toBe('2026-04-20');   // April pay
    expect(payDateOf(PERIODS[11])).toBe('2027-03-20');  // March pay
  });

  it('makes April pay tax month 1 and March pay tax month 12', () => {
    const y = year([]);
    expect(y[0].taxMonth).toBe(1);
    expect(y[11].taxMonth).toBe(12);
  });

  it('pays a twelfth of salary each month, at the new rate from September pay', () => {
    const aug = monthlyPay(SVC, '2026-08-20'), sep = monthlyPay(SVC, '2026-09-20');
    expect(aug.salary).toBeCloseTo(SVC.salary.pre/12, 2);   // paid to the penny
    expect(sep.salary).toBeCloseTo(SVC.salary.post/12, 2);
  });

  it('keeps a basic-rate officer at basic-rate deductions on overtime in every month, including the start of the year', () => {
    // A shift claimed in each of the first eight pay months.
    const entries = PERIODS.slice(0,8).map(p=>shift(p.start, { hours133:'4' }));
    year(entries).slice(0,8).forEach(pb=>{
      const deducted = 1 - pb.combinedNet/pb.combinedGross;
      expect(deducted).toBeGreaterThan(0.215);   // 20% tax + at least 2% NI
      expect(deducted).toBeLessThan(0.285);      // 20% tax + 8% NI, give or take payroll's whole-pound rounding
    });
  });
});

describe('pay point changes', () => {
  it('prices shifts and salary by the pay point in force on the date', () => {
    const settings = { rank:'Constable', service:'PC 5', payHistory:[ { from:'', rank:'Constable', service:'PC 4' }, { from:'2026-10-01', rank:'Constable', service:'PC 5' } ] };
    const before = shift('2026-09-09', { hours133:'2' }), after = shift('2026-10-05', { hours133:'2' });
    const y = buildPayYear({ periods: PERIODS, entries:[before, after], settings });
    expect(y[7].parts.find(p=>p.entry===before).amount).toBeCloseTo(2*PAY_RATES.Constable['PC 4'].post.r133, 2);
    expect(y[7].parts.find(p=>p.entry===after).amount).toBeCloseTo(2*PAY_RATES.Constable['PC 5'].post.r133, 2);
    expect(y[5].salary).toBeCloseTo(PAY_RATES.Constable['PC 4'].salary.post/12, 2);   // September pay
    expect(y[6].salary).toBeCloseTo(PAY_RATES.Constable['PC 5'].salary.post/12, 2);   // October pay
  });
});

describe('shift take-home adds up', () => {
  const entries = [
    shift('2026-09-09', { hours133:'2' }),
    shift('2026-09-13', { hours150:'10', otRateTier:'hours150', paRate:'PA1' }),
    shift('2026-09-18', { hours133:'4', paRate:'PA3' }),
    shift('2026-08-12', { hours133:'1', paRate:'PA2', paSubmittedDate:'2026-09-10' }), // PA claimed a month later
  ];
  const y = year(entries);
  const nov = y[7];

  it('splits a month\'s net across its claims so the shares add up exactly', () => {
    const sum = partNets(nov).reduce((s,x)=>s+x.net,0);
    expect(sum).toBeCloseTo(nov.combinedNet, 8);
  });

  it('gives saved shifts nets that add up to their months\' nets', () => {
    const total = entries.reduce((s,e)=>s+entryNet({ e, settings:SETTINGS, today:TODAY, lookup:lookupIn(y) }),0);
    const months = y.reduce((s,pb)=>s+pb.combinedNet,0);
    expect(total).toBeCloseTo(months, 8);
  });

  it('previews a new claimed shift at exactly what it adds once saved', () => {
    const fresh = shift('2026-09-26', { hours133:'2', otSubmittedDate:'2026-09-26' });
    const preview = entryNet({ e: fresh, settings:SETTINGS, today:TODAY, lookup:lookupIn(y) });
    const after = year([...entries, fresh])[7].combinedNet;
    expect(preview).toBeCloseTo(after - nov.combinedNet, 8);
  });

  it('previews an edit without counting the saved copy twice', () => {
    const saved = entries[0];
    const edited = { ...saved, hours133:'3' };
    const preview = entryNet({ e: edited, settings:SETTINGS, today:TODAY, lookup:lookupIn(y), exclude: saved });
    const without = year(entries.filter(x=>x!==saved))[7].combinedNet;
    const after = year([...entries.filter(x=>x!==saved), edited])[7].combinedNet;
    expect(preview).toBeCloseTo(after - without, 8);
  });

  it('never shows an unclaimed shift as tax-free just because its month has nothing else claimed', () => {
    const lone = shift('2026-05-28', { hours200:'4', otRateTier:'hours200', otSubmitted:false, otSubmittedDate:'' });
    const y2 = year([lone]);
    const net = entryNet({ e: lone, settings:SETTINGS, today:TODAY, lookup:lookupIn(y2) });
    expect(net).toBeLessThan(4*SVC.pre.r200*0.8);
  });

  it('has periodNet agree with the month record itself', () => {
    expect(periodNet(nov, nov.ot, nov.pa)).toBeCloseTo(nov.combinedNet, 8);
  });
});
