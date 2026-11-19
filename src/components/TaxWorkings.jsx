import { fmtGBP } from '../lib/format.js';

// Full breakdown for the Tax & £100k+ calculator: every step of the sum,
// in plain English, the way payroll works it out. `v` is one side of
// taxView in App.jsx (actual = paydays so far, forecast = the full year).
const MONO = 'var(--num-font)';
const g = fmtGBP;
const pct = r => `${(r * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

const Step = ({ n, title, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: '10px', padding: '12px 0', borderTop: n > 1 ? '1px solid var(--border-2)' : 'none' }}>
    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--navy)', color: '#fff', fontWeight: 900, fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 900, fontSize: '14px', color: 'var(--ink)', marginBottom: '3px' }}>{title}</div>
      {children}
    </div>
  </div>
);
const Say = ({ children }) => <div style={{ fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.55, marginBottom: '8px' }}>{children}</div>;
const Why = ({ children }) => <div style={{ fontSize: '11.5px', color: 'var(--quiet)', lineHeight: 1.5, marginTop: '7px' }}><b style={{ color: 'var(--muted)' }}>Why?</b> {children}</div>;
// A worked sum: lines of [label, amount, sign], then a total.
const Sum = ({ lines, total, tone }) => (
  <div style={{ background: 'var(--surface-2)', borderRadius: '11px', padding: '6px 12px' }}>
    {lines.filter(Boolean).map(([label, amt, sign], i) => (
      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '5px 0', fontSize: '12.5px', color: 'var(--ink)' }}>
        <span style={{ minWidth: 0 }}><span style={{ display: 'inline-block', width: '14px', fontWeight: 900, color: 'var(--quiet)' }}>{sign || (i ? '+' : '')}</span>{label}</span>
        <span style={{ fontFamily: MONO, fontWeight: 600, whiteSpace: 'nowrap' }}>{amt}</span>
      </div>
    ))}
    {total && (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '7px 0 5px', marginTop: '2px', borderTop: '2px solid var(--ink)', fontSize: '13.5px', fontWeight: 900, color: tone || 'var(--ink)' }}>
        <span><span style={{ display: 'inline-block', width: '14px' }}>=</span>{total[0]}</span>
        <span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{total[1]}</span>
      </div>
    )}
  </div>
);

export default function TaxWorkings({ v, kind, onClose, BRASS }) {
  const ytd = kind === 'ytd';
  const m = v.months || 12;
  const b = v.breakdown;
  const basicLimit = Math.ceil(37700 * m / 12 - 1e-9), upperLimit = Math.ceil(125140 * m / 12 - 1e-9);
  const period = ytd ? `${m} payday${m === 1 ? '' : 's'} so far` : 'the whole tax year';
  const over = v.over;
  const yearTaxable = v.runRate;              // the year's taxable pay (or this year's pace)

  return (
    <div className="tax-workings" style={{ borderTop: '2px solid var(--border-2)', marginTop: '12px', paddingTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '15px', color: 'var(--ink)' }}>How your tax is worked out</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{ytd ? `Actual: your ${period}` : 'Forecast: the whole tax year, at your pace so far'}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 800, color: BRASS, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Show less</button>
      </div>

      <Step n={1} title="What you earned">
        <Say>Everything on your payslips before anything is taken off.</Say>
        <Sum lines={[
          ['Basic salary', g(v.salary)],
          v.lw > 0.005 && ['London Weighting', g(v.lw)],
          v.la > 0.005 && ['London Allowance', g(v.la)],
          // The forecast folds PA into its projected overtime, so it's one line there.
          ...(ytd ? [['Overtime', g(v.ot)], ['Protection Allowance', g(v.pa)]] : [['Overtime and Protection Allowance', g(v.ot + v.pa)]]),
        ]} total={['Total pay (gross)', g(v.gross)]}/>
      </Step>

      <Step n={2} title="Take off what isn't taxed">
        <Say>Your police pension comes off <b>before</b> tax. It's {pct(v.pensionRate)} of your pensionable pay (basic salary and London Weighting only, not overtime): {g(v.pensionable)} × {pct(v.pensionRate)} = {g(v.pension)}.{v.sacrifice > 0.005 ? ' Salary sacrifice (like Cycle2Work) comes off before tax too.' : ''}</Say>
        <Sum lines={[
          ['Total pay', g(v.gross)],
          ['Police pension', g(v.pension), '−'],
          v.sacrifice > 0.005 && ['Salary sacrifice', g(v.sacrifice), '−'],
        ]} total={['Taxable pay', g(v.taxable)]}/>
        <Why>You don't pay tax on money paid into your pension. That's why it's taken off first.</Why>
      </Step>

      <Step n={3} title="Your tax-free amount">
        <Say>{(b.code||'1257L')==='1257L'
          ? <>Everyone gets £12,570 a year tax-free. Payroll hands it out a twelfth at a time: {g(b.freePay / m)} a payday on tax code 1257L.</>
          : <>Your tax code is <b>{v.taxCode || b.code}</b> (set in More › Config), so your tax-free pay is {g(b.freePay / m)} a payday{b.freePay < 0 ? ', which adds to your taxable pay' : ''}. The standard code, 1257L, gives £1,048.25.</>}</Say>
        <Sum lines={[
          ['Taxable pay', g(v.taxable)],
          [`Tax-free: ${g(b.freePay / m)} × ${m} payday${m === 1 ? '' : 's'}`, g(b.freePay), '−'],
        ]} total={['Pay that gets taxed', g(b.taxable)]}/>
        <Why>Payroll rounds the pay that gets taxed down to the whole pound.</Why>
      </Step>

      <Step n={4} title="Tax, slice by slice">
        <Say>Your taxed pay is cut into slices and each slice has its own rate. {ytd ? `For ${m} paydays the slice sizes are ${m}/12 of the yearly ones.` : ''}</Say>
        <Sum lines={[
          [`First ${g(Math.min(b.taxable, basicLimit))} at 20% (basic rate)`, g(b.basicTax), ''],
          b.higherAmt > 0 && [`Next ${g(b.higherAmt)} at 40% (higher rate)`, g(b.higherTax)],
          b.additionalAmt > 0 && [`Everything over ${g(upperLimit)} at 45%`, g(b.additionalTax)],
        ]} total={['Income tax', g(b.totalTax)]} tone="var(--text-red-deep)"/>
        <Why>{b.higherAmt > 0 ? `Only the part above ${g(basicLimit)} is taxed at 40%, not all of it. Overtime is the top of your pay, so it's the part taxed at 40%.` : 'All of your taxed pay is in the 20% basic-rate slice.'}</Why>
      </Step>

      <Step n={5} title="The £100,000 rule">
        {over ? (
          <>
            <Say>Once taxable pay goes over £100,000 in a tax year, you lose £1 of tax-free allowance for every £2 over.{ytd ? ` At your pace so far you're heading for ${g(yearTaxable)} this year.` : ''}</Say>
            <Sum lines={[
              [ytd ? 'Taxable pay for the year, at this pace' : 'Taxable pay for the year', g(yearTaxable), ''],
              ['The £100,000 line', '£100,000.00', '−'],
            ]} total={['Over the line by', g(yearTaxable - 100000)]}/>
            <div style={{ height: '8px' }}/>
            <Sum lines={[
              [`Allowance lost: ${g(yearTaxable - 100000)} ÷ 2${12570 - v.allowanceLeft >= 12570 ? ' (all £12,570 of it)' : ''}`, g(12570 - v.allowanceLeft), ''],
              ytd && [`Your share of it so far (${m} of 12 paydays)`, g(v.allowanceLostSoFar), '→'],
            ]} total={['Extra tax from losing it', g(v.extraTax)]} tone="var(--text-red-deep)"/>
            <Why>The lost allowance is taxed at 40% (45% for any of it pushed over £125,140). Payroll keeps giving you the full tax-free amount during the year, so this extra tax isn't on your payslips. It usually arrives later as a tax code change or a Self Assessment bill. Between £100,000 and £125,140 every extra £1 costs about 60p in tax.</Why>
          </>
        ) : (
          <>
            <Say>Go over £100,000 of taxable pay in a tax year and you start losing your tax-free allowance. You're under it, so you keep all of yours.</Say>
            <Sum lines={[
              ['The £100,000 line', '£100,000.00', ''],
              [ytd ? 'Taxable pay for the year, at this pace' : 'Taxable pay for the year', g(yearTaxable), '−'],
            ]} total={['Room before you hit it', g(100000 - yearTaxable)]} tone="var(--text-green-deep)"/>
          </>
        )}
      </Step>

      <Step n={6} title="National Insurance">
        <Say>NI is worked out on each month's pay on its own (after salary sacrifice), not on the year. Each month: nothing on the first £1,048, 8% on the part between £1,048 and £4,189, and 2% on anything above that.</Say>
        <Sum lines={[
          ['8% on the £1,048–£4,189 part of each month', g(v.niMain), ''],
          ['2% on the part above £4,189 each month', g(v.niUpper)],
        ]} total={['National Insurance', g(v.niMain + v.niUpper)]} tone="var(--text-red-deep)"/>
        <Why>NI doesn't build up over the year like tax does, so there's never any catching up to do later.</Why>
      </Step>

      <Step n={7} title="What reaches your bank">
        <Sum lines={[
          ['Total pay', g(v.gross), ''],
          ['Police pension', g(v.pension), '−'],
          v.sacrifice > 0.005 && ['Salary sacrifice', g(v.sacrifice), '−'],
          ['Income tax', g(b.totalTax), '−'],
          ['National Insurance', g(v.niMain + v.niUpper), '−'],
        ]} total={['Net pay (the payslip figure)', g(v.net)]}/>
        {v.other > 0.005 && (
          <>
            <div style={{ height: '8px' }}/>
            <Sum lines={[
              ['Net pay', g(v.net), ''],
              ['Your monthly deductions (Federation, ATOC…)', g(v.other), '−'],
            ]} total={['Take-home', g(v.net - v.other)]} tone="var(--text-green-deep)"/>
          </>
        )}
        {over && <Why>Keep {g(v.extraTax)} aside for the extra tax from the £100,000 rule (step 5): it isn't taken off here.</Why>}
      </Step>

      <div style={{ fontSize: '10.5px', color: 'var(--quiet)', lineHeight: 1.5, marginTop: '4px' }}>{ytd ? 'Your payslips so far this tax year, worked out the way payroll does.' : 'All twelve payslips: salary as known, overtime and PA at your pace so far.'} For guidance only. Check against your payslip.</div>
    </div>
  );
}
