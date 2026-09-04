# Overtime & Shift Tracker — Full Recreation Guide

**Purpose of this document:** if you (Adam) lost all memory of this project, or handed it to someone else entirely, this file plus the current `App.jsx` should be enough to get back to exactly where things stand today — same design, same layout, same fonts, same colours, same calculations, same code, same cloud sync and login, deployed the same way.

**The single most important thing to understand about this document:** it is a *companion* to `App.jsx`, not a replacement for it. `App.jsx` is the actual source of truth — every pixel value, every calculation, every line of logic already exists there, fully written. This guide's job is to explain *why* it's built that way, capture the handful of things that live outside that one file (the Supabase project, the deployment pipeline), and prevent someone from accidentally "fixing" something that was already a deliberate decision. If this document and `App.jsx` ever disagree, `App.jsx` is right.

**Keep both together, always.** The current `App.jsx` and this file should be stored side by side — in the GitHub repo itself is the natural place, so they can never drift apart or get separated.

---

## 1. What this is, in one paragraph

A React 18 single-file SPA (`src/App.jsx`) that lets a Metropolitan Police (RaSP) officer track overtime, TOIL, and Protection Allowance (PA) claims against the Met's real 13-period pay calendar. It runs entirely client-side, syncs end-to-end encrypted to a Supabase backend so the same data is available on any signed-in device, and is deployed via GitHub → Vercel. Desktop is the primary intended platform; mobile is a deliberate "on the road" fallback with its own layout, not a scaled-down afterthought.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18 (`useState`, `useMemo`, `useEffect`, `useRef`, `useCallback` — no class components, no external state library) |
| Build tool | Vite (`import.meta.env` is used directly for environment variables — this only works under Vite, not CRA/webpack) |
| Language | Plain JavaScript + JSX, no TypeScript |
| Styling | Inline `style={{...}}` objects everywhere, no CSS framework, no CSS Modules, no styled-components. A handful of shared style objects (`S.card`, `S.lbl`, `S.inp`, etc.) are defined once near the top of the component and reused by reference. |
| Backend | Supabase (Postgres + Auth + Realtime + one Edge Function) |
| Hosting | Vercel, auto-deploying from a GitHub repo |
| npm dependencies | Exactly two: `react` and `@supabase/supabase-js`. That's it. |
| CDN-loaded (not npm) | `ExcelJS` (`https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js`), loaded lazily via a dynamically-injected `<script>` tag only when the person actually exports a spreadsheet — never loaded on initial page load. |
| PDF export | Not a PDF library at all — a print-styled preview screen plus `window.print()`, using `@media print` CSS and a `no-print` class to hide UI chrome. Browser handles "Save as PDF" natively. |

**Why so few dependencies:** this was a deliberate constraint carried through the whole project — "no new npm packages" is treated as a hard architecture rule (see §6). Anything that can be done without a library, is. Anything that genuinely needs one uses a CDN instead of adding to `package.json`, so `src/App.jsx` really is the entire application and a fresh `npm install` never risks pulling in a breaking dependency update.

---

## 3. Recreating the project from absolutely nothing

Follow this section in order if starting with no existing Vercel project, no existing Supabase project, and nothing but this guide and `App.jsx`.

### 3.1 Prerequisites

- A GitHub account
- A Vercel account (can sign in with GitHub)
- A Supabase account
- Node.js installed locally (for the one-time scaffolding step)

### 3.2 Scaffold the Vite + React project

```bash
npm create vite@latest ot-tracker -- --template react
cd ot-tracker
npm install
npm install @supabase/supabase-js
```

Delete the generated `src/App.jsx` and `src/App.css` — replace `src/App.jsx` with the real one. Nothing in `App.jsx` imports a CSS file, so `App.css` isn't needed; `src/index.css` can stay minimal (just a CSS reset / `box-sizing: border-box` if desired — the app supplies all its own styling inline).

`src/main.jsx` needs nothing special — the standard Vite template's `createRoot(...).render(<App />)` is exactly right as-is.

