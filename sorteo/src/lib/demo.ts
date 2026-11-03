// DATOS DE EJEMPLO para la Etapa 2 (diseño y navegación).
// No vienen de ninguna base de datos. Se reemplazan por Supabase en la Etapa 3.

export type NumberState = 'available' | 'reserved' | 'paid'

export interface DemoRaffle {
  id: string
  name: string
  prize: string
  description: string
  pricePerNumber: number
  totalNumbers: number
  digits: number
  closesAt: string
  officialDraw: string
  rule: string
  art: 'phone' | 'bike' | 'tv'
  states: Record<number, NumberState>
}

const scatter = (seed: number, total: number, count: number, state: NumberState) => {
  const out: Record<number, NumberState> = {}
  let x = seed
  for (let i = 0; i < count; i++) {
    x = (x * 37 + 11) % total
    out[x] = state
  }
  return out
}

export const demoRaffles: DemoRaffle[] = [
  {
    id: 'ejemplo-celular',
    name: 'Celular de ejemplo',
    prize: 'Smartphone 128 GB',
    description: 'Premio ficticio para mostrar cómo se ve un sorteo publicado.',
    pricePerNumber: 5000,
    totalNumbers: 100,
    digits: 2,
    closesAt: '2026-11-28T21:00:00-03:00',
    officialDraw: 'Quiniela de la Ciudad · Nocturna',
    rule: 'Dos últimas cifras del primer premio',
    art: 'phone',
    states: { ...scatter(3, 100, 22, 'paid'), ...scatter(8, 100, 7, 'reserved') },
  },
  {
    id: 'ejemplo-bici',
    name: 'Bicicleta de ejemplo',
    prize: 'Bicicleta rodado 29',
    description: 'Premio ficticio. Muestra un sorteo con más números vendidos.',
    pricePerNumber: 3000,
    totalNumbers: 100,
    digits: 2,
    closesAt: '2026-12-05T21:00:00-03:00',
    officialDraw: 'Quiniela de la Ciudad · Nocturna',
    rule: 'Dos últimas cifras del primer premio',
    art: 'bike',
    states: { ...scatter(5, 100, 48, 'paid'), ...scatter(2, 100, 5, 'reserved') },
  },
  {
    id: 'ejemplo-tv',
    name: 'Smart TV de ejemplo',
    prize: 'Smart TV 50"',
    description: 'Premio ficticio. Recién abierto, casi todos los números libres.',
    pricePerNumber: 8000,
    totalNumbers: 100,
    digits: 2,
    closesAt: '2026-12-19T21:00:00-03:00',
    officialDraw: 'Quiniela de la Ciudad · Nocturna',
    rule: 'Dos últimas cifras del primer premio',
    art: 'tv',
    states: { ...scatter(7, 100, 4, 'paid') },
  },
]

export const findDemoRaffle = (id?: string) => demoRaffles.find((r) => r.id === id)

export const countStates = (r: DemoRaffle) => {
  const values = Object.values(r.states)
  const paid = values.filter((s) => s === 'paid').length
  const reserved = values.filter((s) => s === 'reserved').length
  return { paid, reserved, available: r.totalNumbers - paid - reserved }
}
