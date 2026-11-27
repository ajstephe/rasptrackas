const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + __dirname + '/guide.html'); await p.waitForTimeout(800);
  await p.evaluate(() => document.fonts.ready);
  // report any page whose content spills past the footer
  console.log(await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => {
    const foot = pg.querySelector('.foot'); const limit = foot ? foot.getBoundingClientRect().top : pg.getBoundingClientRect().bottom;
    const kids = [...pg.querySelectorAll('p,li,table,img,h2,.tip,.toc')].filter(e=>!e.closest('.foot')&&!e.closest('.install')&&!e.closest('.cover .phone'));
    const bottom = Math.max(...kids.map(e => e.getBoundingClientRect().bottom));
    return `p${i+1}: ${Math.round(limit - bottom)}px spare`;
  }).join('  ')));
  await p.pdf({ path: __dirname + '/Overtime-Shift-Tracker-User-Guide.pdf', preferCSSPageSize: true, printBackground: true });
  // The copy the app links to (More › User guide), served at /user-guide.pdf.
  require('fs').copyFileSync(__dirname + '/Overtime-Shift-Tracker-User-Guide.pdf', __dirname + '/../../public/user-guide.pdf');
  await b.close();
})();
