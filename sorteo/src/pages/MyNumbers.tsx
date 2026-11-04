import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, isConfigured } from '../lib/supabase'
import { fecha, pad } from '../lib/format'
import { slotTimes, type DrawSlot } from '../lib/data'
import { InstallCard, PushCard } from '../components/AppSetup'

interface Row {
  id: string
  raffle_id: string
  numbers: number[]
  status: string
  created_at: string
  notes: string
  raffles: { name: string; digits: number; is_demo: boolean; status: string; closes_at: string; official_draw_date: string | null; official_draw_slot: DrawSlot | null } | null
}

// Los números que eligió la persona en cada sorteo.
export default function MyNumbers() {
  const { ready, session } = useAuth()
  const [params] = useSearchParams()
  const fresh = params.get('nueva')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('reservations')
      .select('id, raffle_id, numbers, status, created_at, notes, raffles(name, digits, is_demo, status, closes_at, official_draw_date, official_draw_slot)')
      .eq('user_id', session.user.id).order('created_at', { ascending: false })
    if (error) setErr('No se pudieron cargar tus números.')
    else setRows((data ?? []) as unknown as Row[])
  }, [session])

  useEffect(() => { void load() }, [load])

  const release = async (r: Row) => {
    if (!window.confirm('¿Soltar estos números? Otra persona los va a poder elegir.')) return
    const { error } = await supabase!.rpc('cancel_reservation', { p_reservation: r.id })
    if (error) setErr(error.message)
    void load()
  }

  if (!isConfigured) return <p className="py-16 text-center text-muted">Disponible cuando la app esté conectada a la base de datos.</p>
  if (!ready) return <p className="py-16 text-center text-muted">Cargando…</p>
  if (!session) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-extrabold">Mis números</h1>
        <p className="mt-2 text-lg text-muted">Ingresá para ver los números que elegiste.</p>
        <Link to="/perfil" className="mt-6 inline-block rounded-2xl bg-brand-600 px-8 py-4 text-lg font-bold text-white">Ingresar</Link>
      </div>
    )
  }

  const mine = (rows ?? []).filter((r) => r.status === 'approved' || r.status === 'pending')
  const released = (rows ?? []).filter((r) => r.status === 'cancelled' && /Liberado:/.test(r.notes ?? ''))

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-extrabold">Mis números</h1>
      {err && <p role="alert" className="rounded-xl bg-sold/10 p-3 text-sold">{err}</p>}
      {fresh && <><InstallCard compact /><PushCard /></>}
      {rows === null ? <p className="text-muted">Cargando…</p> : mine.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-lg">Todavía no elegiste números.</p>
          <Link to="/" className="mt-4 inline-block rounded-2xl bg-brand-600 px-6 py-3.5 text-lg font-bold text-white">Ver sorteos</Link>
        </div>
      ) : mine.map((r) => {
        const digits = r.raffles?.digits ?? 2
        const canRelease = r.raffles?.status === 'active' && new Date(r.raffles.closes_at) > new Date()
        return (
          <article key={r.id} className={`rounded-3xl border bg-surface p-5 ${r.id === fresh ? 'border-brand-500 ring-2 ring-brand-200' : 'border-line'}`}>
            {r.id === fresh && <p className="mb-3 rounded-xl bg-free/10 p-3 text-lg font-semibold text-free">¡Listo! Ya estás participando.</p>}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link to={`/sorteo/${r.raffle_id}`} className="text-lg font-bold">{r.raffles?.name ?? 'Sorteo'}</Link>
              {r.raffles?.is_demo && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">Prueba</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.numbers.map((n) => <span key={n} className="rounded-xl bg-brand-600 px-4 py-2 text-2xl font-bold tabular-nums text-white">{pad(n, digits)}</span>)}
            </div>
            <p className="mt-3 text-base">Elegido el {fecha(r.created_at)}.</p>
            {r.raffles?.official_draw_date && <p className="text-base">Se sortea el {r.raffles.official_draw_date.split('-').reverse().join('/')}{r.raffles.official_draw_slot && ` a las ${slotTimes[r.raffles.official_draw_slot]}`}. Si ganás, te avisamos acá en la app y el organizador se comunica con vos.</p>}
            {canRelease && <button onClick={() => release(r)} className="mt-4 w-full rounded-2xl border border-line py-3 font-semibold text-muted">Soltar mis números</button>}
          </article>
        )
      })}
      {released.length > 0 && (
        <div className="rounded-2xl bg-canvas p-4 text-sm text-muted">
          {released.map((r) => <p key={r.id}>{r.raffles?.name}: el organizador liberó {r.numbers.map((n) => pad(n, r.raffles?.digits ?? 2)).join(', ')}. {r.notes.split('Liberado:')[1]?.trim()}</p>)}
        </div>
      )}
    </div>
  )
}
