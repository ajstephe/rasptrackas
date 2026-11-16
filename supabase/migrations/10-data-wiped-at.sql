-- When this account's data was last wiped (Wipe All Data), in server time.
-- Every device checks it before syncing: one still holding data from
-- before the wipe clears its copy instead of uploading it again.
alter table user_keys add column if not exists data_wiped_at timestamptz;

-- Stamps the wipe with the server's clock and returns it, so the wiping
-- device knows the exact value it set.
create or replace function public.mark_data_wiped()
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.user_keys set data_wiped_at = now() where user_id = auth.uid() returning data_wiped_at;
$$;

revoke all on function public.mark_data_wiped() from public, anon;
grant execute on function public.mark_data_wiped() to authenticated;