### 3.3 Create the Supabase project

1. In the Supabase dashboard, create a new project. Note the **Project URL** and the **anon/public API key** — both go into environment variables later (§3.7).
2. Go to **Authentication → Providers** and confirm **Email** sign-in is enabled (it is by default). No other providers are used — sign-in is email + password only, plus a recovery-word-based account recovery flow that lives entirely in application logic, not a Supabase feature.
3. Go to **Authentication → URL Configuration** and set the **Site URL** to the eventual production domain (the Vercel URL, or a custom domain once attached) — this is where the password-reset email link points.

### 3.4 Database schema

> **Important caveat:** the SQL below is reconstructed from how `App.jsx` actually reads and writes these tables — every table name, column name, and query shape is taken directly from the real code, but the exact column *types* (particularly on `entries.id` and `toil_taken.id` — see the note beneath the schema) were inferred rather than pulled from a live schema export. **Before relying on this for a fresh deployment, export the actual schema from the current live Supabase project** (Database → Backups, or `supabase db dump`) and prefer that over this reconstruction if the two ever disagree.

```sql
-- ── user_keys ──────────────────────────────────────────────────────────────
-- One row per user. Holds the wrapped (encrypted) data-encryption-key,
-- twice over — once wrapped by the login password, once by the separate
-- recovery word. Supabase never sees the key itself, the password, or the
-- recovery word in the clear (see §5 for the full crypto explanation).
create table user_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wrapped_dek text not null,
  kek_salt text not null,
  kek_iterations integer not null,
  wrapped_dek_recovery text not null,
  recovery_salt text not null,
  recovery_iterations integer not null,
  created_at timestamptz not null default now()
);

-- ── entries ────────────────────────────────────────────────────────────────
-- Every logged shift. The actual shift data (date, hours, PA rate, notes,
-- submission status, everything) lives only inside `ciphertext` — encrypted
-- client-side before it ever reaches Supabase. Row-level fields (id,
-- user_id, timestamps) stay in the clear because they're needed for
-- querying/sync, not because they're sensitive on their own.
--
-- id is TEXT, not uuid or bigint: client-generated ids are
-- `Date.now() + Math.random()` (a JS float, e.g. 1735689600000.7234) —
-- this needs a type that won't lose precision or reject the value.
create table entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── toil_taken ─────────────────────────────────────────────────────────────
-- TOIL redemption records. Same shape and same reasoning as entries.
-- Client-generated ids here are `Date.now().toString()` — also text.
create table toil_taken (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── settings ───────────────────────────────────────────────────────────────
-- One row per user (rank, service length — everything needed to compute pay
-- rates). No soft-delete column: settings are just overwritten, never
-- individually removed.
create table settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- ── row-level security ────────────────────────────────────────────────────
-- Every table: a user can only ever see/write their own rows. This is what
-- makes the anon key safe to ship to the browser at all.
alter table user_keys enable row level security;
alter table entries enable row level security;
alter table toil_taken enable row level security;
alter table settings enable row level security;

create policy "own rows only" on user_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on toil_taken
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 3.5 Enable Realtime

The app subscribes to live Postgres changes on `entries`, `toil_taken`, and `settings` (filtered to the signed-in user's own rows) so a second device sees an edit within moments, without polling.

```sql
alter publication supabase_realtime add table entries;
alter publication supabase_realtime add table toil_taken;
alter publication supabase_realtime add table settings;

