import type { QuinielaLive } from '../lib/quiniela'
import { slotLabels, slotTimes } from '../lib/data'
import Balls from './Balls'
import Icon from './Icon'

type Props = { live: QuinielaLive | null; digits?: number; title?: string }

// Los 20 números de la Quiniela de la Ciudad a medida que salen. El 1.er premio va grande.
export default function QuinielaBoard({ live, digits = 2, title }: Props) {
  if (!live) return null
  const first = live.numeros[0]
  const status = {
    pendiente: `Todavía no salieron los números. La ${slotLabels[live.turno].split(' ·')[0]} empieza a las ${slotTimes[live.turno]}.`,
    en_curso: 'Están saliendo los números.',
    completo: 'Salieron los 20 números.',
    sin_conexion: 'No pudimos leer la página oficial. Probamos de nuevo en 10 segundos.',
  }[live.estado]
  return (
    <div className="card rounded-3xl p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold">{title ?? `Quiniela de la Ciudad · ${slotLabels[live.turno]}`}</h3>
        {live.estado !== 'completo' && (
          <span className="label flex items-center gap-2 rounded-full border border-sold/40 bg-sold/15 px-3 py-1.5 text-[#ff8f94]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff5a5f] shadow-[0_0_8px_#ff5a5f]" aria-hidden="true" /> En vivo
          </span>
        )}
      </div>
      <p className="mt-1 text-base text-muted" role="status">{status}{live.estado !== 'completo' && ' Se actualiza sola cada 10 segundos.'}</p>
      <div className="mt-5 text-center">
        <p className="label text-gold-dark">1.er premio (cabeza)</p>
        <div className="mt-3">
          {first ? <Balls value={first} gold={digits} size="lg" /> : <Balls value="····" size="lg" />}
        </div>
        {first && <p className="mt-4 text-base text-muted">Número ganador <b className="gold-text ml-1 font-display text-4xl font-bold">{first.slice(4 - digits)}</b></p>}
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-base sm:grid-cols-4">
        {live.numeros.map((n, i) => (
          <li key={i} className={`flex justify-between rounded-lg border-b border-line px-2 py-1.5 tabular-nums ${i === 0 && n ? 'border-transparent bg-gold/15' : ''}`}>
            <span className="text-muted">{i + 1}.º</span>
            <span className={`font-extrabold tracking-wider ${n ? (i === 0 ? 'text-gold-dark' : '') : 'text-line'}`}>{n ?? '····'}</span>
          </li>
        ))}
      </ol>
      <a href="https://quiniela.loteriadelaciudad.gob.ar/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted"><Icon name="shield" className="h-4 w-4" />Fuente oficial: Lotería de la Ciudad ↗</a>
    </div>
  )
}
