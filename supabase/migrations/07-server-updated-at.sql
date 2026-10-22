-- Incremental pulls ask for "rows changed since X", so updated_at has to
-- come from one clock everyone shares. Clients used to stamp it with their
-- own device time; a phone running a few minutes slow would write rows
-- that another device's cursor had already moved past, and they'd never be
-- pulled. The server's clock now overrides whatever the client sends.
-- settings is deliberately left alone: its updated_at is compared against
-- client-held values (isStaleSettingsUpdate) and is only ever one row.

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists entries_server_updated_at on public.entries;
create trigger entries_server_updated_at
  before insert or update on public.entries
  for each row execute function public.set_server_updated_at();

drop trigger if exists toil_taken_server_updated_at on public.toil_taken;
create trigger toil_taken_server_updated_at
  before insert or update on public.toil_taken
  for each row execute function public.set_server_updated_at();

-- A row stamped in the future by a fast device clock would drag a pull
-- cursor ahead of the server and hide real changes until it caught up.
update public.entries set updated_at = now() where updated_at > now();
update public.toil_taken set updated_at = now() where updated_at > now();

create index if not exists entries_user_updated_idx on public.entries (user_id, updated_at);
create index if not exists toil_taken_user_updated_idx on public.toil_taken (user_id, updated_at);
