-- SORTEO · Base de datos COMPLETA para una copia nueva (un cliente nuevo).
-- Se pega UNA sola vez en un proyecto de Supabase vacío: SQL Editor > New query > pegar todo > Run.
-- Para la app de Sebastián NO se usa este archivo: ya tiene la base; se pega actualizacion-pendiente.sql.
-- Contiene, en orden, todas las migraciones de supabase/migrations.

-- ====================================================================
-- 20261103000001_esquema_inicial.sql
-- ====================================================================
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
  path        text not null check (path ~ '^[A-Za-z0-9/_.-]{1,255}$'),
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

-- ---------------------------------------------------------------------------
-- Reservas y pagos
-- ---------------------------------------------------------------------------
create table reservations (
  id          uuid primary key default gen_random_uuid(),
  raffle_id   uuid not null references raffles (id) on delete restrict,
  user_id     uuid not null references profiles (id) on delete restrict,
  numbers     int[] not null check (cardinality(numbers) >= 1),
  unit_price  numeric(14, 2) not null,
  total       numeric(14, 2) not null check (total > 0),
  expires_at  timestamptz not null,
  status      reservation_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index reservations_user_idx on reservations (user_id, created_at desc);
create index reservations_raffle_idx on reservations (raffle_id, status);

alter table raffle_numbers
  add constraint raffle_numbers_reservation_fk foreign key (reservation_id) references reservations (id);

create table payments (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null unique references reservations (id) on delete restrict,
  method_id         uuid references payment_methods (id) on delete set null,
  amount            numeric(14, 2) not null check (amount > 0),
  status            payment_status not null default 'pending',
  reviewed_by       uuid references profiles (id),
  reviewed_at       timestamptz,
  rejection_reason  text check (rejection_reason is null or length(rejection_reason) <= 500),
  created_at        timestamptz not null default now()
);
create index payments_status_idx on payments (status, created_at);

create table payment_proofs (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references payments (id) on delete cascade,
  storage_path  text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,120}$'),
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes    int  not null check (size_bytes between 1 and 5242880),
  uploaded_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Resultados oficiales y ganadores
-- ---------------------------------------------------------------------------
create table lottery_draws (
  id               uuid primary key default gen_random_uuid(),
  draw_date        date not null,
  draw_slot        draw_slot not null,
  official_number  text not null default '' check (official_number ~ '^[0-9]{0,8}$'),
  first_prize      text not null check (first_prize ~ '^[0-9]{4}$'),
  last_two         text generated always as (right(first_prize, 2)) stored,
  source_url       text not null default 'https://quiniela.loteriadelaciudad.gob.ar/',
  fetched_at       timestamptz not null default now(),
  entered_manually boolean not null default false,
  status           draw_status not null default 'por_verificar',
  verified_by      uuid references profiles (id),
  verified_at      timestamptz,
  unique (draw_date, draw_slot)
);

create table winners (
  id               uuid primary key default gen_random_uuid(),
  raffle_id        uuid not null unique references raffles (id) on delete restrict,
  lottery_draw_id  uuid not null references lottery_draws (id) on delete restrict,
  winning_number   int not null,
  user_id          uuid references profiles (id),
  status           winner_status not null default 'en_revision',
  notes            text not null default '',
  published_at     timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Gastos, notificaciones, auditoría
-- ---------------------------------------------------------------------------
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  raffle_id   uuid references raffles (id) on delete set null,
  concept     text not null check (length(concept) between 1 and 200),
  amount      numeric(14, 2) not null check (amount >= 0),
  spent_on    date not null default current_date,
  created_at  timestamptz not null default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles (id) on delete cascade, -- null = para todos
  kind        text not null check (kind in ('nuevo_sorteo', 'nuevo_producto', 'cambio_fecha', 'pago_aprobado', 'pago_rechazado', 'resultado', 'ganador')),
  title       text not null check (length(title) <= 120),
  body        text not null default '' check (length(body) <= 1000),
  link        text not null default '',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://'),
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

create table audit_logs (
  id          bigint generated always as identity primary key,
  actor       uuid,
  action      text not null,
  table_name  text,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  at          timestamptz not null default now()
);
create index audit_logs_at_idx on audit_logs (at desc);

-- Registro automático de cambios en tablas importantes.
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (actor, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', ''),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['products', 'raffles', 'settings', 'payment_methods', 'payments',
                           'reservations', 'lottery_draws', 'winners', 'expenses', 'profiles']
  loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_row()', t || '_audit', t);
  end loop;
end $$;

-- El registro de auditoría no se edita ni se borra, ni siquiera por un admin.
create or replace function audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'El registro de auditoría no se puede modificar';
end $$;
create trigger audit_logs_no_change before update or delete on audit_logs
  for each row execute function audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- Funciones de negocio (lo único que un participante puede "escribir")
-- ---------------------------------------------------------------------------

-- Libera reservas vencidas. La llama pg_cron cada minuto y también
-- reserve_numbers antes de reservar. Las reservas con comprobante enviado
-- ('submitted') NO vencen solas: las resuelve el administrador.
create or replace function release_expired_reservations() returns int
language plpgsql security definer set search_path = public as $$
declare released int;
begin
  with expired as (
    update reservations set status = 'expired', updated_at = now()
    where status = 'pending' and expires_at < now()
    returning id
  )
  update raffle_numbers rn
     set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
    from expired e
   where rn.reservation_id = e.id and rn.state = 'reserved';
  get diagnostics released = row_count;
  return released;
end $$;

create or replace function reserve_numbers(p_raffle uuid, p_numbers int[]) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid := auth.uid();
  v_raffle  raffles;
  v_nums    int[];
  v_locked  int;
  v_res     reservations;
  v_open    int;
begin
  if v_user is null then raise exception 'Tenés que iniciar sesión'; end if;

  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() < v_raffle.starts_at or now() >= v_raffle.closes_at then raise exception 'El sorteo no está abierto'; end if;
  if not v_raffle.is_demo and not (select payments_enabled from settings where id = 1) then
    raise exception 'Las ventas están deshabilitadas';
  end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if cardinality(v_nums) > v_raffle.max_numbers_per_reservation then
    raise exception 'Podés reservar hasta % números por vez', v_raffle.max_numbers_per_reservation;
  end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  select count(*) into v_open from reservations
   where user_id = v_user and raffle_id = p_raffle and status = 'pending' and expires_at > now();
  if v_open >= 3 then raise exception 'Tenés demasiadas reservas pendientes en este sorteo'; end if;

  perform release_expired_reservations();

  -- Bloqueo en orden fijo (evita bloqueos cruzados) y solo de los disponibles.
  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, numbers, unit_price, total, expires_at)
  values (p_raffle, v_user, v_nums, v_raffle.price_per_number,
          v_raffle.price_per_number * cardinality(v_nums),
          now() + make_interval(mins => v_raffle.reservation_minutes))
  returning * into v_res;

  update raffle_numbers
     set state = 'reserved', reservation_id = v_res.id, reserved_until = v_res.expires_at, updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';

  return v_res;
end $$;

create or replace function cancel_reservation(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id <> auth.uid() then raise exception 'Reserva no encontrada'; end if;
  if v_res.status <> 'pending' then raise exception 'La reserva ya no se puede cancelar'; end if;
  update reservations set status = 'cancelled', updated_at = now() where id = p_reservation;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = p_reservation and state = 'reserved';
end $$;

-- El participante informa su pago adjuntando el comprobante (ya subido a
-- Storage en su carpeta). NUNCA confirma el pago: solo lo deja pendiente.
create or replace function submit_payment(
  p_reservation uuid, p_method uuid, p_proof_path text, p_mime text, p_size int
) returns payments
language plpgsql security definer set search_path = public as $$
declare
  v_res  reservations;
  v_pay  payments;
  v_demo boolean;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id <> auth.uid() then raise exception 'Reserva no encontrada'; end if;
  if v_res.status <> 'pending' or v_res.expires_at < now() then raise exception 'La reserva venció o ya fue enviada'; end if;
  select is_demo into v_demo from raffles where id = v_res.raffle_id;
  if not v_demo and not (select payments_enabled from settings where id = 1) then
    raise exception 'Los cobros están deshabilitados';
  end if;
  if split_part(p_proof_path, '/', 1) <> auth.uid()::text then raise exception 'Ruta de comprobante inválida'; end if;
  if p_method is not null and not exists (select 1 from payment_methods where id = p_method and active) then
    raise exception 'Medio de pago inválido';
  end if;

  insert into payments (reservation_id, method_id, amount)
  values (p_reservation, p_method, v_res.total)
  returning * into v_pay;
  insert into payment_proofs (payment_id, storage_path, mime_type, size_bytes)
  values (v_pay.id, p_proof_path, p_mime, p_size);
  update reservations set status = 'submitted', updated_at = now() where id = p_reservation;
  return v_pay;
end $$;

-- Solo Sebastián, después de verificar el ingreso real del dinero.
create or replace function approve_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay payments; v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador puede aprobar pagos'; end if;
  select * into v_pay from payments where id = p_payment for update;
  if not found or v_pay.status <> 'pending' then raise exception 'El pago no está pendiente'; end if;
  select * into v_res from reservations where id = v_pay.reservation_id for update;

  update raffle_numbers set state = 'paid', reserved_until = null, updated_at = now()
   where reservation_id = v_res.id and state = 'reserved';
  update payments set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_payment;
  update reservations set status = 'approved', updated_at = now() where id = v_res.id;
  insert into notifications (user_id, kind, title, body)
  values (v_res.user_id, 'pago_aprobado', 'Pago aprobado',
          'Tus números ' || array_to_string(v_res.numbers, ', ') || ' quedaron confirmados.');
end $$;

create or replace function reject_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay payments; v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador puede rechazar pagos'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo del rechazo'; end if;
  select * into v_pay from payments where id = p_payment for update;
  if not found or v_pay.status <> 'pending' then raise exception 'El pago no está pendiente'; end if;
  select * into v_res from reservations where id = v_pay.reservation_id for update;

  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = v_res.id and state = 'reserved';
  update payments set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
                      rejection_reason = left(p_reason, 500) where id = p_payment;
  update reservations set status = 'rejected', updated_at = now() where id = v_res.id;
  insert into notifications (user_id, kind, title, body)
  values (v_res.user_id, 'pago_rechazado', 'Pago rechazado', left(p_reason, 500));
end $$;

-- Grilla pública: solo número y estado, sin datos de nadie.
create or replace view public_raffle_numbers with (security_invoker = false) as
  select rn.raffle_id, rn.number, rn.state
    from raffle_numbers rn
    join raffles r on r.id = rn.raffle_id
   where r.status in ('active', 'closed', 'drawn');

-- Estadísticas: separa reservado de vendido y pendiente de cobrado.
create or replace function raffle_stats(p_raffle uuid) returns table (
  sold int, reserved int, available int, collected_verified numeric, pending_amount numeric, expenses numeric, result numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  return query
  select
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'paid'),
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'reserved'),
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'available'),
    coalesce((select sum(p.amount) from payments p join reservations r on r.id = p.reservation_id
               where r.raffle_id = p_raffle and p.status = 'approved'), 0),
    coalesce((select sum(p.amount) from payments p join reservations r on r.id = p.reservation_id
               where r.raffle_id = p_raffle and p.status = 'pending'), 0),
    coalesce((select sum(amount) from expenses where raffle_id = p_raffle), 0),
    coalesce((select sum(p.amount) from payments p join reservations r on r.id = p.reservation_id
               where r.raffle_id = p_raffle and p.status = 'approved'), 0)
      - coalesce((select sum(amount) from expenses where raffle_id = p_raffle), 0)
      - coalesce((select pr.acquisition_cost from raffles ra join products pr on pr.id = ra.product_id where ra.id = p_raffle), 0);
