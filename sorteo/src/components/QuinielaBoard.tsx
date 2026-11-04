import type { QuinielaLive } from '../lib/quiniela'
import { slotLabels, slotTimes } from '../lib/data'

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
    <div className="rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{title ?? `Quiniela de la Ciudad · ${slotLabels[live.turno]}`}</h3>
        {live.estado !== 'completo' && (
          <span className="flex items-center gap-2 rounded-full bg-sold/10 px-3 py-1 text-sm font-bold text-sold">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sold" aria-hidden="true" /> En vivo
          </span>
        )}
      </div>
      <p className="mt-1 text-base text-muted" role="status">{status}{live.estado !== 'completo' && ' Se actualiza sola cada 10 segundos.'}</p>
      <div className="mt-4 rounded-2xl bg-brand-50 p-4 text-center">
        <p className="text-sm font-semibold text-brand-700">1.er premio (cabeza)</p>
        <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-wider">
          {first ? (
            <>
              <span className="text-muted">{first.slice(0, 4 - digits)}</span>
              <span className="text-brand-700">{first.slice(4 - digits)}</span>
            </>
          ) : '– – – –'}
        </p>
        {first && <p className="mt-1 text-base">Número ganador: <b className="text-xl">{first.slice(4 - digits)}</b></p>}
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-base sm:grid-cols-4">
        {live.numeros.map((n, i) => (
          <li key={i} className="flex justify-between border-b border-line py-1 tabular-nums">
            <span className="text-muted">{i + 1}.º</span>
            <span className={`font-bold ${n ? '' : 'text-line'}`}>{n ?? '····'}</span>
          </li>
        ))}
      </ol>
      <a href="https://quiniela.loteriadelaciudad.gob.ar/" target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-brand-600">Fuente oficial: Lotería de la Ciudad ↗</a>
    </div>
  )
}
