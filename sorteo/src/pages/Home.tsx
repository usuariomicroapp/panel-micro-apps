import { Link } from 'react-router-dom'
import RaffleImage from '../components/RaffleImage'
import { InstallCard } from '../components/AppSetup'
import { useAuth } from '../lib/auth'
import { fecha } from '../lib/format'
import { countView, usePublicRaffles } from '../lib/publicRaffles'

export default function Home() {
  const { loading, error, data } = usePublicRaffles()
  const { isAdmin } = useAuth()
  return (
    <div>
      <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-900 to-brand-600 p-6 text-white md:p-10">
        <p className="text-sm font-semibold text-gold">Sorteos activos</p>
        <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">Elegí tu número de la suerte</h1>
        <p className="mt-2 max-w-lg text-brand-100">Cada sorteo usa las dos últimas cifras del primer premio de la Quiniela de la Ciudad.</p>
      </section>

      <div className="mb-6"><InstallCard compact /></div>
      {loading && <p className="py-16 text-center text-muted">Cargando sorteos…</p>}
      {error && <p className="rounded-2xl bg-red-50 p-4 text-center text-sm text-red-700">{error}</p>}
      {!loading && !error && data.length === 0 && (
        <div className="rounded-3xl border border-dashed border-line bg-surface p-10 text-center">
          <h2 className="text-lg font-bold">Todavía no hay sorteos publicados</h2>
          <p className="mt-1 text-sm text-muted">Cuando se publique uno, lo vas a ver acá.</p>
          {isAdmin && (
            <Link to="/admin?tab=sorteos" className="mt-5 inline-block rounded-2xl bg-brand-600 px-5 py-3 font-bold text-white">Crear un sorteo</Link>
          )}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((r) => {
          const c = countView(r)
          const pct = Math.round(((c.paid + c.reserved) / r.totalNumbers) * 100)
          return (
            <Link key={r.id} to={`/sorteo/${r.id}`} className="group overflow-hidden rounded-3xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative">
                <RaffleImage raffle={r} className="aspect-[16/10] w-full" />
                <div className="absolute left-3 top-3 flex gap-1.5">
                  {r.isDemo && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">Prueba</span>}
                  {r.status !== 'active' && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{r.statusLabel}</span>}
                </div>
              </div>
              <div className="p-5">
                {r.raffleNo && <p className="text-sm font-bold text-brand-600">Sorteo N° {r.raffleNo}</p>}
                <h2 className="text-lg font-bold">{r.name}</h2>
                <p className="text-sm text-muted">{r.prize}</p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted">Números libres</p>
                    <p className="text-2xl font-extrabold text-free">{c.available}</p>
                  </div>
                  <p className="text-right text-xs text-muted">Cierra<br /><span className="font-semibold text-ink">{fecha(r.closesAt)}</span></p>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-sold" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-sm text-muted">{c.paid + c.reserved} elegidos · {c.available} libres</p>
                <span className="mt-4 block rounded-2xl bg-brand-600 py-3.5 text-center text-lg font-bold text-white group-hover:bg-brand-700">{r.status === 'active' ? 'Elegir mi número' : 'Ver sorteo'}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
