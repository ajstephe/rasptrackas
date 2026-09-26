import { calcEntry, isOtSubmitted, isPaSubmitted, effectiveOtDate, effectivePaDate } from './calc.js';
import { applyBandTax, pensionTierRate, LONDON_WEIGHTING, LONDON_ALLOWANCE } from './tax.js';
import { RATE_CHANGE_DATE } from './payPeriods.js';

// ─── payroll: one pay month = one PAYE tax month ─────────────────────────────
// Pay lands on the 20th of the month each pay period is named after, so
// "April pay" (shifts 9 Feb – 8 Mar) is paid on 20 April — after 6 April,
// which makes it month 1 of the tax year, and "March pay" month 12. The pay
// year and the tax year therefore line up exactly, and shifts stay in the
// pay month their dates put them in.
//
// Each pay month is taxed the way PAYE does it: salary arrives as a twelfth
// of the annual figure (at the rate in force on the pay date), and by tax
// month n you've had n/12 of the tax-free allowance and of each band.
export const PAY_DAY = 20;
const MONTH_NUM = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };

export const payDateOf = period => {
  const [name, year] = period.month.split(' ');
  return `${year}-${String(MONTH_NUM[name]).padStart(2,'0')}-${PAY_DAY}`;
};

// A month's salary, London Weighting and London Allowance, at the rates
// in force on its pay date.
export const monthlyPay = (svcData, payDate) => {
  const post = payDate >= RATE_CHANGE_DATE;
  const salaryAnnual = svcData ? svcData.salary[post?'post':'pre'] : 0;
  const lwAnnual = LONDON_WEIGHTING[post?'post':'pre'];
  const salary = salaryAnnual/12, lw = lwAnnual/12, la = LONDON_ALLOWANCE/12;
  return { salary, lw, la, base: salary+lw+la, pensionable: salary+lw, annualPensionable: salaryAnnual+lwAnnual };
};

// The money parts of one entry that have been claimed: overtime and PA are
// claimed separately, so each lands in the pay month of its own claim date.
export const claimedParts = (e, settings) => {
  const c = calcEntry(e, settings);
  const parts = [];
  if (c.h1+c.h2+c.h3 > 0 && isOtSubmitted(e) && c.ot > 0) parts.push({ kind:'ot', date:effectiveOtDate(e), amount:c.ot, entry:e });
  if (c.pa > 0 && isPaSubmitted(e)) parts.push({ kind:'pa', date:effectivePaDate(e), amount:c.pa, entry:e });
  return parts;
};

const zeroResult = { tax:0, ni:0, net:0, rate:0, bandName:null };

// Take-home from a pay month's overtime and PA, stacked on top of that
// month's salary and everything earlier in the tax year.
export const periodNet = (pb, ot, pa) =>
  applyBandTax(pb.cumBase, ot, pb.yearFraction, pb.baseAmt).net +
  applyBandTax(pb.cumBase+ot, pa, pb.yearFraction, pb.baseAmt+ot).net;

// All twelve pay months of one pay year (= one tax year).
export const buildPayYear = ({ periods, entries, settings, svcData }) => {
  const partsBy = periods.map(()=>[]);
  entries.forEach(e=>claimedParts(e, settings).forEach(part=>{
    const i = periods.findIndex(p=>part.date>=p.start&&part.date<=p.end);
    if (i>=0) partsBy[i].push(part);
  }));
  let cum = 0;
  return periods.map((p,i)=>{
    const payDate = payDateOf(p);
    const m = monthlyPay(svcData, payDate);
    const yearFraction = (i+1)/12;
    const pensionRate = svcData ? pensionTierRate(m.annualPensionable) : 0;
    const periodPension = m.pensionable * pensionRate;
    const cumBase = cum + m.base - periodPension;   // salary is taxed first, net of pension
    const parts = partsBy[i].sort((a,b)=>a.entry.date.localeCompare(b.entry.date) || String(a.entry.id).localeCompare(String(b.entry.id)) || (a.kind==='ot'?-1:1));
    const ot = parts.filter(x=>x.kind==='ot').reduce((s,x)=>s+x.amount,0);
    const pa = parts.filter(x=>x.kind==='pa').reduce((s,x)=>s+x.amount,0);
    const otResult = applyBandTax(cumBase, ot, yearFraction, m.base);
    const paResult = applyBandTax(cumBase+ot, pa, yearFraction, m.base+ot);
    cum = cumBase + ot + pa;
    return {
      month:p.month, start:p.start, end:p.end, payDate, taxMonth:i+1, yearFraction,
      baseAmt:m.base, salary:m.salary, lw:m.lw, la:m.la,
      pensionablePayThisPeriod:m.pensionable, pensionRate, periodPension,
      ot, night:0, pa, otResult, nightResult:zeroResult, paResult,
      combinedGross: ot+pa, combinedNet: otResult.net+paResult.net,
      cumBase, cumAfter: cum, inCurrentTaxYear: true, parts,
    };
  });
};

