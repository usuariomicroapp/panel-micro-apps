import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls } from '../../components/ui'
import NumberGrid, { GridLegend } from '../../components/NumberGrid'
import { loadNumberStates, type Raffle } from '../../lib/data'
import type { NumberState } from '../../lib/demo'
import { fecha, pad } from '../../lib/format'

interface Entry {
  id: string
  numbers: number[]
  status: string
  manual: boolean
  buyer_name: string | null
  buyer_phone: string | null
  notes: string
  created_at: string
}

const phoneHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`
const waHref = (p: string) => {
  const d = p.replace(/\D/g, '')
  return `https://wa.me/${d.startsWith('54') ? d : `54${d}`}`
}

// Quién tiene cada número, y anotar a quienes eligen en persona (gente sin celular).
export default function Participants() {
  const [raffles, setRaffles] = useState<Raffle[] | null>(null)
  const [raffleId, setRaffleId] = useState('')
  const [states, setStates] = useState<Record<number, NumberState>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [entries, setEntries] = useState<Entry[]>([])
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase!.from('raffles').select('*').in('status', ['active', 'closed', 'drawn']).order('closes_at').then(({ data }) => {
      const list = (data ?? []) as Raffle[]
      setRaffles(list)
      if (list.length) setRaffleId(list[0].id)
    })
  }, [])

  const raffle = raffles?.find((r) => r.id === raffleId)
  const digits = raffle?.digits ?? 2

  const reload = useCallback(async () => {
    if (!raffleId) return
    const [st, { data }] = await Promise.all([
      loadNumberStates(raffleId),
      supabase!.from('reservations').select('id, numbers, status, manual, buyer_name, buyer_phone, notes, created_at')
        .eq('raffle_id', raffleId).eq('status', 'approved').order('created_at', { ascending: false }),
    ])
    setStates(st)
    setEntries((data ?? []) as Entry[])
  }, [raffleId])

  useEffect(() => {
    setSelected(new Set())
    void reload()
  }, [reload])

  const explain = (m: string) =>
    /admin_manual_entry|admin_release_entry|claim_numbers/.test(m) && /does not exist|schema cache|function/i.test(m)
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
    if (!selected.size) return setMsg({ kind: 'error', text: 'Tocá en la grilla los números que eligió la persona.' })
    setBusy(true); setMsg(null)
    const { error } = await supabase!.rpc('admin_manual_entry', {
      p_raffle: raffleId,
      p_numbers: [...selected],
      p_name: String(f.get('name')).trim(),
      p_phone: String(f.get('phone')).trim(),
      p_notes: String(f.get('notes')).trim(),
    })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: explain(error.message) })
    setMsg({ kind: 'ok', text: `Anotado: ${[...selected].sort((a, b) => a - b).map((n) => pad(n, digits)).join(', ')}.` })
    form.reset()
    setSelected(new Set())
    void reload()
  }

  const release = async (en: Entry) => {
    const reason = window.prompt(`¿Por qué liberás los números de ${en.buyer_name ?? 'esta persona'}? Vuelven a quedar libres.`)
    if (!reason?.trim()) return
    const { error } = await supabase!.rpc('admin_release_entry', { p_reservation: en.id, p_reason: reason })
    if (error) setMsg({ kind: 'error', text: explain(error.message) })
    void reload()
  }

  if (!raffles) return <Card title="Participantes"><p className="text-muted">Cargando…</p></Card>
  if (!raffles.length) return <Card title="Participantes"><p className="text-sm text-muted">Todavía no hay sorteos activos.</p></Card>

  const chosen = [...selected].sort((a, b) => a - b)
  const open = raffle?.status === 'active'
  const filter = q.trim()
  const shown = entries.filter((en) => !filter || `${en.buyer_name} ${en.buyer_phone} ${en.numbers.map((n) => pad(n, digits)).join(' ')}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="space-y-6">
      <label className="block text-sm font-medium">Sorteo
        <select value={raffleId} onChange={(e) => setRaffleId(e.target.value)} className={inputCls}>
          {raffles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_demo ? ' (prueba)' : ''}</option>)}
        </select>
      </label>

      <Card title={`Quién tiene cada número (${entries.reduce((a, en) => a + en.numbers.length, 0)} elegidos)`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o número" className={inputCls} />
        {shown.length === 0 ? <p className="mt-3 text-sm text-muted">{entries.length ? 'No hay coincidencias.' : 'Todavía nadie eligió números en este sorteo.'}</p> : (
          <ul className="mt-3 divide-y divide-line">
            {shown.map((en) => (
              <li key={en.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    {en.numbers.map((n) => <span key={n} className="rounded-lg bg-brand-600 px-2 py-0.5 font-bold tabular-nums text-white">{pad(n, digits)}</span>)}
                  </div>
                  <p className="mt-1.5 font-semibold">{en.buyer_name ?? 'Sin nombre'}</p>
                  {en.buyer_phone && (
                    <p className="flex gap-3">
                      <a href={phoneHref(en.buyer_phone)} className="text-brand-600">{en.buyer_phone}</a>
                      <a href={waHref(en.buyer_phone)} target="_blank" rel="noreferrer" className="font-semibold text-free">WhatsApp</a>
                    </p>
                  )}
                  <p className="text-xs text-muted">{en.manual ? 'Anotado en persona' : 'Desde la app'} · {fecha(en.created_at)}{en.notes && <> · {en.notes}</>}</p>
                </div>
                {raffle?.status !== 'drawn' && <button onClick={() => release(en)} className="font-semibold text-sold">Liberar</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && raffle && (
        <Card title="Anotar a alguien en persona">
          <form onSubmit={save} className="space-y-4">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">1. Tocá los números que eligió</p>
                <GridLegend />
              </div>
              <NumberGrid total={raffle.total_numbers} digits={raffle.digits} states={states} selected={selected} onToggle={toggle} />
              <p className="mt-2 text-sm">{chosen.length ? <>Elegidos: <b>{chosen.map((n) => pad(n, raffle.digits)).join(', ')}</b></> : <span className="text-muted">Ningún número elegido.</span>}</p>
            </div>
            <p className="text-sm font-medium">2. Datos de la persona</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">Nombre y apellido
                <input name="name" required maxLength={120} placeholder="Ej.: Rosa Pérez" className={inputCls} />
              </label>
              <label className="block text-sm">Teléfono de contacto
                <input name="phone" type="tel" maxLength={40} placeholder="Ej.: 11 4444-5555" className={inputCls} />
              </label>
            </div>
            <label className="block text-sm">Nota (opcional)
              <input name="notes" maxLength={300} placeholder="Ej.: vino al local" className={inputCls} />
            </label>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <button disabled={busy} className={`${primaryCls} w-full`}>{busy ? 'Guardando…' : 'Anotar'}</button>
          </form>
        </Card>
      )}
    </div>
  )
}
