-- MIS CUENTAS NUBE · base de datos (Supabase). Pegar completo en SQL Editor y ejecutar UNA vez.
-- Reglas clave: cada persona solo ve lo suyo; sin acceso vigente no puede leer ni guardar datos;
-- nadie (salvo el administrador) puede cambiar su propio estado, vencimiento o rol.

create table public.settings (
  id int primary key default 1 check (id = 1),
  brand_name  text not null default 'Mis Cuentas' check (char_length(brand_name) between 1 and 40),
  brand_color text not null default '#e8c26a' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  trial_days  int  not null default 7 check (trial_days between 0 and 90),
  price_text  text not null default '' check (char_length(price_text) <= 80),
  payment_url text not null default '' check (char_length(payment_url) <= 500),
  whatsapp    text not null default '' check (char_length(whatsapp) <= 25)
);
insert into public.settings default values;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'trial' check (status in ('trial', 'active', 'paused')),
  access_until timestamptz not null,
  created_at timestamptz not null default now()
);
create index profiles_created_idx on public.profiles (created_at desc);

create table public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) < 3000000),
  updated_at timestamptz not null default now()
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

-- Acceso vigente: administrador siempre; el resto, si no está pausado y no venció.
create function public.has_access() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles p where p.id = auth.uid()
     and (p.role = 'admin' or (p.status <> 'paused' and p.access_until > now()))) $$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, access_until)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'name', ''), 80),
          now() + make_interval(days => (select trial_days from public.settings where id = 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Único camino para cambiar estado/vencimiento: solo el administrador.
create function public.admin_set_access(p_user uuid, p_status text, p_until timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_status not in ('trial', 'active', 'paused') then raise exception 'Estado inválido'; end if;
  update public.profiles set status = p_status, access_until = coalesce(p_until, access_until) where id = p_user;
end $$;

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

create policy settings_leer on public.settings for select using (true);
create policy settings_editar on public.settings for update using (public.is_admin()) with check (public.is_admin());
create policy profiles_leer on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy datos_leer on public.user_data for select using (user_id = auth.uid() and public.has_access());
create policy datos_crear on public.user_data for insert with check (user_id = auth.uid() and public.has_access());
create policy datos_editar on public.user_data for update
  using (user_id = auth.uid() and public.has_access()) with check (user_id = auth.uid() and public.has_access());

revoke all on public.settings, public.profiles, public.user_data from anon, authenticated;
grant select on public.settings to anon, authenticated;
grant update (brand_name, brand_color, trial_days, price_text, payment_url, whatsapp) on public.settings to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.user_data to authenticated;
revoke execute on function public.admin_set_access(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_set_access(uuid, text, timestamptz) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- DESPUÉS de crear tu cuenta en la app, convertila en administradora (cambiá el correo):
-- update public.profiles set role = 'admin' where email = 'TU_CORREO@gmail.com';
