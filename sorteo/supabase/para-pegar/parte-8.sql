-- Sorteos gratuitos: se quitan por completo los cobros de la app (pedido de Sebastián, 04/11/2026).
-- Cada número elegido guarda el nombre y el teléfono de quien lo eligió.
-- El estado 'paid' de la grilla pasa a significar "ocupado".

-- 1) Quitar funciones de cobro ------------------------------------------------------
drop function if exists reserve_numbers(uuid, int[]);
drop function if exists submit_payment(uuid, uuid, text, text, int);
drop function if exists approve_payment(uuid);
drop function if exists reject_payment(uuid, text);
drop function if exists admin_manual_sale(uuid, int[], text, text, boolean, text);
drop function if exists admin_manual_mark_paid(uuid);
drop function if exists raffle_stats(uuid);

-- 2) Quitar tablas de cobro (estaban vacías: solo hubo pruebas) -------------------------
drop table if exists payment_proofs cascade;
drop table if exists payments cascade;
drop table if exists payment_methods cascade;
drop policy if exists "comprobantes: sube el dueño" on storage.objects;
drop policy if exists "comprobantes: ve el dueño o admin" on storage.objects;

alter table settings drop constraint if exists payments_need_authorization;
alter table settings
  drop column if exists payments_enabled,
  drop column if exists authorization_number,
  drop column if exists authorization_entity;

delete from notifications where kind in ('pago_aprobado', 'pago_rechazado');
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('nuevo_sorteo', 'nuevo_producto', 'cambio_fecha', 'numeros_liberados', 'resultado', 'ganador'));

-- Un sorteo con números elegidos no cambia sus reglas (ya no hay precio que cuidar).
create or replace function guard_raffle_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from raffle_numbers where raffle_id = old.id and state <> 'available') then
    if new.digits <> old.digits
       or new.official_draw_date is distinct from old.official_draw_date
       or new.official_draw_slot is distinct from old.official_draw_slot
       or new.unsold_policy is distinct from old.unsold_policy
       or new.winner_rule <> old.winner_rule
       or new.is_demo <> old.is_demo then
      raise exception 'El sorteo ya tiene números elegidos: no se pueden cambiar sus reglas';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 3) Sorteos sin precio ---------------------------------------------------------------------
alter table raffles alter column price_per_number set default 0;
alter table raffles drop constraint if exists raffles_price_per_number_check;
update raffles set price_per_number = 0 where price_per_number <> 0;
alter table raffles add constraint raffles_price_per_number_check check (price_per_number = 0);
alter table raffles alter column max_numbers_per_reservation set default 1;

alter table reservations alter column unit_price set default 0;
alter table reservations alter column total set default 0;
alter table reservations drop constraint if exists reservations_total_check;
alter table reservations add constraint reservations_total_check check (total >= 0);

-- 4) Elegir números gratis -----------------------------------------------------------------
-- La persona debe tener nombre y teléfono en su perfil; quedan guardados con sus números.
-- max_numbers_per_reservation pasa a ser el máximo de números por persona en el sorteo.
create or replace function claim_numbers(p_raffle uuid, p_numbers int[]) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_prof   profiles;
  v_raffle raffles;
  v_nums   int[];
  v_have   int;
  v_locked int;
  v_res    reservations;
begin
  if v_user is null then raise exception 'Tenés que iniciar sesión'; end if;
  select * into v_prof from profiles where id = v_user;
  if coalesce(trim(v_prof.first_name), '') = '' or coalesce(trim(v_prof.phone), '') = '' then
    raise exception 'Completá tu nombre y teléfono para elegir números';
  end if;

  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() < v_raffle.starts_at or now() >= v_raffle.closes_at then raise exception 'El sorteo no está abierto'; end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  select coalesce(sum(cardinality(numbers)), 0) into v_have from reservations
   where raffle_id = p_raffle and user_id = v_user and status = 'approved';
  if v_have + cardinality(v_nums) > v_raffle.max_numbers_per_reservation then
    raise exception 'En este sorteo cada persona puede elegir hasta % número(s)', v_raffle.max_numbers_per_reservation;
  end if;

  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, buyer_name, buyer_phone, numbers, unit_price, total, expires_at, status)
  values (p_raffle, v_user, left(trim(v_prof.first_name || ' ' || v_prof.last_name), 120), left(v_prof.phone, 40),
          v_nums, 0, 0, v_raffle.closes_at, 'approved')
  returning * into v_res;

  update raffle_numbers set state = 'paid', reservation_id = v_res.id, reserved_until = null, updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';
  return v_res;
