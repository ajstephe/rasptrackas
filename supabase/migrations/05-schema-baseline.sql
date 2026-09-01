-- Baseline snapshot of the schema and RLS policies that were already live in
-- production before this file existed — pulled directly from the project via
-- information_schema/pg_policies/pg_indexes, not reconstructed from memory.
-- The round-9 audit found the original CREATE TABLE + policy statements were
-- never committed anywhere; only two later ALTERs made it into this folder
-- (03-fix-id-column-type.sql, 04-replica-identity-full.sql). This closes
-- that gap. Everything below is written to be safe to re-run against a
-- database that already has it (IF NOT EXISTS / duplicate_object guards
-- throughout) — it's both a real historical record now and something that
-- would actually rebuild this schema from scratch on a fresh project if
-- this one were ever lost, without needing 03/04 replayed afterward.
--
-- Also adds two indexes that didn't exist anywhere before: entries.user_id
-- and toil_taken.user_id had no index at all — every RLS-filtered query
-- against them (which is all of them) did a full table scan. Harmless at
-- today's row counts, worth having from here on as this grows. settings and
-- user_keys don't need one — user_id is already their primary key.

create table if not exists entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists toil_taken (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- kek_iterations/recovery_iterations default to 210000 matching
-- PASSWORD_KDF_ITERATIONS in App.jsx — the recovery-word path passes its own
-- higher RECOVERY_KDF_ITERATIONS (600000) explicitly on every write, so this
-- default is only ever a fallback, never actually relied on for that column.
create table if not exists user_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wrapped_dek text not null,
  kek_salt text not null,
  kek_iterations integer not null default 210000,
  wrapped_dek_recovery text not null,
  recovery_salt text not null,
  recovery_iterations integer not null default 210000,
  updated_at timestamptz not null default now()
);

alter table entries replica identity full;
alter table toil_taken replica identity full;
alter table settings replica identity full;

alter table entries enable row level security;
alter table toil_taken enable row level security;
alter table settings enable row level security;
alter table user_keys enable row level security;

-- One ALL-command policy per table, scoping every operation (select/insert/
-- update/delete) to rows the signed-in user owns — this is the entire
-- access-control boundary for data that's otherwise meaningless ciphertext
-- to anyone without the client-side data key (see App.jsx's crypto comments).
-- `do` blocks skip re-creating a policy that already exists rather than
-- erroring — `create policy` has no native `if not exists`.
do $$ begin
  create policy "Users manage their own entries" on entries
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users manage their own toil records" on toil_taken
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users manage their own settings" on settings
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users manage their own key record" on user_keys
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists entries_user_id_idx on entries(user_id);
create index if not exists toil_taken_user_id_idx on toil_taken(user_id);

-- Recovered from pg_stat_statements: the original, never-committed setup ran
-- this as its own second migration ("run this AFTER 01-schema-and-rls.sql"),
-- adding these three tables — deliberately not user_keys, which is only
-- ever read once at sign-in — to the realtime publication. Without this,
-- entries/toilTaken/settings changes on one device never reach another
-- signed-in device live (App.jsx's own `.channel('sync-'+uid)` subscription
-- has nothing to listen to). `alter publication ... add table` errors
-- (42710, duplicate_object) if the table's already a member, exactly like
-- `create policy` does — same guard shape as the policies above.
do $$ begin
  alter publication supabase_realtime add table entries;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table toil_taken;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table settings;
exception when duplicate_object then null; end $$;
