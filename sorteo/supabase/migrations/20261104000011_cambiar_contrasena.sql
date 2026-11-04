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
