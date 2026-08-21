-- Run this in the SQL Editor of your existing project — entries and
-- toil_taken were created with a uuid id column, but the app's local
-- entries use plain timestamp-based string ids (e.g. "1735689600000").
-- Postgres rejects those as invalid uuid syntax on insert. This switches
-- both tables to a plain text id instead, which the local ids already
-- satisfy as-is — no data-shape change needed on the app side.
--
-- Safe to run even if these tables already have rows in them.

alter table entries drop constraint if exists entries_pkey;
alter table entries alter column id drop default;
alter table entries alter column id type text using id::text;
alter table entries add primary key (id);

alter table toil_taken drop constraint if exists toil_taken_pkey;
alter table toil_taken alter column id drop default;
alter table toil_taken alter column id type text using id::text;
alter table toil_taken add primary key (id);
