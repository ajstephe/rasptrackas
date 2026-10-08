# Overtime & Shift Tracker — Full Recreation Guide

**Purpose:** if all memory of this project were lost, or it was handed to someone new, this file plus the code in this repo should be enough to understand it, rebuild it and keep it running: same calculations, same cloud sync and sign-in, deployed the same way.

**The code is the source of truth.** This guide explains *why* things are built the way they are, covers what lives outside the code (Supabase, Vercel), and flags deliberate decisions so nobody "fixes" them by accident. If this guide and the code ever disagree, the code is right — then update this guide.

*Last updated: October 2026.*

---

## 1. What this is

A React web app (installable as a PWA) that lets a Metropolitan Police (RaSP) officer log overtime, Protection Allowance (PA) and TOIL, keep track of what still needs submitting on **CARMS** (overtime) and **PSOP** (PA), and see what they'll actually take home. It runs in the browser, stores everything on the device, and — once signed in — syncs end-to-end encrypted to Supabase so the same records appear on every device. It's hosted on Vercel and deploys from GitHub.

**Computer first, phone second.** The computer layout (sidebar, wide tables) is the main way to use it. The phone layout (bottom tabs, one column) is for quick jobs on the go. Both are first-class, but design decisions favour the computer.

**The one rule everything hangs on:** the app can't see CARMS or PSOP. A claim only counts towards pay once the person **marks it submitted** and picks the date they submitted it. That date decides which pay month the money lands in.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18, function components and hooks only, no state library |
| Build | Vite 5 (`import.meta.env` for environment variables) |
| Language | Plain JavaScript + JSX, no TypeScript |
| Styling | Inline `style={{…}}` objects plus one global `<style>` block in `App.jsx`. Colours come from CSS variables set per theme (see §9). No CSS framework. |
| Offline / install | `vite-plugin-pwa` (service worker precaches the app shell; `registerType:'prompt'` so an update never swaps the app out mid-entry — a toast asks first). `public/manifest.json` and icons are hand-written. |
| Backend | Supabase: Postgres + Auth + Realtime + one Edge Function (`delete-account`) |
| Hosting | Vercel, auto-deploying `main` from GitHub |
| npm dependencies | `react`, `react-dom`, `@supabase/supabase-js`, `exceljs` (loaded with a dynamic `import()` only when someone exports a spreadsheet) |
| Dev dependencies | `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `vitest` |
| PDF output | No PDF library. Payslip and year-summary previews use print CSS and `window.print()`; the browser's "Save as PDF" does the rest. |

---

## 3. Project layout

```
src/
  main.jsx                 entry: <ErrorBoundary><App/></ErrorBoundary> in StrictMode
  App.jsx                  app shell: auth, crypto, sync, state, totals, exports, navigation, global CSS
  ErrorBoundary.jsx        crash screen instead of a blank page
  components/
    TabDashboard.jsx       Home
    TabLogOvertime.jsx     Log Overtime (also used for Edit)
    TabSummary.jsx         Summary: Calendar / Shifts / Months
    TabCarms.jsx           Awaits Submission
    TabToil.jsx            TOIL
    TabSettings.jsx        More.. (config, tax, archive, exports, account, help, privacy)
    SetupCard.jsx          first-run rank / pay point picker (Home, Log)
    MonthlyChart.jsx       Home's monthly overtime & PA chart
    PrivacyNotice.jsx      the privacy notice text
    SegSlider, TimeSelect, Tooltip, ToastStack, Icons
  lib/                     plain, unit-tested logic — no React unless named use*
    payPeriods.js          pay calendar (4-5-4 weeks), tax-year helpers, cloud retention cutoff
    payRates.js            pay scales by rank/pay point, before/after the 1 Sept 2026 award; PA rates
    calc.js                one shift's figures; submitted checks; effective (submitted) dates
    payroll.js             pay-month engine: base pay + overtime + PA → PAYE, NI, pension, net
    tax.js                 HMRC monthly PAYE (1257L), NI, pension tiers, £100k taper
    deadline.js            submitWindow(date): deadline, pay month, payday, "after that" month
    carms.js               Awaits selection helpers
    shiftTimes.js          rostered vs worked → overtime hours
    sync.js                merge/diff rules for cloud sync
    storage.js             localStorage wrapper (dualWrite/dualRead) and key names
    migrations.js          old-shape → current-shape for settings, shifts, backups
    legal.js               privacy notice version and consent hand-off
    format.js, ids.js, haptics.js, spring.js
    useCountUp, useAnimatedPoints, useBackButtonCloses, useEscapeToClose, useFocusTrap, useMountTransition
    hmrcPayeReference.js   independent PAYE reference used only by tests
    *.test.js              unit tests (vitest)
