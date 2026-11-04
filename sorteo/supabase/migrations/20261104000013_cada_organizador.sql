-- SORTEO · Cada organizador con lo suyo, todos en la misma app.
-- Cada producto y sorteo es de un organizador. Cada organizador ve y maneja solo lo suyo,
-- tiene su propia marca (nombre, logo, enlaces, mensaje) y su propio link (?o=código).
-- El dueño ve y maneja todo. Lo que ya estaba cargado queda del primer organizador
-- (o del dueño si todavía no hay organizadores).

set search_path = public;

-- 1) Dueño de cada producto y sorteo -----------------------------------------------------------
alter table products add column if not exists organizer_id uuid references profiles (id) on delete restrict;
alter table raffles  add column if not exists organizer_id uuid references profiles (id) on delete restrict;

do $$
declare v_first uuid;
begin
  select id into v_first from profiles where role = 'admin' and not is_owner order by created_at limit 1;
  if v_first is null then select id into v_first from profiles where is_owner order by created_at limit 1; end if;
  if v_first is not null then
    update products set organizer_id = v_first where organizer_id is null;
    update raffles  set organizer_id = v_first where organizer_id is null;
  end if;
end $$;

alter table products alter column organizer_id set default auth.uid();
alter table raffles  alter column organizer_id set default auth.uid();
create index if not exists products_organizer_idx on products (organizer_id);
create index if not exists raffles_organizer_idx on raffles (organizer_id, status);
grant select (organizer_id) on products to anon, authenticated;