end $$;

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

-- ====================================================================
-- 20261103000002_tareas_programadas.sql
-- ====================================================================
-- SORTEO · Tareas programadas con pg_cron (Supabase Cron, incluido en el plan gratuito).
-- Libera cada minuto las reservas vencidas sin comprobante enviado.
create extension if not exists pg_cron;

select cron.schedule(
  'sorteo-liberar-reservas-vencidas',
  '* * * * *',
  $$ select public.release_expired_reservations(); $$
);

-- ====================================================================
-- 20261104000003_arreglo_ruta_fotos.sql
-- ====================================================================
-- Arreglo: PostgreSQL no acepta repeticiones mayores a 255 en una expresión regular,
-- así que la regla anterior ({1,300}) hacía fallar cualquier foto de producto.
alter table product_photos drop constraint if exists product_photos_path_check;
alter table product_photos add constraint product_photos_path_check
  check (path ~ '^[A-Za-z0-9/_.-]{1,255}$');

-- ====================================================================
-- 20261104000004_ventas_en_persona_y_marca.sql
-- ====================================================================
-- Etapa 5b: pedidos de Sebastián del 04/11/2026.
-- 1) La cantidad de números se puede ampliar o achicar (achicar solo si los números que se quitan están libres).
-- 2) El organizador carga ventas en persona con nombre y teléfono del comprador.
-- 3) Nombre del emprendimiento y logo editables.
-- 4) Catálogo de premios: cada producto puede mostrarse u ocultarse en la tienda.

-- 1) Cantidad de números editable ------------------------------------------------
create or replace function sync_raffle_numbers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.total_numbers < old.total_numbers then
    if exists (select 1 from raffle_numbers
                where raffle_id = new.id and number >= new.total_numbers and state <> 'available') then
      raise exception 'No se puede achicar: hay números reservados o vendidos a partir del %', new.total_numbers;
    end if;
    delete from raffle_numbers where raffle_id = new.id and number >= new.total_numbers;
    return new;
  end if;
  insert into raffle_numbers (raffle_id, number)
  select new.id, n from generate_series(0, new.total_numbers - 1) n
  on conflict do nothing;
  return new;
