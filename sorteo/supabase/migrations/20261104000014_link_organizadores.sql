-- SORTEO · Link del dueño para sumar organizadores sin aprobarlos a mano.
-- Quien se registra con el link (que lleva un código secreto) queda como organizador.
-- El dueño puede cambiar el código (el link viejo deja de andar) y quitar permisos desde Cuentas.

set search_path = public;

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
  if v_me.is_owner or v_me.role = 'admin' then return 'ya'; end if;
  update profiles set role = 'admin' where id = auth.uid();
  insert into audit_logs (actor, action, table_name, record_id) values (auth.uid(), 'alta_organizador_por_link', 'profiles', auth.uid()::text);
  return 'ok';
end $$;

revoke execute on function owner_reset_invite(boolean), join_as_organizer(text) from public, anon;
grant execute on function owner_reset_invite(boolean), join_as_organizer(text) to authenticated;
