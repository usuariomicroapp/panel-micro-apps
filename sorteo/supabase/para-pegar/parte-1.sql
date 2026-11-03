-- SORTEO · Base de datos · Parte 1 de 4. Pegar y ejecutar en orden (Run).
set search_path = public;

-- SORTEO · Etapa 3 · Esquema inicial
-- Tablas, restricciones, índices, funciones seguras, RLS y Storage.
-- Pensado para Supabase (PostgreSQL 15+). Se aplica una sola vez, en orden.
--
-- Principios:
--  * Los participantes nunca escriben directo en tablas sensibles: llaman a
--    funciones (RPC) que validan en el servidor y dejan registro.
--  * El total de una reserva se calcula en el servidor, nunca en el navegador.
--  * Un número pagado no tiene ninguna función que lo devuelva a disponible.
--  * Los cobros arrancan APAGADOS (settings.payments_enabled = false) y no se
--    pueden encender sin cargar un número de autorización.

set search_path = public;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type user_role          as enum ('admin', 'participant');
create type raffle_status      as enum ('draft', 'active', 'closed', 'drawn', 'cancelled');
create type number_state       as enum ('available', 'reserved', 'paid');
create type reservation_status as enum ('pending', 'submitted', 'approved', 'rejected', 'expired', 'cancelled');
create type payment_status     as enum ('pending', 'approved', 'rejected');
create type draw_slot          as enum ('previa', 'primera', 'matutina', 'vespertina', 'nocturna');
create type draw_status        as enum ('por_verificar', 'verificado', 'rechazado');
create type winner_status      as enum ('en_revision', 'publicado', 'desierto');
create type unsold_policy      as enum ('desierto', 'siguiente_sorteo', 'segundo_premio');

-- ---------------------------------------------------------------------------
-- Perfiles y roles
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null default '' check (length(first_name) <= 80),
  last_name   text not null default '' check (length(last_name) <= 80),
  phone       text not null default '' check (phone ~ '^[0-9 +()-]{0,25}$'),
  email       text not null default '' check (length(email) <= 254),
  role        user_role not null default 'participant',
  created_at  timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Crea el perfil automáticamente al registrarse.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 80),
    left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9 +()-]', '', 'g'), 25)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Nadie puede cambiarse el rol a sí mismo; solo un admin cambia roles.
-- Sin security definer a propósito: current_user debe ser el rol real que llama.
create or replace function guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and not is_admin() and current_user not in ('postgres', 'service_role') then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'Campos no modificables';
  end if;
  return new;
end $$;

create trigger profiles_guard_role before update on profiles
  for each row execute function guard_profile_role();

-- ---------------------------------------------------------------------------
-- Configuración general (una sola fila)
-- ---------------------------------------------------------------------------
create table settings (
  id                    int primary key default 1 check (id = 1),
  group_link            text not null default '' check (group_link = '' or group_link ~ '^https://'),
  install_link          text not null default '' check (install_link = '' or install_link ~ '^https://'),
  share_message         text not null default E'¡Te invito a SORTEO!\n\nIngresá a nuestro grupo para conocer los próximos premios y novedades.\n\nGrupo:\n[ENLACE DEL GRUPO]\n\nInstalá la aplicación:\n[ENLACE DE SORTEO]',
  payments_enabled      boolean not null default false,
  authorization_number  text check (authorization_number is null or length(authorization_number) between 3 and 120),
  authorization_entity  text check (authorization_entity is null or length(authorization_entity) <= 200),
  updated_at            timestamptz not null default now(),
  -- Control legal: no se pueden habilitar cobros sin autorización cargada.
  constraint payments_need_authorization check (not payments_enabled or authorization_number is not null)
);
insert into settings (id) values (1);

create table payment_methods (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('transferencia', 'mercado_pago', 'otro')),
  label         text not null check (length(label) between 1 and 80),
  alias         text not null default '' check (length(alias) <= 40),
  cbu           text not null default '' check (cbu = '' or cbu ~ '^[0-9]{22}$'),
  holder        text not null default '' check (length(holder) <= 120),
  instructions  text not null default '' check (length(instructions) <= 1000),
  active        boolean not null default true,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Productos y sorteos
