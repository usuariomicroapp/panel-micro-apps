import { Link } from 'react-router-dom'
import PrizeArt from '../components/PrizeArt'
import { countStates, demoRaffles } from '../lib/demo'
import { fecha, pesos } from '../lib/format'

export default function Home() {
  return (
    <div>
      <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-900 to-brand-600 p-6 text-white md:p-10">
        <p className="text-sm font-semibold text-gold">Sorteos activos</p>
        <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">Elegí tu número de la suerte</h1>
        <p className="mt-2 max-w-lg text-brand-100">Cada sorteo usa las dos últimas cifras del primer premio de la Quiniela de la Ciudad.</p>
        <Link to="/bienvenida" className="mt-4 inline-block text-sm font-semibold text-white underline underline-offset-4">Ver pantalla de bienvenida</Link>
      </section>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {demoRaffles.map((r) => {
          const c = countStates(r)
          const pct = Math.round((c.paid / r.totalNumbers) * 100)
          return (
            <Link key={r.id} to={`/sorteo/${r.id}`} className="group overflow-hidden rounded-3xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <PrizeArt kind={r.art} className="aspect-[16/10] w-full" />
              <div className="p-5">
                <h2 className="text-lg font-bold">{r.name}</h2>
                <p className="text-sm text-muted">{r.prize}</p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted">Por número</p>
                    <p className="text-2xl font-extrabold text-brand-700">{pesos(r.pricePerNumber)}</p>
                  </div>
                  <p className="text-right text-xs text-muted">Cierra<br /><span className="font-semibold text-ink">{fecha(r.closesAt)}</span></p>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-sold" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted">{c.paid} vendidos · {c.available} disponibles</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
