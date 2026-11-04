import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls } from '../../components/ui'
import { pesos } from '../../lib/format'
import type { Profile } from '../../lib/auth'

interface Sale { id: string; client_id: string | null; client_name: string; concept: string; amount: number; sale_date: string; status: 'pagado' | 'pendiente'; note: string }

const missing = (m: string) => (/owner_sales/.test(m) ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).' : m)
const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const month = (d: string) => d.slice(0, 7)
const monthName = (ym: string) => cap(new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T12:00:00Z`)))
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const dmy = (d: string) => d.split('-').reverse().join('/')
const who = (p: Profile) => `${p.first_name} ${p.last_name}`.trim() || p.email

// Clientes y ventas del dueño: cuántos organizadores tiene y lo que le pagó cada uno.
export default function OwnerSales() {
  const [clients, setClients] = useState<Profile[] | null>(null)
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [err, setErr] = useState('')

  const loadSales = () => supabase!.from('owner_sales').select('*').order('sale_date', { ascending: false }).order('created_at', { ascending: false })
    .then(({ data, error }) => { if (error) setErr(missing(error.message)); setSales((data ?? []) as Sale[]) })
  useEffect(() => {
    supabase!.from('profiles').select('*').eq('role', 'admin').eq('is_owner', false).order('created_at', { ascending: false })
      .then(({ data }) => setClients((data ?? []) as Profile[]))
    void loadSales()
  }, [])

  const now = month(today())
  const t = useMemo(() => {
    const s = sales ?? []
    return {
      monthPaid: s.filter((x) => x.status === 'pagado' && month(x.sale_date) === now).reduce((a, x) => a + Number(x.amount), 0),
      pending: s.filter((x) => x.status === 'pendiente').reduce((a, x) => a + Number(x.amount), 0),
      total: s.filter((x) => x.status === 'pagado').reduce((a, x) => a + Number(x.amount), 0),
      newClients: (clients ?? []).filter((c) => month(c.created_at) === now).length,
    }
  }, [sales, clients, now])

  const byMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of sales ?? []) if (x.status === 'pagado') m.set(month(x.sale_date), (m.get(month(x.sale_date)) ?? 0) + Number(x.amount))
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)
  }, [sales])

  const paidBy = (id: string) => (sales ?? []).filter((x) => x.client_id === id && x.status === 'pagado').reduce((a, x) => a + Number(x.amount), 0)
  const owesBy = (id: string) => (sales ?? []).filter((x) => x.client_id === id && x.status === 'pendiente').reduce((a, x) => a + Number(x.amount), 0)

  const setStatus = async (s: Sale, status: Sale['status']) => {
    const { error } = await supabase!.from('owner_sales').update({ status }).eq('id', s.id)
    if (error) setErr(missing(error.message)); void loadSales()
  }
  const remove = async (s: Sale) => {
    if (!window.confirm(`¿Borrar el registro de ${pesos(Number(s.amount))} de ${s.client_name || 'sin nombre'}?`)) return
    const { error } = await supabase!.from('owner_sales').delete().eq('id', s.id)
    if (error) setErr(missing(error.message)); void loadSales()
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Clientes" value={clients ? String(clients.length) : '…'} sub={t.newClients ? `${t.newClients} ${t.newClients === 1 ? 'nuevo' : 'nuevos'} este mes` : 'organizadores'} />
        <Stat label="Cobrado este mes" value={sales ? pesos(t.monthPaid) : '…'} sub={monthName(now)} gold />
        <Stat label="Pendiente de cobro" value={sales ? pesos(t.pending) : '…'} sub="lo que te deben" warn={t.pending > 0} />
        <Stat label="Cobrado en total" value={sales ? pesos(t.total) : '…'} sub="desde el inicio" />
      </div>
      {err && <Notice kind="error">{err}</Notice>}

      <Card title="Mis clientes" collapsible hint={clients ? `${clients.length} organizadores` : undefined}>
        {!clients ? <p className="text-muted">Cargando…</p> : !clients.length ? (
          <p className="text-sm text-muted">Todavía no tenés organizadores. Compartí el link de «Sumar organizadores» y después habilitalos en Cuentas.</p>
        ) : (
          <ul className="divide-y divide-line">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{who(c)}</p>
                  <p className="truncate text-muted">{c.email}{c.phone && <> · {c.phone}</>}</p>
                  <p className="text-xs text-muted">Cliente desde {dmy(c.created_at.slice(0, 10))}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-free">{pesos(paidBy(c.id))}</p>
                  {owesBy(c.id) > 0 && <p className="text-xs font-bold text-held">Debe {pesos(owesBy(c.id))}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Anotar una venta" collapsible hint="Lo que te pagó o te debe un cliente">
        <NewSale clients={clients ?? []} onSaved={loadSales} />
      </Card>

      <Card title="Ventas" collapsible hint={sales ? `${sales.length} registros` : undefined}>
        {byMonth.length > 0 && (
          <div className="mb-4 rounded-2xl bg-canvas p-3">
            <p className="label mb-2 text-muted">Cobrado por mes</p>
            <ul className="space-y-1 text-sm">
              {byMonth.map(([m, v]) => <li key={m} className="flex justify-between"><span>{monthName(m)}</span><span className="font-bold">{pesos(v)}</span></li>)}
            </ul>
          </div>
        )}
        {!sales ? <p className="text-muted">Cargando…</p> : !sales.length ? <p className="text-sm text-muted">Todavía no anotaste ventas.</p> : (
          <ul className="divide-y divide-line">
            {sales.map((s) => (
              <li key={s.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.client_name || 'Sin nombre'}</p>
                    <p className="text-muted">{dmy(s.sale_date)}{s.concept && <> · {s.concept}</>}</p>
                    {s.note && <p className="text-xs text-muted">{s.note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold">{pesos(Number(s.amount))}</p>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status === 'pagado' ? 'bg-free/15 text-free' : 'bg-held/15 text-held'}`}>{s.status === 'pagado' ? 'PAGADO' : 'PENDIENTE'}</span>
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-sm font-semibold">
                  {s.status === 'pendiente'
                    ? <button onClick={() => setStatus(s, 'pagado')} className="text-free">Marcar pagado</button>
                    : <button onClick={() => setStatus(s, 'pendiente')} className="text-muted">Marcar pendiente</button>}
                  <button onClick={() => remove(s)} className="text-sold">Borrar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function Stat({ label, value, sub, gold, warn }: { label: string; value: string; sub: string; gold?: boolean; warn?: boolean }) {
  return (
    <div className={`${gold ? 'navycard' : 'card'} rounded-2xl p-4`}>
      <p className={`label ${gold ? 'text-[#f6e0a4]' : 'text-muted'}`}>{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${gold ? 'gold-text' : warn ? 'text-held' : ''}`}>{value}</p>
      <p className={`text-xs ${gold ? 'text-[#aab3d6]' : 'text-muted'} first-letter:uppercase`}>{sub}</p>
    </div>
  )
}

function NewSale({ clients, onSaved }: { clients: Profile[]; onSaved: () => void }) {
  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [status, setStatus] = useState<Sale['status']>('pagado')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(amount.replace(/\./g, '').replace(',', '.'))
    const c = clients.find((x) => x.id === clientId)
    const clientName = c ? who(c) : name.trim()
    if (!clientName) return setMsg({ kind: 'error', text: 'Elegí el cliente o escribí su nombre.' })
    if (!Number.isFinite(n) || n < 0) return setMsg({ kind: 'error', text: 'Escribí el monto en números, por ejemplo 50000.' })
    setBusy(true); setMsg(null)
    const { error } = await supabase!.from('owner_sales').insert({ client_id: c?.id ?? null, client_name: clientName, concept: concept.trim(), amount: n, sale_date: date, status, note: note.trim() })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: missing(error.message) })
    setAmount(''); setConcept(''); setNote(''); setName('')
    setMsg({ kind: 'ok', text: `Venta de ${pesos(n)} anotada.` })
    onSaved()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-semibold">Cliente
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
          <option value="">Otro (escribir el nombre)</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{who(c)}</option>)}
        </select>
      </label>
      {!clientId && <label className="block text-sm font-semibold">Nombre del cliente
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputCls} />
      </label>}
      <label className="block text-sm font-semibold">Qué le vendiste
        <input value={concept} onChange={(e) => setConcept(e.target.value)} maxLength={120} placeholder="Ej.: App con su diseño, cuota de noviembre" className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">Monto ($)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="50000" className={inputCls} />
        </label>
        <label className="block text-sm font-semibold">Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-1">
        {(['pagado', 'pendiente'] as const).map((k) => (
          <button type="button" key={k} onClick={() => setStatus(k)} className={`rounded-xl py-2.5 font-bold ${status === k ? (k === 'pagado' ? 'bg-free text-white' : 'bg-held text-night') : 'text-muted'}`}>{k === 'pagado' ? 'Ya me pagó' : 'Me debe'}</button>
        ))}
      </div>
      <label className="block text-sm font-semibold">Nota (opcional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputCls} />
      </label>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <button disabled={busy} className={`${primaryCls} w-full`}>{busy ? 'Guardando…' : 'Anotar venta'}</button>
    </form>
  )
}
