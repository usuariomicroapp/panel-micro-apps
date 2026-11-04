-- Pruebas de la migración 20261104000016 (borrar un sorteo por completo).
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

\set ORG  '00000000-0000-0000-0000-00000000000a'
\set ORG2 '00000000-0000-0000-0000-0000000000e2'
\set PEPA '00000000-0000-0000-0000-0000000000e3'

-- El sorteo "Tele" de ORG2 tiene un número elegido por Pepa (de las pruebas anteriores).
select pg_temp.as_postgres();
select pg_temp.check((select count(*) from reservations where raffle_id = '20000000-0000-0000-0000-000000000ff2') = 1, 'el sorteo tiene números elegidos');

select pg_temp.as_user(:'PEPA');
select pg_temp.expect_error($$select admin_delete_raffle('20000000-0000-0000-0000-000000000ff2')$$, 'un participante no borra sorteos');
select pg_temp.as_user(:'ORG');
select pg_temp.expect_error($$select admin_delete_raffle('20000000-0000-0000-0000-000000000ff2')$$, 'otro organizador no borra el sorteo ajeno');
select pg_temp.as_user(null);
select pg_temp.expect_error($$select admin_delete_raffle('20000000-0000-0000-0000-000000000ff2')$$, 'sin cuenta no se borra');

select pg_temp.as_user(:'ORG2');
select admin_delete_raffle('20000000-0000-0000-0000-000000000ff2');
select pg_temp.as_postgres();
select pg_temp.check(not exists (select 1 from raffles where id = '20000000-0000-0000-0000-000000000ff2'), 'el sorteo se borró');
select pg_temp.check(not exists (select 1 from raffle_numbers where raffle_id = '20000000-0000-0000-0000-000000000ff2'), 'sus números se borraron');
select pg_temp.check(not exists (select 1 from reservations where raffle_id = '20000000-0000-0000-0000-000000000ff2'), 'las anotaciones se borraron');
select pg_temp.check(not exists (select 1 from products where id = '10000000-0000-0000-0000-000000000ff2'), 'el premio propio se borró');
select pg_temp.check(exists (select 1 from raffles where id = '20000000-0000-0000-0000-000000000ff1'), 'el otro sorteo de ORG2 sigue');
\echo 'Borrar sorteo: todas las pruebas pasaron'
