import type { NumberState } from '../lib/demo'
import { pad } from '../lib/format'

const styles: Record<NumberState, string> = {
  available: 'bg-free/10 text-free border-free/40 hover:bg-free/20',
  reserved: 'bg-held/15 text-yellow-800 border-held/50 cursor-not-allowed',
  paid: 'bg-sold/10 text-sold/70 border-sold/30 cursor-not-allowed line-through',
}

interface Props {
  total: number
  digits: number
  states: Record<number, NumberState>
  selected: Set<number>
  onToggle: (n: number) => void
}

export default function NumberGrid({ total, digits, states, selected, onToggle }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {Array.from({ length: total }, (_, n) => {
        const state = states[n] ?? 'available'
        const isSel = selected.has(n)
        const label = pad(n, digits)
        return (
          <button
            key={n}
            type="button"
            disabled={state !== 'available'}
            onClick={() => onToggle(n)}
            aria-pressed={isSel}
            aria-label={`Número ${label}: ${state === 'available' ? 'disponible' : state === 'reserved' ? 'reservado' : 'vendido'}`}
            className={`min-h-14 rounded-xl border-2 text-xl font-bold tabular-nums transition sm:aspect-square sm:min-h-0 sm:text-base ${
              isSel ? 'scale-105 border-brand-600 bg-brand-600 text-white shadow-md' : styles[state]
            }`}
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
    ['bg-free', 'Verde: libre'],
    ['bg-held', 'Amarillo: reservado'],
    ['bg-sold', 'Rojo: vendido'],
    ['bg-brand-600', 'Violeta: elegido por vos'],
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5"><span className={`h-4 w-4 rounded ${c}`} />{l}</span>
      ))}
    </div>
  )
}
