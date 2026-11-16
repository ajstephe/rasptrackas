import { describe, it, expect } from 'vitest';
import { layoutFor } from './layout.js';

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
