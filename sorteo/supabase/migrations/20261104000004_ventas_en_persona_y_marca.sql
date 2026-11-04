-- Etapa 5b: pedidos de Sebastián del 04/11/2026.
-- 1) La cantidad de números se puede ampliar o achicar (achicar solo si los números que se quitan están libres).
-- 2) El organizador carga ventas en persona con nombre y teléfono del comprador.
-- 3) Nombre del emprendimiento y logo editables.
-- 4) Catálogo de premios: cada producto puede mostrarse u ocultarse en la tienda.

-- 1) Cantidad de números editable ------------------------------------------------
create or replace function sync_raffle_numbers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.total_numbers < old.total_numbers then
    if exists (select 1 from raffle_numbers
                where raffle_id = new.id and number >= new.total_numbers and state <> 'available') then
      raise exception 'No se puede achicar: hay números reservados o vendidos a partir del %', new.total_numbers;
    end if;
    delete from raffle_numbers where raffle_id = new.id and number >= new.total_numbers;
    return new;
  end if;
  insert into raffle_numbers (raffle_id, number)
  select new.id, n from generate_series(0, new.total_numbers - 1) n
  on conflict do nothing;
  return new;
end $$;

-- 2) Ventas en persona ---------------------------------------------------------------
alter table reservations alter column user_id drop not null;
alter table reservations
  add column if not exists manual      boolean not null default false,
  add column if not exists buyer_name  text check (buyer_name is null or length(trim(buyer_name)) between 1 and 120),
  add column if not exists buyer_phone text check (buyer_phone is null or length(buyer_phone) <= 40),
  add column if not exists notes       text not null default '' check (length(notes) <= 500);
alter table reservations drop constraint if exists reservation_owner;
alter table reservations add constraint reservation_owner check (
  (not manual and user_id is not null) or (manual and user_id is null and buyer_name is not null)
);

-- Una reserva sin usuario (venta en persona) no la puede cancelar nadie más que el admin.
create or replace function cancel_reservation(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id is distinct from auth.uid() then raise exception 'Reserva no encontrada'; end if;
  if v_res.status <> 'pending' then raise exception 'La reserva ya no se puede cancelar'; end if;
  update reservations set status = 'cancelled', updated_at = now() where id = p_reservation;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = p_reservation and state = 'reserved';
end $$;

-- El organizador anota una venta hecha en persona. Si ya cobró, los números quedan pagados;
-- si no, quedan reservados a nombre del comprador hasta el cierre del sorteo.
create or replace function admin_manual_sale(
  p_raffle uuid, p_numbers int[], p_name text, p_phone text, p_paid boolean, p_notes text default ''
) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_raffle raffles;
  v_nums   int[];
  v_locked int;
  v_res    reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador puede cargar ventas'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribí el nombre del comprador'; end if;

  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() >= v_raffle.closes_at then raise exception 'El sorteo ya cerró sus ventas'; end if;
  -- Misma regla legal que las ventas por la app: sin autorización solo se usan sorteos de prueba.
  if not v_raffle.is_demo and not (select payments_enabled from settings where id = 1) then
    raise exception 'Las ventas están deshabilitadas hasta tener la autorización';
  end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  perform release_expired_reservations();

  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, manual, buyer_name, buyer_phone, notes,
                            numbers, unit_price, total, expires_at, status)
  values (p_raffle, null, true, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), coalesce(p_notes, ''),
          v_nums, v_raffle.price_per_number, v_raffle.price_per_number * cardinality(v_nums),
          v_raffle.closes_at, case when p_paid then 'approved' else 'pending' end::reservation_status)
  returning * into v_res;

  update raffle_numbers
     set state = case when p_paid then 'paid' else 'reserved' end::number_state,
         reservation_id = v_res.id,
         reserved_until = case when p_paid then null else v_raffle.closes_at end,
         updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';

  if p_paid then
    insert into payments (reservation_id, amount, status, reviewed_by, reviewed_at)
    values (v_res.id, v_res.total, 'approved', auth.uid(), now());
  end if;
  return v_res;
end $$;

-- Marca como cobrada una venta en persona que estaba pendiente.
create or replace function admin_manual_mark_paid(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  select * into v_res from reservations where id = p_reservation for update;
  if not found or not v_res.manual then raise exception 'Venta no encontrada'; end if;
  if v_res.status <> 'pending' then raise exception 'Esta venta ya no está pendiente'; end if;
  update raffle_numbers set state = 'paid', reserved_until = null, updated_at = now()
   where reservation_id = v_res.id and state = 'reserved';
  update reservations set status = 'approved', updated_at = now() where id = v_res.id;
  insert into payments (reservation_id, amount, status, reviewed_by, reviewed_at)
  values (v_res.id, v_res.total, 'approved', auth.uid(), now());
end $$;

-- Anula una venta en persona cargada por error: libera los números y deja constancia.
create or replace function admin_manual_cancel(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  select * into v_res from reservations where id = p_reservation for update;
  if not found or not v_res.manual then raise exception 'Venta no encontrada'; end if;
  if v_res.status not in ('pending', 'approved') then raise exception 'Esta venta ya estaba anulada'; end if;
  if exists (select 1 from raffles where id = v_res.raffle_id and status not in ('active', 'closed')) then
    raise exception 'El sorteo ya se realizó: la venta no se puede anular';
  end if;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = v_res.id;
  update payments set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
                      rejection_reason = left('Venta anulada: ' || trim(p_reason), 500)
   where reservation_id = v_res.id and status = 'approved';
  update reservations set status = 'cancelled', notes = left(trim(notes || ' · Anulada: ' || trim(p_reason), ' ·'), 500),
                          updated_at = now()
   where id = v_res.id;
end $$;

grant execute on function cancel_reservation(uuid) to authenticated;
grant execute on function admin_manual_sale(uuid, int[], text, text, boolean, text) to authenticated;
grant execute on function admin_manual_mark_paid(uuid) to authenticated;
grant execute on function admin_manual_cancel(uuid, text) to authenticated;

-- 3) Nombre del emprendimiento y logo ----------------------------------------------------
alter table settings
  add column if not exists brand_name      text not null default 'SORTEO' check (length(trim(brand_name)) between 1 and 40),
  add column if not exists brand_logo_path text check (brand_logo_path is null or brand_logo_path ~ '^marca/[A-Za-z0-9_.-]{1,100}$');

-- 4) Catálogo de premios ------------------------------------------------------------------
alter table products add column if not exists show_in_store boolean not null default true;
grant select (show_in_store) on products to anon, authenticated;
