import { useEffect, useState } from 'react'
import { supabase, isConfigured } from './supabase'
import { demoRaffles, type DemoRaffle, type NumberState } from './demo'
import { loadNumberStates, loadPhotos, type PhotoView, slotLabels, statusLabels, unsoldLabels, type Raffle, type RaffleStatus, type DrawSlot } from './data'

// Forma común para mostrar un sorteo, venga de la base o de los ejemplos.
export interface RaffleView {
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
  unsold: string
  art?: DemoRaffle['art']
  photos: PhotoView[]
  states: Record<number, NumberState>
  isDemo: boolean
  status: RaffleStatus
  statusLabel: string
  maxPerPerson: number
  raffleNo?: number | null
  drawDate?: string | null
  drawSlot?: DrawSlot | null
}

const fromDemo = (r: DemoRaffle): RaffleView => ({
  ...r, unsold: '', photos: [], isDemo: true, status: 'active', statusLabel: 'Ejemplo', maxPerPerson: 1,
})

type Row = Raffle & { products: { name: string; prize_info: string } | null }

const officialDraw = (r: Raffle) => {
  if (!r.official_draw_date || !r.official_draw_slot) return 'A definir'
  const [y, m, d] = r.official_draw_date.split('-')
  return `Quiniela de la Ciudad · ${slotLabels[r.official_draw_slot]} del ${d}/${m}/${y}`
}

const toView = (r: Row, photos: PhotoView[], states: Record<number, NumberState>): RaffleView => ({
  id: r.id,
  name: r.name,
  prize: r.products?.prize_info || r.products?.name || '',
  description: r.description,
  pricePerNumber: Number(r.price_per_number),
  totalNumbers: r.total_numbers,
  digits: r.digits,
  closesAt: r.closes_at,
  officialDraw: officialDraw(r),
  rule: r.digits === 2 ? 'Dos últimas cifras del primer premio' : `Últimas ${r.digits} cifras del primer premio`,
  unsold: r.unsold_policy ? unsoldLabels[r.unsold_policy] : '',
  photos,
  states,
  isDemo: r.is_demo,
  status: r.status,
  statusLabel: statusLabels[r.status],
  maxPerPerson: r.max_numbers_per_reservation,
  raffleNo: r.raffle_no,
  drawDate: r.official_draw_date,
  drawSlot: r.official_draw_slot,
})

const select = '*, products(name, prize_info)'

export const countView = (r: RaffleView) => {
  const values = Object.values(r.states)
  const paid = values.filter((s) => s === 'paid').length
  const reserved = values.filter((s) => s === 'reserved').length
  return { paid, reserved, available: r.totalNumbers - paid - reserved }
}

type Load<T> = { loading: boolean; error: string; data: T }

// Lista pública: sorteos activos y cerrados (los borradores no se ven por las reglas de la base).
export function usePublicRaffles(): Load<RaffleView[]> {
  const [state, setState] = useState<Load<RaffleView[]>>({ loading: isConfigured, error: '', data: isConfigured ? [] : demoRaffles.map(fromDemo) })
  useEffect(() => {
    if (!supabase) return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('raffles').select(select).in('status', ['active', 'closed']).order('closes_at')
      if (error) {
        if (alive) setState({ loading: false, error: 'No se pudieron cargar los sorteos. Probá de nuevo en un rato.', data: [] })
        return
      }
      const rows = (data ?? []) as Row[]
      const photos = await loadPhotos([...new Set(rows.map((r) => r.product_id))])
      const states = await Promise.all(rows.map((r) => loadNumberStates(r.id)))
      if (alive) setState({ loading: false, error: '', data: rows.map((r, i) => toView(r, photos[r.product_id] ?? [], states[i])) })
    })()
    return () => {
      alive = false
    }
  }, [])
  return state
}

export function usePublicRaffle(id?: string): Load<RaffleView | null> & { reload: () => void } {
  const demo = demoRaffles.find((r) => r.id === id)
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<Load<RaffleView | null>>({ loading: isConfigured && !demo, error: '', data: demo ? fromDemo(demo) : null })
  useEffect(() => {
    if (!supabase || !id || demo) return
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      setState({ loading: false, error: '', data: null })
      return
    }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('raffles').select(select).eq('id', id).maybeSingle()
      if (error || !data) {
        if (alive) setState({ loading: false, error: error ? 'No se pudo cargar el sorteo.' : '', data: null })
        return
      }
      const row = data as Row
      const [photos, states] = await Promise.all([loadPhotos([row.product_id]), loadNumberStates(row.id)])
      if (alive) setState({ loading: false, error: '', data: toView(row, photos[row.product_id] ?? [], states) })
    })()
    return () => {
      alive = false
    }
  }, [id, tick, demo])
  return { ...state, reload: () => setTick((t) => t + 1) }
}