end $$;

-- La persona puede soltar sus números mientras el sorteo sigue abierto.
create or replace function cancel_reservation(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id is distinct from auth.uid() then raise exception 'No encontramos esos números'; end if;
  if v_res.status not in ('pending', 'approved') then raise exception 'Esos números ya no están a tu nombre'; end if;
  if not exists (select 1 from raffles where id = v_res.raffle_id and status = 'active' and now() < closes_at) then
    raise exception 'El sorteo ya cerró: no se pueden soltar números';
  end if;
  update reservations set status = 'cancelled', updated_at = now() where id = p_reservation;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = p_reservation;
end $$;

-- 5) Anotar en persona (gente sin celular) ------------------------------------------------------
create or replace function admin_manual_entry(p_raffle uuid, p_numbers int[], p_name text, p_phone text, p_notes text default '')
returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_raffle raffles;
  v_nums   int[];
  v_locked int;
  v_res    reservations;
begin
  if not is_admin() then raise exception 'Solo el organizador puede anotar participantes'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribí el nombre de la persona'; end if;
  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() >= v_raffle.closes_at then raise exception 'El sorteo ya cerró'; end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, manual, buyer_name, buyer_phone, notes, numbers, unit_price, total, expires_at, status)
  values (p_raffle, null, true, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), coalesce(p_notes, ''),
          v_nums, 0, 0, v_raffle.closes_at, 'approved')
  returning * into v_res;

  update raffle_numbers set state = 'paid', reservation_id = v_res.id, reserved_until = null, updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';
  return v_res;
end $$;

-- El organizador libera números (de la app o anotados en persona), con motivo.
create or replace function admin_release_entry(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el organizador'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  select * into v_res from reservations where id = p_reservation for update;
  if not found then raise exception 'No encontramos esa anotación'; end if;
  if v_res.status not in ('pending', 'approved') then raise exception 'Esos números ya estaban libres'; end if;
  if exists (select 1 from raffles where id = v_res.raffle_id and status not in ('active', 'closed')) then
    raise exception 'El sorteo ya se realizó: no se pueden liberar números';
  end if;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = v_res.id;
  update reservations set status = 'cancelled', notes = left(trim(notes || ' · Liberado: ' || trim(p_reason), ' ·'), 500), updated_at = now()
   where id = v_res.id;
  if v_res.user_id is not null then
    insert into notifications (user_id, kind, title, body)
    values (v_res.user_id, 'numeros_liberados', 'Números liberados',
            'El organizador liberó tus números ' || array_to_string(v_res.numbers, ', ') || '. Motivo: ' || left(trim(p_reason), 200));
  end if;
end $$;
drop function if exists admin_manual_cancel(uuid, text);

-- 6) Estadísticas sin plata -------------------------------------------------------------------
create or replace function raffle_stats(p_raffle uuid) returns table (taken int, available int, participants int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  return query
  select
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state <> 'available'),
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'available'),
    (select count(distinct coalesce(user_id::text, 'p:' || lower(buyer_name) || coalesce(buyer_phone, '')))::int
       from reservations where raffle_id = p_raffle and status = 'approved');
end $$;

grant execute on function claim_numbers(uuid, int[]) to authenticated;
grant execute on function cancel_reservation(uuid) to authenticated;
grant execute on function admin_manual_entry(uuid, int[], text, text, text) to authenticated;
grant execute on function admin_release_entry(uuid, text) to authenticated;
grant execute on function raffle_stats(uuid) to authenticated;
