-- Pruebas de la migración 20261104000014 (link del dueño para organizadores).
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

\set OWN  '00000000-0000-0000-0000-0000000000d0'
\set ANA  '00000000-0000-0000-0000-0000000000b1'
\set NUEVO '00000000-0000-0000-0000-0000000000f7'

select pg_temp.as_postgres();
insert into auth.users (id, email, raw_user_meta_data) values (:'NUEVO', 'nuevo@example.com', '{"first_name":"Nico"}');
create temp table k as select code from owner_invite;
grant select on k to anon, authenticated;

select pg_temp.as_user(:'ANA');
select pg_temp.check((select count(*) from owner_invite) = 0, 'un participante no ve el código');
select pg_temp.expect_error($$select owner_reset_invite()$$, 'un participante no cambia el código');
select pg_temp.expect_error($$select join_as_organizer('codigoinventado')$$, 'con un código inventado no pasa');
select pg_temp.as_user(null);
select pg_temp.expect_error(format($$select join_as_organizer(%L)$$, (select code from k)), 'sin cuenta no pasa');

select pg_temp.as_user(:'NUEVO');
select pg_temp.check(join_as_organizer(upper((select code from k))) = 'ok', 'con el link queda como organizador');
select pg_temp.as_postgres();
select pg_temp.check((select role from profiles where id = :'NUEVO') = 'admin', 'tiene rol de organizador');
select pg_temp.check(exists (select 1 from organizer_settings where organizer_id = :'NUEVO'), 'ya tiene su marca y su link');

select pg_temp.as_user(:'OWN');
select pg_temp.check((select count(*) from owner_invite) = 1, 'el dueño ve el código');
select owner_reset_invite();
select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select join_as_organizer(%L)$$, (select code from k)), 'el código viejo ya no sirve');
select pg_temp.as_user(:'OWN');
update profiles set role = 'participant' where id = :'NUEVO';
select pg_temp.as_postgres();
select pg_temp.check((select role from profiles where id = :'NUEVO') = 'participant', 'el dueño le puede quitar el permiso');
\echo 'Link de organizadores: todas las pruebas pasaron'
