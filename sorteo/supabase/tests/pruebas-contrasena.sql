-- Pruebas de la migración 20261104000011 (cambiar contraseña desde el panel).
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

select pg_temp.as_postgres();
create temp table emails as select id, email, role, is_owner from profiles where id in (:'ORG', :'OWN', :'ANA');
grant select on emails to anon, authenticated;
select pg_temp.check((select count(*) from emails) = 3, 'están las tres cuentas de prueba');

select pg_temp.as_user(null);
select pg_temp.expect_error(format($$select admin_set_password(%L, 'clave-nueva-1')$$, (select email from emails where id = :'ANA')), 'sin sesión no se cambian contraseñas');
select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select admin_set_password(%L, 'clave-nueva-1')$$, (select email from emails where id = :'ANA')), 'un participante no usa esta función');
select pg_temp.as_user(:'ORG');
select pg_temp.expect_error(format($$select admin_set_password(%L, 'corta')$$, (select email from emails where id = :'ANA')), 'mínimo 8 caracteres');
select pg_temp.expect_error($$select admin_set_password('nadie@example.com', 'clave-nueva-1')$$, 'correo inexistente');
select pg_temp.expect_error(format($$select admin_set_password(%L, 'clave-nueva-1')$$, (select email from emails where id = :'OWN')), 'el organizador no toca la contraseña del dueño');
select admin_set_password(upper((select email from emails where id = :'ANA')), 'clave-nueva-1');
select pg_temp.as_postgres();
select pg_temp.check((select encrypted_password = extensions.crypt('clave-nueva-1', encrypted_password) from auth.users where id = :'ANA'), 'la contraseña nueva funciona (sin importar mayúsculas del correo)');
select pg_temp.check(exists (select 1 from audit_logs where action = 'cambio_contrasena' and record_id = :'ANA' and actor = :'ORG' and not (new_data::text ilike '%clave-nueva%')), 'queda en el historial, sin la contraseña');
select pg_temp.as_user(:'OWN');
select admin_set_password((select email from emails where id = :'ORG'), 'clave-org-1234');
select pg_temp.as_postgres();
select pg_temp.check((select encrypted_password = extensions.crypt('clave-org-1234', encrypted_password) from auth.users where id = :'ORG'), 'el dueño puede cambiar la de un organizador');
\echo 'Cambiar contraseña: todas las pruebas pasaron'
