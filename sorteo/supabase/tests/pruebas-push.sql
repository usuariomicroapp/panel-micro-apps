-- Pruebas de la Etapa 10 (migración 20261104000009). Se ejecutan después de pruebas-resultados.sql.
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

-- Cada persona registra su celular
select pg_temp.as_user(null);
select pg_temp.expect_error($$select save_push_subscription('https://push.example/a', '{"p256dh":"x","auth":"y"}')$$, 'sin sesión no se registra');
select pg_temp.as_user(:'BETO');
select pg_temp.expect_error($$select save_push_subscription('http://push.example/a', '{"p256dh":"x","auth":"y"}')$$, 'solo direcciones https');
select pg_temp.expect_error($$select save_push_subscription('https://push.example/a', '{"p256dh":1}')$$, 'claves inválidas');
select save_push_subscription('https://push.example/beto', '{"p256dh":"pb","auth":"ab"}');
select pg_temp.as_user(:'ANA');
select save_push_subscription('https://push.example/ana', '{"p256dh":"pa","auth":"aa"}');
select pg_temp.check((select count(*) from push_subscriptions) = 1, 'cada persona ve solo su celular');
-- El mismo celular pasa a otra cuenta si cambia la sesión
select save_push_subscription('https://push.example/beto', '{"p256dh":"pb","auth":"ab"}');
select pg_temp.as_postgres();
select pg_temp.check((select user_id from push_subscriptions where endpoint = 'https://push.example/beto') = :'ANA', 'el celular queda a nombre de quien inició sesión');
update push_subscriptions set user_id = :'BETO' where endpoint = 'https://push.example/beto';

-- Lote de envío
update notifications set pushed_at = now();
insert into notifications (user_id, kind, title, body, link) values
  (:'BETO', 'ganador', '¡Ganaste!', 'Salió tu número', '/resultados'),
  (:'ANA', 'resultado', 'Resultado', 'No ganaste', '/resultados');
insert into notifications (user_id, kind, title, body, created_at) values (:'ANA', 'resultado', 'Viejo', '', now() - interval '2 days');
select pg_temp.as_user(:'ANA');
select pg_temp.expect_error($$select * from take_push_batch()$$, 'un participante no puede leer avisos ajenos para enviar');
select pg_temp.expect_error($$select drop_push_endpoints(array['https://push.example/beto'])$$, 'un participante no borra celulares ajenos');
select pg_temp.as_user(:'ORG');
create temp table lote as select * from take_push_batch();
select pg_temp.check((select count(*) from lote) = 2, 'se envían solo los avisos nuevos (no los de hace días)');
select pg_temp.check((select subs -> 0 ->> 'endpoint' from lote where title = '¡Ganaste!') = 'https://push.example/beto', 'cada aviso va al celular de su dueño');
select pg_temp.check((select count(*) from take_push_batch()) = 0, 'un aviso no se manda dos veces');
select drop_push_endpoints(array['https://push.example/ana']);
select pg_temp.as_postgres();
select pg_temp.check(not exists (select 1 from push_subscriptions where endpoint = 'https://push.example/ana'), 'se borran celulares que ya no aceptan avisos');
\echo 'Etapa 10: todas las pruebas pasaron'
