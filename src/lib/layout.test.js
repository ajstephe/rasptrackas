import { describe, it, expect } from 'vitest';
import { layoutFor, fixStaleSize } from './layout.js';

describe('layoutFor', () => {
  it('phones use the phone layout both ways up', () => {
    expect(layoutFor(390, 844)).toEqual({ isWide: false, tabletP: false });
    expect(layoutFor(844, 390)).toEqual({ isWide: false, tabletP: true }); // on its side: phone shell, wider column
    expect(layoutFor(932, 430)).toEqual({ isWide: true, tabletP: false }); // big phone on its side: 900+ wide
  });
  it('unfolded foldables: upright keeps the phone shell, on their side goes desktop', () => {
    expect(layoutFor(740, 830)).toEqual({ isWide: false, tabletP: true });
    expect(layoutFor(830, 750)).toEqual({ isWide: true, tabletP: false });
  });
  it('computers and tablets on their side go desktop', () => {
    expect(layoutFor(1440, 900).isWide).toBe(true);
    expect(layoutFor(1024, 768).isWide).toBe(true);
    expect(layoutFor(768, 1024)).toEqual({ isWide: false, tabletP: true });
  });
});

describe('fixStaleSize', () => {
  it('keeps a size that matches the orientation', () => {
    expect(fixStaleSize(830, 750, true, 750, 830)).toEqual({ w: 830, h: 750 });
    expect(fixStaleSize(740, 830, false, 740, 830)).toEqual({ w: 740, h: 830 });
  });
  it('turned on its side but still reporting the upright height: uses the screen', () => {
    const s = fixStaleSize(830, 830, true, 750, 830);
    expect(s).toEqual({ w: 830, h: 750 });
    expect(layoutFor(s.w, s.h).isWide).toBe(true);
  });
  it('turned upright but still reporting the side-on size: uses the screen', () => {
    expect(fixStaleSize(830, 750, false, 750, 830)).toEqual({ w: 750, h: 830 });
  });
  it('a narrow window on a computer keeps its own size', () => {
    expect(fixStaleSize(700, 1000, true, 1920, 1080)).toEqual({ w: 700, h: 1000 });
  });
  it('leaves things alone without orientation or screen info', () => {
    expect(fixStaleSize(830, 830, null, 750, 830)).toEqual({ w: 830, h: 830 });
  });
});

describe('folding iPhone', () => {
  it('unfolded upright (669 x 869) keeps the phone layout', () => {
    expect(layoutFor(669, 869).isWide).toBe(false);
  });
  it('unfolded on its side (about 845 x 595) goes desktop', () => {
    expect(layoutFor(845, 595).isWide).toBe(true);
    expect(layoutFor(869, 560).isWide).toBe(true);
    expect(layoutFor(867, 587).isWide).toBe(true); // measured on the device
  });
  it('ordinary phones on their side still stay phone', () => {
    expect(layoutFor(844, 390).isWide).toBe(false);
    expect(layoutFor(852, 393).isWide).toBe(false);
  });
});