end $$;

-- 2) Ventas en persona ---------------------------------------------------------------
alter table reservations alter column user_id drop not null;
alter table reservations
  add column if not exists manual      boolean not null default false,
  add column if not exists buyer_name  text check (buyer_name is null or length(trim(buyer_name)) between 1 and 120),
  add column if not exists buyer_phone text check (buyer_phone is null or length(buyer_phone) <= 40),
  add column if not exists notes       text not null default '' check (length(notes) <= 500);
alter table reservations drop constraint if exists reservation_owner;
alter table reservations add constraint reservation_owner check (
  (not manual and user_id is not null) or (manual and user_id is null and buyer_name is not null)
);

-- Una reserva sin usuario (venta en persona) no la puede cancelar nadie más que el admin.
create or replace function cancel_reservation(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id is distinct from auth.uid() then raise exception 'Reserva no encontrada'; end if;
  if v_res.status <> 'pending' then raise exception 'La reserva ya no se puede cancelar'; end if;
  update reservations set status = 'cancelled', updated_at = now() where id = p_reservation;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = p_reservation and state = 'reserved';
end $$;

-- El organizador anota una venta hecha en persona. Si ya cobró, los números quedan pagados;
-- si no, quedan reservados a nombre del comprador hasta el cierre del sorteo.
create or replace function admin_manual_sale(
  p_raffle uuid, p_numbers int[], p_name text, p_phone text, p_paid boolean, p_notes text default ''
) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_raffle raffles;
  v_nums   int[];
  v_locked int;
  v_res    reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador puede cargar ventas'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribí el nombre del comprador'; end if;

  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() >= v_raffle.closes_at then raise exception 'El sorteo ya cerró sus ventas'; end if;
  -- Misma regla legal que las ventas por la app: sin autorización solo se usan sorteos de prueba.
  if not v_raffle.is_demo and not (select payments_enabled from settings where id = 1) then
    raise exception 'Las ventas están deshabilitadas hasta tener la autorización';
  end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  perform release_expired_reservations();

  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, manual, buyer_name, buyer_phone, notes,
                            numbers, unit_price, total, expires_at, status)
  values (p_raffle, null, true, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), coalesce(p_notes, ''),
          v_nums, v_raffle.price_per_number, v_raffle.price_per_number * cardinality(v_nums),
          v_raffle.closes_at, case when p_paid then 'approved' else 'pending' end::reservation_status)
  returning * into v_res;

  update raffle_numbers
     set state = case when p_paid then 'paid' else 'reserved' end::number_state,
         reservation_id = v_res.id,
         reserved_until = case when p_paid then null else v_raffle.closes_at end,
         updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';

  if p_paid then
    insert into payments (reservation_id, amount, status, reviewed_by, reviewed_at)
    values (v_res.id, v_res.total, 'approved', auth.uid(), now());
  end if;
  return v_res;
end $$;

-- Marca como cobrada una venta en persona que estaba pendiente.
create or replace function admin_manual_mark_paid(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  select * into v_res from reservations where id = p_reservation for update;
  if not found or not v_res.manual then raise exception 'Venta no encontrada'; end if;
  if v_res.status <> 'pending' then raise exception 'Esta venta ya no está pendiente'; end if;
  update raffle_numbers set state = 'paid', reserved_until = null, updated_at = now()
   where reservation_id = v_res.id and state = 'reserved';
  update reservations set status = 'approved', updated_at = now() where id = v_res.id;
  insert into payments (reservation_id, amount, status, reviewed_by, reviewed_at)
  values (v_res.id, v_res.total, 'approved', auth.uid(), now());
end $$;

-- Anula una venta en persona cargada por error: libera los números y deja constancia.
create or replace function admin_manual_cancel(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  select * into v_res from reservations where id = p_reservation for update;
  if not found or not v_res.manual then raise exception 'Venta no encontrada'; end if;
  if v_res.status not in ('pending', 'approved') then raise exception 'Esta venta ya estaba anulada'; end if;
  if exists (select 1 from raffles where id = v_res.raffle_id and status not in ('active', 'closed')) then
    raise exception 'El sorteo ya se realizó: la venta no se puede anular';
  end if;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = v_res.id;
  update payments set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
                      rejection_reason = left('Venta anulada: ' || trim(p_reason), 500)
   where reservation_id = v_res.id and status = 'approved';
  update reservations set status = 'cancelled', notes = left(trim(notes || ' · Anulada: ' || trim(p_reason), ' ·'), 500),
                          updated_at = now()
   where id = v_res.id;
end $$;

grant execute on function cancel_reservation(uuid) to authenticated;
grant execute on function admin_manual_sale(uuid, int[], text, text, boolean, text) to authenticated;
grant execute on function admin_manual_mark_paid(uuid) to authenticated;
grant execute on function admin_manual_cancel(uuid, text) to authenticated;

-- 3) Nombre del emprendimiento y logo ----------------------------------------------------
alter table settings
  add column if not exists brand_name      text not null default 'SORTEO' check (length(trim(brand_name)) between 1 and 40),
  add column if not exists brand_logo_path text check (brand_logo_path is null or brand_logo_path ~ '^marca/[A-Za-z0-9_.-]{1,100}$');

-- 4) Catálogo de premios ------------------------------------------------------------------
alter table products add column if not exists show_in_store boolean not null default true;
grant select (show_in_store) on products to anon, authenticated;

-- ====================================================================
-- 20261104000005_dueno_y_pausa.sql
-- ====================================================================
-- Tres niveles: dueño de la plataforma (Sebastián), organizador (su cliente) y comprador.
-- El dueño ve y puede todo lo del organizador, elige quién organiza y puede pausar la app.
-- Nadie más que el dueño puede quitarle ese lugar.

alter table profiles add column if not exists is_owner boolean not null default false;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_owner);
$$;

-- El dueño también cuenta como administrador en todas las reglas existentes.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or is_owner));
$$;

-- Roles: solo el dueño los cambia. Antes de que exista un dueño, también un organizador
-- (así sigue funcionando una copia que todavía no tiene dueño cargado).
create or replace function guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
declare
  v_trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin');
  v_has_owner boolean := exists (select 1 from profiles where is_owner);
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'Campos no modificables';
  end if;
  if new.is_owner is distinct from old.is_owner and not v_trusted then
    raise exception 'El dueño solo se cambia desde la base de datos';
  end if;
  if old.is_owner and not is_owner() and not v_trusted then
    raise exception 'No se puede modificar la cuenta del dueño';
  end if;
  if new.role is distinct from old.role and not v_trusted then
    if v_has_owner and not is_owner() then raise exception 'Solo el dueño puede cambiar roles'; end if;
    if not v_has_owner and not is_admin() then raise exception 'Solo un administrador puede cambiar roles'; end if;
  end if;
  return new;
end $$;

