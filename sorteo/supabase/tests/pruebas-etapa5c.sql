-- Pruebas del dueño y la pausa. Se ejecutan después de pruebas-etapa5b.sql.
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

\set R '20000000-0000-0000-0000-000000000001'
\set ORG '00000000-0000-0000-0000-00000000000a'
\set ANA '00000000-0000-0000-0000-0000000000b1'
\set BETO '00000000-0000-0000-0000-0000000000b2'
\set DUENO '00000000-0000-0000-0000-0000000000d0'

-- Sin dueño cargado, el organizador sigue pudiendo nombrar organizadores (copias viejas siguen andando)
select pg_temp.as_user(:'ORG');
update profiles set role = 'admin' where id = :'BETO';
update profiles set role = 'participant' where id = :'BETO';
select pg_temp.check(true, 'sin dueño, el organizador cambia roles');

-- Se carga el dueño desde la base (como lo hará Sebastián en el SQL Editor)
select pg_temp.as_postgres();
insert into auth.users (id, email) values (:'DUENO', 'dueno@example.com');
update profiles set is_owner = true where id = :'DUENO';

select pg_temp.as_user(:'DUENO');
select pg_temp.check(is_admin() and is_owner(), 'el dueño cuenta como administrador');
select pg_temp.check((select count(*) from profiles) >= 4, 'el dueño ve todas las cuentas');
update profiles set role = 'admin' where id = :'BETO';
select pg_temp.check((select role from profiles where id = :'BETO') = 'admin', 'el dueño nombra un organizador');
update profiles set role = 'participant' where id = :'BETO';

select pg_temp.as_user(:'ORG');
select pg_temp.check(not is_owner(), 'el organizador no es dueño');
select pg_temp.expect_error(format($$update profiles set role = 'admin' where id = %L$$, :'ANA'), 'con dueño cargado, el organizador no cambia roles');
select pg_temp.expect_error(format($$update profiles set is_owner = true where id = %L$$, :'ORG'), 'el organizador no se hace dueño');
select pg_temp.expect_error(format($$update profiles set first_name = 'x' where id = %L$$, :'DUENO'), 'el organizador no toca la cuenta del dueño');
select pg_temp.expect_error($$update settings set app_paused = true$$, 'el organizador no pausa la app');

select pg_temp.as_user(:'DUENO');
select pg_temp.expect_error(format($$update profiles set is_owner = false where id = %L$$, :'DUENO'), 'el dueño solo se cambia desde la base');

-- Pausa
update settings set app_paused = true, paused_message = 'Volvemos pronto';
select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select reserve_numbers(%L, array[70])$$, :'R'), 'con la app pausada no se reserva');
select pg_temp.as_user(:'ORG');
select pg_temp.expect_error(format($$select admin_manual_sale(%L, array[71], 'X', '', true)$$, :'R'), 'con la app pausada no se cargan ventas');
select pg_temp.as_user(null);
select pg_temp.check((select app_paused from settings), 'cualquiera ve que la app está pausada');
select pg_temp.as_user(:'DUENO');
update settings set app_paused = false;
select pg_temp.as_user(:'ANA');
select pg_temp.check((select (reserve_numbers(:'R', array[70])).total) > 0, 'al reanudar se puede reservar de nuevo');

\echo 'PRUEBAS DEL DUEÑO Y LA PAUSA PASARON'
