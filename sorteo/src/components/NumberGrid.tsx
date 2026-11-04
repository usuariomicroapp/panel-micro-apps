import type { NumberState } from '../lib/demo'
import { pad } from '../lib/format'

interface Props {
  total: number
  digits: number
  states: Record<number, NumberState>
  selected: Set<number>
  onToggle: (n: number) => void
  mine?: Set<number>
}

// Grilla de números con tres colores fuertes: verde libre, azul mi número, rojo ocupado.
export default function NumberGrid({ total, digits, states, selected, onToggle, mine }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-10 sm:gap-2">
      {Array.from({ length: total }, (_, n) => {
        const state = states[n] ?? 'available'
        const isSel = selected.has(n)
        const isMine = mine?.has(n) ?? false
        const label = pad(n, digits)
        const cls = isSel ? 'tile-sel' : isMine ? 'tile-mine' : state === 'available' ? 'tile-free' : 'tile-taken'
        return (
          <button
            key={n}
            type="button"
            disabled={!isSel && state !== 'available'}
            onClick={() => onToggle(n)}
            aria-pressed={isSel}
            aria-label={`Número ${label}: ${isSel || isMine ? 'mi número' : state === 'available' ? 'libre' : 'ocupado'}`}
            className={`tile ${cls} min-h-14 rounded-xl text-xl font-extrabold tabular-nums disabled:cursor-not-allowed sm:aspect-square sm:min-h-0 sm:text-base`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function GridLegend() {
  const items = [
    ['tile tile-free', 'text-free', 'Libre'],
    ['tile tile-mine', 'text-mine', 'Mi número'],
    ['tile tile-taken', 'text-sold', 'Ocupados'],
  ]
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map(([c, t, l]) => (
        <span key={l} className={`inline-flex items-center gap-2 text-base font-extrabold uppercase tracking-wide ${t}`}>
          <span className={`h-5 w-5 rounded-md ${c}`} />{l}
        </span>
      ))}
    </div>
  )
}