-- Pausa general de la app (por ejemplo, si el cliente no está al día). Solo la toca el dueño.
alter table settings
  add column if not exists app_paused     boolean not null default false,
  add column if not exists paused_message text not null default 'La app está pausada momentáneamente.'
    check (length(paused_message) <= 300);

create or replace function guard_settings_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.app_paused is distinct from old.app_paused or new.paused_message is distinct from old.paused_message)
     and not is_owner() and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Solo el dueño puede pausar o reanudar la app';
  end if;
  return new;
end $$;
drop trigger if exists settings_guard_owner on settings;
create trigger settings_guard_owner before update on settings
  for each row execute function guard_settings_owner();

-- Con la app pausada no se reservan ni se cargan ventas.
create or replace function guard_not_paused() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select app_paused from settings where id = 1) then
    raise exception 'La app está pausada: no se pueden reservar ni vender números';
  end if;
  return new;
end $$;
drop trigger if exists reservations_not_paused on reservations;
create trigger reservations_not_paused before insert on reservations
  for each row execute function guard_not_paused();

grant execute on function is_owner() to anon, authenticated;

-- ====================================================================
-- 20261104000006_sorteos_gratuitos.sql
-- ====================================================================
-- Sorteos gratuitos: se quitan por completo los cobros de la app (pedido de Sebastián, 04/11/2026).
-- Cada número elegido guarda el nombre y el teléfono de quien lo eligió.
-- El estado 'paid' de la grilla pasa a significar "ocupado".

-- 1) Quitar funciones de cobro ------------------------------------------------------
drop function if exists reserve_numbers(uuid, int[]);
drop function if exists submit_payment(uuid, uuid, text, text, int);
drop function if exists approve_payment(uuid);
drop function if exists reject_payment(uuid, text);
drop function if exists admin_manual_sale(uuid, int[], text, text, boolean, text);
drop function if exists admin_manual_mark_paid(uuid);
drop function if exists raffle_stats(uuid);

-- 2) Quitar tablas de cobro (estaban vacías: solo hubo pruebas) -------------------------
drop table if exists payment_proofs cascade;
drop table if exists payments cascade;
drop table if exists payment_methods cascade;
drop policy if exists "comprobantes: sube el dueño" on storage.objects;
drop policy if exists "comprobantes: ve el dueño o admin" on storage.objects;

alter table settings drop constraint if exists payments_need_authorization;
alter table settings
  drop column if exists payments_enabled,
  drop column if exists authorization_number,
  drop column if exists authorization_entity;

delete from notifications where kind in ('pago_aprobado', 'pago_rechazado');
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('nuevo_sorteo', 'nuevo_producto', 'cambio_fecha', 'numeros_liberados', 'resultado', 'ganador'));

-- Un sorteo con números elegidos no cambia sus reglas (ya no hay precio que cuidar).
create or replace function guard_raffle_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from raffle_numbers where raffle_id = old.id and state <> 'available') then
    if new.digits <> old.digits
       or new.official_draw_date is distinct from old.official_draw_date
       or new.official_draw_slot is distinct from old.official_draw_slot
       or new.unsold_policy is distinct from old.unsold_policy
       or new.winner_rule <> old.winner_rule
       or new.is_demo <> old.is_demo then
      raise exception 'El sorteo ya tiene números elegidos: no se pueden cambiar sus reglas';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 3) Sorteos sin precio ---------------------------------------------------------------------
alter table raffles alter column price_per_number set default 0;
alter table raffles drop constraint if exists raffles_price_per_number_check;
update raffles set price_per_number = 0 where price_per_number <> 0;
alter table raffles add constraint raffles_price_per_number_check check (price_per_number = 0);
alter table raffles alter column max_numbers_per_reservation set default 1;

alter table reservations alter column unit_price set default 0;
alter table reservations alter column total set default 0;
alter table reservations drop constraint if exists reservations_total_check;
alter table reservations add constraint reservations_total_check check (total >= 0);

-- 4) Elegir números gratis -----------------------------------------------------------------
-- La persona debe tener nombre y teléfono en su perfil; quedan guardados con sus números.
-- max_numbers_per_reservation pasa a ser el máximo de números por persona en el sorteo.
create or replace function claim_numbers(p_raffle uuid, p_numbers int[]) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_prof   profiles;
  v_raffle raffles;
  v_nums   int[];
  v_have   int;
  v_locked int;
  v_res    reservations;
begin
  if v_user is null then raise exception 'Tenés que iniciar sesión'; end if;
  select * into v_prof from profiles where id = v_user;
  if coalesce(trim(v_prof.first_name), '') = '' or coalesce(trim(v_prof.phone), '') = '' then
    raise exception 'Completá tu nombre y teléfono para elegir números';
  end if;

  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() < v_raffle.starts_at or now() >= v_raffle.closes_at then raise exception 'El sorteo no está abierto'; end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  select coalesce(sum(cardinality(numbers)), 0) into v_have from reservations
   where raffle_id = p_raffle and user_id = v_user and status = 'approved';
  if v_have + cardinality(v_nums) > v_raffle.max_numbers_per_reservation then
    raise exception 'En este sorteo cada persona puede elegir hasta % número(s)', v_raffle.max_numbers_per_reservation;
  end if;

  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, buyer_name, buyer_phone, numbers, unit_price, total, expires_at, status)
  values (p_raffle, v_user, left(trim(v_prof.first_name || ' ' || v_prof.last_name), 120), left(v_prof.phone, 40),
          v_nums, 0, 0, v_raffle.closes_at, 'approved')
  returning * into v_res;

  update raffle_numbers set state = 'paid', reservation_id = v_res.id, reserved_until = null, updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';
  return v_res;
end $$;

-- La persona puede soltar sus números mientras el sorteo sigue abierto.
create or replace function cancel_reservation(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  select * into v_res from reservations where id = p_reservation for update;
  if not found or v_res.user_id is distinct from auth.uid() then raise exception 'No encontramos esos números'; end if;
  if v_res.status not in ('pending', 'approved') then raise exception 'Esos números ya no están a tu nombre'; end if;
  if not exists (select 1 from raffles where id = v_res.raffle_id and status = 'active' and now() < closes_at) then
    raise exception 'El sorteo ya cerró: no se pueden soltar números';
  end if;
  update reservations set status = 'cancelled', updated_at = now() where id = p_reservation;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = p_reservation;
end $$;

-- 5) Anotar en persona (gente sin celular) ------------------------------------------------------
create or replace function admin_manual_entry(p_raffle uuid, p_numbers int[], p_name text, p_phone text, p_notes text default '')
returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_raffle raffles;
  v_nums   int[];
  v_locked int;
  v_res    reservations;
