-- SORTEO · Cuántos instalaron la app (para el panel del dueño).
-- Se cuenta cada celular o computadora que abre la app desde el ícono instalado (o acepta instalarla).
-- Cada aparato tiene un código al azar guardado en el propio aparato: no se guarda nada personal.

set search_path = public;

create table if not exists app_installs (
  device_id    text primary key check (device_id ~ '^[A-Za-z0-9-]{16,64}$'),
  user_id      uuid references profiles (id) on delete set null,
  organizer_id uuid references profiles (id) on delete set null,
  platform     text not null default 'otro' check (platform in ('android', 'iphone', 'computadora', 'otro')),
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
alter table app_installs enable row level security;
revoke all on app_installs from anon, authenticated;

create or replace function register_install(p_device text, p_platform text, p_org uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_device !~ '^[A-Za-z0-9-]{16,64}$' then return; end if;
  if p_platform not in ('android', 'iphone', 'computadora', 'otro') then p_platform := 'otro'; end if;
  if p_org is not null and not exists (select 1 from profiles where id = p_org and (role = 'admin' or is_owner)) then p_org := null; end if;
  insert into app_installs (device_id, user_id, organizer_id, platform)
  values (p_device, auth.uid(), p_org, p_platform)
  on conflict (device_id) do update
     set last_seen = now(),
         user_id = coalesce(auth.uid(), app_installs.user_id),
         organizer_id = coalesce(app_installs.organizer_id, excluded.organizer_id);
end $$;
revoke execute on function register_install(text, text, uuid) from public;
grant execute on function register_install(text, text, uuid) to anon, authenticated;

create or replace function owner_install_stats() returns table (
  total bigint, this_month bigint, last_7_days bigint, active_30_days bigint, with_account bigint,
  android bigint, iphone bigint, computadora bigint
)
language plpgsql stable security definer set search_path = public as $$
declare v_month timestamptz := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
begin
  if not is_owner() then raise exception 'Solo el dueño'; end if;
  return query select
    count(*),
    count(*) filter (where first_seen >= v_month),
    count(*) filter (where first_seen >= now() - interval '7 days'),
    count(*) filter (where last_seen >= now() - interval '30 days'),
    count(*) filter (where user_id is not null),
    count(*) filter (where platform = 'android'),
    count(*) filter (where platform = 'iphone'),
    count(*) filter (where platform = 'computadora')
  from app_installs;
end $$;
revoke execute on function owner_install_stats() from public, anon;
grant execute on function owner_install_stats() to authenticated;

-- Que la app vea las funciones nuevas enseguida.
notify pgrst, 'reload schema';
