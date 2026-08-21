-- Run in the SQL Editor. Needed for Realtime to reliably report UPDATE
-- events (including the soft-deletes this app uses, which are UPDATEs
-- setting deleted_at) — without this, Postgres only tracks the primary
-- key of a changed row by default, and Realtime's UPDATE handling in
-- practice needs the full row to work reliably.

alter table entries replica identity full;
alter table toil_taken replica identity full;
alter table settings replica identity full;
