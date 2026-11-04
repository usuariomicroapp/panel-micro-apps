import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { myId } from '../../lib/mine'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls } from '../../components/ui'
import NumberGrid, { GridLegend } from '../../components/NumberGrid'
import { loadNumberStates, raffleLabel, type Raffle } from '../../lib/data'
import type { NumberState } from '../../lib/demo'
import { fecha, pad, waLink } from '../../lib/format'
import { sendPendingPush } from '../../lib/pwa'
import { downloadFile, toCsv } from '../../lib/download'

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
const waHref = (p: string) => waLink(p)

// Quién tiene cada número, y anotar a quienes eligen en persona (gente sin celular).
export default function Participants() {
  const [raffles, setRaffles] = useState<Raffle[] | null>(null)
  const [raffleId, setRaffleId] = useState('')
  const [states, setStates] = useState<Record<number, NumberState>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [entries, setEntries] = useState<Entry[]>([])
  const [q, setQ] = useState('')
  const [openKey, setOpenKey] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void myId().then((me) => supabase!.from('raffles').select('*').eq('organizer_id', me).in('status', ['active', 'closed', 'drawn']).order('closes_at')).then(({ data }) => {
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
    else void sendPendingPush()
    void reload()
  }

  if (!raffles) return <Card title="Participantes"><p className="text-muted">Cargando…</p></Card>
  if (!raffles.length) return <Card title="Participantes"><p className="text-sm text-muted">Todavía no hay sorteos activos.</p></Card>

  const chosen = [...selected].sort((a, b) => a - b)
  const open = raffle?.status === 'active'
  const filter = q.trim()
  const exportCsv = () => {
    const rows: (string | number)[][] = [['Número', 'Nombre', 'Teléfono', 'Origen', 'Fecha', 'Notas']]
    for (const en of entries) for (const n of en.numbers) rows.push([pad(n, digits), en.buyer_name ?? '', en.buyer_phone ?? '', en.manual ? 'En persona' : 'App', fecha(en.created_at), en.notes ?? ''])
    rows.sort((a, b) => (a[0] === 'Número' ? -1 : b[0] === 'Número' ? 1 : String(a[0]).localeCompare(String(b[0]))))
    downloadFile(`participantes-${(raffle?.name ?? 'sorteo').replace(/[^\w-]+/g, '-')}.csv`, toCsv(rows), 'text/csv;charset=utf-8')
  }
  // Una fila por persona: mismo nombre y teléfono (o la misma cuenta) juntan sus números.
  const groups = new Map<string, { key: string; name: string; phone: string; entries: Entry[] }>()
  for (const en of entries) {
    const name = en.buyer_name?.trim() || 'Sin nombre'
    const phone = en.buyer_phone?.trim() || ''
    const key = `${name.toLowerCase()}|${phone.replace(/\D/g, '')}`
    const g = groups.get(key) ?? { key, name, phone, entries: [] }
    g.entries.push(en); groups.set(key, g)
  }
  const people = [...groups.values()].sort((x, y) => x.name.localeCompare(y.name, 'es'))
  const takenCount = Object.values(states).filter((st) => st !== 'available').length
  const freeCount = Math.max(0, (raffle?.total_numbers ?? 0) - takenCount)
  const shown = people.filter((p) => !filter || `${p.name} ${p.phone} ${p.entries.flatMap((en) => en.numbers).map((n) => pad(n, digits)).join(' ')}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="space-y-6">
      <label className="block text-sm font-medium">Sorteo
        <select value={raffleId} onChange={(e) => setRaffleId(e.target.value)} className={inputCls}>
          {raffles.map((r) => <option key={r.id} value={r.id}>{raffleLabel(r)}{r.is_demo ? ' (prueba)' : ''}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-3 gap-2">
        <Count label="Elegidos" value={takenCount} cls="text-mine" />
        <Count label="Libres" value={freeCount} cls="text-free" />
        <Count label="Personas" value={people.length} cls="text-gold-dark" />
      </div>

      <Card title="Participantes">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o número" className={inputCls} />
        {shown.length === 0 ? <p className="mt-3 text-sm text-muted">{entries.length ? 'No hay coincidencias.' : 'Todavía nadie eligió números en este sorteo.'}</p> : (
          <ul className="mt-3 space-y-2">
            {shown.map((p) => {
              const isOpen = openKey === p.key || !!filter
              const nums = p.entries.flatMap((en) => en.numbers).sort((x, y) => x - y)
              return (
                <li key={p.key} className="rounded-2xl border border-line">
                  <button type="button" onClick={() => setOpenKey(isOpen && !filter ? '' : p.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-3 text-left">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mine font-bold text-white">{nums.length}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{p.name}</span>
                      <span className="block truncate text-sm text-muted">{p.phone || 'Sin teléfono'} · {nums.length === 1 ? '1 número' : `${nums.length} números`}</span>
                    </span>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-5 w-5 shrink-0 text-gold-dark transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-line p-3 text-sm">
                      <div className="flex flex-wrap gap-1.5">
                        {nums.map((n) => <span key={n} className="rounded-lg bg-mine px-2.5 py-1 font-bold tabular-nums text-white">{pad(n, digits)}</span>)}
                      </div>
                      {p.phone && (
                        <div className="grid grid-cols-2 gap-2">
                          <a href={phoneHref(p.phone)} className="card rounded-xl py-2.5 text-center font-bold">Llamar</a>
                          <a href={waHref(p.phone)} target="_blank" rel="noreferrer" className="btn-green rounded-xl py-2.5 text-center font-bold">WhatsApp</a>
                        </div>
                      )}
                      {p.entries.map((en) => (
                        <div key={en.id} className="flex items-start justify-between gap-3 text-xs text-muted">
                          <span>{en.numbers.map((n) => pad(n, digits)).join(', ')} · {en.manual ? 'Anotado en persona' : 'Desde la app'} · {fecha(en.created_at)}{en.notes && <> · {en.notes}</>}</span>
                          {raffle?.status !== 'drawn' && <button onClick={() => release(en)} className="shrink-0 font-semibold text-sold">Liberar</button>}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {entries.length > 0 && (
          <button onClick={exportCsv} className="mt-4 rounded-xl border border-line px-4 py-2 text-sm font-semibold">Descargar lista (Excel)</button>
        )}
      </Card>

      {open && raffle && (
        <Card title="Anotar a alguien en persona" collapsible hint="Para quien elige su número sin celular">
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

function Count({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="card rounded-2xl p-3 text-center">
      <p className={`font-display text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
      <p className="label text-muted">{label}</p>
    </div>
  )
}