begin
  if not is_admin() then raise exception 'Solo el organizador puede anotar participantes'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribí el nombre de la persona'; end if;
  select * into v_raffle from raffles where id = p_raffle;
  if not found or v_raffle.status <> 'active' then raise exception 'El sorteo no está activo'; end if;
  if now() >= v_raffle.closes_at then raise exception 'El sorteo ya cerró'; end if;

  select array_agg(distinct n order by n) into v_nums from unnest(p_numbers) n;
  if v_nums is null then raise exception 'Elegí al menos un número'; end if;
  if exists (select 1 from unnest(v_nums) n where n < 0 or n >= v_raffle.total_numbers) then
    raise exception 'Número fuera de rango';
  end if;

  select count(*) into v_locked from (
    select 1 from raffle_numbers
     where raffle_id = p_raffle and number = any (v_nums) and state = 'available'
     order by number
     for update
  ) s;
  if v_locked <> cardinality(v_nums) then
    raise exception 'Alguno de los números elegidos ya no está disponible' using errcode = 'P0001';
  end if;

  insert into reservations (raffle_id, user_id, manual, buyer_name, buyer_phone, notes, numbers, unit_price, total, expires_at, status)
  values (p_raffle, null, true, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), coalesce(p_notes, ''),
          v_nums, 0, 0, v_raffle.closes_at, 'approved')
  returning * into v_res;

  update raffle_numbers set state = 'paid', reservation_id = v_res.id, reserved_until = null, updated_at = now()
   where raffle_id = p_raffle and number = any (v_nums) and state = 'available';
  return v_res;
end $$;

-- El organizador libera números (de la app o anotados en persona), con motivo.
create or replace function admin_release_entry(p_reservation uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_res reservations;
begin
  if not is_admin() then raise exception 'Solo el organizador'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indicá el motivo'; end if;
  select * into v_res from reservations where id = p_reservation for update;
  if not found then raise exception 'No encontramos esa anotación'; end if;
  if v_res.status not in ('pending', 'approved') then raise exception 'Esos números ya estaban libres'; end if;
  if exists (select 1 from raffles where id = v_res.raffle_id and status not in ('active', 'closed')) then
    raise exception 'El sorteo ya se realizó: no se pueden liberar números';
  end if;
  update raffle_numbers set state = 'available', reservation_id = null, reserved_until = null, updated_at = now()
   where reservation_id = v_res.id;
  update reservations set status = 'cancelled', notes = left(trim(notes || ' · Liberado: ' || trim(p_reason), ' ·'), 500), updated_at = now()
   where id = v_res.id;
  if v_res.user_id is not null then
    insert into notifications (user_id, kind, title, body)
    values (v_res.user_id, 'numeros_liberados', 'Números liberados',
            'El organizador liberó tus números ' || array_to_string(v_res.numbers, ', ') || '. Motivo: ' || left(trim(p_reason), 200));
  end if;
end $$;
drop function if exists admin_manual_cancel(uuid, text);

-- 6) Estadísticas sin plata -------------------------------------------------------------------
create or replace function raffle_stats(p_raffle uuid) returns table (taken int, available int, participants int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el administrador'; end if;
  return query
  select
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state <> 'available'),
    (select count(*)::int from raffle_numbers where raffle_id = p_raffle and state = 'available'),
    (select count(distinct coalesce(user_id::text, 'p:' || lower(buyer_name) || coalesce(buyer_phone, '')))::int
       from reservations where raffle_id = p_raffle and status = 'approved');
end $$;

grant execute on function claim_numbers(uuid, int[]) to authenticated;
grant execute on function cancel_reservation(uuid) to authenticated;
grant execute on function admin_manual_entry(uuid, int[], text, text, text) to authenticated;
grant execute on function admin_release_entry(uuid, text) to authenticated;
grant execute on function raffle_stats(uuid) to authenticated;

-- ====================================================================
-- 20261104000007_detalle_fotos.sql
-- ====================================================================
-- Detalle editable debajo de cada foto del premio.
alter table product_photos add column if not exists caption text not null default ''
  check (length(caption) <= 1000);

-- ====================================================================
-- 20261104000008_resultados.sql
-- ====================================================================
-- SORTEO · Etapa 8 · Día del sorteo, resultado de la Quiniela y ganador.
-- * Cada sorteo tiene un número (Sorteo N° 1, 2, 3...) para distinguirlo.
-- * El organizador carga el día y el turno de la Quiniela; si ya hay números elegidos,
--   se avisa a esas personas del cambio.
-- * El organizador confirma el 1.er premio oficial; el servidor calcula el ganador,
--   lo publica y le avisa dentro de la app.

set search_path = public;

-- 1) Número de sorteo -------------------------------------------------------------------------
alter table raffles add column if not exists raffle_no int generated by default as identity;
create unique index if not exists raffles_raffle_no_idx on raffles (raffle_no);

-- 2) Ganadores: a qué anotación corresponde --------------------------------------------------
alter table winners add column if not exists reservation_id uuid references reservations (id);
alter table lottery_draws add column if not exists numbers text[] not null default '{}';
-- Salió un número que nadie tenía y la regla es pasar al siguiente sorteo: falta cargar el nuevo día.
alter table raffles add column if not exists needs_new_draw boolean not null default false;

-- Hora de cada turno de la Quiniela de la Ciudad (hora de Argentina).
create or replace function slot_time(p_slot draw_slot) returns time
language sql immutable as $$
  select case p_slot
    when 'previa' then time '10:15' when 'primera' then time '12:00' when 'matutina' then time '15:00'
    when 'vespertina' then time '18:00' else time '21:00' end;
$$;

create or replace function draw_moment(p_date date, p_slot draw_slot) returns timestamptz
language sql immutable as $$
  select (p_date + slot_time(p_slot)) at time zone 'America/Argentina/Buenos_Aires';
$$;

-- 3) Las reglas siguen fijas con números elegidos, salvo el día del sorteo -------------------
create or replace function guard_raffle_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from raffle_numbers where raffle_id = old.id and state <> 'available') then
    if new.digits <> old.digits
       or new.unsold_policy is distinct from old.unsold_policy
       or new.winner_rule <> old.winner_rule
       or new.is_demo <> old.is_demo then
      raise exception 'El sorteo ya tiene números elegidos: no se pueden cambiar sus reglas';
    end if;
  end if;
  if old.status in ('drawn', 'cancelled')
     and (new.official_draw_date is distinct from old.official_draw_date
          or new.official_draw_slot is distinct from old.official_draw_slot) then
    raise exception 'El sorteo ya terminó: no se puede cambiar el día';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Aviso a quienes tienen números cuando cambia el día del sorteo.
create or replace function notify_draw_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.official_draw_date is not null and new.official_draw_slot is not null
     and (new.official_draw_date is distinct from old.official_draw_date
          or new.official_draw_slot is distinct from old.official_draw_slot)
     and old.official_draw_date is not null then
    insert into notifications (user_id, kind, title, body, link)
    select distinct r.user_id, 'cambio_fecha', 'Cambió el día del sorteo',
           'El sorteo "' || new.name || '" ahora se hace el ' || to_char(new.official_draw_date, 'DD/MM/YYYY')
           || ' a las ' || to_char(slot_time(new.official_draw_slot), 'HH24:MI') || ' (Quiniela de la Ciudad).',
           '/sorteo/' || new.id
      from reservations r
     where r.raffle_id = new.id and r.status = 'approved' and r.user_id is not null;
  end if;
  return new;
