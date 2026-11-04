import { useEffect, useState } from 'react'
import type { DrawSlot } from './data'

export interface QuinielaLive {
  fecha: string
  turno: DrawSlot
  sorteo?: number
  estado: 'pendiente' | 'en_curso' | 'completo' | 'sin_conexion'
  numeros: (string | null)[]
  error?: string
}

const empty = (fecha: string, turno: DrawSlot): QuinielaLive => ({ fecha, turno, estado: 'pendiente', numeros: Array(20).fill(null) })

// Lee la Quiniela de la Ciudad cada 10 segundos (a través de /api/quiniela) hasta que salen los 20 números.
export function useQuiniela(fecha: string | null, turno: DrawSlot | null, enabled = true) {
  const [data, setData] = useState<QuinielaLive | null>(null)
  useEffect(() => {
    if (!fecha || !turno || !enabled) { setData(null); return }
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      let next: QuinielaLive
      try {
        const r = await fetch(`/api/quiniela?fecha=${fecha}&turno=${turno}`, { cache: 'no-store' })
        next = r.ok && (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : { ...empty(fecha, turno), estado: 'sin_conexion' }
      } catch {
        next = { ...empty(fecha, turno), estado: 'sin_conexion' }
      }
      if (stop) return
      setData(next)
      if (next.estado !== 'completo') timer = setTimeout(tick, 10_000)
    }
    setData(empty(fecha, turno))
    tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [fecha, turno, enabled])
  return data
}