-- ¿La persona conectada maneja lo de este organizador?
create or replace function manages(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or (p_org is not null and p_org = auth.uid() and is_admin());
$$;
create or replace function manages_raffle(p_raffle uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select manages((select organizer_id from raffles where id = p_raffle));
$$;
create or replace function manages_product(p_product uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select manages((select organizer_id from products where id = p_product));
$$;
-- Participante que eligió números en algún sorteo del organizador conectado.
create or replace function is_my_participant(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() and exists (
    select 1 from reservations r join raffles ra on ra.id = r.raffle_id
     where r.user_id = p_user and ra.organizer_id = auth.uid());
$$;
grant execute on function manages(uuid), manages_raffle(uuid), manages_product(uuid), is_my_participant(uuid) to anon, authenticated;

-- Un organizador no crea ni pasa cosas a nombre de otro.
create or replace function guard_organizer_id() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or auth.uid() is null then return new; end if;
  if new.organizer_id is null then new.organizer_id := auth.uid(); end if;
  if tg_op = 'UPDATE' and new.organizer_id is distinct from old.organizer_id and not is_owner() then
    raise exception 'No se puede pasar a otro organizador';
  end if;
  if not manages(new.organizer_id) then raise exception 'Solo podés cargar cosas a tu nombre'; end if;
  return new;
end $$;
drop trigger if exists products_guard_organizer on products;
create trigger products_guard_organizer before insert or update on products for each row execute function guard_organizer_id();
drop trigger if exists raffles_guard_organizer on raffles;
create trigger raffles_guard_organizer before insert or update on raffles for each row execute function guard_organizer_id();

-- El sorteo y su premio tienen que ser del mismo organizador.
create or replace function guard_raffle_product() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from products where id = new.product_id and organizer_id is not distinct from new.organizer_id) then
    raise exception 'Ese premio es de otro organizador';
  end if;
  return new;
end $$;
drop trigger if exists raffles_guard_product on raffles;
create trigger raffles_guard_product before insert or update of product_id, organizer_id on raffles for each row execute function guard_raffle_product();

-- 2) Reglas de acceso -------------------------------------------------------------------------
drop policy if exists products_admin on products;
create policy products_admin on products for all to authenticated using (manages(organizer_id)) with check (manages(organizer_id));
drop policy if exists product_photos_admin on product_photos;
create policy product_photos_admin on product_photos for all to authenticated using (manages_product(product_id)) with check (manages_product(product_id));

drop policy if exists raffles_read on raffles;
create policy raffles_read on raffles for select to anon, authenticated using (status <> 'draft' or manages(organizer_id));
drop policy if exists raffles_admin on raffles;
create policy raffles_admin on raffles for all to authenticated using (manages(organizer_id)) with check (manages(organizer_id));

drop policy if exists raffle_numbers_admin on raffle_numbers;
create policy raffle_numbers_admin on raffle_numbers for select to authenticated using (manages_raffle(raffle_id));
drop policy if exists reservations_read on reservations;
create policy reservations_read on reservations for select to authenticated using (user_id = auth.uid() or manages_raffle(raffle_id));

drop policy if exists winners_read on winners;
create policy winners_read on winners for select to anon, authenticated using (status in ('publicado', 'desierto') or manages_raffle(raffle_id));
drop policy if exists winners_admin on winners;
create policy winners_admin on winners for all to authenticated using (manages_raffle(raffle_id)) with check (manages_raffle(raffle_id));

drop policy if exists expenses_admin on expenses;
create policy expenses_admin on expenses for all to authenticated
  using (is_owner() or (raffle_id is not null and manages_raffle(raffle_id)))
  with check (is_owner() or (raffle_id is not null and manages_raffle(raffle_id)));

-- Cuentas: cada uno ve la suya; el organizador, la de quienes participan en sus sorteos; el dueño, todas.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (id = auth.uid() or is_owner() or is_my_participant(id));
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated using (id = auth.uid() or is_owner()) with check (id = auth.uid() or is_owner());

drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid() or user_id is null or is_owner());
drop policy if exists audit_admin_read on audit_logs;
create policy audit_admin_read on audit_logs for select to authenticated using (is_owner() or (is_admin() and actor = auth.uid()));

-- Fotos: cada organizador sube y borra solo las de sus premios y su logo.
drop policy if exists "fotos: escribe admin" on storage.objects;
create policy "fotos: escribe admin" on storage.objects for all to authenticated
  using (bucket_id = 'product-photos' and (public.is_owner() or (public.is_admin() and (
    ((storage.foldername(name))[1] = 'marca' and coalesce((storage.foldername(name))[2], '') in ('', auth.uid()::text))
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.manages_product(((storage.foldername(name))[1])::uuid))))))
  with check (bucket_id = 'product-photos' and (public.is_owner() or (public.is_admin() and (
    ((storage.foldername(name))[1] = 'marca' and (storage.foldername(name))[2] = auth.uid()::text)
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and public.manages_product(((storage.foldername(name))[1])::uuid))))));

-- 3) Marca y enlaces de cada organizador ------------------------------------------------------
create table if not exists organizer_settings (
  organizer_id    uuid primary key references profiles (id) on delete cascade,
  code            text not null unique default lower(substr(md5(gen_random_uuid()::text), 1, 6)) check (code ~ '^[a-z0-9]{4,20}$'),
  brand_name      text not null default 'SORTEO' check (length(trim(brand_name)) between 1 and 40),
  brand_logo_path text check (brand_logo_path is null or brand_logo_path ~ '^marca/([0-9a-f-]{36}/)?[A-Za-z0-9_.-]{1,100}$'),
  group_link      text not null default '' check (group_link = '' or group_link ~ '^https://'),
  install_link    text not null default '' check (install_link = '' or install_link ~ '^https://'),
  share_message   text not null default '' check (length(share_message) <= 2000),
  updated_at      timestamptz not null default now()
);
alter table organizer_settings enable row level security;
drop policy if exists organizer_settings_read on organizer_settings;
create policy organizer_settings_read on organizer_settings for select to anon, authenticated using (true);
drop policy if exists organizer_settings_write on organizer_settings;
create policy organizer_settings_write on organizer_settings for update to authenticated using (manages(organizer_id)) with check (manages(organizer_id));
revoke all on organizer_settings from anon, authenticated;
grant select on organizer_settings to anon, authenticated;
grant update (brand_name, brand_logo_path, group_link, install_link, share_message, updated_at) on organizer_settings to authenticated;

