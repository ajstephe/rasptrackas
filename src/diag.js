// TEST BUILD ONLY (branch diag/duo-screen): shows what size screen iOS gives
// the app and the safe-area insets it reports, to see whether the app can
// draw under the iPhone Duo's side status column. Never merge this.
function start() {
  // Pink behind everything: if the side strip turns pink, the app's page
  // already reaches under it.
  document.documentElement.style.background = '#ff00c8';
  document.body.style.background = '#ff00c8';

  // A probe that turns each env() inset into a measurable size.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
  document.body.appendChild(probe);

  // Outline of the full width the page thinks it has.
  const frame = document.createElement('div');
  frame.style.cssText = 'position:fixed;inset:0;border:3px dashed #ff00c8;pointer-events:none;z-index:2147483646;box-sizing:border-box;';
  document.body.appendChild(frame);

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;' +
    'background:rgba(0,0,0,0.85);color:#fff;font:600 13px/1.45 ui-monospace,Menlo,monospace;padding:10px 12px;' +
    'border-radius:10px;white-space:pre;pointer-events:auto;max-width:92vw;overflow:auto;';
  box.title = 'Tap to hide for 5 seconds';
  box.addEventListener('click', () => { box.style.display = 'none'; setTimeout(() => { box.style.display = ''; }, 5000); });
  document.body.appendChild(box);

  const px = v => Math.round(parseFloat(v) || 0);
  const draw = () => {
    const cs = getComputedStyle(probe), d = document.documentElement, vv = window.visualViewport;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    box.textContent = [
      'SCREEN TEST BUILD',
      `opened as:   ${standalone ? 'home-screen app' : 'Safari tab'}`,
      `orientation: ${window.screen?.orientation?.type || (matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait')}`,
      `page width:  ${d.clientWidth} x ${d.clientHeight}`,
      `window:      ${innerWidth} x ${innerHeight}`,
      `visual:      ${vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)}` : '-'}`,
      `screen:      ${screen.width} x ${screen.height} @${window.devicePixelRatio}x`,
      `insets  top ${px(cs.paddingTop)}  right ${px(cs.paddingRight)}`,
      `     bottom ${px(cs.paddingBottom)}  left ${px(cs.paddingLeft)}`,
      '',
      'Pink edge = where the page ends.',
      'Tap this box to hide it for 5s.',
    ].join('\n');
  };
  draw();
  window.addEventListener('resize', draw);
  window.addEventListener('orientationchange', () => setTimeout(draw, 300));
  window.visualViewport?.addEventListener('resize', draw);
  setInterval(draw, 2000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