supabase/
  migrations/              05-schema-baseline.sql rebuilds everything; 06 adds privacy consent columns
  functions/delete-account Edge Function source
public/                    manifest, icons, iOS splash screens
docs/                      this guide, GDPR documents
```

---

## 4. Recreating the project from nothing

### 4.1 Supabase

1. Create a project. Note the **Project URL** and the **anon/public key**.
2. **Database:** run `supabase/migrations/05-schema-baseline.sql`, then `06-add-privacy-consent.sql`. 05 is safe to re-run and creates everything: the four tables, row-level security (each user can only touch their own rows), the `user_id` indexes, `replica identity full`, and the Realtime publication. 03 and 04 are historical and not needed on a fresh project.

   | Table | Holds |
   |---|---|
   | `entries` | one row per shift: `id` (text), `user_id`, `ciphertext`, `updated_at`, `deleted_at` (soft delete) |
   | `toil_taken` | one row per TOIL-taken record, same shape |
   | `settings` | one row per user: encrypted settings (rank, pay point, etc.) |
   | `user_keys` | the data key wrapped twice (password and recovery word), salts, iteration counts, privacy version and acceptance time |

   Only ciphertext is stored — Supabase never sees shift details.
3. **Auth → Providers:** Email on, with "Confirm email" on.
4. **Auth → URL Configuration:**
   - Site URL: the production URL (`https://rasptrackas.vercel.app`).
   - Redirect URLs: add `https://rasptrackas.vercel.app/**`.

   Sign-up and resend pass `emailRedirectTo: <origin>/?confirmed=1`. The app reads that on load and shows a green "Email confirmed" banner, or an amber "That link has expired" banner if Supabase returns an error code. Without these two settings, the email link lands on Supabase's default (localhost) and fails.
5. **Edge Function:** deploy `supabase/functions/delete-account` (`supabase functions deploy delete-account`). It reads the caller's JWT, uses the service-role key (only available server-side) and deletes that user. The `on delete cascade` foreign keys remove all their rows.

### 4.2 Environment variables

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon/public key |

Set them in Vercel (Production, Preview, Development) and in `.env.local` for local work. If they're missing, the app runs in local-only mode (no sign-in, data stays on the device) rather than crashing.

### 4.3 Vercel

Import the GitHub repo. Vercel detects Vite (`npm run build`, output `dist`). Add the two variables. Every push to `main` deploys to production; every other branch gets a preview URL.

