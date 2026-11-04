-- SORTEO · El día del sorteo se carga después.
-- El organizador publica el sorteo sin día ni Quiniela. La gente elige números mientras tanto.
-- Cuando quiere (por ejemplo, cuando se entregaron todos los números), carga el día y el turno
-- en "Día del sorteo". Hasta ese momento el sorteo queda abierto sin hora de cierre.

set search_path = public;

-- 1) Un sorteo activo ya no necesita el día cargado (sí qué pasa si nadie tiene el número).
alter table raffles drop constraint if exists active_needs_rules;
alter table raffles add constraint active_needs_rules check (
  status in ('draft', 'cancelled') or unsold_policy is not null
);

-- 2) Aviso a quienes tienen números cuando se carga o cambia el día del sorteo.
create or replace function notify_draw_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.official_draw_date is not null and new.official_draw_slot is not null
     and (new.official_draw_date is distinct from old.official_draw_date
          or new.official_draw_slot is distinct from old.official_draw_slot) then
    insert into notifications (user_id, kind, title, body, link)
    select distinct r.user_id, 'cambio_fecha',
           case when old.official_draw_date is null then 'Ya hay día del sorteo' else 'Cambió el día del sorteo' end,
           'El sorteo "' || new.name || '" se hace el ' || to_char(new.official_draw_date, 'DD/MM/YYYY')
           || ' a las ' || to_char(slot_time(new.official_draw_slot), 'HH24:MI') || ' (Quiniela de la Ciudad).',
           '/sorteo/' || new.id
      from reservations r
     where r.raffle_id = new.id and r.status = 'approved' and r.user_id is not null;
  end if;
  return new;
end $$;
