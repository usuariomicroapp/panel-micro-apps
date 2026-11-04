-- SORTEO · Base de datos · Parte 2 de 4. Pegar y ejecutar en orden (Run).
set search_path = public;

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