### 4.4 Local development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (vitest)
npm run build      # production build into dist/
```

### 4.5 Check it end to end

1. Open the site: you should see the sign-in screen.
2. Create an account, tick the privacy notice, confirm the email (expect the "Email confirmed" banner), sign in, and set a recovery word.
3. Set rank and pay point on the welcome card.
4. Log a shift, sign in on a second browser, and check that it appears. That exercises push → Realtime → pull.

---

## 5. Domain rules (the parts that are deliberate)

**Pay calendar.** The year has 12 pay months of **4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4 weeks** (52 weeks). Each pay month covers a block of shifts and is paid on the **20th**. The anchor is `FY_ANCHOR_START = '2026-02-09'`, the start of April pay 2026; other years are generated from it. A pay month's name rarely matches the calendar month of its shifts (November pay = shifts 7 Sept – 11 Oct 2026), so always look the dates up and never assume them from the label.

**Deadline.** The end of a pay month's shift block is its submission deadline. Submitted by then, the claim is paid that month. After it, the claim moves to whichever pay month's deadline the submission date does meet. `deadline.js → submitWindow(date)` is the one place this is worked out. It handles dates in any pay year.

**Money follows the submitted date, not the worked date.** Overtime goes by `otSubmittedDate`, PA by `paSubmittedDate` (`effectiveOtDate` / `effectivePaDate`). Overtime and PA are tracked separately on the same shift, because CARMS and PSOP are separate systems.

**Not counted until marked submitted.** Unsubmitted overtime and PA are left out of gross and net figures. They show as red "to submit" totals instead. TOIL earned on a shift only joins the balance once that shift is submitted.

**Planned shifts.** A shift dated in the future is "planned". It shows separately (blue, dashed) and joins Awaits Submission once the day has passed.

**Hours are factual.** Hours worked are counted in the pay month the shift was worked, whatever its submission status. That's deliberately different from the money rule.

**One shift per date.** Logging a second shift on the same date is blocked, with a prompt to edit the existing one. This is a decision the owner made, not a gap.

**Year rollover.** Unsubmitted claims from an earlier year are never filed away. They stay in Awaits Submission, grouped under their original pay month, with a "Deadline was … · submitted now, paid in …" note. Once submitted they land in the new year's pay month. In a new year with nothing logged yet, Summary › Months says how many claims are still to submit instead of "No overtime yet".

**Tax year by payday.** "Gross pay this tax year" counts pay months whose **payday** falls in the UK tax year (6 April – 5 April), the way payroll does. For a few weeks around February to April the current pay month can belong to the next tax year.

**Pay and tax.**
- **Pay scales:** pay scales and the pay award date (`RATE_CHANGE_DATE = '2026-09-01'`) are in `payRates.js`. A pay point change can take effect from a chosen date.
- **PA:** PA1 £48, PA2 £98, PA3 £133.
- **London pay:** London Weighting is £3,150 before and £3,260 after the award; London Allowance is £6,588.
- **PAYE:** PAYE is worked out month by month on tax code 1257L, with NI on each month's pay and tiered pension.
- **£100k taper:** above £100k, payroll keeps giving the full tax-free allowance; the Tax calculator shows the extra tax likely to be collected later.
- **Accuracy:** `payroll.hmrc.test.js` checks the engine against an independent reference to the penny.

**Cloud retention.** The cloud keeps this year and the last 3; the device keeps everything. Older rows are pruned from the cloud only. Their absence there is never treated as a deletion.

---

## 6. Sign-in and encryption

- **Data key (DEK):** one random AES-256-GCM key per user, made at sign-up. It encrypts every shift, TOIL record and the settings. It only ever exists in memory on the device.
- **Wrapped twice**, and both copies are stored in `user_keys`:
  - by a key derived from the **password**, PBKDF2-SHA-256 with 210,000 iterations (`PASSWORD_KDF_ITERATIONS`, used at every sign-in)
  - by a key derived from a separate **recovery word**, 600,000 iterations (`RECOVERY_KDF_ITERATIONS`, used rarely)

  Either secret unlocks the same data.
- **Sign-up:** this runs `signUp`. With email confirmation on, key setup, the recovery word and recording consent wait until the first sign-in after confirming, because there's no session to write with before that (`handleRecoverySetup`). Consent is stashed locally at the moment of ticking (`legal.js`) and written then.
- **Sign-in:** `signInWithPassword`, fetch `user_keys`, then unwrap the DEK. Failing to unwrap after Auth accepted the password means a damaged key row, not a wrong password.
- **Recovery:** the recovery word unwraps the DEK directly, then the data key is re-wrapped under a new password.
- **Payload format:** each row is AES-GCM with a fresh IV, stored as one base64 blob (IV + ciphertext).
- **Account deletion vs Wipe all data:** these are different on purpose.
  - Wipe all data clears shifts, TOIL, rank and pay point (local and cloud) but keeps the account.
  - Delete account calls the Edge Function and removes the account and every row.

---

## 7. Storage and sync

- **Local first.** All state lives in `localStorage` via `dualWrite` / `dualRead` (`storage.js`). Each value is wrapped as `{__v, __t, __seq}` so the newest write wins reliably, even between tabs. Key names are in `KEYS` (prefix `ajs_ot_`).
- **Push.** Each change is diffed against a "last synced" snapshot per row (kept in `localStorage`, so it survives reloads). Only changed rows are sent (`computeRowPushDiff`). Pushes per row are chained so they can't overtake each other.
- **Pull and merge** (`mergeRemoteRows`, `hasNoPendingLocalEdit`) run on unlock and on reconnect. Take the server's copy unless there's an unsynced local edit on that row. Settings also compare `updated_at`, so a late echo of an older write can't undo a newer one (`isStaleSettingsUpdate`).
- **Realtime.** One channel per user (`'sync-' + uid`) listens to `entries`, `toil_taken` and `settings`, so other open devices update live.
- **Visible state.** The Sync button shows "Synced N minutes ago". Failed pushes are listed rather than silently dropped. Sign-out warns if anything hasn't synced yet.
- **Backups.** More.. › Account & data › Backup saves a JSON file; Restore shows what's in it, with the numbers, before replacing anything, and offers Undo. Restored files go through `parseBackupFile` / `migrateEntries`. A monthly reminder nudges people to back up.

---

## 8. Screens

**Navigation.** On a computer, a sidebar shows today's date, Home, Log Overtime, Summary, Awaits Submission (with a red count), TOIL and More.., with Theme at the bottom. On a phone the same tabs run along the bottom (Awaits is shortened). On a computer the top bar always shows the current pay month's gross and net, plus a red "to submit" chip that opens Awaits Submission.

**First run.** A welcome card on Home and Log asks for rank and pay point. More.. › Config shows the same pickers inline. After the pay point is picked, the card stays open for about a second so the rates visibly appear, then it collapses.

**Home:**
- **Top of the screen:**
  - Gross pay this tax year, with a "to submit · Review" button.
  - The current pay month and its shift block.
  - Net overtime this month, compared with last month, with planned shifts shown separately.
  - TOIL balance.
  - Overtime & PA to submit, with the next deadline.
- **Salary breakdown & forecast:**
  - Base pay, allowances, overtime, PA, and "Submitted, not paid yet".
  - Actual and forecast gross on bars marked at £100k and £125,140.
  - A monthly gross/net chart; click a point for that month.

**Log Overtime** (also used for Edit) has numbered steps:
1. When and what.
2. Your hours: either *Shift time input* (rostered vs actually worked; overtime worked out automatically; quick rostered presets; Normal duty or Rest day (RDW) — on RDW the whole shift counts) or *Enter hours* by rate.
3. How it's paid: rate 1.33× / 1.5× / 2×, take it as Pay / TOIL / Mix, and PA.
4. Claim submitted yet? Separate CARMS and PSOP cards, red until submitted, each with **Submit overtime** / **Submit PA**.
5. Notes.

A sticky bar shows gross and net live, with **Save shift**. Leaving with unsaved edits asks first.

**Summary:**
- **Views:** Calendar · Shifts · Months, with one view saved as the default.
- **Month pills:** pick a pay month directly; months with something still to submit are outlined.
- **Calendar:** one pay month. Click a day to see, edit, submit or delete its shifts, or log one. Red means something is still to submit, green means it's all submitted, and blue dashed means planned.
- **Shifts:** every shift in the pay month, with Edit, Delete and Submit buttons.
- **Months:** tax-year totals, then each pay month **newest first**, with gross, net and status. Click a month to open it. Submit buttons are red.

**Awaits Submission:**
- **Header:** a navy header shows the total to submit (overtime / PA split), the next deadline and the pay month it's paid in.
- **Filters and sorting:** All · Overtime · PA · TOIL; the default sort is **oldest first**.
- **Grouping:** claims are grouped by pay month.
- **Submitting:** each row has **Submit overtime / Submit PA[n]**, or tick several and use **Submit N claims**. Either way a calendar pops up for the date submitted; future dates are disabled, and there's an Undo toast.
- **Layout:** a table on a computer. On a phone each claim is a card, and shift names wrap to up to three lines.

**TOIL:** the balance (in hours and roughly in days), plus how much more is coming once waiting shifts are submitted. Record TOIL taken (hours, half day or full day). A ledger lists every change, newest first.

**More..:**
- "Want to say thanks?" with an animated coffee cup.
- **Pay & tax:** Config, rates & pay scales; Tax & £100k+ calculator.
- **Data:** Archived tax years; Reports & export (payslip, year summary, PDF or spreadsheet); Account & data (sign-in, backup, restore, wipe).
- **Support:** Help & suggestions; Privacy notice.

On a computer each item opens as a pop-up; on a phone it opens inline.

**Wording standard:** submit buttons always say **Submit overtime** / **Submit PA** (or Submit PA1/2/3), everywhere. The owner wants these labels kept in their current capitals: Sign Out, Export Spreadsheet, View Year Summary, Delete Permanently, Privacy Notice, Set Time, "Rostered vs Worked, auto calculated", the tax breakdown labels, and the "Tax & 100K+ Calculator" print heading. Don't convert them to sentence case.

---

## 9. Design system

- **Font:** DM Sans (Google Fonts) throughout. `index.html` also loads a few others, used by some themes' figures.
- **Themes:** 11 — Auto (follows the device), Light, Dark, Corporate, Pro, Midnight, FlagCarrier, Heritage, Energy, Goji, Luftplane (`SB_THEMES`, `THEME_PALETTES`, `THEME_IDS` in `App.jsx`). Each sets CSS variables such as `--ink`, `--muted`, `--quiet`, `--border`, `--border-2`, `--tint-red`, `--text-red-deep`, `--tag-purple`. New UI should use these variables, never fixed colours, or it will break in dark themes.
- **Accent:** brass `#b8823f` (`BRASS`) for primary buttons and active states; navy for headers and the sidebar.
- **Status colours (keep consistent everywhere):**
  - Red: not submitted / to submit.
  - Green: submitted / paid.
  - Blue, dashed: planned.
  - Amber: PA.
  - Purple: TOIL.
