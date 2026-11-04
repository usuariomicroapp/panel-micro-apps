-- Pruebas de la Etapa 8 (migración 20261104000008). Se ejecutan después de pruebas-gratuitos.sql.
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
-- Próximo día hábil (lunes a sábado) a partir de mañana + n.
create or replace function pg_temp.dia(n int) returns date language sql as $$
  select d::date from generate_series(current_date + n, current_date + n + 3, interval '1 day') d where extract(isodow from d) <> 7 limit 1;
$$;

\set ORG '00000000-0000-0000-0000-00000000000a'
\set ANA '00000000-0000-0000-0000-0000000000b1'
\set BETO '00000000-0000-0000-0000-0000000000b2'
\set P '10000000-0000-0000-0000-000000000001'
\set A '20000000-0000-0000-0000-0000000000a1'
\set B '20000000-0000-0000-0000-0000000000a2'
\set C '20000000-0000-0000-0000-0000000000a3'

select pg_temp.as_postgres();
select pg_temp.check((select count(*) = count(distinct raffle_no) and count(raffle_no) = count(*) from raffles), 'cada sorteo existente recibió su número');

-- Tres sorteos: cada uno con su número
select pg_temp.as_user(:'ORG');
insert into raffles (id, name, product_id, closes_at, starts_at, is_demo, status, official_draw_date, official_draw_slot, unsold_policy, max_numbers_per_reservation)
values (:'A', 'Bici', :'P', now() + interval '30 days', now() - interval '1 minute', false, 'active', current_date + 30, 'nocturna', 'desierto', 3),
       (:'B', 'Tele', :'P', now() + interval '30 days', now() - interval '1 minute', false, 'active', current_date + 30, 'nocturna', 'siguiente_sorteo', 3),
       (:'C', 'Horno', :'P', now() + interval '30 days', now() - interval '1 minute', false, 'active', current_date + 30, 'nocturna', 'segundo_premio', 3);
select pg_temp.check((select count(distinct raffle_no) from raffles where id in (:'A', :'B', :'C')) = 3, 'tres sorteos tienen tres números distintos');

-- Cargar día del sorteo
select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select admin_set_draw(%L, %L, 'nocturna')$$, :'A', pg_temp.dia(3)), 'un participante no carga el día');
select pg_temp.as_user(:'ORG');
select pg_temp.expect_error(format($$select admin_set_draw(%L, current_date - 1, 'nocturna')$$, :'A'), 'no se carga un día que ya pasó');
select pg_temp.expect_error(format($$select admin_set_draw(%L, %L, 'nocturna')$$, :'A',
  (select d::date from generate_series(current_date + 1, current_date + 7, interval '1 day') d where extract(isodow from d) = 7 limit 1)), 'los domingos no hay Quiniela');
select admin_set_draw(:'A', pg_temp.dia(3), 'vespertina');
select pg_temp.check((select official_draw_slot = 'vespertina' and closes_at = draw_moment(pg_temp.dia(3), 'vespertina') from raffles where id = :'A'),
  'se guarda día y turno, y se puede elegir hasta que empieza la Quiniela');
