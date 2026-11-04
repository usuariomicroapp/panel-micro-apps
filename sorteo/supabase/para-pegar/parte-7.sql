-- Tres niveles: dueño de la plataforma (Sebastián), organizador (su cliente) y comprador.
-- El dueño ve y puede todo lo del organizador, elige quién organiza y puede pausar la app.
-- Nadie más que el dueño puede quitarle ese lugar.

alter table profiles add column if not exists is_owner boolean not null default false;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_owner);
$$;

-- El dueño también cuenta como administrador en todas las reglas existentes.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or is_owner));
$$;

-- Roles: solo el dueño los cambia. Antes de que exista un dueño, también un organizador
-- (así sigue funcionando una copia que todavía no tiene dueño cargado).
create or replace function guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
declare
  v_trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin');
  v_has_owner boolean := exists (select 1 from profiles where is_owner);
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'Campos no modificables';
  end if;
  if new.is_owner is distinct from old.is_owner and not v_trusted then
    raise exception 'El dueño solo se cambia desde la base de datos';
  end if;
  if old.is_owner and not is_owner() and not v_trusted then
    raise exception 'No se puede modificar la cuenta del dueño';
  end if;
  if new.role is distinct from old.role and not v_trusted then
    if v_has_owner and not is_owner() then raise exception 'Solo el dueño puede cambiar roles'; end if;
    if not v_has_owner and not is_admin() then raise exception 'Solo un administrador puede cambiar roles'; end if;
  end if;
  return new;
end $$;

-- Pausa general de la app (por ejemplo, si el cliente no está al día). Solo la toca el dueño.
alter table settings
  add column if not exists app_paused     boolean not null default false,
  add column if not exists paused_message text not null default 'La app está pausada momentáneamente.'
    check (length(paused_message) <= 300);

create or replace function guard_settings_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.app_paused is distinct from old.app_paused or new.paused_message is distinct from old.paused_message)
     and not is_owner() and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Solo el dueño puede pausar o reanudar la app';
  end if;
  return new;
end $$;
drop trigger if exists settings_guard_owner on settings;
create trigger settings_guard_owner before update on settings
  for each row execute function guard_settings_owner();

-- Con la app pausada no se reservan ni se cargan ventas.
create or replace function guard_not_paused() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select app_paused from settings where id = 1) then
    raise exception 'La app está pausada: no se pueden reservar ni vender números';
  end if;
  return new;
end $$;
drop trigger if exists reservations_not_paused on reservations;
create trigger reservations_not_paused before insert on reservations
  for each row execute function guard_not_paused();

grant execute on function is_owner() to anon, authenticated;