-- Cada organizador tiene su fila apenas el dueño lo habilita (copia la marca general).
create or replace function ensure_organizer_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'admin' or new.is_owner then
    insert into organizer_settings (organizer_id, brand_name, brand_logo_path, group_link, install_link, share_message)
    select new.id, s.brand_name, s.brand_logo_path, s.group_link, s.install_link, s.share_message from settings s where s.id = 1
    on conflict (organizer_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists profiles_organizer_settings on profiles;
create trigger profiles_organizer_settings after insert or update of role, is_owner on profiles
  for each row execute function ensure_organizer_settings();

insert into organizer_settings (organizer_id, brand_name, brand_logo_path, group_link, install_link, share_message)
select p.id, s.brand_name, s.brand_logo_path, s.group_link, s.install_link, s.share_message
  from profiles p cross join settings s where s.id = 1 and (p.role = 'admin' or p.is_owner)
on conflict (organizer_id) do nothing;

-- 4) Funciones del panel: cada organizador solo sobre sus sorteos ------------------------------
-- Se guardan las funciones originales con otro nombre y se las envuelve con el control.
do $$
declare f text;
begin
  foreach f in array array[
    'admin_set_draw(uuid, date, draw_slot)', 'admin_preview_winner(uuid, text, text)',
    'admin_publish_result(uuid, text, text, text[], boolean)', 'admin_manual_entry(uuid, int[], text, text, text)',
    'admin_release_entry(uuid, text)', 'raffle_stats(uuid)', 'admin_set_password(text, text)']
  loop
    if to_regprocedure(replace(f, '(', '_base(')) is null then
      execute format('alter function %s rename to %I', f, split_part(f, '(', 1) || '_base');
    end if;
    execute format('revoke execute on function %s from public, anon, authenticated', replace(f, '(', '_base('));
  end loop;
end $$;

create or replace function admin_set_draw(p_raffle uuid, p_date date, p_slot draw_slot) returns raffles
language plpgsql security definer set search_path = public as $$
begin
  if not manages_raffle(p_raffle) then raise exception 'Ese sorteo es de otro organizador'; end if;
  return admin_set_draw_base(p_raffle, p_date, p_slot);
end $$;