select pg_temp.check((select to_char(closes_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') from raffles where id = :'A') = '18:00', 'la vespertina es a las 18:00 de Argentina');

-- Con números elegidos se puede cambiar el día y se avisa
select pg_temp.as_user(:'BETO');
select (claim_numbers(:'A', array[37])).id \gset ba_
select claim_numbers(:'B', array[37]);
select claim_numbers(:'C', array[60]);
select pg_temp.as_user(:'ANA');
update profiles set first_name = 'Ana', last_name = 'Pérez', phone = '11 4444-5555' where id = auth.uid();
select claim_numbers(:'A', array[12]);
select pg_temp.as_user(:'ORG');
select admin_manual_entry(:'C', array[87], 'Doña Rosa', '11 5555-6666');
select admin_set_draw(:'A', pg_temp.dia(4), 'nocturna');
select pg_temp.check((select count(*) from notifications where kind = 'cambio_fecha' and user_id in (:'ANA', :'BETO') and link = '/sorteo/' || :'A') = 2, 'quienes tienen números reciben el aviso del cambio de día');
select pg_temp.expect_error(format($$update raffles set unsold_policy = 'segundo_premio' where id = %L$$, :'A'), 'las demás reglas siguen fijas con números elegidos');

-- Antes de la hora no se publica
select pg_temp.expect_error(format($$select * from admin_publish_result(%L, '4537')$$, :'A'), 'no se publica antes de la Quiniela');

-- Pasa el día (simulado)
select pg_temp.as_postgres();
update raffles set official_draw_date = current_date - 1, starts_at = now() - interval '5 days', closes_at = now() - interval '1 day' where id in (:'A', :'B', :'C');
select pg_temp.as_user(:'ANA');
select pg_temp.expect_error(format($$select * from admin_preview_winner(%L, '4537')$$, :'A'), 'un participante no ve quién ganó antes de publicar');
select pg_temp.expect_error(format($$select * from admin_publish_result(%L, '4537')$$, :'A'), 'un participante no publica resultados');

-- Ganador: últimas 2 cifras del 1.er premio
select pg_temp.as_user(:'ORG');
select pg_temp.expect_error(format($$select * from admin_preview_winner(%L, '453')$$, :'A'), 'el 1.er premio debe tener 4 cifras');
select pg_temp.check((select name || ' ' || winning_number || ' ' || outcome from admin_preview_winner(:'A', '4537')) = 'Beto Gómez 37 ganador', 'la vista previa muestra al ganador');
select pg_temp.expect_error(format($$select * from admin_publish_result(%L, '4537', null, array['1111'])$$, :'A'), 'la lista tiene que empezar con el 1.er premio');
select pg_temp.check((select outcome || ' ' || phone from admin_publish_result(:'A', '4537', null, array['4537','1234'], true)) = 'ganador 11 2222-3333', 'se publica y el organizador ve el teléfono del ganador');
select pg_temp.check((select status from raffles where id = :'A') = 'drawn', 'el sorteo queda sorteado');
select pg_temp.check(exists (select 1 from notifications where user_id = :'BETO' and kind = 'ganador'), 'el ganador recibe el aviso');
select pg_temp.check(exists (select 1 from notifications where user_id = :'ANA' and kind = 'resultado' and title like '%Bici%'), 'los demás reciben el resultado');
select pg_temp.check(not exists (select 1 from notifications where user_id = :'BETO' and kind = 'resultado' and title like '%Bici%'), 'el ganador no recibe además el aviso de perdedor');
select pg_temp.expect_error(format($$select * from admin_publish_result(%L, '1111')$$, :'A'), 'no se publica dos veces');
select pg_temp.expect_error(format($$select admin_set_draw(%L, %L, 'nocturna')$$, :'A', pg_temp.dia(3)), 'un sorteo terminado no cambia de día');
select pg_temp.expect_error(format($$select cancel_reservation(%L)$$, :'ba_id'), 'después del sorteo no se sueltan números');

-- Resultados públicos
select pg_temp.as_user(null);
select pg_temp.check((select winner_label || ' ' || first_prize || ' ' || winning_number from public_results() where raffle_id = :'A') = 'Beto G. 4537 37', 'el público ve número y nombre abreviado');
select pg_temp.check((select to_jsonb(r)::text from public_results() r where raffle_id = :'A') !~ '2222', 'el público no ve el teléfono');
select pg_temp.as_user(:'BETO');
select pg_temp.check((select is_mine from public_results() where raffle_id = :'A'), 'el ganador ve que es suyo');

-- Nadie tiene el número y la regla es pasar al siguiente sorteo
select pg_temp.as_user(:'ORG');
select pg_temp.check((select outcome from admin_publish_result(:'B', '9999')) = 'siguiente_sorteo', 'sin ganador pasa al siguiente sorteo');
select pg_temp.check((select status = 'active' and needs_new_draw from raffles where id = :'B'), 'el sorteo sigue y pide nuevo día');
select pg_temp.expect_error(format($$select * from admin_publish_result(%L, '1137')$$, :'B'), 'no se publica hasta cargar el nuevo día');
select admin_set_draw(:'B', pg_temp.dia(1), 'primera');
select pg_temp.check((select not needs_new_draw from raffles where id = :'B'), 'con el nuevo día queda listo');

-- Segundo premio y anotado en persona
select pg_temp.check((select outcome from admin_preview_winner(:'C', '1200')) = 'falta_segundo', 'pide el 2.º premio si nadie tiene el 1.º');
select pg_temp.expect_error(format($$select * from admin_publish_result(%L, '1200')$$, :'C'), 'sin 2.º premio no se publica');
select pg_temp.check((select name || ' ' || winning_number || ' ' || from_app from admin_preview_winner(:'C', '1200', '3487')) = 'Doña Rosa 87 false', 'gana con el 2.º premio una persona anotada en persona');
select pg_temp.check((select outcome from admin_publish_result(:'C', '1200', '3487', array['1200','3487'], true)) = 'ganador', 'se publica el ganador anotado en persona');
select pg_temp.check((select first_prize from lottery_draws where draw_date = current_date - 1 and draw_slot = 'nocturna') = '1200', 'el resultado oficial queda guardado una sola vez por turno');
select pg_temp.as_user(null);
select pg_temp.check((select winner_label from public_results() where raffle_id = :'C') = 'Doña R.', 'el público ve el nombre abreviado de la persona anotada');
\echo 'Etapa 8: todas las pruebas pasaron'
