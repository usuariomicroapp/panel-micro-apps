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