create or replace function admin_preview_winner(p_raffle uuid, p_first_prize text, p_second_prize text default null)
returns table (used_prize text, winning_number int, reservation_id uuid, name text, phone text, from_app boolean, outcome text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not manages_raffle(p_raffle) then raise exception 'Ese sorteo es de otro organizador'; end if;
  return query select * from admin_preview_winner_base(p_raffle, p_first_prize, p_second_prize);
end $$;

create or replace function admin_manual_entry(p_raffle uuid, p_numbers int[], p_name text, p_phone text, p_notes text default '')
returns reservations
language plpgsql security definer set search_path = public as $$
begin
  if not manages_raffle(p_raffle) then raise exception 'Ese sorteo es de otro organizador'; end if;
  return admin_manual_entry_base(p_raffle, p_numbers, p_name, p_phone, p_notes);
end $$;

create or replace function admin_release_entry(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not manages_raffle((select raffle_id from reservations where id = p_reservation)) then
    raise exception 'Esa anotación es de un sorteo de otro organizador';
  end if;
  perform admin_release_entry_base(p_reservation, p_reason);
end $$;

create or replace function raffle_stats(p_raffle uuid) returns table (taken int, available int, participants int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not manages_raffle(p_raffle) then raise exception 'Ese sorteo es de otro organizador'; end if;
  return query select * from raffle_stats_base(p_raffle);
end $$;

create or replace function admin_set_password(p_email text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_target profiles;
begin
  select * into v_target from profiles where lower(email) = lower(trim(p_email));
  if found and not is_owner() and v_target.id <> auth.uid() and v_target.role <> 'admin' and not v_target.is_owner
     and not is_my_participant(v_target.id) then
    raise exception 'Esa persona todavía no eligió números en tus sorteos';
  end if;
  return admin_set_password_base(p_email, p_password);
end $$;

create or replace function admin_publish_result(
  p_raffle uuid, p_first_prize text, p_second_prize text default null, p_numbers text[] default '{}', p_from_source boolean default false
) returns table (outcome text, winning_number int, name text, phone text)
language plpgsql security definer set search_path = public as $$
begin
  if not manages_raffle(p_raffle) then raise exception 'Ese sorteo es de otro organizador'; end if;
  return query select * from admin_publish_result_base(p_raffle, p_first_prize, p_second_prize, p_numbers, p_from_source);
end $$;

-- Premios con costo: cada organizador ve los suyos.
create or replace function admin_products() returns setof products
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  return query select * from products where manages(organizer_id) order by created_at desc;
end $$;

revoke execute on function admin_set_draw(uuid, date, draw_slot), admin_preview_winner(uuid, text, text),
  admin_publish_result(uuid, text, text, text[], boolean), admin_manual_entry(uuid, int[], text, text, text),
  admin_release_entry(uuid, text), raffle_stats(uuid), admin_set_password(text, text) from public, anon;
grant execute on function admin_set_draw(uuid, date, draw_slot), admin_preview_winner(uuid, text, text),
  admin_publish_result(uuid, text, text, text[], boolean), admin_manual_entry(uuid, int[], text, text, text),
  admin_release_entry(uuid, text), raffle_stats(uuid), admin_set_password(text, text), admin_products() to authenticated;

-- 5) Resultados públicos con el organizador, para mostrar solo los de cada uno -----------------
drop function if exists public_results();
create function public_results() returns table (
  raffle_id uuid, raffle_no int, raffle_name text, prize text, digits int, draw_date date, draw_slot draw_slot,
  first_prize text, numbers text[], winning_number int, outcome winner_status, winner_label text, is_mine boolean, published_at timestamptz,
  organizer_id uuid
)
language sql stable security definer set search_path = public as $$
  select ra.id, ra.raffle_no, ra.name, coalesce(p.name, ''), ra.digits, d.draw_date, d.draw_slot,
         d.first_prize, d.numbers, w.winning_number, w.status,
         case when w.status = 'publicado' then
           split_part(trim(coalesce(r.buyer_name, '')), ' ', 1)
           || coalesce(' ' || nullif(left(split_part(trim(coalesce(r.buyer_name, '')), ' ', 2), 1), '') || '.', '')
         else '' end,
         (w.user_id is not null and w.user_id = auth.uid()),
         w.published_at, ra.organizer_id
    from winners w
    join raffles ra on ra.id = w.raffle_id
    join lottery_draws d on d.id = w.lottery_draw_id
    left join products p on p.id = ra.product_id
    left join reservations r on r.id = w.reservation_id
   where w.status in ('publicado', 'desierto')
   order by w.published_at desc nulls last
   limit 50;
$$;
grant execute on function public_results() to anon, authenticated;

-- 6) La copia de seguridad incluye las marcas de cada organizador ------------------------------
create or replace function owner_backup() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := jsonb_build_object('creada', now(), 'app', 'SORTEO'); part jsonb; t text;
begin
  if not is_owner() then raise exception 'Solo el dueño puede descargar la copia completa'; end if;
  foreach t in array array['settings', 'organizer_settings', 'profiles', 'products', 'product_photos', 'raffles', 'raffle_numbers',
                           'reservations', 'lottery_draws', 'winners', 'notifications', 'expenses', 'owner_sales']
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I x', t) into part;
    v := v || jsonb_build_object(t, part);
  end loop;
  return v;
end $$;
revoke execute on function owner_backup() from public, anon;
grant execute on function owner_backup() to authenticated;