// Each claimed part's share of its pay month's take-home, stacked in date
// order, so the shares always add up exactly to the month's net.
export const partNets = pb => {
  let prior = 0;
  return pb.parts.map(part=>{
    const cumBefore = pb.cumBase + prior;
    const r = applyBandTax(cumBefore, part.amount, pb.yearFraction, pb.baseAmt + prior);
    prior += part.amount;
    return { part, net:r.net, tax:r.tax, ni:r.ni, rate:r.rate, bandName:r.bandName, cumBefore };
  });
};

// What one entry adds to take-home. A saved, claimed shift shows its share
// of its pay month's net (see partNets), so a month's shifts add up to the
// month. A shift not yet claimed — or an edit being previewed — shows the
// difference it would make to the month's net: claimed parts in the month
// they landed in, unclaimed parts in the month they'd land in if claimed
// now (or on the shift date, for a future shift). `lookup(date)` returns the pay month record for a date, in
// any pay year. `exclude` is the saved copy of an entry being edited, so
// its current contribution isn't counted twice.
export const entryNet = ({ e, settings, today, lookup, exclude=null }) => {
  const c = calcEntry(e, settings);
  const pending = e.date > today ? e.date : today;
  const adds = [];
  if (c.h1+c.h2+c.h3 > 0 && c.ot > 0) adds.push({ kind:'ot', amount:c.ot, date: isOtSubmitted(e) ? effectiveOtDate(e) : pending });
  if (c.pa > 0) adds.push({ kind:'pa', amount:c.pa, date: isPaSubmitted(e) ? effectivePaDate(e) : pending });
  // The saved copy's claimed parts, if they're counted in a month already
  // (matched by id, so a new shift being previewed removes nothing).
  const saved = exclude || e;
  const removes = claimedParts(saved, settings).map(p=>({ kind:p.kind, amount:p.amount, date:p.date }));

  const byMonth = new Map();
  const touch = (date, kind, amount, sign) => {
    const pb = lookup(date);
    if (!pb) return;
    if (sign<0 && !pb.parts.some(p=>p.kind===kind && p.entry.id===saved.id)) return;
    const key = pb.month;
    const rec = byMonth.get(key) || { pb, remove:{ot:0,pa:0}, add:{ot:0,pa:0}, has:false };
    if (sign<0) rec.remove[kind] += amount; else { rec.add[kind] += amount; rec.has = true; }
    byMonth.set(key, rec);
  };
  removes.forEach(r=>touch(r.date, r.kind, r.amount, -1));
  adds.forEach(a=>touch(a.date, a.kind, a.amount, +1));

  let net = 0;
  byMonth.forEach(({ pb, remove, add, has })=>{
    if (!has) return;
    // A saved shift that's already counted in this month shows its share of
    // the month's take-home, so the shifts in a month add up to its net.
    if (!exclude) {
      const shares = partNets(pb).filter(sh=>sh.part.entry.id===e.id);
      const countedOt = shares.filter(sh=>sh.part.kind==='ot').reduce((s,sh)=>s+sh.part.amount,0);
      const countedPa = shares.filter(sh=>sh.part.kind==='pa').reduce((s,sh)=>s+sh.part.amount,0);
      if (shares.length && Math.abs(countedOt-add.ot)<0.005 && Math.abs(countedPa-add.pa)<0.005) {
        net += shares.reduce((s,sh)=>s+sh.net,0);
        return;
      }
    }
    // Otherwise (not claimed yet, or an edit being previewed): the
    // difference it would make to the month's net.
    const ot0 = Math.max(0, pb.ot - remove.ot), pa0 = Math.max(0, pb.pa - remove.pa);
    net += periodNet(pb, ot0+add.ot, pa0+add.pa) - periodNet(pb, ot0, pa0);
  });
  return net;
};
