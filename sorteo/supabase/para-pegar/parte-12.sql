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
