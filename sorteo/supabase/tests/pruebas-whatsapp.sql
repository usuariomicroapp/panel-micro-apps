-- Pruebas de la migración 20261104000018 (WhatsApp del organizador).
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
\set ORG2 '00000000-0000-0000-0000-0000000000e2'
\set PEPA '00000000-0000-0000-0000-0000000000e3'
select set_config('role', 'postgres', false);
update profiles set phone = '11 2222-3333' where id = :'ORG2';
select pg_temp.as_user(:'PEPA');
select pg_temp.check(organizer_whatsapp(:'ORG2') = '1122223333', 'el participante ve el WhatsApp del organizador');
select pg_temp.check(organizer_whatsapp(:'PEPA') is null, 'de un participante no se ve el teléfono');
select pg_temp.as_user(null);
select pg_temp.expect_error(format($$select organizer_whatsapp(%L)$$, :'ORG2'), 'sin cuenta no se ve');
\echo 'WhatsApp del organizador: todas las pruebas pasaron'
