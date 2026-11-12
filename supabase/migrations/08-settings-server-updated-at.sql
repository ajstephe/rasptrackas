-- Settings now take the server's clock too (see 07 for entries and TOIL).
-- Devices decide which settings copy is newer by comparing updated_at; with
-- each phone stamping its own time, one running a few minutes fast would
-- ignore (and later overwrite) changes made on another device. The app now
-- reads back the server's stamp after each save, so every device compares
-- like with like.

drop trigger if exists settings_server_updated_at on public.settings;
create trigger settings_server_updated_at
  before insert or update on public.settings
  for each row execute function public.set_server_updated_at();

update public.settings set updated_at = now() where updated_at > now();
