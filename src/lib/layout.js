// Which layout fits a screen of w x h CSS pixels.
// isWide: the computer layout (sidebar, wide cards). 960+ wide always; a
//   screen on its side from 900 wide; and unfolded foldables on their side
//   (roughly 830 x 750), from 720 wide when at least 600 tall. Ordinary
//   phones on their side are far too short (about 390-430) to match.
// tabletP: unfolded foldables held upright (about 720-760 wide) keep the
//   phone shell and bottom bar with a wider column.
export function layoutFor(w, h) {
  const isWide = w >= 960 || (w > h && w >= 900) || (w > h && w >= 720 && h >= 600);
  return { isWide, tabletP: !isWide && w >= 700 };
}

// The layout viewport's size. documentElement.client* is what CSS lays out
// against and isn't changed by pinch zoom; innerWidth is the fallback.
export function screenSize() {
  const d = document.documentElement;
  return { w: d?.clientWidth || window.innerWidth, h: d?.clientHeight || window.innerHeight };
}
