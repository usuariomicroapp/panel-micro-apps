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
