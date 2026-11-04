import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { myId } from '../../lib/mine'
import { supabase } from '../../lib/supabase'
import {
  digitsFor, fromInputDateTime, slotLabels, statusLabels, toInputDateTime, unsoldLabels,
  type DrawSlot, type Product, type Raffle, type RaffleStatus, type UnsoldPolicy,
} from '../../lib/data'
import { fecha } from '../../lib/format'
import { Card, Notice, ghostCls, inputCls, primaryCls } from '../../components/ui'

interface Stats { taken: number; available: number; participants: number }

const explain = (msg: string) => {
  if (/active_needs_rules/.test(msg)) return 'Para activar el sorteo completá la fecha y el horario del sorteo oficial y qué pasa si el número ganador no se vendió.'
  if (/closes_after_start/.test(msg)) return 'La fecha de cierre tiene que ser posterior a la de inicio.'
  if (/digits_fit_numbers/.test(msg)) return 'La cantidad de cifras no alcanza para esa cantidad de números.'
  if (/solo puede ampliarse/.test(msg)) return 'La cantidad de números solo se puede ampliar, no reducir.'
  if (/ya tiene números/.test(msg)) return 'Este sorteo ya tiene números elegidos: no se pueden cambiar sus reglas.'
  return msg
}

function RaffleForm({ initial, products, onDone }: { initial?: Raffle; products: Product[]; onDone: () => void }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [total, setTotal] = useState(initial?.total_numbers ?? 100)
  const now = new Date()
  const inWeek = new Date(now.getTime() + 7 * 864e5)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const row = {
      name: s('name'),
      product_id: s('product_id'),
      description: s('description'),
      total_numbers: total,
      digits: digitsFor(total),
      starts_at: fromInputDateTime(s('starts_at')),
      closes_at: fromInputDateTime(s('closes_at')),
      official_draw_date: s('official_draw_date') || null,
      official_draw_slot: (s('official_draw_slot') || null) as DrawSlot | null,
      unsold_policy: (s('unsold_policy') || null) as UnsoldPolicy | null,
      no_winner_notes: s('no_winner_notes'),
      max_numbers_per_reservation: Number(s('max_numbers_per_reservation')),
      is_demo: f.get('is_demo') === 'on',
      status: s('status') as RaffleStatus,
    }
    setBusy(true); setErr('')
    const { error } = initial
      ? await supabase!.from('raffles').update(row).eq('id', initial.id)
      : await supabase!.from('raffles').insert(row)
    setBusy(false)
    if (error) setErr(explain(error.message))
    else onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">Nombre del sorteo
          <input name="name" required maxLength={120} defaultValue={initial?.name} className={inputCls} />
        </label>
        <label className="block text-sm sm:col-span-2">Producto
          <select name="product_id" required defaultValue={initial?.product_id ?? ''} className={inputCls}>
            <option value="" disabled>Elegí un producto</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">Descripción
          <textarea name="description" rows={2} maxLength={4000} defaultValue={initial?.description} className={inputCls} />
        </label>
        <label className="block text-sm">Cantidad de números
          <input type="number" required min={2} max={10000} value={total} onChange={(e) => setTotal(Number(e.target.value))} className={inputCls} />
          <span className="mt-1 block text-xs text-muted">Del {'0'.padStart(digitsFor(total), '0')} al {String(total - 1).padStart(digitsFor(total), '0')} · {digitsFor(total)} cifras. Podés cambiarla cuando quieras, siempre que no quites números ya elegidos.</span>
        </label>
        <label className="block text-sm">Inicio (hora Argentina)
          <input name="starts_at" type="datetime-local" required defaultValue={toInputDateTime(initial?.starts_at ?? now.toISOString())} className={inputCls} />
        </label>
        <label className="block text-sm">Se puede elegir hasta (hora Argentina)
          <input name="closes_at" type="datetime-local" required defaultValue={toInputDateTime(initial?.closes_at ?? inWeek.toISOString())} className={inputCls} />
        </label>
      </div>

      <fieldset className="card rounded-2xl p-4">
        <legend className="px-1 text-sm font-semibold">Sorteo oficial de referencia · Quiniela de la Ciudad</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Fecha del sorteo oficial
            <input name="official_draw_date" type="date" defaultValue={initial?.official_draw_date ?? ''} className={inputCls} />
          </label>
          <label className="block text-sm">Horario
            <select name="official_draw_slot" defaultValue={initial?.official_draw_slot ?? 'nocturna'} className={inputCls}>
              {Object.entries(slotLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <p className="text-sm sm:col-span-2"><b>Regla:</b> gana el número igual a las últimas {digitsFor(total)} cifras del primer premio.</p>
          <label className="block text-sm sm:col-span-2">Si el número ganador no se vendió
            <select name="unsold_policy" defaultValue={initial?.unsold_policy ?? ''} className={inputCls}>
              <option value="">Sin definir (obligatorio para activar)</option>
              {Object.entries(unsoldLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">Notas para casos no previstos
            <input name="no_winner_notes" maxLength={1000} defaultValue={initial?.no_winner_notes} className={inputCls} />
          </label>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Números por persona
          <input name="max_numbers_per_reservation" type="number" min="1" max="1000" defaultValue={initial?.max_numbers_per_reservation ?? 1} className={inputCls} />
          <span className="mt-1 block text-xs text-muted">Cuántos números puede elegir cada participante en este sorteo.</span>
        </label>
        <label className="block text-sm">Estado
          <select name="status" defaultValue={initial?.status ?? 'draft'} className={inputCls}>
            {(['draft', 'active', 'closed', 'cancelled'] as RaffleStatus[]).map((k) => <option key={k} value={k}>{statusLabels[k]}</option>)}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="is_demo" defaultChecked={initial?.is_demo ?? false} className="mt-1" />
        <span><b>Sorteo de prueba.</b> Se muestra con la etiqueta "Prueba" para que nadie lo confunda con un sorteo real.</span>
      </label>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex gap-2">
        <button disabled={busy} className={primaryCls}>{initial ? 'Guardar' : 'Crear sorteo'}</button>
        <button type="button" onClick={onDone} className={ghostCls}>Cancelar</button>
      </div>
    </form>
  )
}

function RaffleStats({ id }: { id: string }) {
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => { supabase!.rpc('raffle_stats', { p_raffle: id }).then(({ data }) => setS(((data ?? []) as Stats[])[0] ?? null)) }, [id])
  if (!s) return null
  return (
    <p className="mt-2 text-xs text-muted">
      <span className="text-sold">{s.taken} elegidos</span> · <span className="text-free">{s.available} libres</span> · {s.participants} participantes
    </p>
  )
}

export default function Raffles() {
  const [items, setItems] = useState<Raffle[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  const load = async () => {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase!.from('raffles').select('*').eq('organizer_id', await myId()).order('created_at', { ascending: false }),
      supabase!.rpc('admin_products'),
    ])
    setItems((r ?? []) as Raffle[])
    setProducts((p ?? []) as Product[])
  }
  useEffect(() => { void load() }, [])

  const badge: Record<RaffleStatus, string> = {
    draft: 'bg-line text-muted', active: 'bg-free/15 text-free', closed: 'bg-held/20 text-yellow-800', drawn: 'bg-brand-100 text-brand-700', cancelled: 'bg-sold/10 text-sold',
  }

  return (
    <Card title="Sorteos" action={editing === null && <button onClick={() => setEditing('new')} disabled={!products.length} className="text-sm font-semibold text-brand-600 disabled:text-muted">+ Nuevo sorteo</button>}>
      {items && !products.length && <p className="mb-3 text-sm text-muted">Primero creá un producto en la pestaña Productos.</p>}
      {editing === 'new' && <div className="mb-4"><RaffleForm products={products} onDone={() => { setEditing(null); void load() }} /></div>}
      {!items ? <p className="text-muted">Cargando…</p> : items.length === 0 && editing !== 'new' ? (
        <p className="text-sm text-muted">Todavía no hay sorteos.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => editing === r.id ? (
            <li key={r.id}><RaffleForm initial={r} products={products} onDone={() => { setEditing(null); void load() }} /></li>
          ) : (
            <li key={r.id} className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold">
                    {r.raffle_no ? `N° ${r.raffle_no} · ` : ''}{r.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${badge[r.status]}`}>{statusLabels[r.status]}</span>
                    {r.is_demo && <span className="ml-1 rounded-full bg-gold/30 px-2 py-0.5 text-xs font-bold text-brand-900">Prueba</span>}
                  </p>
                  <p className="text-muted">{r.total_numbers} números · hasta {r.max_numbers_per_reservation} por persona · cierra {fecha(r.closes_at)}</p>
                  <p className="text-muted">Oficial: {r.official_draw_date ? r.official_draw_date.split('-').reverse().join('/') : 'sin fecha'} · {r.official_draw_slot ? slotLabels[r.official_draw_slot] : 'sin horario'}</p>
                </div>
                <div className="flex gap-3 text-sm font-semibold">
                  {r.status !== 'draft' && <Link to={`/sorteo/${r.id}`} className="text-muted">Ver</Link>}
                  <button onClick={() => setEditing(r.id)} className="text-brand-600">Editar</button>
                </div>
              </div>
              <RaffleStats id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
