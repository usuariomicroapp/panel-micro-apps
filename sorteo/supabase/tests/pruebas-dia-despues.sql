-- Pruebas de la migración 20261104000015 (el día del sorteo se carga después).
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

\set ORG2 '00000000-0000-0000-0000-0000000000e2'
\set PEPA '00000000-0000-0000-0000-0000000000e3'

-- ORG2 publica un sorteo sin día ni Quiniela.
select pg_temp.as_user(:'ORG2');
insert into products (id, name, show_in_store) values ('10000000-0000-0000-0000-000000000ff2', 'Tele', false);
insert into raffles (id, name, product_id, closes_at, starts_at, status, unsold_policy)
values ('20000000-0000-0000-0000-000000000ff2', 'Tele', '10000000-0000-0000-0000-000000000ff2', '2100-01-01T00:00:00Z', now() - interval '1 minute', 'active', 'siguiente_sorteo');
select pg_temp.check((select official_draw_date is null and status = 'active' from raffles where id = '20000000-0000-0000-0000-000000000ff2'), 'se publica activo sin día del sorteo');
select pg_temp.expect_error($$insert into raffles (name, product_id, closes_at, starts_at, status, unsold_policy) values ('x', '10000000-0000-0000-0000-000000000ff2', '2100-01-01', now(), 'active', null)$$, 'activo sigue necesitando qué pasa si nadie tiene el número');
select pg_temp.expect_error($$select * from admin_publish_result('20000000-0000-0000-0000-000000000ff2', '1234')$$, 'sin día no se puede publicar resultado');

-- La gente elige números mientras tanto.
select pg_temp.as_user(:'PEPA');
select claim_numbers('20000000-0000-0000-0000-000000000ff2', array[5]);
select pg_temp.check((select count(*) from reservations where raffle_id = '20000000-0000-0000-0000-000000000ff2') = 1, 'se eligen números sin día cargado');
select pg_temp.as_user(null);
select pg_temp.check((select count(*) from raffles where id = '20000000-0000-0000-0000-000000000ff2') = 1, 'el público ve el sorteo sin día');

-- Cuando quiere, ORG2 carga el día y la Quiniela: se avisa a quien eligió.
select pg_temp.as_user(:'ORG2');
select admin_set_draw('20000000-0000-0000-0000-000000000ff2', (current_date + 3 + case when extract(isodow from current_date + 3) = 7 then 1 else 0 end)::date, 'matutina');
select pg_temp.check((select official_draw_slot = 'matutina' and closes_at < '2100-01-01' from raffles where id = '20000000-0000-0000-0000-000000000ff2'), 'queda cargado el día y la hora de cierre');
select pg_temp.as_postgres();
select pg_temp.check((select count(*) from notifications where user_id = :'PEPA' and title = 'Ya hay día del sorteo') = 1, 'a Pepa le llega el aviso del día');
\echo 'Día después: todas las pruebas pasaron'
