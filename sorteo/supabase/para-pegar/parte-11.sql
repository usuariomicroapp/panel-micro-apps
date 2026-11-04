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
