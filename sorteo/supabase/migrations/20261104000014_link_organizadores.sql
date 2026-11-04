-- SORTEO · Link del dueño para sumar organizadores sin aprobarlos a mano, con 20 días de prueba.
-- Quien se registra con el link queda como organizador por 20 días. Después el panel se corta solo
-- hasta que el dueño lo habilite (por ejemplo cuando le paga). Los organizadores que ya existían
-- quedan sin vencimiento. El dueño puede cambiar el link y quitar permisos desde Cuentas.

set search_path = public;

-- 1) Vencimiento del permiso de organizador -----------------------------------------------------
alter table profiles add column if not exists organizer_until date;

-- Organizador = rol de organizador y permiso vigente (o el dueño).
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (is_owner or (role = 'admin'
    and (organizer_until is null or organizer_until >= (now() at time zone 'America/Argentina/Buenos_Aires')::date))));
$$;

-- Solo el dueño cambia el vencimiento.
create or replace function guard_organizer_until() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.organizer_until is distinct from old.organizer_until
     and not is_owner() and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Solo el dueño cambia el vencimiento';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_organizer_until on profiles;
create trigger profiles_guard_organizer_until before update on profiles for each row execute function guard_organizer_until();

create table if not exists owner_invite (
  id         int primary key default 1 check (id = 1),
  code       text not null default lower(substr(md5(gen_random_uuid()::text), 1, 12)) check (code ~ '^[a-z0-9]{8,40}$'),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into owner_invite (id) values (1) on conflict (id) do nothing;
alter table owner_invite enable row level security;
revoke all on owner_invite from anon, authenticated;
drop policy if exists owner_invite_owner on owner_invite;
create policy owner_invite_owner on owner_invite for select to authenticated using (is_owner());
grant select on owner_invite to authenticated;

-- El dueño cambia el código o apaga el link.
create or replace function owner_reset_invite(p_enabled boolean default true) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not is_owner() then raise exception 'Solo el dueño'; end if;
  update owner_invite set code = lower(substr(md5(gen_random_uuid()::text), 1, 12)), enabled = coalesce(p_enabled, true), updated_at = now()
   where id = 1 returning code into v;
  insert into audit_logs (actor, action, table_name, record_id) values (auth.uid(), 'nuevo_link_organizadores', 'owner_invite', '1');
  return v;
end $$;

-- Quien entra con el link y tiene cuenta pasa a organizador.
create or replace function join_as_organizer(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_ok boolean;
begin
  if auth.uid() is null then raise exception 'Primero creá tu cuenta o ingresá'; end if;
  select exists (select 1 from owner_invite where id = 1 and enabled and code = lower(trim(coalesce(p_code, '')))) into v_ok;
  if not v_ok then raise exception 'Ese link para organizadores ya no es válido. Pedile uno nuevo al dueño.'; end if;
  select * into v_me from profiles where id = auth.uid() for update;
  if v_me.is_owner or v_me.role = 'admin' then return 'ya'; end if;  -- si ya fue organizador, no renueva la prueba
  update profiles set role = 'admin', organizer_until = (now() at time zone 'America/Argentina/Buenos_Aires')::date + 20 where id = auth.uid();
  insert into audit_logs (actor, action, table_name, record_id) values (auth.uid(), 'alta_organizador_por_link', 'profiles', auth.uid()::text);
  return 'ok';
end $$;

-- El dueño habilita o corta a un organizador: fecha hasta la que puede usar el panel (null = sin vencimiento).
create or replace function owner_set_organizer_until(p_user uuid, p_until date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Solo el dueño'; end if;
  update profiles set organizer_until = p_until where id = p_user and role = 'admin' and not is_owner;
  if not found then raise exception 'Esa cuenta no es organizador'; end if;
  insert into audit_logs (actor, action, table_name, record_id, new_data)
  values (auth.uid(), 'vencimiento_organizador', 'profiles', p_user::text, jsonb_build_object('hasta', p_until));
end $$;

grant select (organizer_until) on profiles to authenticated;
revoke execute on function owner_reset_invite(boolean), join_as_organizer(text), owner_set_organizer_until(uuid, date) from public, anon;
grant execute on function owner_reset_invite(boolean), join_as_organizer(text), owner_set_organizer_until(uuid, date) to authenticated;
