-- Pruebas de los sorteos gratuitos (migración 20261104000006). Se ejecutan después de las demás.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false), set_config('role', case when u is null then 'anon' else 'authenticated' end, false);
$$;
create or replace function pg_temp.as_postgres() returns void language sql as $$ select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false); $$;
create or replace function pg_temp.expect_error(q text, why text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK (rechazado): % -> %', why, sqlerrm; return; end;
  raise exception 'FALLÓ: debía rechazarse: %', why;
end $$;
create or replace function pg_temp.check(cond boolean, why text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', why; end if; raise notice 'OK: %', why; end $$;

\set ORG '00000000-0000-0000-0000-00000000000a'
\set ANA '00000000-0000-0000-0000-0000000000b1'
\set BETO '00000000-0000-0000-0000-0000000000b2'
\set P '10000000-0000-0000-0000-000000000001'
\set G '20000000-0000-0000-0000-0000000000f1'

-- Los cobros ya no existen
select pg_temp.as_postgres();
select pg_temp.check(to_regclass('public.payments') is null and to_regclass('public.payment_methods') is null and to_regclass('public.payment_proofs') is null, 'no quedan tablas de cobros');
select pg_temp.check(to_regprocedure('reserve_numbers(uuid,int[])') is null and to_regprocedure('approve_payment(uuid)') is null, 'no quedan funciones de cobros');
select pg_temp.check(not exists (select 1 from information_schema.columns where table_name = 'settings' and column_name = 'payments_enabled'), 'la configuración ya no tiene cobros');
select pg_temp.check((select count(*) from raffles where price_per_number <> 0) = 0, 'los sorteos existentes quedaron sin precio');

-- Sorteo gratuito real (no de prueba), 2 números por persona
select pg_temp.as_user(:'ORG');
insert into raffles (id, name, product_id, closes_at, starts_at, is_demo, status, official_draw_date, official_draw_slot, unsold_policy, max_numbers_per_reservation)
values (:'G', 'Gratis', :'P', now() + interval '5 days', now() - interval '1 minute', false, 'active', current_date + 5, 'nocturna', 'desierto', 2);
select pg_temp.expect_error(format($$update raffles set price_per_number = 100 where id = %L$$, :'G'), 'un sorteo no puede tener precio');

-- Elegir requiere nombre y teléfono
select pg_temp.as_user(:'BETO');
update profiles set phone = '' where id = auth.uid();
select pg_temp.expect_error(format($$select claim_numbers(%L, array[1])$$, :'G'), 'sin teléfono no se puede elegir');
update profiles set first_name = 'Beto', last_name = 'Gómez', phone = '11 2222-3333' where id = auth.uid();
select (claim_numbers(:'G', array[1, 2])).id \gset b_
select pg_temp.check((select count(*) from public_raffle_numbers where raffle_id = :'G' and number in (1, 2) and state = 'paid') = 2, 'en un sorteo real gratuito los números quedan ocupados al instante');
select pg_temp.check((select buyer_name || ' / ' || buyer_phone from reservations where id = :'b_id') = 'Beto Gómez / 11 2222-3333', 'cada número guarda nombre y teléfono de quien lo eligió');
select pg_temp.check((select total from reservations where id = :'b_id') = 0, 'no hay montos');
select pg_temp.expect_error(format($$select claim_numbers(%L, array[3])$$, :'G'), 'no se supera el máximo por persona');

select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select claim_numbers(%L, array[2])$$, :'G'), 'no se elige un número ocupado');
select pg_temp.check((select count(*) from reservations where raffle_id = :'G') = 0, 'otra persona no ve nombre ni teléfono de Beto');
select pg_temp.check((select state from public_raffle_numbers where raffle_id = :'G' and number = 2) = 'paid', 'la grilla pública muestra el número ocupado sin datos personales');
select pg_temp.expect_error(format($$select cancel_reservation(%L)$$, :'b_id'), 'otra persona no suelta números ajenos');
select pg_temp.as_user(null);
select pg_temp.expect_error(format($$select claim_numbers(%L, array[5])$$, :'G'), 'sin sesión no se elige');

-- Beto suelta un número y elige otro
select pg_temp.as_user(:'BETO');
select cancel_reservation(:'b_id');
select pg_temp.check((select count(*) from public_raffle_numbers where raffle_id = :'G' and state = 'available') = 100, 'al soltar, los números vuelven a estar libres');
select (claim_numbers(:'G', array[7])).id \gset b2_

-- El organizador anota en persona y libera
select pg_temp.as_user(:'ORG');
select (admin_manual_entry(:'G', array[50], 'Doña Rosa', '11 4444-5555', 'vino al local')).id \gset r_
select pg_temp.check((select state from raffle_numbers where raffle_id = :'G' and number = 50) = 'paid', 'anotar en persona ocupa el número');
select pg_temp.check((select count(*) from reservations where raffle_id = :'G' and status = 'approved') = 2, 'el organizador ve a todos los participantes');
select pg_temp.check((select participants from raffle_stats(:'G')) = 2 and (select taken from raffle_stats(:'G')) = 2, 'estadística: 2 participantes, 2 números ocupados');
select pg_temp.expect_error(format($$select admin_release_entry(%L, '')$$, :'b2_id'), 'liberar exige motivo');
select admin_release_entry(:'b2_id', 'Pidió cambiar de número');
select pg_temp.check((select state from raffle_numbers where raffle_id = :'G' and number = 7) = 'available', 'liberar deja el número libre');
select pg_temp.as_user(:'BETO');
select pg_temp.check((select count(*) from notifications where kind = 'numeros_liberados') = 1, 'Beto recibe aviso de que liberaron su número');

select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select admin_manual_entry(%L, array[60], 'X', '', '')$$, :'G'), 'un participante no anota en persona');
select pg_temp.expect_error(format($$select admin_release_entry(%L, 'x')$$, :'r_id'), 'un participante no libera números');
select pg_temp.expect_error(format($$select raffle_stats(%L)$$, :'G'), 'un participante no ve estadísticas');

\echo 'PRUEBAS DE SORTEOS GRATUITOS PASARON'
