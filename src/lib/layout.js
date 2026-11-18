// Which layout fits a screen of w x h CSS pixels.
// isWide: the computer layout (sidebar, wide cards). 960+ wide always; a
//   screen on its side from 900 wide; and unfolded foldables on their side
//   (830 x 750, or about 845 x 595 on a folding iPhone once its status bar
//   and home bar are taken off), from 720 wide when at least 540 tall. Ordinary
//   phones on their side are far too short (about 390-430) to match.
// tabletP: unfolded foldables held upright (Z Fold about 720-760 wide, a
//   folding iPhone 669; ordinary phones upright are 440 at most) keep the
//   phone shell and bottom bar with a wider column.
export function layoutFor(w, h) {
  const isWide = w >= 960 || (w > h && w >= 900) || (w > h && w >= 720 && h >= 540);
  return { isWide, tabletP: !isWide && w >= 600 };
}

// The size to lay out for. documentElement.client* is what CSS lays out
// against and isn't changed by pinch zoom; innerWidth is the fallback.
// Straight after turning or unfolding, iPhones can report one side of the
// old size (an upright height on a screen now on its side), so the size
// is checked against the device's own orientation, and if the two
// disagree the screen's size is used instead, the right way round.
export function screenSize() {
  const d = document.documentElement;
  const w = d?.clientWidth || window.innerWidth, h = d?.clientHeight || window.innerHeight;
  const type = window.screen?.orientation?.type;
  const landscape = type ? type.startsWith('landscape') : window.matchMedia?.('(orientation: landscape)').matches;
  return fixStaleSize(w, h, landscape, window.screen?.width, window.screen?.height);
}

export function fixStaleSize(w, h, landscape, sw, sh) {
  if (landscape == null || !sw || !sh) return { w, h };
  if (landscape ? w > h : w <= h) return { w, h };
  // Only where the app fills the screen (an installed phone app), so both
  // sides it reports are sides of the screen. A narrow browser window on a
  // computer, or a split screen, keeps its own size.
  const near = (a, b) => Math.abs(a - b) <= 4;
  const isSide = x => near(x, sw) || near(x, sh);
  if (!isSide(w) || !isSide(h)) return { w, h };
  const long = Math.max(sw, sh), short = Math.min(sw, sh);
  return landscape ? { w: long, h: short } : { w: short, h: long };
}
