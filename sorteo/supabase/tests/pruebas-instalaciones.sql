-- Pruebas de la migración 20261104000019 (instalaciones).
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false), set_config('role', case when u is null then 'anon' else 'authenticated' end, false);
$$;
create or replace function pg_temp.check(cond boolean, why text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', why; end if; raise notice 'OK: %', why; end $$;
create or replace function pg_temp.expect_error(q text, why text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK (rechazado): % -> %', why, sqlerrm; return; end;
  raise exception 'FALLÓ: debía rechazarse: %', why;
end $$;
\set OWN  '00000000-0000-0000-0000-0000000000d0'
\set ORG2 '00000000-0000-0000-0000-0000000000e2'
\set PEPA '00000000-0000-0000-0000-0000000000e3'

select pg_temp.as_user(null);
select register_install('aparato-uno-1234567890', 'android', :'ORG2');
select register_install('aparato-uno-1234567890', 'android', null);
select register_install('mal', 'android', null);
select pg_temp.expect_error($$select * from app_installs$$, 'nadie lee la tabla directo');
select pg_temp.as_user(:'PEPA');
select register_install('aparato-uno-1234567890', 'android', null);
select register_install('aparato-dos-1234567890', 'iphone', :'PEPA');
select pg_temp.expect_error($$select * from owner_install_stats()$$, 'un participante no ve las estadísticas');
select pg_temp.as_user(:'ORG2');
select pg_temp.expect_error($$select * from owner_install_stats()$$, 'un organizador no ve las estadísticas');
select pg_temp.as_user(:'OWN');
select pg_temp.check((select total from owner_install_stats()) = 2, 'cuenta 2 aparatos (repetido y código malo no suman)');
select pg_temp.check((select this_month from owner_install_stats()) = 2, 'los 2 son de este mes');
select pg_temp.check((select with_account from owner_install_stats()) = 2, 'los 2 con cuenta');
select pg_temp.check((select android from owner_install_stats()) = 1 and (select iphone from owner_install_stats()) = 1, 'por tipo de celular');
select set_config('role', 'postgres', false);
select pg_temp.check((select organizer_id from app_installs where device_id = 'aparato-uno-1234567890') = :'ORG2', 'queda de qué organizador vino');
select pg_temp.check((select organizer_id from app_installs where device_id = 'aparato-dos-1234567890') is null, 'un participante no cuenta como organizador');
\echo 'Instalaciones: todas las pruebas pasaron'