-- REPLICA IDENTITY FULL is needed so UPDATE/DELETE events carry full row
-- data, not just the primary key — the app's realtime handler reads the
-- new row's ciphertext and deleted_at directly off the event payload.
alter table entries replica identity full;
alter table toil_taken replica identity full;
alter table settings replica identity full;
```

(This mirrors the actual migration history on the live project — applied as four separate migrations: `01-schema`, `02-realtime`, `03-fix-id-column-type`, `04-replica-identity-full`. The `03` migration exists because an earlier attempt at the `id` column type needed correcting after the fact — worth being aware of if recreating from scratch, since getting the type right the first time (per §3.4's note) avoids needing that fix-up migration at all.)

### 3.6 Deploy the `delete-account` Edge Function

Deleting a Supabase Auth user requires the `service_role` key, which must never reach the browser — so full account deletion (as opposed to just clearing this device's local data) goes through a small server-side function instead.

```bash
supabase functions new delete-account
```

The function body needs to:
1. Read the caller's JWT from the request (Supabase's client SDK sends this automatically via `functions.invoke`)
2. Create a Supabase client using the **service role** key (available to the function via its own environment, never exposed to the browser)
3. Call `supabase.auth.admin.deleteUser(userId)` for the calling user's own id (extracted from their JWT — never trust a user-supplied id)

Deleting the `auth.users` row cascades automatically to `user_keys`, `entries`, `toil_taken`, and `settings` via the `on delete cascade` foreign keys already in the schema — the function itself doesn't need to touch those tables directly.

```bash
supabase functions deploy delete-account
```

### 3.7 Environment variables

Two variables, both prefixed `VITE_` so Vite exposes them to client-side code:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | The Project URL from §3.3 |
| `VITE_SUPABASE_ANON_KEY` | The anon/public key from §3.3 |

Set these in **Vercel → Project Settings → Environment Variables** (for Production, Preview, and Development). For local development, put the same two lines in a `.env.local` file at the project root (already gitignored by the Vite template):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

The app is written to **degrade gracefully if these are missing** — `App.jsx` wraps the `createClient` call in a check that leaves `supabase` as `null` rather than throwing, so a misconfigured environment shows a normal error state instead of a blank white screen. Every Supabase call site in the app checks `if (!supabase) return` first.

### 3.8 Deploy to Vercel

1. Push the project (with `src/App.jsx` in place) to a new GitHub repository.
2. In Vercel, **Add New Project**, import that repository. Vercel auto-detects the Vite framework preset — no custom build command needed (`npm run build`, output directory `dist`, both are Vite defaults).
3. Add the two environment variables from §3.7 before the first deploy, or add them after and trigger a redeploy.
4. Deploy.

**Ongoing deploys, day to day:** once this initial setup is done, every future change only needs `src/App.jsx` pushed to the connected GitHub repo — Vercel picks it up automatically. Nothing else in the repo (Vite config, this guide, PWA icons, `package.json`) changes between sessions.

### 3.9 Verify end to end

1. Visit the deployed URL. You should land on a sign-in screen (confirming `supabase` initialised — if you instead see a broken/blank state, double-check the two env vars).
2. Sign up with a real email — Supabase sends a confirmation email by default (Authentication → Providers → Email → "Confirm email" toggle controls this).
3. After confirming and signing in, you'll be asked to set a **recovery word** — this is the app's own account-recovery mechanism, separate from Supabase's password reset (see §5).
4. Log a test shift, sign out, sign back in on a different browser/device, and confirm the same shift appears — this exercises the full push → Realtime → pull round trip.

---

## 4. Design system — exact values, not approximations

Every colour, font size, and spacing value below is taken directly from the current `App.jsx`. If new UI is ever added, it should reuse these values rather than inventing nearby ones — the whole app reads as one consistent system specifically because nothing has ever improvised a "close enough" colour or size.

**Font:** `'DM Sans', system-ui, sans-serif` — used everywhere, no second typeface anywhere in the app.

**Base colours:**

| Role | Colour |
|---|---|
| Primary text | `#0f172a` |
| Muted/secondary text | `#64748b`, `#94a3b8` |
| Page background | `#f8fafc` |
| Card/surface background | `#fff` |
| Primary blue (buttons, links, active states, today-marker) | `#2563eb` |
| Dark navy (sidebar, header cards) | `#0f2744` / `#1e3a5f` |

**Status colours** (used consistently for submission/claim state everywhere — calendar cells, badges, pills, boxes):

