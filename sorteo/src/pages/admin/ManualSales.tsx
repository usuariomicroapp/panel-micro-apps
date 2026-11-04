import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls } from '../../components/ui'
import NumberGrid, { GridLegend } from '../../components/NumberGrid'
import { loadNumberStates, type Raffle } from '../../lib/data'
import type { NumberState } from '../../lib/demo'
import { fecha, pad, pesos } from '../../lib/format'

interface Sale {
  id: string
  numbers: number[]
  total: number
  status: 'pending' | 'approved' | 'cancelled' | 'expired' | 'submitted' | 'rejected'
  buyer_name: string
  buyer_phone: string | null
  notes: string
  created_at: string
}

const statusText: Record<Sale['status'], string> = {
  pending: 'Falta cobrar', approved: 'Cobrado', cancelled: 'Anulada', expired: 'Vencida', submitted: 'Pendiente', rejected: 'Anulada',
}

// El organizador anota los números que vende en persona (gente sin celular, por ejemplo).
export default function ManualSales() {
  const [raffles, setRaffles] = useState<Raffle[] | null>(null)
  const [raffleId, setRaffleId] = useState('')
  const [states, setStates] = useState<Record<number, NumberState>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sales, setSales] = useState<Sale[]>([])
  const [paid, setPaid] = useState(true)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase!.from('raffles').select('*').eq('status', 'active').order('closes_at').then(({ data }) => {
      const list = (data ?? []) as Raffle[]
      setRaffles(list)
      if (list.length) setRaffleId(list[0].id)
    })
  }, [])

  const raffle = raffles?.find((r) => r.id === raffleId)

  const reload = useCallback(async () => {
    if (!raffleId) return
    const [st, { data }] = await Promise.all([
      loadNumberStates(raffleId),
      supabase!.from('reservations').select('*').eq('raffle_id', raffleId).eq('manual', true).order('created_at', { ascending: false }),
    ])
    setStates(st)
    setSales((data ?? []) as Sale[])
  }, [raffleId])

  useEffect(() => {
    setSelected(new Set())
    void reload()
  }, [reload])

  const explain = (m: string) =>
    /manual|buyer_|admin_manual_sale|function/i.test(m) && /does not exist|column|schema cache/i.test(m)
      ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).'
      : m

  const toggle = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    if (!selected.size) return setMsg({ kind: 'error', text: 'Tocá en la grilla los números que vendiste.' })
    setBusy(true); setMsg(null)
    const { error } = await supabase!.rpc('admin_manual_sale', {
      p_raffle: raffleId,
      p_numbers: [...selected],
      p_name: String(f.get('name')).trim(),
      p_phone: String(f.get('phone')).trim(),
      p_paid: paid,
      p_notes: String(f.get('notes')).trim(),
    })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: explain(error.message) })
    setMsg({ kind: 'ok', text: `Venta guardada: ${[...selected].sort((a, b) => a - b).map((n) => pad(n, raffle?.digits ?? 2)).join(', ')}.` })
    form.reset()
    setPaid(true)
    setSelected(new Set())
    void reload()
  }

  const markPaid = async (s: Sale) => {
    const { error } = await supabase!.rpc('admin_manual_mark_paid', { p_reservation: s.id })
    if (error) setMsg({ kind: 'error', text: explain(error.message) })
    void reload()
  }

  const cancel = async (s: Sale) => {
    const reason = window.prompt(`¿Por qué anulás la venta de ${s.buyer_name}? Los números vuelven a quedar libres.`)
    if (!reason?.trim()) return
    const { error } = await supabase!.rpc('admin_manual_cancel', { p_reservation: s.id, p_reason: reason })
    if (error) setMsg({ kind: 'error', text: explain(error.message) })
    void reload()
  }

  if (!raffles) return <Card title="Ventas en persona"><p className="text-muted">Cargando…</p></Card>
  if (!raffles.length) return <Card title="Ventas en persona"><p className="text-sm text-muted">No hay sorteos activos. Activá un sorteo para poder cargar ventas.</p></Card>

  const chosen = [...selected].sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      <Card title="Cargar una venta en persona">
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-medium">Sorteo
            <select value={raffleId} onChange={(e) => setRaffleId(e.target.value)} className={inputCls}>
              {raffles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_demo ? ' (prueba)' : ''}</option>)}
            </select>
          </label>

          {raffle && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">1. Tocá los números que vendiste</p>
                <GridLegend />
              </div>
              <NumberGrid total={raffle.total_numbers} digits={raffle.digits} states={states} selected={selected} onToggle={toggle} />
              <p className="mt-2 text-sm">
                {chosen.length ? <>Elegidos: <b>{chosen.map((n) => pad(n, raffle.digits)).join(', ')}</b> · Total <b>{pesos(chosen.length * Number(raffle.price_per_number))}</b></> : <span className="text-muted">Ningún número elegido.</span>}
              </p>
            </div>
          )}

          <p className="text-sm font-medium">2. Datos del comprador</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Nombre y apellido
              <input name="name" required maxLength={120} placeholder="Ej.: Rosa Pérez" className={inputCls} />
            </label>
            <label className="block text-sm">Teléfono de contacto
              <input name="phone" type="tel" maxLength={40} placeholder="Ej.: 11 4444-5555" className={inputCls} />
            </label>
          </div>

          <div>
            <p className="text-sm font-medium">3. ¿Ya te pagó?</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaid(true)} className={`rounded-2xl border-2 py-3 font-bold ${paid ? 'border-free bg-free/10 text-free' : 'border-line text-muted'}`}>Sí, ya pagó</button>
              <button type="button" onClick={() => setPaid(false)} className={`rounded-2xl border-2 py-3 font-bold ${!paid ? 'border-held bg-held/15 text-yellow-800' : 'border-line text-muted'}`}>Paga después</button>
            </div>
            {!paid && <p className="mt-2 text-xs text-muted">Los números quedan reservados a su nombre hasta el cierre del sorteo ({raffle && fecha(raffle.closes_at)}). Si no los marcás como cobrados antes, vuelven a quedar libres.</p>}
          </div>

          <label className="block text-sm">Nota (opcional)
            <input name="notes" maxLength={300} placeholder="Ej.: pagó en efectivo" className={inputCls} />
          </label>

          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button disabled={busy} className={`${primaryCls} w-full`}>{busy ? 'Guardando…' : 'Guardar venta'}</button>
        </form>
      </Card>

      <Card title="Ventas en persona de este sorteo">
        {sales.length === 0 ? <p className="text-sm text-muted">Todavía no cargaste ventas en este sorteo.</p> : (
          <ul className="divide-y divide-line">
            {sales.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold">{s.buyer_name}</p>
                  {s.buyer_phone && <a href={`tel:${s.buyer_phone.replace(/[^\d+]/g, '')}`} className="text-brand-600">{s.buyer_phone}</a>}
                  <p className="mt-1">Números <b>{s.numbers.map((n) => pad(n, raffle?.digits ?? 2)).join(', ')}</b> · {pesos(Number(s.total))}</p>
                  <p className="text-xs text-muted">{fecha(s.created_at)}{s.notes && <> · {s.notes}</>}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status === 'approved' ? 'bg-free/15 text-free' : s.status === 'pending' ? 'bg-held/20 text-yellow-800' : 'bg-canvas text-muted'}`}>{statusText[s.status]}</span>
                  <div className="flex gap-3 font-semibold">
                    {s.status === 'pending' && <button onClick={() => markPaid(s)} className="text-free">Marcar cobrado</button>}
                    {(s.status === 'pending' || s.status === 'approved') && <button onClick={() => cancel(s)} className="text-sold">Anular</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
