-- SORTEO · Borrar un sorteo por completo (el tachito en la lista de Sorteos).
-- Borra el sorteo, sus números, las anotaciones, el ganador y la foto propia del premio.
-- Solo el organizador dueño del sorteo (o el dueño de la app).

set search_path = public;

create or replace function admin_delete_raffle(p_raffle uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_raffle raffles;
begin
  select * into v_raffle from raffles where id = p_raffle for update;
  if not found then raise exception 'No encontramos ese sorteo'; end if;
  if not manages(v_raffle.organizer_id) then raise exception 'Solo el organizador del sorteo puede borrarlo'; end if;

  delete from winners where raffle_id = p_raffle;
  delete from raffle_numbers where raffle_id = p_raffle;
  delete from reservations where raffle_id = p_raffle;
  delete from raffles where id = p_raffle;

  -- El premio propio del sorteo (no está en la tienda ni en otro sorteo) se borra con sus fotos.
  delete from products p
   where p.id = v_raffle.product_id and not p.show_in_store
     and not exists (select 1 from raffles r where r.product_id = p.id);
end $$;

revoke execute on function admin_delete_raffle(uuid) from public, anon;
grant execute on function admin_delete_raffle(uuid) to authenticated;