-- ---------------------------------------------------------------------------
create table products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(name) between 1 and 120),
  description       text not null default '' check (length(description) <= 4000),
  reference_price   numeric(14, 2) check (reference_price is null or reference_price >= 0),
  acquisition_cost  numeric(14, 2) check (acquisition_cost is null or acquisition_cost >= 0),
  prize_info        text not null default '' check (length(prize_info) <= 4000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table product_photos (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products (id) on delete cascade,
  path        text not null check (path ~ '^[A-Za-z0-9/_.-]{1,300}$'),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index product_photos_product_idx on product_photos (product_id, position);

create table raffles (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(name) between 1 and 120),
  product_id           uuid not null references products (id) on delete restrict,
  description          text not null default '' check (length(description) <= 4000),
  price_per_number     numeric(14, 2) not null check (price_per_number > 0),
  total_numbers        int not null default 100 check (total_numbers between 2 and 10000),
  digits               int not null default 2 check (digits between 1 and 4),
  starts_at            timestamptz not null default now(),
  closes_at            timestamptz not null,
  official_draw_date   date,
  official_draw_slot   draw_slot,
  winner_rule          text not null default 'ultimas_cifras_primer_premio'
                         check (winner_rule in ('ultimas_cifras_primer_premio')),
  unsold_policy        unsold_policy,
  no_winner_notes      text not null default '' check (length(no_winner_notes) <= 1000),
  reservation_minutes  int not null default 60 check (reservation_minutes between 5 and 2880),
  max_numbers_per_reservation int not null default 20 check (max_numbers_per_reservation between 1 and 1000),
  is_demo              boolean not null default true,
  status               raffle_status not null default 'draft',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint closes_after_start check (closes_at > starts_at),
  constraint digits_fit_numbers check (total_numbers <= power(10, digits)::int),
  -- Antes de habilitar un sorteo deben quedar fijadas todas sus reglas.
  constraint active_needs_rules check (
    status in ('draft', 'cancelled')
    or (official_draw_date is not null and official_draw_slot is not null and unsold_policy is not null)
  )
);
create index raffles_status_idx on raffles (status, closes_at);

create table raffle_numbers (
  raffle_id       uuid not null references raffles (id) on delete cascade,
  number          int  not null check (number >= 0),
  state           number_state not null default 'available',
  reservation_id  uuid,
  reserved_until  timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (raffle_id, number),
  constraint reserved_has_owner check (state = 'available' or reservation_id is not null)
);
create index raffle_numbers_state_idx on raffle_numbers (raffle_id, state);
create index raffle_numbers_expiry_idx on raffle_numbers (reserved_until) where state = 'reserved';

-- Genera la grilla al crear el sorteo y permite ampliarla después.
create or replace function sync_raffle_numbers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.total_numbers < old.total_numbers then
    raise exception 'La cantidad de números solo puede ampliarse';
  end if;
  insert into raffle_numbers (raffle_id, number)
  select new.id, n from generate_series(0, new.total_numbers - 1) n
  on conflict do nothing;
  return new;
end $$;

create trigger raffles_numbers_sync
  after insert or update of total_numbers on raffles
  for each row execute function sync_raffle_numbers();

-- Un sorteo con ventas no cambia precio ni reglas.
create or replace function guard_raffle_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from raffle_numbers where raffle_id = old.id and state <> 'available') then
    if new.price_per_number <> old.price_per_number
       or new.digits <> old.digits
       or new.official_draw_date is distinct from old.official_draw_date
       or new.official_draw_slot is distinct from old.official_draw_slot
       or new.unsold_policy is distinct from old.unsold_policy
       or new.winner_rule <> old.winner_rule
       or new.is_demo <> old.is_demo then
      raise exception 'El sorteo ya tiene números reservados o vendidos: no se pueden cambiar precio ni reglas';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger raffles_guard before update on raffles
  for each row execute function guard_raffle_changes();