- **Hours** are always written as "1h 15m" (`fmtHrs`), never as decimals.
- **Pay months** are labelled "November pay", with "Shifts 7 Sept – 11 Oct" beside them (`payLabel`, `shiftSpan`).
- **Dialogs** close with Escape, the Android back button and a backdrop click, and trap focus while open (the `use*` hooks in `lib/`).
- **Motion** respects `prefers-reduced-motion`.

---

## 10. Testing

`npm test` runs the vitest unit tests in `src/lib/*.test.js` (173 at the last count). They cover:
- the pay calendar
- pay rates
- shift calculations
- deadlines across years
- payroll
- PAYE against the independent HMRC reference
- sync merge rules
- storage
- migrations
- formatting

Before a release, also click through the main journeys on both a computer and a phone:
- log a shift
- submit it from Awaits
- edit it
- delete it, then Undo
- record TOIL taken
- export
- back up and restore

---

## 11. Known traps

- **Several screens show the same shift.** These are the calendar day pop-up, Shifts, an opened month in Months, Awaits and Log step 4. A change to how a shift, its status or its Submit button looks must be made in all of them. Shared helpers keep the maths in one place; the layouts are separate.
- **Never compute money from the worked date.** Use `effectiveOtDate` / `effectivePaDate` and `submitWindow`.
- **Don't assume the current pay year.** `PAY_PERIODS` is the current year only. Anything that can involve older claims must work out the year from the date (`getFYStartYearFor`, `generateFYPeriods`).
- **`migrateEntries` runs on load and restore.** Keep it backward-compatible with old backups.
- **Use stable keys in lists** (ids or date strings), never array indexes.
- **StrictMode is on.** Effects run twice in development, so state resets belong in render-time checks or explicit handlers, not in effect cleanups.

---

## 12. History

The full change history is in git (`git log`). Pull requests on GitHub describe each change in plain English.
