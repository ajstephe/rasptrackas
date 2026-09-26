import { describe, it, expect } from 'vitest';
import { buildPayYear } from './payroll.js';
import { generateFYPeriods, addDaysToISO } from './payPeriods.js';
import { PAY_RATES } from './payRates.js';
import { overtimeTakeHome, simulatePayslips } from './hmrcPayeReference.js';

// Checks every pay month's overtime take-home against an independent
// simulation of real payslips built from HMRC's payroll method
// (hmrcPayeReference.js), across pay points and overtime patterns.
const PERIODS = generateFYPeriods(2026);
const PROFILES = [['Constable','PC 1'], ['Constable','PC 4'], ['Constable','PC 7 (top)'], ['Sergeant','SGT 4 (top)']];
let id = 0;
const mk = (date, o) => ({ id:'h'+(++id), date, reason:'', hours133:'', hours150:'', hours200:'', paRate:'None',
  otRateTier:'hours133', toilHours:'0', takeAs:'pay', otSubmitted:true, otSubmittedDate:date, paSubmitted:true, paSubmittedDate:date, ...o });
const PATTERNS = {
  'a quiet year':        p => [mk(addDaysToISO(p.start,3), { hours133:'4' })],
  'a heavy year':        p => [0,1,2,3].map(k=>mk(addDaysToISO(p.start,3+k*5), { hours150:'10', otRateTier:'hours150', paRate:'PA3' })),
  'a year over £100k':   p => [0,1,2,3,4,5].map(k=>mk(addDaysToISO(p.start,2+k*4), { hours200:'22', otRateTier:'hours200' })),
  'claims made late':    (p,i) => i%2
    ? [mk(addDaysToISO(p.start,2), { hours133:'8', otSubmittedDate:addDaysToISO(p.end,3) })]
    : [mk(addDaysToISO(p.start,5), { hours150:'6', otRateTier:'hours150', paRate:'PA2' })],
};

describe('pay months match HMRC payroll to the penny', () => {
  for (const [rank, service] of PROFILES) for (const [name, pattern] of Object.entries(PATTERNS)) {
    it(`${service}, ${name}`, () => {
      const svcData = PAY_RATES[rank][service];
      const entries = PERIODS.flatMap((p,i)=>pattern(p,i)).filter(e=>(e.otSubmittedDate||e.date) <= PERIODS[11].end);
      const year = buildPayYear({ periods: PERIODS, entries, settings: { rank, service }, svcData });
      const hmrc = overtimeTakeHome(svcData.salary, year.map(pb=>pb.ot+pb.pa));
      year.forEach((pb,i)=>expect(Math.abs(pb.combinedNet - hmrc[i])).toBeLessThan(0.005));
      // and each whole payslip: tax, NI, pension and net pay for the month
      const slips = simulatePayslips(svcData.salary, year.map(pb=>pb.ot+pb.pa));
      year.forEach((pb,i)=>{
        expect(Math.abs(pb.monthTax - slips[i].tax)).toBeLessThan(0.005);
        expect(Math.abs(pb.monthNI - slips[i].ni)).toBeLessThan(0.005);
        expect(Math.abs(pb.periodPension - slips[i].pension)).toBeLessThan(0.005);
        expect(Math.abs(pb.monthNet - slips[i].net)).toBeLessThan(0.005);
      });
    });
  }
});

describe('the HMRC reference itself', () => {
  it('gives a PC 4 with no overtime the same net pay every month until the September rise', () => {
    const slips = simulatePayslips(PAY_RATES.Constable['PC 4'].salary, Array(12).fill(0));
    const early = slips.slice(0,5).map(s=>s.net);
    early.forEach(n=>expect(Math.abs(n-early[0])).toBeLessThan(0.02));
    expect(slips[5].net).toBeGreaterThan(early[0]);
  });
});
