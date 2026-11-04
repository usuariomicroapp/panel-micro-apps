import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import HowToPay from '../components/HowToPay'
import { useAuth } from '../lib/auth'
import { supabase, isConfigured } from '../lib/supabase'
import { fecha, pad, pesos } from '../lib/format'

type Status = 'pending' | 'submitted' | 'approved' | 'rejected' | 'expired' | 'cancelled'

interface Row {
  id: string
  raffle_id: string
  numbers: number[]
  total: number
  expires_at: string
  status: Status
  created_at: string
  raffles: { name: string; digits: number; is_demo: boolean } | null
}

const labels: Record<Status, { text: string; cls: string }> = {
  pending: { text: 'Falta pagar', cls: 'bg-held/20 text-yellow-800' },
  submitted: { text: 'Comprobante enviado, en revisión', cls: 'bg-brand-100 text-brand-700' },
  approved: { text: 'Pagado y confirmado', cls: 'bg-free/15 text-free' },
  rejected: { text: 'Pago rechazado', cls: 'bg-sold/10 text-sold' },
  expired: { text: 'Venció', cls: 'bg-canvas text-muted' },
  cancelled: { text: 'Cancelada', cls: 'bg-canvas text-muted' },
}

function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now())
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(until).getTime() - Date.now()
      setLeft(l)
      if (l <= 0) { clearInterval(t); onEnd() }
    }, 1000)
    return () => clearInterval(t)
  }, [until, onEnd])
  if (left <= 0) return <span>vencida</span>
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000)
  const h = Math.floor(m / 60)
  return <span className="tabular-nums">{h > 0 ? `${h} h ${m % 60} min` : `${m}:${String(s).padStart(2, '0')}`}</span>
}

// Los números que reservó o compró la persona, con el tiempo que le queda para pagar.
export default function MyNumbers() {
  const { ready, session } = useAuth()
  const [params] = useSearchParams()
  const fresh = params.get('nueva')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !session) return
    const { data, error } = await supabase.from('reservations').select('id, raffle_id, numbers, total, expires_at, status, created_at, raffles(name, digits, is_demo)')
      .eq('user_id', session.user.id).order('created_at', { ascending: false })
    if (error) setErr('No se pudieron cargar tus números.')
    else setRows((data ?? []) as unknown as Row[])
  }, [session])

  useEffect(() => { void load() }, [load])

  const cancel = async (r: Row) => {
    if (!window.confirm('¿Cancelar esta reserva? Los números vuelven a quedar libres para otros.')) return
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
        <p className="mt-2 text-lg text-muted">Ingresá para ver los números que reservaste.</p>
        <Link to="/perfil" className="mt-6 inline-block rounded-2xl bg-brand-600 px-8 py-4 text-lg font-bold text-white">Ingresar</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-extrabold">Mis números</h1>
      {err && <p role="alert" className="rounded-xl bg-sold/10 p-3 text-sold">{err}</p>}
      {rows === null ? <p className="text-muted">Cargando…</p> : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-lg">Todavía no reservaste números.</p>
          <Link to="/" className="mt-4 inline-block rounded-2xl bg-brand-600 px-6 py-3.5 text-lg font-bold text-white">Ver sorteos</Link>
        </div>
      ) : rows.map((r) => {
        const digits = r.raffles?.digits ?? 2
        const live = r.status === 'pending' && new Date(r.expires_at) > new Date()
        const st = r.status === 'pending' && !live ? labels.expired : labels[r.status]
        return (
          <article key={r.id} className={`rounded-3xl border bg-surface p-5 ${r.id === fresh ? 'border-brand-500 ring-2 ring-brand-200' : 'border-line'}`}>
            {r.id === fresh && <p className="mb-3 rounded-xl bg-free/10 p-3 text-base font-semibold text-free">¡Listo! Tus números quedaron reservados.</p>}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link to={`/sorteo/${r.raffle_id}`} className="text-lg font-bold">{r.raffles?.name ?? 'Sorteo'}</Link>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${st.cls}`}>{st.text}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.numbers.map((n) => <span key={n} className="rounded-xl bg-brand-600 px-3 py-1.5 text-xl font-bold tabular-nums text-white">{pad(n, digits)}</span>)}
            </div>
            <p className="mt-3 text-base">Total: <b>{pesos(Number(r.total))}</b></p>
            <p className="text-sm text-muted">Reservado el {fecha(r.created_at)}</p>
            {live && (
              <>
                <p className="mt-3 rounded-xl bg-held/15 p-3 text-base">Te quedan <b><Countdown until={r.expires_at} onEnd={load} /></b> para pagar y mandar el comprobante.</p>
                <HowToPay total={Number(r.total)} isDemo={!!r.raffles?.is_demo} />
                <p className="mt-3 rounded-xl bg-canvas p-3 text-sm">Subir el comprobante desde la app llega en la próxima etapa.</p>
                <button onClick={() => cancel(r)} className="mt-3 w-full rounded-2xl border border-line py-3 font-semibold text-muted">Cancelar reserva</button>
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}
