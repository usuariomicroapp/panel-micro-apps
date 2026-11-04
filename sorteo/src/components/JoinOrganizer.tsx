import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Link del dueño para sumar organizadores: https://app/?unirme=CÓDIGO
const KEY = 'sorteo-unirme'
const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const write = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY) } catch { /* sin almacenamiento */ } }

;(() => {
  const q = new URLSearchParams(window.location.search).get('unirme') || new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('unirme')
  if (q && /^[a-z0-9]{8,40}$/i.test(q)) write(q.toLowerCase())
})()

export default function JoinOrganizer() {
  const { ready, session, profile, refreshProfile } = useAuth()
  const [code, setCode] = useState(read)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!supabase || !ready || !session || !profile || !code) return
    if (profile.is_owner || profile.role === 'admin') { write(null); setCode(null); return }
    supabase.rpc('join_as_organizer', { p_code: code }).then(async ({ error }) => {
      write(null); setCode(null)
      if (error) return setMsg({ ok: false, text: error.message })
      await refreshProfile()
      setMsg({ ok: true, text: '¡Listo! Ya sos organizador. Tocá «Panel» arriba para cargar tus productos y sorteos.' })
    })
  }, [ready, session, profile, code, refreshProfile])

  if (msg) {
    return (
      <div className={`flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold ${msg.ok ? 'bg-free text-white' : 'bg-sold text-white'}`}>
        <span>{msg.text}</span>
        {msg.ok ? <Link to="/admin" onClick={() => setMsg(null)} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">Ir al panel</Link>
          : <button onClick={() => setMsg(null)} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">Cerrar</button>}
      </div>
    )
  }
  if (code && ready && !session) {
    return (
      <div className="flex items-center justify-between gap-3 bg-night px-4 py-3 text-sm text-white">
        <span>Te invitaron a <b>organizar sorteos</b>. Creá tu cuenta para empezar.</span>
        <Link to="/perfil" className="btn-gold shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold">Crear cuenta</Link>
      </div>
    )
  }
  return null
}
