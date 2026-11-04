-- Pruebas de la migración 20261104000013 (cada organizador con lo suyo).
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

\set ORG  '00000000-0000-0000-0000-00000000000a'
\set OWN  '00000000-0000-0000-0000-0000000000d0'
\set ANA  '00000000-0000-0000-0000-0000000000b1'
\set ORG2 '00000000-0000-0000-0000-0000000000e2'
\set PEPA '00000000-0000-0000-0000-0000000000e3'

select pg_temp.as_postgres();
select pg_temp.check(not exists (select 1 from raffles where organizer_id is null) and not exists (select 1 from products where organizer_id is null), 'lo cargado antes quedó con dueño');
select pg_temp.check((select count(distinct organizer_id) from raffles) = 1 and (select organizer_id from raffles limit 1) = :'ORG', 'lo viejo quedó del primer organizador');
select pg_temp.check(exists (select 1 from organizer_settings where organizer_id = :'ORG') and exists (select 1 from organizer_settings where organizer_id = :'OWN'), 'organizador y dueño tienen su marca');

-- Un cliente nuevo del dueño: se registra y el dueño lo habilita.
insert into auth.users (id, email, raw_user_meta_data) values (:'ORG2', 'marce@example.com', '{"first_name":"Marce"}'), (:'PEPA', 'pepa@example.com', '{"first_name":"Pepa"}');
select pg_temp.as_user(:'OWN');
update profiles set role = 'admin' where id = :'ORG2';
select pg_temp.as_postgres();
select pg_temp.check((select length(code) from organizer_settings where organizer_id = :'ORG2') = 6, 'al habilitarlo se crea su marca con su código');
select pg_temp.check(not exists (select 1 from organizer_settings where organizer_id = :'PEPA'), 'un participante no tiene marca');

-- ORG2 carga su premio y su sorteo.
select pg_temp.as_user(:'ORG2');
insert into products (id, name) values ('10000000-0000-0000-0000-000000000ff1', 'Moto');
select pg_temp.check((select organizer_id from products where id = '10000000-0000-0000-0000-000000000ff1') = :'ORG2', 'el premio queda a su nombre solo');
select pg_temp.expect_error(format($$insert into products (name, organizer_id) values ('trampa', %L)$$, :'ORG'), 'no carga premios a nombre de otro');
select pg_temp.expect_error($$insert into raffles (name, product_id, closes_at, starts_at) select 'trampa', id, now() + interval '5 days', now() from products where organizer_id <> auth.uid() limit 1$$, 'no usa el premio de otro');
insert into raffles (id, name, product_id, closes_at, starts_at, is_demo, status, official_draw_date, official_draw_slot, unsold_policy)
values ('20000000-0000-0000-0000-000000000ff1', 'Moto', '10000000-0000-0000-0000-000000000ff1', now() + interval '5 days', now() - interval '1 minute', false, 'active', current_date + 5, 'nocturna', 'desierto');
select pg_temp.check((select count(*) from admin_products()) = 1, 'en su panel ve solo su premio');
select pg_temp.check((select count(*) from raffles where organizer_id = auth.uid()) = 1, 've su sorteo');
update raffles set name = 'hackeado' where organizer_id = :'ORG';
update products set name = 'hackeado' where organizer_id = :'ORG';
select pg_temp.check((select count(*) from reservations) = 0, 'no ve las anotaciones de los sorteos de otro');
select pg_temp.check((select count(*) from raffle_numbers) = 100, 've solo la grilla interna de su sorteo');
select pg_temp.check((select count(*) from profiles) = 1, 'no ve las cuentas de los participantes de otro');
select pg_temp.check((select count(*) from audit_logs where actor <> auth.uid()) = 0, 'no ve el historial de otro');
select pg_temp.expect_error(format($$select raffle_stats(%L)$$, (select id from raffles where organizer_id = :'ORG' limit 1)), 'no ve estadísticas del sorteo de otro');
select pg_temp.expect_error(format($$select * from admin_preview_winner(%L, '1234')$$, (select id from raffles where organizer_id = :'ORG' limit 1)), 'no ve el ganador del sorteo de otro');
select pg_temp.expect_error(format($$select * from admin_publish_result(%L, '1234')$$, (select id from raffles where organizer_id = :'ORG' limit 1)), 'no publica el resultado de otro');
select pg_temp.expect_error(format($$select admin_set_draw(%L, current_date + 3, 'nocturna')$$, (select id from raffles where organizer_id = :'ORG' limit 1)), 'no cambia la fecha del sorteo de otro');
select pg_temp.expect_error(format($$select admin_manual_entry(%L, array[90], 'X', '')$$, (select id from raffles where organizer_id = :'ORG' and status = 'active' limit 1)), 'no anota gente en el sorteo de otro');
select pg_temp.expect_error($$select admin_set_password('ana@example.com', 'clave-nueva-99')$$, 'no cambia la contraseña de un participante de otro');
select pg_temp.expect_error(format($$update raffles set organizer_id = %L where organizer_id = auth.uid()$$, :'ORG'), 'no le pasa su sorteo a otro');
update organizer_settings set brand_name = 'hackeado' where organizer_id = :'ORG';
update organizer_settings set brand_name = 'Rifas de Marce', group_link = 'https://chat.whatsapp.com/x' where organizer_id = auth.uid();
select pg_temp.expect_error($$update organizer_settings set code = 'trucho' where organizer_id = auth.uid()$$, 'el código no se cambia a mano');
select admin_manual_entry('20000000-0000-0000-0000-000000000ff1', array[7], 'Doña Rosa', '11 1111');
select pg_temp.check((select count(*) from reservations) = 1, 'anota en persona en su sorteo');

