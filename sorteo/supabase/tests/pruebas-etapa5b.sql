-- Pruebas de ventas en persona, cantidad editable, marca y catálogo. Se ejecutan después de pruebas-etapa5.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false), set_config('role', case when u is null then 'anon' else 'authenticated' end, false);
$$;
create or replace function pg_temp.expect_error(q text, why text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK (rechazado): % -> %', why, sqlerrm; return; end;
  raise exception 'FALLÓ: debía rechazarse: %', why;
end $$;
create or replace function pg_temp.check(cond boolean, why text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', why; end if; raise notice 'OK: %', why; end $$;

create or replace function pg_temp.as_postgres() returns void language sql as $$ select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false); $$;
\set R '20000000-0000-0000-0000-000000000001'
\set ADMIN '00000000-0000-0000-0000-00000000000a'
\set ANA '00000000-0000-0000-0000-0000000000b1'

-- Venta en persona cobrada
select pg_temp.as_user(:'ADMIN');
select (admin_manual_sale(:'R', array[90, 91], 'Doña Rosa', '11 4444-5555', true, 'Pagó en efectivo')).id \gset v1_
select pg_temp.check((select count(*) from raffle_numbers where raffle_id = :'R' and number in (90, 91) and state = 'paid') = 2, 'venta en persona cobrada: números pagados');
select pg_temp.check((select status from payments where reservation_id = :'v1_id') = 'approved', 'la venta cobrada suma a lo cobrado');
select pg_temp.expect_error(format($$select admin_manual_sale(%L, array[91], 'Otro', '', true)$$, :'R'), 'no se vende dos veces el mismo número');
select pg_temp.expect_error(format($$select admin_manual_sale(%L, array[92], '  ', '', true)$$, :'R'), 'el nombre del comprador es obligatorio');

-- Venta en persona sin cobrar, después se cobra
select (admin_manual_sale(:'R', array[93], 'Don Pepe', null, false)).id \gset v2_
select pg_temp.check((select state from raffle_numbers where raffle_id = :'R' and number = 93) = 'reserved', 'venta sin cobrar: número reservado a su nombre');
select pg_temp.as_postgres();
select release_expired_reservations();
select pg_temp.check((select state from raffle_numbers where raffle_id = :'R' and number = 93) = 'reserved', 'la venta sin cobrar no vence antes del cierre');
select pg_temp.as_user(:'ADMIN');
select admin_manual_mark_paid(:'v2_id');
select pg_temp.check((select state from raffle_numbers where raffle_id = :'R' and number = 93) = 'paid', 'al marcarla cobrada el número queda pagado');
select pg_temp.expect_error(format($$select admin_manual_mark_paid(%L)$$, :'v2_id'), 'no se cobra dos veces');

-- Anular una venta cargada por error
select pg_temp.expect_error(format($$select admin_manual_cancel(%L, '')$$, :'v1_id'), 'anular exige motivo');
select admin_manual_cancel(:'v1_id', 'Me equivoqué de número');
select pg_temp.check((select count(*) from raffle_numbers where raffle_id = :'R' and number in (90, 91) and state = 'available') = 2, 'anular libera los números');
select pg_temp.check((select status from payments where reservation_id = :'v1_id') = 'rejected', 'anular descuenta lo cobrado');

-- Un participante no puede cargar ni anular ventas, ni ver los datos del comprador
select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select admin_manual_sale(%L, array[94], 'X', '', true)$$, :'R'), 'un participante no carga ventas en persona');
select pg_temp.expect_error(format($$select admin_manual_cancel(%L, 'x')$$, :'v2_id'), 'un participante no anula ventas');
select pg_temp.expect_error(format($$select cancel_reservation(%L)$$, :'v2_id'), 'un participante no cancela una venta en persona ajena');
select pg_temp.check((select count(*) from reservations where manual) = 0, 'un participante no ve nombres ni teléfonos de otros compradores');
select pg_temp.check((select count(*) from public_raffle_numbers where raffle_id = :'R' and number = 93 and state = 'paid') = 1, 'la grilla pública muestra el número vendido sin datos del comprador');

-- Sorteo real con cobros apagados: tampoco se vende en persona
select pg_temp.as_user(:'ADMIN');
select pg_temp.expect_error($$select admin_manual_sale('20000000-0000-0000-0000-000000000002', array[1], 'X', '', true)$$, 'sin autorización no se vende en persona en un sorteo real');

-- Cantidad de números editable
update raffles set total_numbers = 95 where id = :'R';
select pg_temp.check((select count(*) from raffle_numbers where raffle_id = :'R') = 95, 'se puede achicar si los números que se quitan están libres');
select pg_temp.expect_error(format($$update raffles set total_numbers = 90 where id = %L$$, :'R'), 'no se achica por debajo de un número vendido (93)');
update raffles set total_numbers = 100 where id = :'R';
select pg_temp.check((select count(*) from raffle_numbers where raffle_id = :'R') = 100, 'se puede volver a ampliar');

-- Marca y catálogo
update settings set brand_name = 'Rifas de Rosa', brand_logo_path = 'marca/logo-1.jpg';
select pg_temp.expect_error($$update settings set brand_logo_path = '../otro/x.jpg'$$, 'el logo solo puede estar en la carpeta marca/');
select pg_temp.expect_error($$update settings set brand_name = ''$$, 'el nombre no puede quedar vacío');
select pg_temp.as_user(null);
select pg_temp.check((select brand_name from settings) = 'Rifas de Rosa', 'cualquiera ve el nombre del emprendimiento');
select pg_temp.check((select count(*) from products where show_in_store) >= 1, 'un visitante ve el catálogo de premios');
select pg_temp.expect_error($$select acquisition_cost from products$$, 'el costo sigue oculto');
select pg_temp.as_user(:'ANA');
update settings set brand_name = 'Hackeado';
select pg_temp.check((select brand_name from settings) = 'Rifas de Rosa', 'un participante no cambia el nombre');

\echo 'PRUEBAS DE VENTAS EN PERSONA Y MARCA PASARON'
