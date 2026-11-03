-- SORTEO · Base de datos · Parte 3 de 4. Pegar y ejecutar en orden (Run).
set search_path = public;

-- ---------------------------------------------------------------------------
-- Funciones de negocio (lo único que un participante puede "escribir")
-- ---------------------------------------------------------------------------

-- Libera reservas vencidas. La llama pg_cron cada minuto y también
-- reserve_numbers antes de reservar. Las reservas con comprobante enviado
-- ('submitted') NO vencen solas: las resuelve el administrador.
create or replace function release_expired_reservations() returns int
language plpgsql security definer set search_path = public as $$
declare released int;
begin
  with expired as (
    update reservations set status = 'expired', updated_at = now()
    where status = 'pending' and expires_at < now()
    returning id
  )
  update raffle_numbers rn
     set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
    from expired e
   where rn.reservation_id = e.id and rn.state = 'reserved';
  get diagnostics released = row_count;
  return released;
end $$;

create or replace function reserve_numbers(p_raffle uuid, p_numbers int[]) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid := auth.uid();
  v_raffle  raffles;
  v_nums    int[];
  v_locked  int;
  v_res     reservations;
  v_open    int;
begin
  if v_user is null then raise exception 'Tenés que iniciar sesión'; end if;

  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() < v_raffle.starts_at or now() >= v_raffle.closes_at then raise exception 'El sorteo no está abierto'; end if;
  if not v_raffle.is_demo and not (select payments_enabled from settings where id = 1) then
    raise exception 'Las ventas están deshabilitadas';
  end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if cardinality(v_nums) > v_raffle.max_numbers_per_reservation then
    raise exception 'Podés reservar hasta % números por vez', v_raffle.max_numbers_per_reservation;
  end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  select count(*) into v_open from reservations
   where user_id = v_user and raffle_id = p_raffle and status = 'pending' and expires_at > now();
  if v_open >= 3 then raise exception 'Tenés demasiadas reservas pendientes en este sorteo'; end if;

  perform release_expired_reservations();

  -- Bloqueo en orden fijo (evita bloqueos cruzados) y solo de los disponibles.
  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, numbers, unit_price, total, expires_at)
  values (p_raffle, v_user, v_nums, v_raffle.price_per_number,
          v_raffle.price_per_number * cardinality(v_nums),
          now() + make_interval(mins => v_raffle.reservation_minutes))
  returning * into v_res;

  update raffle_numbers
     set state = 'reserved', reservation_id = v_res.id, reserved_until = v_res.expires_at, updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';

  return v_res;
end $$;

create or replace function cancel_reservation(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id <> auth.uid() then raise exception 'Reserva no encontrada'; end if;
  if v_res.status <> 'pending' then raise exception 'La reserva ya no se puede cancelar'; end if;
  update reservations set status = 'cancelled', updated_at = now() where id = p_reservation;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = p_reservation and state = 'reserved';
end $$;

-- El participante informa su pago adjuntando el comprobante (ya subido a
-- Storage en su carpeta). NUNCA confirma el pago: solo lo deja pendiente.
create or replace function submit_payment(
  p_reservation uuid, p_method uuid, p_proof_path text, p_mime text, p_size int
) returns payments
language plpgsql security definer set search_path = public as $$
declare
  v_res  reservations;
  v_pay  payments;
  v_demo boolean;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id <> auth.uid() then raise exception 'Reserva no encontrada'; end if;
  if v_res.status <> 'pending' or v_res.expires_at < now() then raise exception 'La reserva venció o ya fue enviada'; end if;
  select is_demo into v_demo from raffles where id = v_res.raffle_id;
  if not v_demo and not (select payments_enabled from settings where id = 1) then
    raise exception 'Los cobros están deshabilitados';
  end if;
  if split_part(p_proof_path, '/', 1) <> auth.uid()::text then raise exception 'Ruta de comprobante inválida'; end if;
  if p_method is not null and not exists (select 1 from payment_methods where id = p_method and active) then
    raise exception 'Medio de pago inválido';
  end if;

  insert into payments (reservation_id, method_id, amount)
  values (p_reservation, p_method, v_res.total)
  returning * into v_pay;
  insert into payment_proofs (payment_id, storage_path, mime_type, size_bytes)
  values (v_pay.id, p_proof_path, p_mime, p_size);
  update reservations set status = 'submitted', updated_at = now() where id = p_reservation;
  return v_pay;
end $$;

-- Solo Sebastián, después de verificar el ingreso real del dinero.
create or replace function approve_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay payments; v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador puede aprobar pagos'; end if;
  select * into v_pay from payments where id = p_payment for update;
  if not found or v_pay.status <> 'pending' then raise exception 'El pago no está pendiente'; end if;
  select * into v_res from reservations where id = v_pay.reservation_id for update;

  update raffle_numbers set state = 'paid', reserved_until = null, updated_at = now()
   where reservation_id = v_res.id and state = 'reserved';
  update payments set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_payment;
  update reservations set status = 'approved', updated_at = now() where id = v_res.id;
  insert into notifications (user_id, kind, title, body)
  values (v_res.user_id, 'pago_aprobado', 'Pago aprobado',
          'Tus números ' || array_to_string(v_res.numbers, ', ') || ' quedaron confirmados.');
end $$;

create or replace function reject_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay payments; v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador puede rechazar pagos'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo del rechazo'; end if;
  select * into v_pay from payments where id = p_payment for update;
  if not found or v_pay.status <> 'pending' then raise exception 'El pago no está pendiente'; end if;
  select * into v_res from reservations where id = v_pay.reservation_id for update;

  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = v_res.id and state = 'reserved';
  update payments set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
                      rejection_reason = left(p_reason, 500) where id = p_payment;
  update reservations set status = 'rejected', updated_at = now() where id = v_res.id;
  insert into notifications (user_id, kind, title, body)
  values (v_res.user_id, 'pago_rechazado', 'Pago rechazado', left(p_reason, 500));
end $$;

-- Grilla pública: solo número y estado, sin datos de nadie.
create or replace view public_raffle_numbers with (security_invoker = false) as
  select rn.raffle_id, rn.number, rn.state
    from raffle_numbers rn
    join raffles r on r.id = rn.raffle_id
   where r.status in ('active', 'closed', 'drawn');

-- Estadísticas: separa reservado de vendido y pendiente de cobrado.
create or replace function raffle_stats(p_raffle uuid) returns table (
  sold int, reserved int, available int, collected_verified numeric, pending_amount numeric, expenses numeric, result numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  return query
  select
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'paid'),
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'reserved'),
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'available'),
    coalesce((select sum(p.amount) from payments p join reservations r on r.id = p.reservation_id
               where r.raffle_id = p_raffle and p.status = 'approved'), 0),
    coalesce((select sum(p.amount) from payments p join reservations r on r.id = p.reservation_id
               where r.raffle_id = p_raffle and p.status = 'pending'), 0),
    coalesce((select sum(amount) from expenses where raffle_id = p_raffle), 0),
    coalesce((select sum(p.amount) from payments p join reservations r on r.id = p.reservation_id
               where r.raffle_id = p_raffle and p.status = 'approved'), 0)
      - coalesce((select sum(amount) from expenses where raffle_id = p_raffle), 0)
      - coalesce((select pr.acquisition_cost from raffles ra join products pr on pr.id = ra.product_id where ra.id = p_raffle), 0);
end $$;