-- Pepa elige en el sorteo de ORG2: ORG2 la ve y le puede cambiar la contraseña.
select pg_temp.as_postgres();
update profiles set phone = '11 3333-4444' where id = :'PEPA';
select pg_temp.as_user(:'PEPA');
select claim_numbers('20000000-0000-0000-0000-000000000ff1', array[3]);
select pg_temp.as_user(:'ORG2');
select pg_temp.check((select count(*) from profiles) = 2, 've la cuenta de quien eligió en su sorteo');
select admin_set_password('pepa@example.com', 'clave-pepa-123');

select pg_temp.as_postgres();
select pg_temp.check(not exists (select 1 from raffles where name = 'hackeado') and not exists (select 1 from products where name = 'hackeado'), 'no pudo tocar sorteos ni premios de otro');
select pg_temp.check((select brand_name from organizer_settings where organizer_id = :'ORG') <> 'hackeado', 'no pudo tocar la marca de otro');
select pg_temp.check((select brand_name from organizer_settings where organizer_id = :'ORG2') = 'Rifas de Marce', 'cambió su propia marca');

-- El organizador viejo sigue manejando lo suyo, y no ve lo de ORG2.
select pg_temp.as_user(:'ORG');
select pg_temp.check((select count(*) from admin_products()) >= 1 and not exists (select 1 from admin_products() where organizer_id = :'ORG2'), 'el primer organizador ve solo sus premios');
select pg_temp.check(not exists (select 1 from reservations r join raffles ra on ra.id = r.raffle_id where ra.organizer_id = :'ORG2'), 'el primer organizador no ve las anotaciones de ORG2');

-- Los participantes ven todos los sorteos públicos y cada resultado dice de quién es.
select pg_temp.as_user(null);
select pg_temp.check((select count(distinct organizer_id) from raffles) = 2, 'el público ve los sorteos activos de los dos');
select pg_temp.check((select count(*) from organizer_settings) >= 3, 'el público lee las marcas');
select pg_temp.expect_error($$select raffle_stats_base(gen_random_uuid())$$, 'las funciones originales no se llaman desde afuera');

-- El dueño ve todo.
select pg_temp.as_user(:'OWN');
select pg_temp.check((select count(*) from admin_products()) = (select count(*) from products), 'el dueño ve todos los premios');
select pg_temp.check(jsonb_array_length(owner_backup() -> 'organizer_settings') >= 3, 'la copia incluye las marcas');
\echo 'Cada organizador: todas las pruebas pasaron'
