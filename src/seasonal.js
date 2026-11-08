// Seasonal themes: only offered (and only kept) inside their window.
// Windows are [startMonth, startDay, endMonth, endDay], inclusive, months
// 1-12; a window whose end is before its start wraps over New Year.
export const SEASONAL_THEMES = {
  festive: [11, 30, 12, 31], // Festive: 30 Nov – 31 Dec, gone on New Year's Day
};

export function themeInSeason(id, date = new Date()) {
  const w = SEASONAL_THEMES[id];
  if (!w) return true;
  const [sm, sd, em, ed] = w;
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const start = sm * 100 + sd, end = em * 100 + ed;
  return start <= end ? (md >= start && md <= end) : (md >= start || md <= end);
}

// The year a season "belongs" to, so its one-off announcement can show
// once per season (a window that wraps New Year counts as the year it
// started in).
export function seasonKey(id, date = new Date()) {
  const w = SEASONAL_THEMES[id];
  if (!w) return '';
  const wraps = w[2] * 100 + w[3] < w[0] * 100 + w[1];
  const y = date.getFullYear() - (wraps && date.getMonth() + 1 <= w[2] ? 1 : 0);
  return `${id}-${y}`;
}

// Remember what someone was using before they picked a seasonal theme, so
// it can be put back when the season ends.
const PREV_KEY = 'ajs_ot_themeBeforeSeasonal';
export const rememberPreSeasonTheme = v => { try { localStorage.setItem(PREV_KEY, v); } catch {} };
export const preSeasonTheme = () => { try { return localStorage.getItem(PREV_KEY); } catch { return null; } };

const NOTICE_KEY = 'ajs_ot_seasonNoticeSeen';
export const seasonNoticeSeen = key => { try { return localStorage.getItem(NOTICE_KEY) === key; } catch { return true; } };
export const markSeasonNoticeSeen = key => { try { localStorage.setItem(NOTICE_KEY, key); } catch {} };