end $$;

drop trigger if exists raffles_notify_draw_change on raffles;
create trigger raffles_notify_draw_change after update of official_draw_date, official_draw_slot on raffles
  for each row execute function notify_draw_change();

-- 4) Cargar día del sorteo ---------------------------------------------------------------------
-- Las personas pueden elegir números hasta que empieza el turno de la Quiniela.
create or replace function admin_set_draw(p_raffle uuid, p_date date, p_slot draw_slot) returns raffles
language plpgsql security definer set search_path = public as $$
declare
  v_raffle raffles;
  v_at     timestamptz;
begin
  if not is_admin() then raise exception 'Solo el organizador puede cargar el día del sorteo'; end if;
  if p_date is null or p_slot is null then raise exception 'Elegí el día y el horario'; end if;
  select * into v_raffle from raffles where id = p_raffle for update;
  if not found then raise exception 'No encontramos ese sorteo'; end if;
  if v_raffle.status in ('drawn', 'cancelled') then raise exception 'Ese sorteo ya terminó'; end if;
  if extract(isodow from p_date) = 7 then raise exception 'Los domingos no hay Quiniela'; end if;
  v_at := draw_moment(p_date, p_slot);
  if v_at <= now() then raise exception 'Elegí un día y horario que todavía no hayan pasado'; end if;
  if v_at <= v_raffle.starts_at then raise exception 'El sorteo tiene que ser después de que se abra para elegir números'; end if;

  update raffles
     set official_draw_date = p_date,
         official_draw_slot = p_slot,
         closes_at = v_at,
         unsold_policy = coalesce(unsold_policy, 'desierto'),
         needs_new_draw = false
   where id = p_raffle
  returning * into v_raffle;
  return v_raffle;
end $$;

-- 5) Ver quién gana antes de publicar ----------------------------------------------------------
create or replace function winning_number_for(p_raffle raffles, p_prize text) returns int
language sql immutable as $$
  select (right(p_prize, p_raffle.digits))::int;
$$;

create or replace function admin_preview_winner(p_raffle uuid, p_first_prize text, p_second_prize text default null)
returns table (used_prize text, winning_number int, reservation_id uuid, name text, phone text, from_app boolean, outcome text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_raffle raffles;
  v_prize  text;
  v_num    int;
  v_res    reservations;
  v_try    int := 0;
begin
  if not is_admin() then raise exception 'Solo el organizador'; end if;
  if p_first_prize !~ '^[0-9]{4}$' then raise exception 'El 1.er premio tiene que tener 4 cifras'; end if;
  if p_second_prize is not null and p_second_prize !~ '^[0-9]{4}$' then raise exception 'El 2.º premio tiene que tener 4 cifras'; end if;
  select * into v_raffle from raffles where id = p_raffle;
  if not found then raise exception 'No encontramos ese sorteo'; end if;

  v_prize := p_first_prize;
  loop
    v_try := v_try + 1;
    v_num := winning_number_for(v_raffle, v_prize);
    v_res := null;
    if v_num < v_raffle.total_numbers then
      select r.* into v_res from raffle_numbers n join reservations r on r.id = n.reservation_id
       where n.raffle_id = p_raffle and n.number = v_num and n.state <> 'available' and r.status = 'approved';
    end if;
    if v_res.id is not null then
      return query select v_prize, v_num, v_res.id, v_res.buyer_name, coalesce(v_res.buyer_phone, ''), not v_res.manual, 'ganador'::text;
      return;
    end if;
    exit when v_try > 1 or coalesce(v_raffle.unsold_policy, 'desierto') <> 'segundo_premio' or p_second_prize is null;
    v_prize := p_second_prize;
  end loop;

  return query select v_prize, v_num, null::uuid, ''::text, ''::text, false,
    case coalesce(v_raffle.unsold_policy, 'desierto')
      when 'siguiente_sorteo' then 'siguiente_sorteo'
      when 'segundo_premio' then case when p_second_prize is null then 'falta_segundo' else 'desierto' end
      else 'desierto' end;
end $$;

-- 6) Publicar el resultado ---------------------------------------------------------------------
create or replace function admin_publish_result(
  p_raffle uuid, p_first_prize text, p_second_prize text default null, p_numbers text[] default '{}', p_from_source boolean default false
) returns table (outcome text, winning_number int, name text, phone text)
language plpgsql security definer set search_path = public as $$
declare
  v_raffle raffles;
  v_prev   record;
  v_draw   lottery_draws;
  v_nums   text[];
begin
  if not is_admin() then raise exception 'Solo el organizador puede publicar el resultado'; end if;
  select * into v_raffle from raffles where id = p_raffle for update;
  if not found then raise exception 'No encontramos ese sorteo'; end if;
  if v_raffle.status in ('drawn', 'cancelled') then raise exception 'Ese sorteo ya tiene resultado'; end if;
  if v_raffle.official_draw_date is null or v_raffle.official_draw_slot is null then raise exception 'Primero cargá el día del sorteo'; end if;
  if v_raffle.needs_new_draw then raise exception 'Primero cargá el nuevo día del sorteo'; end if;
  if draw_moment(v_raffle.official_draw_date, v_raffle.official_draw_slot) > now() then
    raise exception 'La Quiniela de ese turno todavía no se hizo';
  end if;

  select * into v_prev from admin_preview_winner(p_raffle, p_first_prize, p_second_prize);
  if v_prev.outcome = 'falta_segundo' then raise exception 'Nadie tiene ese número: cargá también el 2.º premio'; end if;

  v_nums := coalesce(p_numbers, '{}');
  if exists (select 1 from unnest(v_nums) x where x !~ '^[0-9]{4}$') or cardinality(v_nums) > 20 then
    raise exception 'Números de la Quiniela inválidos';
  end if;
  if cardinality(v_nums) > 0 and v_nums[1] <> p_first_prize then raise exception 'El 1.er premio no coincide con la lista'; end if;

  insert into lottery_draws (draw_date, draw_slot, first_prize, numbers, entered_manually, status, verified_by, verified_at)
  values (v_raffle.official_draw_date, v_raffle.official_draw_slot, p_first_prize, v_nums, not p_from_source, 'verificado', auth.uid(), now())
  on conflict (draw_date, draw_slot) do update set
    first_prize = excluded.first_prize,
    numbers = case when cardinality(excluded.numbers) > 0 then excluded.numbers else lottery_draws.numbers end,
    status = 'verificado', verified_by = excluded.verified_by, verified_at = now()
  returning * into v_draw;

  if v_prev.outcome = 'siguiente_sorteo' then
    -- Nadie tenía el número: el sorteo pasa al próximo turno que cargue el organizador.
    update raffles set needs_new_draw = true where id = p_raffle;
    insert into notifications (user_id, kind, title, body, link)
    select distinct r.user_id, 'resultado', 'Salió un número que nadie tenía',
           'En "' || v_raffle.name || '" salió el ' || lpad(v_prev.winning_number::text, v_raffle.digits, '0')
           || ' y nadie lo había elegido. El sorteo pasa a la próxima Quiniela; te avisamos el nuevo día.', '/sorteo/' || p_raffle
      from reservations r where r.raffle_id = p_raffle and r.status = 'approved' and r.user_id is not null;
    return query select 'siguiente_sorteo'::text, v_prev.winning_number, ''::text, ''::text;
    return;
  end if;

  insert into winners (raffle_id, lottery_draw_id, winning_number, user_id, reservation_id, status, published_at)
  values (p_raffle, v_draw.id, v_prev.winning_number,
          (select user_id from reservations where id = v_prev.reservation_id), v_prev.reservation_id,
          case when v_prev.outcome = 'ganador' then 'publicado' else 'desierto' end::winner_status, now());
  update raffles set status = 'drawn' where id = p_raffle;

  insert into notifications (user_id, kind, title, body, link)
  select distinct r.user_id, 'resultado', 'Resultado de "' || left(v_raffle.name, 90) || '"',
         'Salió el ' || lpad(v_prev.winning_number::text, v_raffle.digits, '0') || '. '
         || case when v_prev.outcome = 'ganador' then 'Esta vez no ganaste. ¡Gracias por participar!' else 'Nadie tenía ese número: el sorteo quedó desierto.' end,
         '/resultados'
    from reservations r
   where r.raffle_id = p_raffle and r.status = 'approved' and r.user_id is not null
     and r.id is distinct from v_prev.reservation_id;

  if v_prev.outcome = 'ganador' then
    insert into notifications (user_id, kind, title, body, link)
    select user_id, 'ganador', '¡Ganaste ' || left(v_raffle.name, 100) || '!',
           'Salió tu número ' || lpad(v_prev.winning_number::text, v_raffle.digits, '0')
           || ' en la Quiniela de la Ciudad. El organizador se va a comunicar con vos.', '/resultados'
      from reservations where id = v_prev.reservation_id and user_id is not null;
  end if;

  return query select v_prev.outcome, v_prev.winning_number, v_prev.name, v_prev.phone;
