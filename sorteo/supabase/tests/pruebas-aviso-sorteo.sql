-- Pruebas de la migración 20261104000017 (aviso de sorteo nuevo).
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false), set_config('role', case when u is null then 'anon' else 'authenticated' end, false);
$$;
create or replace function pg_temp.as_postgres() returns void language sql as $$ select set_config('role', 'postgres', false), set_config('request.jwt.claim.sub', '', false); $$;
create or replace function pg_temp.check(cond boolean, why text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', why; end if; raise notice 'OK: %', why; end $$;

\set ORG2 '00000000-0000-0000-0000-0000000000e2'
\set PEPA '00000000-0000-0000-0000-0000000000e3'
\set NUEVO '00000000-0000-0000-0000-0000000000f7'
\set ANA  '00000000-0000-0000-0000-0000000000b1'

select pg_temp.as_postgres();
delete from notifications where kind = 'nuevo_sorteo';
-- Ana entra con el link de ORG2 y queda siguiéndolo. Seguir a alguien que no es organizador no hace nada.
select pg_temp.as_user(:'ANA');
select follow_organizer(:'ORG2');
select follow_organizer(:'PEPA');
select pg_temp.check((select count(*) from organizer_followers where user_id = auth.uid()) = 1, 'Ana sigue solo al organizador');

-- ORG2 publica un sorteo: avisa a Ana (seguidora) y a Pepa (ya eligió números en su sorteo).
select pg_temp.as_user(:'ORG2');
insert into products (id, name, show_in_store) values ('10000000-0000-0000-0000-000000000ff3', 'Horno', false);
insert into raffles (id, name, product_id, closes_at, starts_at, status, unsold_policy)
values ('20000000-0000-0000-0000-000000000ff3', 'Horno', '10000000-0000-0000-0000-000000000ff3', '2100-01-01', now(), 'active', 'siguiente_sorteo');
select pg_temp.as_postgres();
select pg_temp.check((select count(*) from notifications where kind = 'nuevo_sorteo' and user_id = :'ANA') = 1, 'a Ana le llega el aviso');
select pg_temp.check((select count(*) from notifications where kind = 'nuevo_sorteo' and user_id = :'PEPA') = 1, 'a Pepa le llega el aviso');
select pg_temp.check((select count(*) from notifications where kind = 'nuevo_sorteo' and user_id = :'ORG2') = 0, 'al organizador no');

-- Cambiarle el nombre no vuelve a avisar.
select pg_temp.as_user(:'ORG2');
update raffles set name = 'Horno eléctrico' where id = '20000000-0000-0000-0000-000000000ff3';
select pg_temp.as_postgres();
select pg_temp.check((select count(*) from notifications where kind = 'nuevo_sorteo') = 2, 'editar no repite el aviso');
\echo 'Aviso de sorteo nuevo: todas las pruebas pasaron'