| State | Background | Border | Text |
|---|---|---|---|
| Submitted / green | `#f0fdf4` | `#bbf7d0` | `#15803d` / `#059669` |
| Outstanding / red | `#fef2f2` | `#fecaca` | `#b91c1c` / `#dc2626` |
| PA / amber | `#fffbeb` | `#fde68a` | `#92400e` / `#f59e0b` / `#d97706` |
| TOIL / purple | `#f5f3ff` | `#ddd6fe` | `#7c3aed` / `#6d28d9` / `#4c1d95` |
| Cross-period / indigo (money counted in a different pay period) | `#e0e7ff` (legend swatch / badge fill) | `#a5b4fc` | `#4338ca` |
| Record-only / grey | `#e2e8f0` | `#cbd5e1` | `#475569` |
| Blank/empty (no data) | `transparent` | `#eef2f6` | `#94a3b8` |
| Info box (calm, non-alarming notes) | `#eff6ff` | `#bfdbfe` | `#1e40af` |
| Warning box (used sparingly) | `#fffbeb` | `#fde68a` | `#92400e` |

**Card/component radii:** `13px`–`18px` for cards, `9px`–`10px` for inputs/cells/smaller elements, `7px` for pills/badges.

**Font sizes** (mobile → desktop, where they differ — most of the app does **not** scale by viewport, only specific desktop-adapted spots do):
- Body/label text: `13px`
- Muted small text / dates in lists: `9px`–`10.5px`
- Headings within cards: uppercase, `900` weight, letter-spacing `0.5px`–`1.5px`
- Overtime/PA/TOIL pills (CARMS & PA Outstanding page): `12.5px` desktop / `10.5px` mobile, padding `3px 8px` — all three pill types share identical sizing
- Amount text (CARMS & PA Outstanding page): `14.5px` desktop / `12.5px` mobile — Overtime, PA, and TOIL amounts are all the same size, standardised to match the PA figure specifically
- Calendar cell date number: `13px` mobile, `16px` desktop
- Calendar cell hours text: `9px` mobile, `10.5px` desktop
- Calendar cell month label: `7px` mobile, `8px` desktop

**Desktop page geometry:** overall content width capped at `1180px` (`maxWidth:'1180px', margin:'0 auto 0 250px'` on the top-level wrap, `isWide` branch), offset from the fixed `230px` left sidebar. If asked to make something "bigger" on desktop, check this constraint first before assuming a component-level fix is needed.

---

## 5. Auth & encryption architecture

This is the part someone would most need explained from scratch, since none of it is visible from just looking at the UI.

**The model:** every user's shift data is protected by **client-side end-to-end encryption**. Supabase Auth handles *who can sign in*, but it never sees the actual shift data in plain form — only ciphertext. Even with full database access, Supabase (or anyone else) cannot read a user's entries, TOIL records, or settings without also knowing that user's password or recovery word.

**The data key (DEK):** a single random AES-256-GCM key, generated once at sign-up, used to encrypt/decrypt every entry, TOIL record, and the settings object. This key lives only in memory on the device for the duration of a session — it is never itself sent to Supabase in the clear.

**Wrapping:** the DEK is *wrapped* (encrypted) twice, independently:
- Once by a key derived from the **login password**, via PBKDF2 (SHA-256, 210,000 iterations — used on every sign-in, so the cost stays low enough to feel instant).
- Once by a key derived from a separate **recovery word** the user sets immediately after signing up, via PBKDF2 with a much higher iteration count (600,000 — used maybe once ever, so it can afford to be slower).

Both wrapped copies (plus their salts and iteration counts) are stored in `user_keys`. Either secret alone is enough to unwrap the same underlying DEK — losing the password doesn't lose the data, as long as the recovery word is still known, and vice versa.

