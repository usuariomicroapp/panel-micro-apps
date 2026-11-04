import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { resyncPush } from '../lib/pwa'

interface Note { id: string; kind: string; title: string; body: string; link: string }

// Avisos personales (ganaste, cambió el día, resultado...) arriba de todas las pantallas hasta que se tocan.
export default function Notices() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const uid = session?.user.id
  const [notes, setNotes] = useState<Note[]>([])
  const load = useCallback(async () => {
    if (!supabase || !uid) return setNotes([])
    const { data } = await supabase.from('notifications').select('id, kind, title, body, link')
      .eq('user_id', uid).is('read_at', null).order('created_at', { ascending: false }).limit(3)
    setNotes((data ?? []) as Note[])
  }, [uid])
  useEffect(() => { load() }, [load, pathname])
  useEffect(() => { if (uid) resyncPush().catch(() => {}) }, [uid])

  const dismiss = async (id: string) => {
    setNotes((n) => n.filter((x) => x.id !== id))
    await supabase!.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  }
  if (!notes.length) return null
  return (
    <div className="mx-auto w-full max-w-6xl space-y-2 px-4 pt-4">
      {notes.map((n) => (
        <div key={n.id} role="status" className={`rounded-2xl border-2 p-4 ${n.kind === 'ganador' ? 'border-free bg-free/10' : 'border-brand-200 bg-brand-50'}`}>
          <p className="text-lg font-bold">{n.kind === 'ganador' && '🎉 '}{n.title}</p>
          {n.body && <p className="mt-1 text-base">{n.body}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            {n.link && n.link !== pathname && <Link to={n.link} onClick={() => dismiss(n.id)} className="rounded-xl bg-ink px-4 py-2 font-semibold text-white">Ver</Link>}
            <button onClick={() => dismiss(n.id)} className="rounded-xl border border-line bg-surface px-4 py-2 font-semibold">Entendido</button>
          </div>
        </div>
      ))}
    </div>
  )
}
