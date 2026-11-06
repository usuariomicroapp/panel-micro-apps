-- Pruebas de reglas y seguridad. Uso: createdb t; psql -d t -f tests/supabase_shim.sql -f base.sql -f tests/pruebas.sql
\set ON_ERROR_STOP off
create temp table res(n text, ok boolean);
grant all on res to anon, authenticated;
create function pg_temp.chk(n text, ok boolean) returns void language sql as $$ insert into res values (n, coalesce(ok, false)) $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'ana@x.com', '{"name":"Ana"}'),
 ('00000000-0000-0000-0000-00000000000b', 'beto@x.com', '{}'),
 ('00000000-0000-0000-0000-0000000000ad', 'admin@x.com', '{}');
update public.profiles set role = 'admin' where email = 'admin@x.com';
select pg_temp.chk('perfil creado con prueba de 7 días', (select access_until between now() + interval '6 days' and now() + interval '8 days' and status = 'trial' and name = 'Ana' from profiles where email = 'ana@x.com'));

-- Ana guarda y lee lo suyo
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into user_data (user_id, data) values ('00000000-0000-0000-0000-00000000000a', '{"debts":[1]}');
select pg_temp.chk('Ana guarda sus datos', (select count(*) = 1 from user_data));
update user_data set data = '{"debts":[1,2]}' where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.chk('Ana actualiza sus datos', (select jsonb_array_length(data -> 'debts') = 2 from user_data));
-- no puede escribir datos de otra persona
do $$ begin insert into user_data (user_id, data) values ('00000000-0000-0000-0000-00000000000b', '{}'); perform pg_temp.chk('Ana NO escribe en cuenta ajena', false);
 exception when others then perform pg_temp.chk('Ana NO escribe en cuenta ajena', true); end $$;
-- no puede cambiarse estado/vencimiento/rol
do $$ begin update profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a'; perform pg_temp.chk('Ana NO se hace admin', false);
 exception when others then perform pg_temp.chk('Ana NO se hace admin', true); end $$;
do $$ begin perform admin_set_access('00000000-0000-0000-0000-00000000000a', 'active', now() + interval '10 years'); perform pg_temp.chk('Ana NO se extiende el acceso', false);
 exception when others then perform pg_temp.chk('Ana NO se extiende el acceso', true); end $$;
select pg_temp.chk('Ana ve solo su perfil', (select count(*) = 1 from profiles));
do $$ begin update settings set price_text = 'gratis'; perform pg_temp.chk('Ana NO edita la configuración', (select price_text <> 'gratis' from settings));
 exception when others then perform pg_temp.chk('Ana NO edita la configuración', true); end $$;

-- Beto no ve lo de Ana
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.chk('Beto no ve datos de Ana', (select count(*) = 0 from user_data));

-- Anónimo: solo ve la configuración pública
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.chk('anónimo ve configuración', (select count(*) = 1 from settings));
do $$ begin perform 1 from profiles; perform pg_temp.chk('anónimo NO ve perfiles', false);
 exception when others then perform pg_temp.chk('anónimo NO ve perfiles', true); end $$;
do $$ begin perform 1 from user_data; perform pg_temp.chk('anónimo NO ve datos', false);
 exception when others then perform pg_temp.chk('anónimo NO ve datos', true); end $$;

-- Administrador
reset role; set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
select pg_temp.chk('admin ve todos los perfiles', (select count(*) = 3 from profiles));
select admin_set_access('00000000-0000-0000-0000-00000000000b', 'paused', null);
select pg_temp.chk('admin pausa a Beto', (select status = 'paused' from profiles where email = 'beto@x.com'));
update settings set price_text = '$5.000 por mes';
select pg_temp.chk('admin edita configuración', (select price_text = '$5.000 por mes' from settings));
do $$ begin perform admin_set_access('00000000-0000-0000-0000-00000000000b', 'vip', null); perform pg_temp.chk('estado inválido rechazado', false);
 exception when others then perform pg_temp.chk('estado inválido rechazado', true); end $$;

-- Pausado o vencido: no lee ni guarda (aunque tenga datos)
reset role; insert into user_data values ('00000000-0000-0000-0000-00000000000b', '{}', now());
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.chk('pausado NO lee sus datos', (select count(*) = 0 from user_data));
update user_data set data = '{"x":1}';
reset role; select pg_temp.chk('pausado NO guarda cambios', (select data = '{}' from user_data where user_id = '00000000-0000-0000-0000-00000000000b'));
-- vence la prueba de Ana
update profiles set access_until = now() - interval '1 day' where email = 'ana@x.com';
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.chk('vencida NO lee', (select count(*) = 0 from user_data));
do $$ begin insert into user_data (user_id, data) values ('00000000-0000-0000-0000-00000000000a', '{}'); perform pg_temp.chk('vencida NO escribe', false);
 exception when others then perform pg_temp.chk('vencida NO escribe', true); end $$;
-- el admin la reactiva
reset role; set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
select admin_set_access('00000000-0000-0000-0000-00000000000a', 'active', now() + interval '30 days');
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.chk('reactivada: lee de nuevo', (select count(*) = 1 from user_data));

reset role;
select case when ok then 'OK   ' else 'FALLA' end as r, n from res order by ok, n;
select count(*) filter (where not ok) as fallas, count(*) as total from res;