**Sign-up flow:**
1. `supabase.auth.signUp({ email, password })` creates the Auth user.
2. Immediately after, the app generates the DEK, wraps it under both the password and a recovery word the user is prompted to choose, and upserts the wrapped copies into `user_keys`.
3. If email confirmation is required, this key-setup step is deferred to the *first sign-in after confirming* instead (there's no session to safely write key material with before that).

**Sign-in flow:**
1. `supabase.auth.signInWithPassword({ email, password })`.
2. Fetch the `user_keys` row for that user.
3. Unwrap the DEK client-side using the password just entered. If this fails but Supabase Auth accepted the password, that indicates a corrupted/tampered key row, not a normal wrong-password case (wrong passwords are already rejected one step earlier, by Supabase Auth itself).

**Recovery flow:** separate from Supabase's own password-reset email. If the password is lost but the recovery word is known, the recovery word can unwrap the DEK directly, then a new password can be set and the DEK re-wrapped under it — without ever needing the old password.

**Every actual row's payload** (an entry, a TOIL record, the settings object) is encrypted with `encryptWithDataKey` before being upserted, and decrypted with `decryptWithDataKey` after being pulled — both using AES-256-GCM with a fresh random IV per encryption, bundled into a single base64 blob (`IV + ciphertext`, concatenated) so no separate IV column is needed in the schema.

**Sync model:**
- **Push:** every local state change diffs against a "last synced" map (kept in `localStorage` so it survives a reload) and only pushes rows that actually changed — never the whole dataset on every edit.
- **Pull + merge:** runs on first unlock and on every Realtime reconnect. For each item, if the local copy still matches what this device last believes it pushed, it's safe to take whatever the server has (which may be newer, from another device). If the local copy has since diverged, there's a pending local edit — keep it, and let the next push cycle send it up.
- **Realtime:** a Postgres changes subscription per table, filtered to the signed-in user's own rows, keeps other open sessions live-updated without polling.
- **Retention:** cloud storage only keeps entries from the last 3 financial years (`CLOUD_RETENTION_CUTOFF`) — older data stays on-device indefinitely but isn't re-uploaded or expected to still be present in the cloud, and its absence there isn't treated as a deletion.

**Account deletion vs. "Wipe All Data":** these are deliberately different actions. Wipe All Data clears everything (local and cloud) but leaves the same account signed in. Deleting the account calls the `delete-account` Edge Function (§3.6), which removes the Auth user entirely — cascading to every row via the schema's foreign keys — while leaving this device's local data untouched (the device just loses its session, same as a normal sign-out).

---

## 6. Non-negotiable architecture rules

- **Single file, no new npm packages.** Everything either lives in `App.jsx` or loads from a CDN at the moment it's needed.
- **Submission-awareness is the core domain rule.** Logging a shift records that it was *worked*. It does not count towards gross/net until the relevant submission toggle (OT via CARMS, PA via MetHR) is switched on. Applies everywhere money is shown.
- **Money is attributed by submission date, not worked date.** A shift worked in one pay period but submitted in a later one has its money counted in the period containing the *submission* date, matching how CARMS actually pays it. This is the single most-tested piece of domain logic in the app (see §7) — verified directly via function calls, not just visually, multiple times. Don't re-investigate `computePayslipData` as a bug without reading the entire function first.
- **Hours-worked figures stay unconditional and period-local** — a factual record of what happened, regardless of submission status. Deliberately *different* from the money rule above; both conventions coexist without conflict once you know which is which.
- **One entry per date**, strictly enforced.
- **13-period police pay calendar**, not the standard UK tax year. `FY_ANCHOR_START = '2026-02-09'`, `FY_WEEK_PATTERN = [4,5,4,4,5,4,4,5,4,4,5,4]`. Periods are labelled by pay month but the actual date range rarely matches the calendar month of the same name. Never assume a period's date range from its label; always look it up.
- **Night hours are fully removed.** `calcEntry` hardcodes `night: 0, nh: 0`. Don't reintroduce anything night-related.
- **`migrateEntries` is NOT applied on backup restore** — all entry fields must be explicit in any backup/demo JSON.
- **Positional array-index keys in `.map()` are never used for list items** — always a stable, meaningful identifier (a date string, an entry id). A past bug in the calendar grid (stale content on period switch) came from exactly this mistake.

---

## 7. Core shared helpers

Search for these before writing a new one — duplicating logic that already exists has caused real bugs before.

| Helper | Purpose |
|---|---|
| `calcEntry(e)` | Single source of truth for one entry's computed figures: `{h1,h2,h3, payH1,payH2,payH3, ot1,ot2,ot3, ot, night:0, pa, gross, toilH, toilBanked, ...}` |
| `submittedGross(e)` | An entry's gross, gated by submission toggles |
| `isOtSubmitted(e)` / `isPaSubmitted(e)` | Submission-status checks |
| `effectiveOtDate(e)` / `effectivePaDate(e)` | `e.otSubmittedDate \|\| e.date` and the PA equivalent — the date whose *period* the money actually belongs to |
| `periodIdxForDate(d)` | `PAY_PERIODS.findIndex(p=>d>=p.start&&d<=p.end)` — shared date→period-index lookup |
| `crossPeriodInfo(e)` | Returns `null`, or `{label, ot:true}` / `{label, pa:true}` / `{label, both:true}` when an entry's money is attributed to a different period than the one it was worked in. Computed independently for OT and PA — one side can be cross-period while the other is still outstanding, and this function correctly reports the side(s) that moved regardless of the other's status. |
| `renderDatePills(dates, normalColor)` | Renders a tier's date list; cross-period dates render in the cross-period indigo, everything else in `normalColor` |
| `carmsBadge(e, fontSize)` | Shared by List View entry cards **and** the Calendar day popup — returns ✓/✗ badges or `null` for a record-only entry with nothing to submit. One function, two render sites. |
| `computePayslipData(start, end)` | Powers the print/PDF payslip preview — two genuinely separate loops by design, one for hours (worked-date, period-local), one for money (submission-date, iterates every entry) |

---

## 8. Full feature state by screen

### Home
- Dark "TOTAL GROSS YTD" card, days into tax year, amber "not yet submitted to CARMS" line (clickable)
- Salary Breakdown & Overtime Forecast (expandable)
- **CARMS & MetHR Awaiting Submission card** — icon, heading, total amount, claim count on the left; Overtime/PA figures as a compact two-line stat block on the right, separated by a vertical hairline rather than a horizontal divider strip. Both the total and the Overtime/PA breakdown figures use the same amber (`#d97706`).
- TOIL Balance card (purple normally, red if overdrawn)
- Current Pay Period card
- Gross & Net OT — Current Period (mobile-only card; desktop shows this via At a Glance instead)
- Disclaimer: "For guidance only. Always verify amounts against your payslip."

### Desktop layout (applies to every screen)
- Sidebar replaces bottom nav; header shows today's date instead of the logo
- Overall page width capped at `1180px` (see §4)
- **At a Glance** column on the right, present on every screen regardless of active tab: "Gross & Net OT — Current Period" and "CARMS & PA Outstanding" (top 5 items before "+N more claims →"). Underneath: "Overtime unclaimed" / "PA unclaimed" breakdown, using the same amber as the numbers above them.
- "Sign Out" (not "Log Out")

### Log Overtime
- Date, Duty/Reason fields, full width
- **Desktop-only two-column layout**: Rostered CARM Shift / Actual Shift on the left (capped ~400px, tightened internal spacing), Select O/T Rate + Take Overtime As + Protection Allowance stacked on the right. Both columns stretch to match whichever is taller (`alignItems:'stretch'`), so neither side leaves dead space.
  - **Header row** ("Rostered CARM Shift / Actual Shift" + "Input Hours Manually" toggle) stacks onto two lines on desktop rather than squeezing side by side in the narrower box; stays side-by-side on mobile, which still has the full width.
  - **RDW (Rest Day Working):** selecting it removes the "Rostered CARM Shift" subsection from the layout entirely (there's no roster to compare against — the whole shift counts as overtime) — it does not grey out or disable. The remaining "Actual Shift Worked" section is vertically centred within the box so it still visually fills the same (stretched, height-matched) space rather than leaving it looking collapsed.
  - **Manual Entry mode** ("Input Hours Manually" toggled on): the left box shows a short explainer ("Manual Entry — recording overtime hours directly against each rate tier...") in place of the Rostered/Actual fields, centred to fill the same stretched height. The right column swaps "Select O/T Rate" for the classic three-tier (1.33x/1.5x/2.0x) hours grid.
  - Mobile is completely unaffected by any of the above — single column, same order as always: Rostered/Actual → Notes → rate section → Take As → Protection Allowance (separate card).
- Notes, CARMS Submission toggles, the live "This Shift" gross/net preview, and Save Record stay full-width below the two-column area, unchanged from the original single-column layout.
- Submission toggles start **off** by default, opening a date picker when flipped on.

### Summary — Calendar View
- Swipe or arrow between pay periods; month pills across the top
- Desktop cells `62px` tall; mobile cells `aspectRatio:1, minHeight:46px`
- Every day cell shows its calendar month abbreviation in the top-left corner, alternating colour by calendar-month parity (blue `#2563eb` / teal `#0d9488`) so the two calendar months any pay period spans stay visually distinct
- **Cell states** (border + background) — deliberately just three, matching every other status colour in the app:
  - Today: `2px solid #2563eb`
  - Record-only (worked, nothing to claim): flat grey `#e2e8f0` / `#cbd5e1`
  - Submitted: green `#f0fdf4` / `#bbf7d0`
  - Outstanding: red `#fef2f2` / `#fecaca`
  - Blank/nothing logged: faint grey border `#eef2f6`
- **Cross-period marker — a small rounded indigo "sparkle" asterisk**, inset into the top-right corner of the cell (mirroring the month tag's top-left position). Drawn as an inline SVG with `stroke-linecap:'round'` rather than a font glyph or emoji, so it renders identically on every device. This is the *only* signal for cross-period attribution — there's no longer a special split-colour cell background for it. It fires whenever *either* OT/TOIL or PA was submitted and counted in a different period, independent of whether the other side is still outstanding, so a day that's still genuinely red (something outstanding) can still correctly carry the asterisk if part of it already crossed into another period.
- PA (`#f59e0b`) and TOIL (`#7c3aed`) dots sit in their own row at the bottom of the cell, unaffected by whether the asterisk is present.
- **Legend**, left column top-to-bottom: "OT/PA Recorded" (red) → "OT/PA Submitted" (green) → "No OT — Info Only" (grey) → the asterisk icon + "OT/PA Counted Other Period", aligned flush with the swatches above it (both use an `11px` box). Right column: PA dot + TOIL dot, then 1.33x / 1.5x / 2.0x stacked vertically underneath.
- Cells keyed by `info.ds` (the actual ISO date string), never positional grid indices.

### Summary — List View
- Individual entry card border: `1px solid #94a3b8`
- Each card: date/reason → `carmsBadge` result → record-only pill if applicable → cross-period pill if applicable
- Record-only pill: `ⓘ Shift Record — No OT Claim`, background `#cbd5e1`, text `#334155`
- Cross-period pill: `↷ OT Counted in [Month]` / `↷ PA Counted in [Month]` / `↷ OT & PA Counted in [Month]` — background `#e0e7ff`, text `#4338ca`
- Both pills exist identically in the Calendar day-detail popup

### OT Pay / PA boxes (Summary, both Calendar and List View)
- PA mirrors OT Pay's layout exactly: one line per tier actually used, each showing its own gross and the specific dates behind it
- TOIL spans full width beneath both boxes
- Tier-line data deliberately differs from the "hours worked" stat above it — that stat stays period-local (factual), the tier lines group by which period the *money* is attributed to
- Every date in these boxes is coloured indigo if it belongs to an entry whose money is attributed to a different period than the one being viewed

### CARMS/PA
- Outstanding claims numbered oldest-first, tap to jump to entry
- Overtime + TOIL share a single numbered row when both outstanding on the same shift
- All three pill types (Overtime/PA/TOIL) share identical sizing; all four amount figures (OT, PA, TOIL hours, and the merged-row sub-amount) share identical sizing, standardised to match the PA figure
- Filters: All / Overtime / PA / TOIL

### TOIL
- Balance, redemption form, ledger of banked/redeemed entries

### More..
- Config Rates & Payscales, Tax & 100K+ Calculator, Archived Financial Years, Financial Reports & Export, Account & Data Management, Help & Suggestions

### Exports
- **Spreadsheet (.xlsx)** via ExcelJS (CDN-loaded), 14 columns, submission-date-aware filtering
- **PDF payslip preview** via print stylesheet + `window.print()`, not a PDF library

---

## 9. Known consistency traps

- **Two parallel implementations of the same UI exist in several places** — List View vs Calendar View versions of the OT Pay/PA boxes, and the List View entry card vs Calendar day-popup pills. A fix applied to one and not the other is the single most common mistake made in this codebase's history. Always check for the second occurrence before considering a fix complete, unless it's driven by a genuinely shared function.
- **Font-size matching between sibling elements** needs to stay in sync manually — there's no shared constant for most of these, just repeated literal values that must match.

---

## 10. Version history

**Through v145:** see the full detailed changelog in the prior handoff document (`OT-Tracker-Project-Handoff.md`) if it still exists alongside this one — record-only shift detection, cross-period attribution built from scratch, calendar cell enlargement on desktop, and the original diagonal-split cross-period cell marker all predate this document.

**This document's session (post-v145):**
- CARMS & PA Outstanding page: Overtime/PA/TOIL pills enlarged and unified in size; all amount figures (OT, PA, TOIL hours, merged-row sub-amount) standardised to match the PA figure's size; month/pay-period header line enlarged to match the duty-reason line
- Home page: CARMS & MetHR Awaiting Submission box redesigned from a bottom divider-strip layout to a right-hand split (icon/heading/total on the left, Overtime/PA as a compact stat block on the right, separated by a vertical hairline); Overtime/PA unclaimed figures on both this box and the desktop "At a Glance" panel recoloured from dark brown to the same amber as the other figures in their box
- Calendar View cross-period marker rebuilt end-to-end: root-caused and fixed a real bug where the marker required the *entire* day to be fully submitted before showing at all, silently hiding legitimate partial cross-period cases (e.g. OT/TOIL already submitted and counted elsewhere while PA is still outstanding via a separate system on its own timeline); replaced the old tiny inline text label and, later, the special split-colour cell background entirely with a single consistent indigo asterisk marker (custom rounded-stroke SVG, not a font glyph), inset into the top-right corner of the cell; legend updated to match, moved into the left column under "No OT — Info Only," relabelled "OT/PA Counted Other Period"
- Log Overtime tab: desktop-only two-column layout built for the Rostered/Actual Shift + rate-selection area (see §8 for full detail), including matched-height columns, original RDW behaviour preserved (Rostered section removed, not disabled) with vertical centring to fill the matched height, and a matching Manual Entry mode treatment — all scoped to desktop only, mobile untouched throughout
- This document itself — first full ground-up recreation guide, covering the previously-undocumented Supabase schema, Realtime setup, Edge Function, and end-to-end encryption architecture

---

## 11. If you only remember one thing

**`App.jsx` is the truth. This document explains it.** If a future session (with or without memory of any of this) needs to change something, the fastest path to not breaking anything is: read the relevant part of `App.jsx` in full before touching it, check this document's design-system and architecture-rules sections for anything that looks like a deliberate constraint rather than an accident, and — if genuinely rebuilding the whole project from zero — follow §3 in order, verifying the reconstructed SQL schema against the actual live project first if it's still reachable.
