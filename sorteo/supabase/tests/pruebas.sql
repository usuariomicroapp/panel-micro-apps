-- Pruebas de la Etapa 3. Se ejecutan en un PostgreSQL local con supabase_shim.sql.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Ayudas -------------------------------------------------------------------
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false), set_config('role', case when u is null then 'anon' else 'authenticated' end, false);
$$;
create or replace function pg_temp.as_postgres() returns void language sql as $$
  select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false);
$$;
create or replace function pg_temp.expect_error(q text, why text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'OK (rechazado como se esperaba): % -> %', why, sqlerrm;
    return;
  end;
  raise exception 'FALLÓ: debía rechazarse: %', why;
end $$;
create or replace function pg_temp.check(cond boolean, why text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLÓ: %', why; end if;
  raise notice 'OK: %', why;
end $$;

-- Datos ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'sebas@example.com', '{"first_name":"Sebastián"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'ana@example.com',   '{"first_name":"Ana","phone":"11 5555-0000"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'beto@example.com',  '{"first_name":"Beto"}');
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

select pg_temp.check((select count(*) from profiles) = 3, 'el registro crea el perfil automáticamente');

insert into products (id, name, acquisition_cost) values ('10000000-0000-0000-0000-000000000001', 'Celular', 250000);
insert into raffles (id, name, product_id, price_per_number, closes_at, starts_at)
values ('20000000-0000-0000-0000-000000000001', 'Demo celular', '10000000-0000-0000-0000-000000000001', 5000, now() + interval '7 days', now() - interval '1 minute');

select pg_temp.check((select count(*) from raffle_numbers where raffle_id = '20000000-0000-0000-0000-000000000001') = 100, 'el sorteo genera la grilla 00-99');
select pg_temp.expect_error($$update raffles set status = 'active' where id = '20000000-0000-0000-0000-000000000001'$$, 'no se activa sin sorteo oficial, fecha y regla de no vendidos');
update raffles set official_draw_date = current_date + 7, official_draw_slot = 'nocturna', unsold_policy = 'desierto', status = 'active'
 where id = '20000000-0000-0000-0000-000000000001';

-- Seguridad de perfiles -------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from profiles) = 1, 'un participante solo ve su propio perfil');
select pg_temp.expect_error($$update profiles set role = 'admin' where id = auth.uid()$$, 'un participante no puede hacerse admin');
select pg_temp.check((select count(*) from reservations) = 0, 'un participante no ve reservas ajenas (ninguna aún)');
select pg_temp.expect_error($$select acquisition_cost from products$$, 'el costo de adquisición no es visible para participantes');
select pg_temp.expect_error($$insert into products (name) values ('hack')$$, 'un participante no puede crear productos');
select pg_temp.expect_error($$update raffle_numbers set state = 'paid'$$, 'un participante no puede tocar la grilla directamente');
update settings set payments_enabled = true, authorization_number = 'falso';
select pg_temp.check(not (select payments_enabled from settings), 'un participante no puede habilitar cobros (la actualización no afecta filas)');
select pg_temp.expect_error($$select approve_payment(gen_random_uuid())$$, 'un participante no puede aprobar pagos');

-- Reservas ------------------------------------------------------------------
select pg_temp.check((select (reserve_numbers('20000000-0000-0000-0000-000000000001', array[37, 37, 5])).total) = 10000,
                     'reservar 2 números distintos cobra 2 × $5.000, el total lo calcula el servidor');
select pg_temp.check((select count(*) from public_raffle_numbers where raffle_id = '20000000-0000-0000-0000-000000000001' and state = 'reserved') = 2,
                     'la grilla pública muestra 2 reservados');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect_error($$select reserve_numbers('20000000-0000-0000-0000-000000000001', array[37])$$, 'otra persona no puede reservar un número ya reservado');
select pg_temp.expect_error($$select reserve_numbers('20000000-0000-0000-0000-000000000001', array[100])$$, 'número fuera de rango');
select pg_temp.check((select count(*) from reservations) = 0, 'Beto no ve la reserva de Ana');
select pg_temp.as_user(null);
select pg_temp.expect_error($$select reserve_numbers('20000000-0000-0000-0000-000000000001', array[1])$$, 'sin sesión no se puede reservar');
select pg_temp.check((select count(*) from public_raffle_numbers) = 100, 'un visitante sin sesión ve la grilla');

