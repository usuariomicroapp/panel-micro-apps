-- Pruebas de la migración 20261104000012 (ventas del dueño).
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
\set OWN '00000000-0000-0000-0000-0000000000d0'
\set ANA '00000000-0000-0000-0000-0000000000b1'

select pg_temp.as_user(:'OWN');
insert into owner_sales (client_id, client_name, concept, amount, status) values (:'ORG', 'Organizador', 'App y diseño', 50000, 'pagado');
insert into owner_sales (client_id, client_name, concept, amount, status) values (:'ORG', 'Organizador', 'Mes de noviembre', 10000, 'pendiente');
select pg_temp.check((select count(*) from owner_sales) = 2, 'el dueño anota y ve sus ventas');
select pg_temp.check((owner_backup() -> 'owner_sales') is not null and jsonb_array_length(owner_backup() -> 'owner_sales') = 2, 'la copia incluye las ventas');
select pg_temp.expect_error($$insert into owner_sales (amount) values (-5)$$, 'monto negativo');

select pg_temp.as_user(:'ORG');
select pg_temp.check((select count(*) from owner_sales) = 0, 'el organizador no ve las ventas');
select pg_temp.expect_error($$insert into owner_sales (amount) values (1)$$, 'el organizador no anota ventas');
update owner_sales set amount = 0;
select pg_temp.as_user(:'ANA');
select pg_temp.check((select count(*) from owner_sales) = 0, 'el participante no ve las ventas');
select pg_temp.as_user(null);
select pg_temp.expect_error($$select count(*) from owner_sales$$, 'sin sesión no se ve nada');
select pg_temp.as_postgres();
select pg_temp.check((select sum(amount) from owner_sales) = 60000, 'nadie más pudo cambiar montos');
\echo 'Ventas del dueño: todas las pruebas pasaron'
