-- SORTEO · Base de datos · Parte 4 de 4. Pegar y ejecutar en orden (Run).
set search_path = public;


-- ---------------------------------------------------------------------------
-- Seguridad: RLS en todas las tablas
-- ---------------------------------------------------------------------------
alter table profiles            enable row level security;
alter table settings            enable row level security;
alter table payment_methods     enable row level security;
alter table products            enable row level security;
alter table product_photos      enable row level security;
alter table raffles             enable row level security;
alter table raffle_numbers      enable row level security;
alter table reservations        enable row level security;
alter table payments            enable row level security;
alter table payment_proofs      enable row level security;
alter table lottery_draws       enable row level security;
alter table winners             enable row level security;
alter table expenses            enable row level security;
alter table notifications       enable row level security;
alter table push_subscriptions  enable row level security;
alter table audit_logs          enable row level security;

-- Perfiles: cada uno ve y edita el suyo; el admin ve todos.
create policy profiles_select on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy profiles_update on profiles for update to authenticated using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- Configuración: lectura pública, escritura solo admin.
create policy settings_read  on settings for select to anon, authenticated using (true);
create policy settings_admin on settings for update to authenticated using (is_admin()) with check (is_admin());

-- Medios de pago: visibles para usuarios registrados solo con cobros habilitados.
create policy payment_methods_read on payment_methods for select to authenticated
  using (is_admin() or (active and (select payments_enabled from settings where id = 1)));
create policy payment_methods_admin on payment_methods for all to authenticated using (is_admin()) with check (is_admin());

-- Productos y fotos: lectura pública, escritura admin. El costo se oculta (ver grants).
create policy products_read  on products for select to anon, authenticated using (true);
create policy products_admin on products for all to authenticated using (is_admin()) with check (is_admin());
create policy product_photos_read  on product_photos for select to anon, authenticated using (true);
create policy product_photos_admin on product_photos for all to authenticated using (is_admin()) with check (is_admin());

-- Sorteos: el público ve los publicados; el admin ve y edita todos.
create policy raffles_read  on raffles for select to anon, authenticated using (status <> 'draft' or is_admin());
create policy raffles_admin on raffles for all to authenticated using (is_admin()) with check (is_admin());

-- Números: lectura directa solo admin (el público usa la vista sin datos personales).
create policy raffle_numbers_admin on raffle_numbers for select to authenticated using (is_admin());

-- Reservas, pagos y comprobantes: cada uno ve los suyos; el admin, todos.
create policy reservations_read on reservations for select to authenticated using (user_id = auth.uid() or is_admin());
create policy payments_read on payments for select to authenticated
  using (is_admin() or exists (select 1 from reservations r where r.id = reservation_id and r.user_id = auth.uid()));
create policy payment_proofs_read on payment_proofs for select to authenticated
  using (is_admin() or exists (select 1 from payments p join reservations r on r.id = p.reservation_id
                               where p.id = payment_id and r.user_id = auth.uid()));

-- Resultados: el público ve solo los verificados y los ganadores publicados.
create policy lottery_draws_read  on lottery_draws for select to anon, authenticated using (status = 'verificado' or is_admin());
create policy lottery_draws_admin on lottery_draws for all to authenticated using (is_admin()) with check (is_admin());
create policy winners_read  on winners for select to anon, authenticated using (status in ('publicado', 'desierto') or is_admin());
create policy winners_admin on winners for all to authenticated using (is_admin()) with check (is_admin());

create policy expenses_admin on expenses for all to authenticated using (is_admin()) with check (is_admin());

create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid() or user_id is null or is_admin());
create policy notifications_mark on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_admin on notifications for insert to authenticated with check (is_admin());

create policy push_own on push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_admin_read on audit_logs for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------------
-- Permisos por columna y funciones
-- ---------------------------------------------------------------------------
-- Supabase otorga todo a anon/authenticated por defecto: lo recortamos.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on settings, products, product_photos, raffles, lottery_draws, winners to anon, authenticated;
revoke select on products from anon, authenticated;
grant select (id, name, description, reference_price, prize_info, created_at, updated_at) on products to anon, authenticated;
grant select on public_raffle_numbers to anon, authenticated;

grant select, update on profiles to authenticated;
revoke update on profiles from authenticated;
grant update (first_name, last_name, phone, role) on profiles to authenticated; -- role: lo frena el trigger salvo admin
grant select on payment_methods, raffle_numbers, reservations, payments, payment_proofs, notifications, audit_logs to authenticated;
grant update (read_at) on notifications to authenticated;
grant insert on notifications to authenticated;
grant select, insert, delete on push_subscriptions to authenticated;

-- Escritura del admin (las políticas RLS exigen is_admin()).
grant insert, update, delete on products, product_photos, raffles, payment_methods, lottery_draws, winners, expenses to authenticated;
grant update on settings to authenticated;
grant select on expenses to authenticated;

-- El costo de adquisición lo lee el admin por una función.
create or replace function admin_products() returns setof products
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  return query select * from products order by created_at desc;
end $$;

grant execute on function is_admin() to anon, authenticated;
grant execute on function reserve_numbers(uuid, int[]) to authenticated;
grant execute on function cancel_reservation(uuid) to authenticated;
grant execute on function submit_payment(uuid, uuid, text, text, int) to authenticated;
grant execute on function approve_payment(uuid) to authenticated;
grant execute on function reject_payment(uuid, text) to authenticated;
grant execute on function raffle_stats(uuid) to authenticated;
grant execute on function admin_products() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: fotos públicas, comprobantes privados
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-photos', 'product-photos', true,  2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "fotos: lectura publica" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-photos');
create policy "fotos: escribe admin" on storage.objects for all to authenticated
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());

create policy "comprobantes: sube el dueño" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprobantes: ve el dueño o admin" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- SORTEO · Tareas programadas con pg_cron (Supabase Cron, incluido en el plan gratuito).
-- Libera cada minuto las reservas vencidas sin comprobante enviado.
create extension if not exists pg_cron;

select cron.schedule(
  'sorteo-liberar-reservas-vencidas',
  '* * * * *',
  $$ select public.release_expired_reservations(); $$
);

select 'SORTEO: base de datos lista' as resultado;
