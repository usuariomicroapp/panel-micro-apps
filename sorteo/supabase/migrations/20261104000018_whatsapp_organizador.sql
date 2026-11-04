-- SORTEO · WhatsApp del organizador para el botón "Informar al administrador".
-- Devuelve solo el teléfono del organizador (el que cargó en Mis datos), y solo a quien tiene cuenta.

set search_path = public;

create or replace function organizer_whatsapp(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select nullif(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), '')
    from profiles p
   where p.id = p_org and (p.role = 'admin' or p.is_owner) and auth.uid() is not null;
$$;
revoke execute on function organizer_whatsapp(uuid) from public, anon;
grant execute on function organizer_whatsapp(uuid) to authenticated;