-- Vencimiento ----------------------------------------------------------------
select pg_temp.as_postgres();
update reservations set expires_at = now() - interval '1 second';
select pg_temp.check(release_expired_reservations() = 2, 'las reservas vencidas liberan sus números');
select pg_temp.check((select count(*) from raffle_numbers where state = 'available') = 100, 'los números vuelven a estar disponibles');

-- Pago manual: enviar, aprobar ----------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select (reserve_numbers('20000000-0000-0000-0000-000000000001', array[7, 8])).id \gset r_
select pg_temp.expect_error(format($$select submit_payment(%L, null, 'otro-usuario/x.jpg', 'image/jpeg', 1000)$$, :'r_id'), 'no se puede adjuntar un comprobante en carpeta ajena');
select pg_temp.expect_error(format($$select submit_payment(%L, null, %L, 'application/zip', 1000)$$, :'r_id', '00000000-0000-0000-0000-0000000000b1/c.zip'), 'tipo de archivo no permitido');
select (submit_payment(:'r_id', null, '00000000-0000-0000-0000-0000000000b1/comprobante.jpg', 'image/jpeg', 120000)).id \gset p_
select pg_temp.check((select state from raffle_numbers where number = 7) = 'reserved', 'enviar comprobante NO confirma el número');
select pg_temp.as_postgres();
update reservations set expires_at = now() - interval '1 second' where id = :'r_id';
select release_expired_reservations();
select pg_temp.check((select state from raffle_numbers where number = 7) = 'reserved', 'una reserva con comprobante enviado no vence sola');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select approve_payment(:'p_id');
select pg_temp.check((select count(*) from raffle_numbers where state = 'paid') = 2, 'tras la aprobación del admin los números quedan pagados');
select pg_temp.check((select collected_verified from raffle_stats('20000000-0000-0000-0000-000000000001')) = 10000, 'estadística: cobrado y verificado = $10.000');
select pg_temp.expect_error(format($$select reject_payment(%L, 'x')$$, :'p_id'), 'un pago aprobado no se puede rechazar después');
select pg_temp.expect_error($$update raffles set price_per_number = 1 where id = '20000000-0000-0000-0000-000000000001'$$, 'con ventas no se puede cambiar el precio');
select pg_temp.expect_error($$update raffles set total_numbers = 5 where id = '20000000-0000-0000-0000-000000000001'$$, 'la grilla no se achica por debajo de un número vendido');

-- Rechazo --------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select (reserve_numbers('20000000-0000-0000-0000-000000000001', array[50])).id \gset r2_
select (submit_payment(:'r2_id', null, '00000000-0000-0000-0000-0000000000b2/c.pdf', 'application/pdf', 5000)).id \gset p2_
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error(format($$select reject_payment(%L, '')$$, :'p2_id'), 'rechazar exige un motivo');
select reject_payment(:'p2_id', 'No se registró la transferencia');
select pg_temp.check((select state from raffle_numbers where number = 50) = 'available', 'un pago rechazado libera el número');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select count(*) from notifications where kind = 'pago_rechazado') = 1, 'el participante recibe el aviso de rechazo');

-- Sorteo real con cobros apagados ------------------------------------------
select pg_temp.as_postgres();
insert into raffles (id, name, product_id, price_per_number, closes_at, starts_at, is_demo, status, official_draw_date, official_draw_slot, unsold_policy)
values ('20000000-0000-0000-0000-000000000002', 'Real', '10000000-0000-0000-0000-000000000001', 5000, now() + interval '7 days', now() - interval '1 minute', false, 'active', current_date + 7, 'nocturna', 'desierto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error($$select reserve_numbers('20000000-0000-0000-0000-000000000002', array[1])$$, 'con cobros apagados no se vende en un sorteo real');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$update settings set payments_enabled = true$$, 'ni el admin puede habilitar cobros sin número de autorización');

-- Auditoría ------------------------------------------------------------------
select pg_temp.check((select count(*) from audit_logs where table_name = 'payments' and action = 'update') >= 2, 'aprobaciones y rechazos quedan en el registro');
select pg_temp.expect_error($$delete from audit_logs$$, 'el registro de auditoría no se puede borrar');
select pg_temp.as_postgres();
select pg_temp.expect_error($$update audit_logs set action = 'x'$$, 'ni el dueño de la base puede editar la auditoría');

\echo 'TODAS LAS PRUEBAS PASARON'
