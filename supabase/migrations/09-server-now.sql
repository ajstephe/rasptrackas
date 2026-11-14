-- The server's current time, so the app can tell how far each device's own
-- clock is out. Theme picks are stamped with server time (clock + offset), so
-- the newest pick wins between devices even when one device's clock runs
-- fast or slow. Read-only; reveals nothing but the time.

create or replace function public.server_now()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

revoke all on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
