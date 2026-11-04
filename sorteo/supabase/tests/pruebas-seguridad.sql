-- Etapa 11: pruebas de "intruso". Se ejecutan al final, con todas las migraciones aplicadas.
-- Cada línea intenta algo que NO debería poder hacerse (o verifica que no se vea un dato ajeno).
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
-- Cuántas filas cambió una orden (0 = la base no la dejó tocar nada).
create or replace function pg_temp.affected(q text) returns int language plpgsql as $$
declare n int; begin execute q; get diagnostics n = row_count; return n; end $$;
-- Cuenta filas sin fallar si la tabla no está permitida (0 = no ve nada).
create or replace function pg_temp.visible(q text) returns int language plpgsql as $$
declare n int; begin execute 'select count(*) from (' || q || ') x' into n; return n; exception when insufficient_privilege then return 0; end $$;

\set ORG '00000000-0000-0000-0000-00000000000a'
\set OWN '00000000-0000-0000-0000-0000000000d0'
\set ANA '00000000-0000-0000-0000-0000000000b1'
\set BETO '00000000-0000-0000-0000-0000000000b2'
\set A '20000000-0000-0000-0000-0000000000a1'

-- ===== Sin sesión (cualquiera en internet) =====
select pg_temp.as_user(null);
select pg_temp.check(pg_temp.visible('select * from profiles') = 0, 'sin sesión no se ven perfiles');
select pg_temp.check(pg_temp.visible('select * from reservations') = 0, 'sin sesión no se ven anotaciones (nombres y teléfonos)');
select pg_temp.check(pg_temp.visible('select * from raffle_numbers') = 0, 'sin sesión no se ve la tabla interna de números');
select pg_temp.check(pg_temp.visible('select * from audit_logs') = 0, 'sin sesión no se ve el historial');
select pg_temp.check(pg_temp.visible('select * from notifications') = 0, 'sin sesión no se ven avisos');
select pg_temp.check(pg_temp.visible('select * from push_subscriptions') = 0, 'sin sesión no se ven celulares');
select pg_temp.check(pg_temp.visible('select * from expenses') = 0, 'sin sesión no se ven gastos');
select pg_temp.expect_error('select user_id from winners', 'sin sesión no se ve qué cuenta ganó');
select pg_temp.check(pg_temp.visible('select id, winning_number from winners') > 0, 'sin sesión sí se ven los ganadores publicados (sin datos personales)');
select pg_temp.expect_error('select acquisition_cost from products', 'sin sesión no se ve el costo de los premios');
select pg_temp.expect_error(format($$select claim_numbers(%L, array[50])$$, :'A'), 'sin sesión no se eligen números');
select pg_temp.expect_error($$select * from admin_products()$$, 'sin sesión no se usa el panel');
select pg_temp.expect_error($$select release_expired_reservations()$$, 'sin sesión no se ejecutan tareas internas');
select pg_temp.expect_error($$update settings set brand_name = 'X'$$, 'sin sesión no se cambia la configuración');
select pg_temp.expect_error($$insert into notifications (user_id, kind, title) values (null, 'resultado', 'falso')$$, 'sin sesión no se mandan avisos');

