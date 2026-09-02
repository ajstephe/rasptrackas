-- Records which version of the Privacy Notice an account agreed to, and
-- when. Written once, at the same upsert that first creates a user_keys
-- row (sign-up's handleRecoverySetup, App.jsx) — never overwritten
-- afterward, so it stays an honest record of what was actually agreed to
-- at the time, even after the notice itself is later revised.
-- Nullable: the one pre-existing account predates this column and was
-- never asked to consent to anything, so it has nothing to backfill here.
alter table user_keys
  add column if not exists privacy_version text,
  add column if not exists privacy_accepted_at timestamptz;
