// Desktop screenshots for the user guide (made-up data from seed.cjs).
// Needs a local preview on :4332 (see README).
const { chromium } = require('playwright'); const seed = require('./seed.cjs');
const out = __dirname + '/shots/desktop';
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{ width:1440, height:900 }, deviceScaleFactor:1.5 });
  const p = await ctx.newPage();
  await p.addInitScript(`(${seed.toString()})('light')`);
  await p.goto('http://localhost:4332/'); await p.waitForTimeout(1800);
  const side = name => p.locator('.sidebar-nav-btn', { hasText: name }).first().click().then(()=>p.waitForTimeout(900));
  const shot = n => p.screenshot({ path:`${out}/${n}.png` });
  await shot('home');
  await p.evaluate(()=>document.querySelector('main')?.scrollBy(0,250)); await p.waitForTimeout(400); await shot('home-overview');
  await side('Log Overtime'); await shot('log');
  await side('Summary'); await p.getByText('Aug',{exact:true}).first().click(); await p.waitForTimeout(700); await shot('summary');
  await side('Awaits'); await shot('awaits');
  await side('TOIL'); await shot('toil');
  await side('More'); await shot('more');
  await p.getByText('Monthly deductions',{exact:true}).first().click(); await p.waitForTimeout(900); await shot('deductions');
  await p.getByText('Tax & £100k calculator').first().click(); await p.waitForTimeout(900); await shot('taxcalc');
  await p.getByText('Reports & export').first().click(); await p.waitForTimeout(700);
  await p.getByText('Export to PDF or spreadsheet').first().click(); await p.waitForTimeout(700);
  await p.getByText('PDF',{exact:true}).first().click(); await p.waitForTimeout(400); await p.getByText('Tax year',{exact:true}).first().click(); await p.waitForTimeout(400); await shot('export');
  await p.getByRole('button',{name:/Create PDF/}).last().click(); await p.waitForTimeout(1500); await shot('statement');
  await b.close();
  const b2 = await chromium.launch(); const q = await (await b2.newContext({ viewport:{ width:1440, height:900 }, deviceScaleFactor:1.5 })).newPage();
  await q.addInitScript(()=>localStorage.setItem('ajs_ot_themeMode', JSON.stringify('light')));
  await q.goto('http://localhost:4332/'); await q.waitForTimeout(1500);
  await q.locator('#setup-rank-home').click(); await q.waitForTimeout(300); await q.getByRole('option',{name:'Constable'}).first().click(); await q.waitForTimeout(300);
  await q.locator('#setup-pp-home').click(); await q.waitForTimeout(300); await q.getByRole('option',{name:'PC 4',exact:true}).first().click(); await q.waitForTimeout(900);
  await q.getByText('+ ATOC').click(); await q.getByLabel('ATOC monthly amount').fill('41.67'); await q.getByText('+ Cycle2Work').click(); await q.getByLabel('Cycle2Work monthly amount').fill('50'); await q.waitForTimeout(300);
  await q.screenshot({ path:`${out}/setup.png` });
  await b2.close();
})().catch(e=>{ console.error(e.message); process.exit(1); });
