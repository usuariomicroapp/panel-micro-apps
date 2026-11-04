-- SORTEO · Aviso de sorteo nuevo.
-- Quien entra con el link de un organizador queda como "seguidor" de ese organizador.
-- Cuando el organizador publica un sorteo, a sus seguidores y a quienes ya eligieron números
-- en sus sorteos les llega el aviso (en la app y, si los activaron, como notificación push).

set search_path = public;

create table if not exists organizer_followers (
  organizer_id uuid not null references profiles (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (organizer_id, user_id)
);
alter table organizer_followers enable row level security;
revoke all on organizer_followers from anon, authenticated;
grant select on organizer_followers to authenticated;
drop policy if exists organizer_followers_read on organizer_followers;
create policy organizer_followers_read on organizer_followers for select to authenticated
  using (user_id = auth.uid() or manages(organizer_id));

-- Seguir al organizador del link (solo si de verdad es organizador).
create or replace function follow_organizer(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_org is null or p_org = auth.uid() then return; end if;
  if not exists (select 1 from profiles where id = p_org and (role = 'admin' or is_owner)) then return; end if;
  insert into organizer_followers (organizer_id, user_id) values (p_org, auth.uid()) on conflict do nothing;
end $$;
revoke execute on function follow_organizer(uuid) from public, anon;
grant execute on function follow_organizer(uuid) to authenticated;

-- Al publicar un sorteo (nuevo y activo, o de borrador a activo) se avisa a la gente del organizador.
create or replace function notify_new_raffle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'active' or new.organizer_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then return new; end if;
  insert into notifications (user_id, kind, title, body, link)
  select u.user_id, 'nuevo_sorteo', left('🎟️ Nuevo sorteo: ' || new.name, 120),
         'Entrá y elegí tu número antes de que se terminen.', '/sorteo/' || new.id
    from (
      select f.user_id from organizer_followers f where f.organizer_id = new.organizer_id
      union
      select r.user_id from reservations r join raffles ra on ra.id = r.raffle_id
       where ra.organizer_id = new.organizer_id and r.user_id is not null
    ) u
   where u.user_id <> new.organizer_id;
  return new;
end $$;
drop trigger if exists raffles_notify_new on raffles;
create trigger raffles_notify_new after insert or update of status on raffles
  for each row execute function notify_new_raffle();
