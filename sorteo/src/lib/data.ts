import { supabase } from './supabase'
import type { NumberState } from './demo'

export type DrawSlot = 'previa' | 'primera' | 'matutina' | 'vespertina' | 'nocturna'
export type RaffleStatus = 'draft' | 'active' | 'closed' | 'drawn' | 'cancelled'
export type UnsoldPolicy = 'desierto' | 'siguiente_sorteo' | 'segundo_premio'

export const slotLabels: Record<DrawSlot, string> = {
  previa: 'Previa · 10:15', primera: 'Primera · 12:00', matutina: 'Matutina · 15:00', vespertina: 'Vespertina · 18:00', nocturna: 'Nocturna · 21:00',
}
export const statusLabels: Record<RaffleStatus, string> = {
  draft: 'Borrador', active: 'Activo', closed: 'Cerrado', drawn: 'Sorteado', cancelled: 'Cancelado',
}
export const unsoldLabels: Record<UnsoldPolicy, string> = {
  desierto: 'Queda desierto',
  siguiente_sorteo: 'Se usa el siguiente sorteo oficial',
  segundo_premio: 'Se usa el 2.º premio',
}

export interface Product {
  id: string
  name: string
  description: string
  reference_price: number | null
  acquisition_cost?: number | null
  prize_info: string
  show_in_store?: boolean
  organizer_id?: string | null
  created_at: string
}

export interface ProductPhoto { id: string; product_id: string; path: string; position: number; caption?: string }
export interface PhotoView { url: string; caption: string }

export interface Raffle {
  id: string
  name: string
  product_id: string
  description: string
  price_per_number: number
  total_numbers: number
  digits: number
  starts_at: string
  closes_at: string
  official_draw_date: string | null
  official_draw_slot: DrawSlot | null
  unsold_policy: UnsoldPolicy | null
  no_winner_notes: string
  reservation_minutes: number
  max_numbers_per_reservation: number
  is_demo: boolean
  status: RaffleStatus
  raffle_no?: number | null
  needs_new_draw?: boolean
}

// "Sorteo N° 3 · Bicicleta" para distinguir sorteos cuando hay varios.
export const raffleLabel = (r: Pick<Raffle, 'name'> & { raffle_no?: number | null }) =>
  r.raffle_no ? `Sorteo N° ${r.raffle_no} · ${r.name}` : r.name

export const slotTimes: Record<DrawSlot, string> = { previa: '10:15', primera: '12:00', matutina: '15:00', vespertina: '18:00', nocturna: '21:00' }
// Momento exacto del turno de la Quiniela (hora de Argentina, UTC−3).
export const drawMoment = (date: string, slot: DrawSlot) => new Date(`${date}T${slotTimes[slot]}:00-03:00`)
export const dateAR = (d = new Date()) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
// Mientras no se carga el día del sorteo, la hora de cierre queda muy lejos (se elige sin apuro).
export const NO_DRAW_YET = '2100-01-01T00:00:00Z'
export const hasDeadline = (iso: string) => new Date(iso).getTime() < new Date(NO_DRAW_YET).getTime()
export const dmy = (date: string) => date.split('-').reverse().join('/')

export const photoUrl = (path: string) => supabase!.storage.from('product-photos').getPublicUrl(path).data.publicUrl

export async function loadPhotos(productIds: string[]) {
  if (!productIds.length) return {} as Record<string, PhotoView[]>
  const { data } = await supabase!.from('product_photos').select('*').in('product_id', productIds).order('position')
  const out: Record<string, PhotoView[]> = {}
  for (const p of (data ?? []) as ProductPhoto[]) (out[p.product_id] ??= []).push({ url: photoUrl(p.path), caption: p.caption ?? '' })
  return out
}

export async function loadNumberStates(raffleId: string) {
  const { data } = await supabase!.from('public_raffle_numbers').select('number, state').eq('raffle_id', raffleId).range(0, 9999)
  const states: Record<number, NumberState> = {}
  for (const r of (data ?? []) as { number: number; state: NumberState }[]) if (r.state !== 'available') states[r.number] = r.state
  return states
}

// Fechas: el formulario trabaja en hora de Argentina (UTC−3, sin horario de verano).
export const toInputDateTime = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return d.toISOString().slice(0, 16)
}
export const fromInputDateTime = (v: string) => new Date(v + ':00-03:00').toISOString()

export const digitsFor = (total: number) => Math.max(2, String(total - 1).length)

// Reduce las fotos antes de subirlas para cuidar el 1 GB gratuito de Storage.
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality))
}
