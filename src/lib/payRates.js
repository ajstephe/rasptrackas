import { RATE_CHANGE_DATE } from './payPeriods.js';

// ─── pay rates ────────────────────────────────────────────────────────────────
// Pre-Sept salaries are post ÷ 1.035 (3.5% pay rise from 1 Sep 2026).
// PC 1-3 pre-Sept use their own back-calculated figures (not Year 3 mapping).
export const PAY_RATES = {
  Constable: {
    'PC 1': {
      salary: { pre:31159, post:32255 },
      pre:    { base:14.95, r133:19.88, r150:22.43, r200:29.89 },
      post:   { base:15.47, r133:20.58, r150:23.21, r200:30.94 },
    },
    'PC 2': {
      salary: { pre:32470, post:33609 },
      pre:    { base:15.57, r133:20.72, r150:23.36, r200:31.15 },
      post:   { base:16.12, r133:21.44, r150:24.18, r200:32.24 },
    },
    'PC 3': {
      salary: { pre:33786, post:34972 },
      pre:    { base:16.20, r133:21.55, r150:24.31, r200:32.41 },
      post:   { base:16.77, r133:22.30, r150:25.16, r200:33.54 },
    },
    'PC 4': {
      salary: { pre:35104, post:36335 },
      pre:    { base:16.86, r133:22.43, r150:25.24, r200:33.65 },
      post:   { base:17.42, r133:23.17, r150:26.13, r200:34.84 },
    },
    'PC 5': {
      salary: { pre:37737, post:39058 },
      pre:    { base:18.13, r133:24.11, r150:27.13, r200:36.17 },
      post:   { base:18.73, r133:24.91, r150:28.10, r200:37.46 },
    },
    'PC 6': {
      salary: { pre:43036, post:44544 },
      pre:    { base:20.68, r133:27.50, r150:30.94, r200:41.25 },
      post:   { base:21.36, r133:28.41, r150:32.04, r200:42.72 },
    },
    'PC 7 (top)': {
      salary: { pre:50255, post:52015 },
      pre:    { base:24.14, r133:32.11, r150:36.13, r200:48.17 },
      post:   { base:24.94, r133:33.17, r150:37.41, r200:49.88 },
    },
  },
  Sergeant: {
    'SGT 2 (on promotion)': {
      salary: { pre:53567, post:55443 },
      pre:    { base:25.73, r133:34.23, r150:38.51, r200:51.34 },
      post:   { base:26.59, r133:35.36, r150:39.89, r200:53.18 },
    },
    'SGT 3': {
      salary: { pre:54659, post:56573 },
      pre:    { base:26.26, r133:34.93, r150:39.29, r200:52.39 },
      post:   { base:27.13, r133:36.08, r150:40.70, r200:54.26 },
    },
    'SGT 4 (top)': {
      salary: { pre:56206, post:58175 },
      pre:    { base:27.01, r133:35.92, r150:40.40, r200:53.87 },
      post:   { base:27.90, r133:37.11, r150:41.85, r200:55.80 },
    },
  },
};

export const PA_RATES   = { None:0, PA1:40, PA2:90, PA3:125 };
export const PA_LABELS  = { None:'—', PA1:'£40', PA2:'£90', PA3:'£125' };

// Which of the three overtime rate tiers a given field name/key maps to —
// used to convert TOIL hours (worked) into TOIL hours (banked).
export const RATE_TIER_MULT = { hours133:1.33, hours150:1.5, hours200:2.0 };

// ─── rate helper ──────────────────────────────────────────────────────────────
// Returns the correct rate set for a given pay point and entry date.
export const getRates = (rank, service, date) => {
  const empty = { base:0, r133:0, r150:0, r200:0 };
  if (!rank || !service || !date) return empty;
  const grp = PAY_RATES[rank];
  if (!grp) return empty;
  const svc = grp[service];
  if (!svc) return empty;
  return date >= RATE_CHANGE_DATE ? svc.post : svc.pre;
};