end $$;

-- 7) Resultados públicos: sin teléfonos y con el nombre abreviado ----------------------------
create or replace function public_results() returns table (
  raffle_id uuid, raffle_no int, raffle_name text, prize text, digits int, draw_date date, draw_slot draw_slot,
  first_prize text, numbers text[], winning_number int, outcome winner_status, winner_label text, is_mine boolean, published_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select ra.id, ra.raffle_no, ra.name, coalesce(p.name, ''), ra.digits, d.draw_date, d.draw_slot,
         d.first_prize, d.numbers, w.winning_number, w.status,
         case when w.status = 'publicado' then
           split_part(trim(coalesce(r.buyer_name, '')), ' ', 1)
           || coalesce(' ' || nullif(left(split_part(trim(coalesce(r.buyer_name, '')), ' ', 2), 1), '') || '.', '')
         else '' end,
         (w.user_id is not null and w.user_id = auth.uid()),
         w.published_at
    from winners w
    join raffles ra on ra.id = w.raffle_id
    join lottery_draws d on d.id = w.lottery_draw_id
    left join products p on p.id = ra.product_id
    left join reservations r on r.id = w.reservation_id
   where w.status in ('publicado', 'desierto')
   order by w.published_at desc nulls last
   limit 50;
$$;

grant execute on function admin_set_draw(uuid, date, draw_slot) to authenticated;
grant execute on function admin_preview_winner(uuid, text, text) to authenticated;
grant execute on function admin_publish_result(uuid, text, text, text[], boolean) to authenticated;
grant execute on function public_results() to anon, authenticated;
revoke execute on function admin_set_draw(uuid, date, draw_slot) from anon;
revoke execute on function admin_preview_winner(uuid, text, text) from anon;
revoke execute on function admin_publish_result(uuid, text, text, text[], boolean) from anon;

-- ====================================================================
-- 20261104000009_avisos_push.sql
-- ====================================================================
-- SORTEO · Etapa 10 · Avisos push al celular.
-- Los avisos se siguen guardando en notifications. Cuando el organizador hace algo que genera
-- avisos (publicar ganador, cambiar el día, liberar números), su app le pide a /api/push que
-- los mande. Esa función usa la sesión del organizador: no hace falta ninguna clave secreta de Supabase.

set search_path = public;

alter table notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_push_idx on notifications (created_at) where pushed_at is null;

-- Una persona puede tener varios celulares; cada uno registra su suscripción.
alter table push_subscriptions drop constraint if exists push_subscriptions_keys_check;
alter table push_subscriptions add constraint push_subscriptions_keys_check
  check (jsonb_typeof(keys -> 'p256dh') = 'string' and jsonb_typeof(keys -> 'auth') = 'string' and length(keys::text) < 400);
alter table push_subscriptions drop constraint if exists push_subscriptions_endpoint_check;
alter table push_subscriptions add constraint push_subscriptions_endpoint_check
  check (endpoint ~ '^https://' and length(endpoint) < 1000);

-- Guardar (o mover a mi cuenta) la suscripción de este celular.
create or replace function save_push_subscription(p_endpoint text, p_keys jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  insert into push_subscriptions (user_id, endpoint, keys) values (auth.uid(), p_endpoint, p_keys)
  on conflict (endpoint) do update set user_id = excluded.user_id, keys = excluded.keys, created_at = now();
end $$;

-- Toma los avisos pendientes (de las últimas 24 h) con los celulares de cada persona y los marca enviados.
create or replace function take_push_batch() returns table (id uuid, title text, body text, link text, kind text, subs jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el organizador'; end if;
  return query
  with pend as (
    select n.id from notifications n
     where n.pushed_at is null and n.user_id is not null and n.read_at is null
       and n.created_at > now() - interval '24 hours'
     order by n.created_at
     limit 300
     for update skip locked
  ), marked as (
    update notifications n set pushed_at = now() from pend where n.id = pend.id
    returning n.id, n.user_id, n.title, n.body, n.link, n.kind
  )
  select m.id, m.title, m.body, m.link, m.kind,
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', s.keys))
                     from push_subscriptions s where s.user_id = m.user_id), '[]'::jsonb)
    from marked m;
end $$;

-- Borra celulares que ya no aceptan avisos (la persona desinstaló o bloqueó).
create or replace function drop_push_endpoints(p_endpoints text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el organizador'; end if;
  delete from push_subscriptions where endpoint = any (p_endpoints);
end $$;

grant execute on function save_push_subscription(text, jsonb) to authenticated;
grant execute on function take_push_batch() to authenticated;
grant execute on function drop_push_endpoints(text[]) to authenticated;
revoke execute on function save_push_subscription(text, jsonb) from anon;
revoke execute on function take_push_batch() from anon;
revoke execute on function drop_push_endpoints(text[]) from anon;

-- ====================================================================
-- 20261104000010_seguridad.sql
-- ====================================================================
-- SORTEO · Etapa 11 · Seguridad.
-- 1) Las funciones solo las puede llamar quien corresponde (además del control que ya hace cada una).
-- 2) Resultados oficiales y ganadores solo se escriben con "Confirmar y publicar", nunca a mano.
-- 3) Un sorteo solo pasa a "Sorteado" si tiene ganador publicado, y no vuelve atrás.
-- 4) El público no ve qué cuenta ganó (solo el nombre abreviado que muestra Resultados).
-- 5) Copia de seguridad completa para el dueño.

