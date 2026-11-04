-- Pruebas de la Etapa 5 (productos y sorteos desde el panel). Se ejecutan después de pruebas.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false), set_config('role', case when u is null then 'anon' else 'authenticated' end, false);
$$;
create or replace function pg_temp.expect_error(q text, why text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'OK (rechazado): % -> %', why, sqlerrm; return; end;
  raise exception 'FALLÓ: debía rechazarse: %', why;
end $$;
create or replace function pg_temp.check(cond boolean, why text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', why; end if; raise notice 'OK: %', why; end $$;

-- El admin crea un producto con foto y lo ve con su costo
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into products (id, name, prize_info, reference_price, acquisition_cost)
values ('10000000-0000-0000-0000-000000000005', 'Bicicleta', 'Rodado 29, nueva', 400000, 300000);
insert into product_photos (product_id, path) values ('10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005/a.jpg');
select pg_temp.check((select acquisition_cost from admin_products() where id = '10000000-0000-0000-0000-000000000005') = 300000, 'el admin ve el costo con admin_products()');
update products set name = 'Bicicleta MTB' where id = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect_error($$insert into product_photos (product_id, path) values ('10000000-0000-0000-0000-000000000005', '../x y.jpg')$$, 'la ruta de una foto no admite caracteres raros');

-- Sorteo en borrador con 1000 números (3 cifras)
insert into raffles (id, name, product_id, price_per_number, total_numbers, digits, closes_at)
values ('20000000-0000-0000-0000-000000000005', 'Bici 1000', '10000000-0000-0000-0000-000000000005', 1000, 1000, 3, now() + interval '3 days');
select pg_temp.check((select count(*) from raffle_numbers where raffle_id = '20000000-0000-0000-0000-000000000005') = 1000, 'un sorteo de 1000 números genera 000-999');
select pg_temp.expect_error($$insert into raffles (name, product_id, price_per_number, total_numbers, digits, closes_at) values ('x', '10000000-0000-0000-0000-000000000005', 1, 1000, 2, now() + interval '1 day')$$, '1000 números no entran en 2 cifras');
select pg_temp.expect_error($$insert into raffles (name, product_id, price_per_number, closes_at, starts_at) values ('x', '10000000-0000-0000-0000-000000000005', 1, now(), now() + interval '1 day')$$, 'el cierre debe ser posterior al inicio');
select pg_temp.expect_error($$delete from products where id = '10000000-0000-0000-0000-000000000005'$$, 'no se borra un producto que tiene sorteos');
select pg_temp.check((select count(*) from raffle_stats('20000000-0000-0000-0000-000000000005')) = 1, 'el admin ve las estadísticas del sorteo');

-- Un visitante no ve borradores, sí ve activos con su producto y su foto
select pg_temp.as_user(null);
select pg_temp.check(not exists (select 1 from raffles where id = '20000000-0000-0000-0000-000000000005'), 'un visitante no ve sorteos en borrador');
select pg_temp.check((select count(*) from raffles r join products p on p.id = r.product_id where r.status = 'active') >= 1, 'un visitante ve sorteos activos con nombre de producto');
select pg_temp.check(exists (select 1 from product_photos where product_id = '10000000-0000-0000-0000-000000000005'), 'un visitante ve las fotos del premio');

-- Al publicarlo aparece
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update raffles set official_draw_date = current_date + 3, official_draw_slot = 'nocturna', unsold_policy = 'siguiente_sorteo', status = 'active'
 where id = '20000000-0000-0000-0000-000000000005';
select pg_temp.as_user(null);
select pg_temp.check((select count(*) from public_raffle_numbers where raffle_id = '20000000-0000-0000-0000-000000000005') = 1000, 'al publicarlo el visitante ve su grilla completa');

-- Un participante no puede tocar productos, fotos ni sorteos
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error($$insert into product_photos (product_id, path) values ('10000000-0000-0000-0000-000000000005', 'x.jpg')$$, 'un participante no puede subir fotos');
select pg_temp.expect_error($$insert into raffles (name, product_id, price_per_number, closes_at) values ('x', '10000000-0000-0000-0000-000000000005', 1, now() + interval '1 day')$$, 'un participante no puede crear sorteos');
update raffles set price_per_number = 1 where id = '20000000-0000-0000-0000-000000000005';
select pg_temp.check((select price_per_number from raffles where id = '20000000-0000-0000-0000-000000000005') = 1000, 'un participante no puede cambiar el precio');
select pg_temp.expect_error($$select raffle_stats('20000000-0000-0000-0000-000000000005')$$, 'un participante no ve las estadísticas');
select pg_temp.expect_error($$select * from admin_products()$$, 'un participante no puede usar admin_products()');

\echo 'PRUEBAS DE LA ETAPA 5 PASARON'
