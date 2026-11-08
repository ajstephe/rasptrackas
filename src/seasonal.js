// Seasonal themes: only offered (and only kept) inside their window.
// Windows are [startMonth, startDay, endMonth, endDay], inclusive, months
// 1-12; a window whose end is before its start wraps over New Year.
export const SEASONAL_THEMES = {
  pumpkin: [9, 1, 11, 30],   // Pumpkin Spice: 1 Sep – 30 Nov
  festive: [12, 1, 1, 6],    // Festive: 1 Dec – 6 Jan (Twelfth Night)
};

export function themeInSeason(id, date = new Date()) {
  const w = SEASONAL_THEMES[id];
  if (!w) return true;
  const [sm, sd, em, ed] = w;
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const start = sm * 100 + sd, end = em * 100 + ed;
  return start <= end ? (md >= start && md <= end) : (md >= start || md <= end);
}