set search_path = public;

-- 1) Permisos de ejecución ------------------------------------------------------------------
do $$
declare f text;
begin
  -- Solo con sesión iniciada
  foreach f in array array[
    'admin_manual_entry(uuid, int[], text, text, text)', 'admin_release_entry(uuid, text)', 'admin_products()',
    'admin_set_draw(uuid, date, draw_slot)', 'admin_preview_winner(uuid, text, text)',
    'admin_publish_result(uuid, text, text, text[], boolean)', 'claim_numbers(uuid, int[])', 'cancel_reservation(uuid)',
    'raffle_stats(uuid)', 'save_push_subscription(text, jsonb)', 'take_push_batch()', 'drop_push_endpoints(text[])']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Uso interno (tareas programadas): nadie desde la app
  execute 'revoke execute on function release_expired_reservations() from public, anon, authenticated';
end $$;

-- 2) Resultados y ganadores: solo por las funciones que verifican -----------------------------
revoke insert, update, delete on lottery_draws, winners from anon, authenticated;
drop policy if exists lottery_draws_admin on lottery_draws;
drop policy if exists winners_admin on winners;

-- 3) Estado "Sorteado" solo con ganador -------------------------------------------------------
create or replace function guard_raffle_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from raffle_numbers where raffle_id = old.id and state <> 'available') then
    if new.digits <> old.digits
       or new.unsold_policy is distinct from old.unsold_policy
       or new.winner_rule <> old.winner_rule
       or new.is_demo <> old.is_demo then
      raise exception 'El sorteo ya tiene números elegidos: no se pueden cambiar sus reglas';
    end if;
  end if;
  if old.status in ('drawn', 'cancelled')
     and (new.official_draw_date is distinct from old.official_draw_date
          or new.official_draw_slot is distinct from old.official_draw_slot) then
    raise exception 'El sorteo ya terminó: no se puede cambiar el día';
  end if;
  if old.status = 'drawn' and new.status <> 'drawn' then
    raise exception 'Un sorteo ya realizado no puede volver atrás';
  end if;
  if new.status = 'drawn' and old.status <> 'drawn'
     and not exists (select 1 from winners where raffle_id = new.id) then
    raise exception 'Para marcar el sorteo como realizado, publicá el resultado en "Día del sorteo"';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 4) Ganadores: el público no ve la cuenta ni la anotación ------------------------------------
revoke select on winners from anon, authenticated;
grant select (id, raffle_id, lottery_draw_id, winning_number, status, notes, published_at, created_at) on winners to anon, authenticated;

-- 5) Copia de seguridad (solo el dueño) --------------------------------------------------------
create or replace function owner_backup() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := jsonb_build_object('creada', now(), 'app', 'SORTEO'); part jsonb; t text;
begin
  if not is_owner() then raise exception 'Solo el dueño puede descargar la copia completa'; end if;
  foreach t in array array['settings', 'profiles', 'products', 'product_photos', 'raffles', 'raffle_numbers',
                           'reservations', 'lottery_draws', 'winners', 'notifications', 'expenses']
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I x', t) into part;
    v := v || jsonb_build_object(t, part);
  end loop;
  return v;
end $$;

revoke execute on function owner_backup() from public, anon;
grant execute on function owner_backup() to authenticated;


-- SORTEO · Cambiar la contraseña de un cliente desde el panel (sin correo).
-- El cliente avisa por WhatsApp, el organizador le pone una contraseña nueva y se la pasa.
-- Reglas: solo organizador o dueño; la del dueño solo la cambia el dueño; la de otro
-- organizador solo la cambia el dueño. Queda anotado en el historial (sin la contraseña).

set search_path = public;

create or replace function admin_set_password(p_email text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_target profiles;
begin
  if not is_admin() then raise exception 'Solo el organizador puede cambiar contraseñas'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  select * into v_target from profiles where lower(email) = lower(trim(p_email));
  if not found then raise exception 'No hay ninguna cuenta con ese correo'; end if;
  if v_target.is_owner and not is_owner() then
    raise exception 'La contraseña del dueño solo la puede cambiar el dueño';
  end if;
  if v_target.role = 'admin' and v_target.id <> auth.uid() and not is_owner() then
    raise exception 'La contraseña de otro organizador solo la puede cambiar el dueño';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = v_target.id;
  insert into audit_logs (actor, action, table_name, record_id, new_data)
  values (auth.uid(), 'cambio_contrasena', 'auth.users', v_target.id::text, jsonb_build_object('email', v_target.email));
  return trim(coalesce(v_target.first_name, '') || ' ' || coalesce(v_target.last_name, ''));
end $$;

revoke execute on function admin_set_password(text, text) from public, anon;
grant execute on function admin_set_password(text, text) to authenticated;
-- Registro privado del dueño: lo que le paga cada cliente (organizador) por la app y el diseño.
-- Es solo un registro manual. La app no cobra nada ni guarda datos de tarjetas o cuentas.
create table if not exists owner_sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles(id) on delete set null,
  client_name text not null default '' check (char_length(client_name) <= 120),
  concept text not null default '' check (char_length(concept) <= 120),
  amount numeric(12,2) not null check (amount >= 0 and amount <= 1000000000),
  sale_date date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  status text not null default 'pagado' check (status in ('pagado', 'pendiente')),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists owner_sales_date_idx on owner_sales (sale_date desc);

alter table owner_sales enable row level security;
drop policy if exists owner_sales_owner on owner_sales;
create policy owner_sales_owner on owner_sales for all to authenticated using (is_owner()) with check (is_owner());
revoke all on owner_sales from anon;
grant select, insert, update, delete on owner_sales to authenticated;

-- La copia de seguridad también incluye las ventas.
create or replace function owner_backup() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := jsonb_build_object('creada', now(), 'app', 'SORTEO'); part jsonb; t text;
begin
  if not is_owner() then raise exception 'Solo el dueño puede descargar la copia completa'; end if;
  foreach t in array array['settings', 'profiles', 'products', 'product_photos', 'raffles', 'raffle_numbers',
                           'reservations', 'lottery_draws', 'winners', 'notifications', 'expenses', 'owner_sales']
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %I x', t) into part;
    v := v || jsonb_build_object(t, part);
  end loop;
  return v;
end $$;
revoke execute on function owner_backup() from public, anon;
grant execute on function owner_backup() to authenticated;
