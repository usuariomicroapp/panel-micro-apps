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
    <div className="grid grid-cols-10 gap-1.5 sm:gap-2">
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
            className={`aspect-square rounded-lg border text-sm font-bold tabular-nums transition sm:text-base ${
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
    ['bg-free', 'Disponible'],
    ['bg-held', 'Reservado'],
    ['bg-sold', 'Pagado'],
    ['bg-brand-600', 'Tu selección'],
  ]
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${c}`} />{l}</span>
      ))}
    </div>
  )
}
