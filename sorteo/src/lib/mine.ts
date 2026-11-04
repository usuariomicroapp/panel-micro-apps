import { supabase } from './supabase'

// Id de la cuenta conectada, para filtrar en el panel lo que es de este organizador.
export async function myId() {
  const { data } = await supabase!.auth.getSession()
  return data.session?.user.id ?? '00000000-0000-0000-0000-000000000000'
}