-- ===== Participante curioso (Ana) =====
select pg_temp.as_user(:'ANA');
select pg_temp.check(pg_temp.visible('select * from profiles') = 1, 'un participante solo ve su perfil');
select pg_temp.check(pg_temp.visible(format('select * from reservations where user_id <> %L', :'ANA')) = 0, 'un participante no ve nombres ni teléfonos de otros');
select pg_temp.check(pg_temp.visible(format('select * from notifications where user_id is not null and user_id <> %L', :'ANA')) = 0, 'no ve avisos ajenos');
select pg_temp.check(pg_temp.visible('select * from audit_logs') = 0, 'no ve el historial');
select pg_temp.check(pg_temp.visible('select * from raffle_numbers') = 0, 'no ve la tabla interna de números');
select pg_temp.expect_error(format($$update profiles set role = 'admin' where id = %L$$, :'ANA'), 'no se puede hacer organizador sola');
select pg_temp.expect_error(format($$update profiles set is_owner = true where id = %L$$, :'ANA'), 'no se puede hacer dueña');
select pg_temp.check(pg_temp.affected($q$update profiles set first_name = 'Hack' where id = '00000000-0000-0000-0000-0000000000b2'$q$) = 0, 'no puede cambiar el perfil de otra persona');
select pg_temp.check(pg_temp.affected($q$update settings set app_paused = false, brand_name = 'Hack'$q$) = 0, 'no toca la configuración');
select pg_temp.check(pg_temp.affected($q$update raffles set name = 'X'$q$) = 0, 'no puede editar sorteos');
select pg_temp.expect_error(format($$insert into winners (raffle_id, lottery_draw_id, winning_number) select %L, id, 1 from lottery_draws limit 1$$, :'A'), 'no puede inventar un ganador');
select pg_temp.expect_error($$update lottery_draws set first_prize = '0000'$$, 'no puede cambiar un resultado oficial');
select pg_temp.expect_error(format($$select * from admin_preview_winner(%L, '1234')$$, :'A'), 'no ve quién tiene cada número');
select pg_temp.expect_error(format($$select admin_manual_entry(%L, array[90], 'X', '1')$$, :'A'), 'no anota gente');
select pg_temp.expect_error($$select owner_backup()$$, 'no descarga la copia');
select pg_temp.expect_error($$select * from take_push_batch()$$, 'no lee avisos para mandar');
select pg_temp.expect_error($$insert into notifications (user_id, kind, title) values (null, 'resultado', 'falso')$$, 'no manda avisos falsos a todos');
select pg_temp.check(pg_temp.affected($q$delete from push_subscriptions$q$) <= 1, 'solo puede borrar su propio celular');

-- ===== Organizador: maneja su app, pero no inventa resultados ni toca al dueño =====
select pg_temp.as_user(:'ORG');
select pg_temp.expect_error($$update lottery_draws set first_prize = '0000'$$, 'el organizador no edita resultados oficiales a mano');
select pg_temp.expect_error($$delete from winners$$, 'el organizador no borra ganadores');
select pg_temp.expect_error(format($$insert into winners (raffle_id, lottery_draw_id, winning_number) select %L, id, 1 from lottery_draws limit 1$$, :'A'), 'el organizador no carga ganadores a mano');
insert into raffles (id, name, product_id, closes_at, starts_at, is_demo, status, official_draw_date, official_draw_slot, unsold_policy)
values ('20000000-0000-0000-0000-0000000000e1', 'Sin resultado', '10000000-0000-0000-0000-000000000001', now() + interval '3 days', now() - interval '1 minute', false, 'active', current_date + 3, 'nocturna', 'desierto');
select pg_temp.expect_error($$update raffles set status = 'drawn' where id = '20000000-0000-0000-0000-0000000000e1'$$, 'no se marca "sorteado" sin publicar el resultado');
select pg_temp.expect_error(format($$update raffles set status = 'active' where id = %L$$, :'A'), 'un sorteo realizado no vuelve atrás');
select pg_temp.expect_error($$update settings set app_paused = true$$, 'el organizador no pausa la app (solo el dueño)');
select pg_temp.expect_error(format($$update profiles set role = 'participant' where id = %L$$, :'OWN'), 'el organizador no toca la cuenta del dueño');
select pg_temp.expect_error($$select owner_backup()$$, 'el organizador no descarga la copia completa');

-- ===== Dueño: copia de seguridad =====
select pg_temp.as_user(:'OWN');
select pg_temp.check((select jsonb_array_length(b -> 'reservations') > 0 and b ? 'profiles' and b ? 'winners' from owner_backup() b), 'el dueño descarga la copia con todas las tablas');
\echo 'Etapa 11: todas las pruebas de seguridad pasaron'
