import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { myId } from '../../lib/mine'
import { supabase } from '../../lib/supabase'
import {
  compressImage, digitsFor, loadPhotos, NO_DRAW_YET, dmy, slotTimes, slotLabels, statusLabels,
  type Product, type Raffle, type RaffleStatus, type UnsoldPolicy,
} from '../../lib/data'
import { Card, Notice, ghostCls, inputCls, primaryCls } from '../../components/ui'
import Icon from '../../components/Icon'

interface Stats { taken: number; available: number; participants: number }

const explain = (msg: string) => {
  if (/active_needs_rules/.test(msg)) return 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor) y probá de nuevo.'
  if (/closes_after_start/.test(msg)) return 'La fecha de cierre tiene que ser posterior a la de inicio.'
  if (/digits_fit_numbers/.test(msg)) return 'La cantidad de cifras no alcanza para esa cantidad de números.'
  if (/solo puede ampliarse/.test(msg)) return 'La cantidad de números solo se puede ampliar, no reducir.'
  if (/ya tiene números/.test(msg)) return 'Este sorteo ya tiene números elegidos: no se pueden cambiar sus reglas.'
  return msg
}

const SIZES = [100, 500, 1000]

// Cargar sorteo: foto, qué se sortea, descripción y cantidad de números.
// El día y la Quiniela se cargan después, en "Día del sorteo", cuando el organizador quiera.
// La foto y la descripción se guardan en un premio propio del sorteo (no aparece en la tienda).
function RaffleForm({ initial, products, photo: current, onDone }: { initial?: Raffle; products: Product[]; photo?: string; onDone: () => void }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [total, setTotal] = useState(initial?.total_numbers ?? 100)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const prize = products.find((p) => p.id === initial?.product_id)
  const sizes = SIZES.includes(total) ? SIZES : [...SIZES, total].sort((x, y) => x - y)

  const pick = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setErr('Elegí una foto (imagen).')
    setErr(''); setPhoto(f); setPreview(URL.createObjectURL(f))
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const name = s('name')
    const description = s('description')
    if (!initial && !photo) return setErr('Subí la foto de lo que se sortea.')
    setBusy(true); setErr('')
    try {
      // 1) El premio del sorteo (foto y descripción). No se muestra en la tienda.
      let productId = initial?.product_id ?? ''
      if (!initial) {
        const ins = await supabase!.from('products').insert({ name, description, show_in_store: false }).select('id').single()
        if (ins.error) throw new Error(ins.error.message)
        productId = (ins.data as { id: string }).id
      } else if (prize && (prize.name !== name || prize.description !== description)) {
        await supabase!.from('products').update({ name, description }).eq('id', productId)
      }
      if (photo) {
        const blob = await compressImage(photo)
        const path = `${productId}/${crypto.randomUUID()}.jpg`
        const up = await supabase!.storage.from('product-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw new Error(up.error.message)
        // La foto nueva queda primera.
        const { data: old } = await supabase!.from('product_photos').select('id, position').eq('product_id', productId)
        for (const o of (old ?? []) as { id: string; position: number }[]) await supabase!.from('product_photos').update({ position: o.position + 1 }).eq('id', o.id)
        const ph = await supabase!.from('product_photos').insert({ product_id: productId, path, position: 0 })
        if (ph.error) throw new Error(ph.error.message)
      }
      // 2) El sorteo.
      const row = {
        name,
        product_id: productId,
        description,
        total_numbers: total,
        digits: digitsFor(total),
        // Sin día del sorteo todavía: se carga después en "Día del sorteo".
        ...(initial ? {} : { starts_at: new Date().toISOString(), closes_at: NO_DRAW_YET }),
        // Cada persona puede elegir los números que quiera.
        max_numbers_per_reservation: Math.min(total, 1000),
        ...(initial ? {} : { status: 'active' as RaffleStatus, unsold_policy: 'siguiente_sorteo' as UnsoldPolicy, is_demo: false, no_winner_notes: '' }),
      }
      const { error } = initial
        ? await supabase!.from('raffles').update(row).eq('id', initial.id)
        : await supabase!.from('raffles').insert(row)
      if (error) throw new Error(explain(error.message))
      onDone()
    } catch (e2) {
      setErr(e2 instanceof Error ? explain(e2.message) : 'No se pudo guardar el sorteo.')
    }
    setBusy(false)
  }

  const digits = digitsFor(total)
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
      <div>
        <p className="text-sm font-semibold">1. Foto de lo que se sortea</p>
        <label className="mt-2 block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-gold/50 bg-surface">
          {preview || current ? (
            <img src={preview ?? current!} alt="" className="aspect-[16/10] w-full bg-night object-contain" />
          ) : (
            <span className="grid aspect-[16/10] w-full place-items-center text-center text-sm font-semibold text-muted">📷<br />Tocá para subir la foto</span>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {(preview || current) && <p className="mt-1 text-xs text-muted">Tocá la foto para cambiarla.</p>}
      </div>
      <label className="block text-sm font-semibold">2. Qué se sortea
        <input name="name" required maxLength={120} defaultValue={initial?.name} placeholder="Ej.: Bicicleta rodado 29" className={inputCls} />
      </label>
      <label className="block text-sm font-semibold">3. Descripción (va debajo de la foto)
        <textarea name="description" rows={3} maxLength={4000} defaultValue={initial?.description} placeholder="Ej.: Nueva, con cambios Shimano. Se entrega en el local." className={inputCls} />
      </label>
      <div>
        <p className="text-sm font-semibold">4. Cantidad de números</p>
        <div className={`mt-2 grid gap-2 ${sizes.length > 3 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {sizes.map((n) => (
            <button type="button" key={n} onClick={() => setTotal(n)}
              className={`rounded-2xl py-3 text-center font-extrabold ${total === n ? 'btn-gold' : 'card text-ink'}`}>
              {n}
              <span className="block text-[11px] font-semibold opacity-80">{'0'.padStart(digitsFor(n), '0')} al {String(n - 1).padStart(digitsFor(n), '0')}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Gana el número igual a las últimas {digits} cifras del 1.er premio de la Quiniela de la Ciudad.</p>
      </div>
      {!initial && <p className="rounded-2xl bg-gold/10 p-3 text-sm">📅 El día del sorteo y la Quiniela los cargás después, cuando quieras (por ejemplo, cuando se entreguen todos los números), en <b>Día del sorteo</b>.</p>}

      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex gap-2">
        <button disabled={busy} className={`${primaryCls} flex-1`}>{busy ? 'Guardando…' : initial ? 'Guardar' : 'Publicar sorteo'}</button>
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
  const [photos, setPhotos] = useState<Record<string, string>>({})

  const load = async () => {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase!.from('raffles').select('*').eq('organizer_id', await myId()).order('created_at', { ascending: false }),
      supabase!.rpc('admin_products'),
    ])
    const list = (r ?? []) as Raffle[]
    setItems(list)
    setProducts((p ?? []) as Product[])
    const ph = await loadPhotos([...new Set(list.map((x) => x.product_id))])
    setPhotos(Object.fromEntries(Object.entries(ph).map(([k, v]) => [k, v[0]?.url ?? ''])))
  }
  useEffect(() => { void load() }, [])

  const setStatus = async (r: Raffle, status: RaffleStatus) => {
    if (status === 'cancelled' && !window.confirm(`¿Cancelar "${r.name}"? Deja de verse en la tienda.`)) return
    const { error } = await supabase!.from('raffles').update({ status }).eq('id', r.id)
    if (error) window.alert(explain(error.message))
    void load()
  }

  // Tachito: borra el sorteo por completo, con su foto y sus números.
  const remove = async (r: Raffle) => {
    const { data } = await supabase!.rpc('raffle_stats', { p_raffle: r.id })
    const taken = ((data ?? []) as Stats[])[0]?.taken ?? 0
    const warn = taken > 0 ? `\n\nATENCIÓN: ya hay ${taken} ${taken === 1 ? 'número elegido' : 'números elegidos'}. Se borran también.` : ''
    if (!window.confirm(`¿Borrar "${r.name}" por completo?${warn}\n\nEsto no se puede deshacer.`)) return
    const { data: ph } = await supabase!.from('product_photos').select('path').eq('product_id', r.product_id)
    const { error } = await supabase!.rpc('admin_delete_raffle', { p_raffle: r.id })
    if (error) return window.alert(/admin_delete_raffle|schema cache|function/i.test(error.message) ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).' : error.message)
    const paths = ((ph ?? []) as { path: string }[]).map((x) => x.path)
    if (paths.length) await supabase!.storage.from('product-photos').remove(paths)
    void load()
  }

  const badge: Record<RaffleStatus, string> = {
    draft: 'bg-line text-muted', active: 'bg-free/15 text-free', closed: 'bg-held/20 text-yellow-800', drawn: 'bg-brand-100 text-brand-700', cancelled: 'bg-sold/10 text-sold',
  }

  return (
    <Card title="Sorteos">
      {editing === null && <button onClick={() => setEditing('new')} className={`${primaryCls} mb-4 w-full py-4 text-lg`}>+ Cargar sorteo</button>}
      {editing === 'new' && <div className="mb-4"><RaffleForm products={products} onDone={() => { setEditing(null); void load() }} /></div>}
      {!items ? <p className="text-muted">Cargando…</p> : items.length === 0 && editing !== 'new' ? (
        <p className="text-sm text-muted">Todavía no cargaste sorteos.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => editing === r.id ? (
            <li key={r.id}><RaffleForm initial={r} products={products} photo={photos[r.product_id] || undefined} onDone={() => { setEditing(null); void load() }} /></li>
          ) : (
            <li key={r.id} className="relative rounded-2xl border border-line p-4 pr-14">
              <button onClick={() => void remove(r)} aria-label={`Borrar ${r.name}`} title="Borrar sorteo"
                className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-sold hover:bg-sold/10"><Icon name="trash" className="h-6 w-6" /></button>
              <div className="flex items-start gap-3">
                {photos[r.product_id]
                  ? <img src={photos[r.product_id]} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-night object-contain" />
                  : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-line text-2xl">🎁</span>}
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {r.raffle_no ? `N° ${r.raffle_no} · ` : ''}{r.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${badge[r.status]}`}>{statusLabels[r.status]}</span>
                    {r.is_demo && <span className="ml-1 rounded-full bg-gold/30 px-2 py-0.5 text-xs font-bold text-brand-900">Prueba</span>}
                  </p>
                  <p className="text-muted">{r.total_numbers} números</p>
                  <p className="text-muted">{r.official_draw_date && r.official_draw_slot
                    ? <>Se sortea el {dmy(r.official_draw_date)} a las {slotTimes[r.official_draw_slot]} · {slotLabels[r.official_draw_slot].split(' ·')[0]}</>
                    : 'Día del sorteo: todavía sin cargar'}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap text-sm font-semibold">
                  {r.status !== 'draft' && <Link to={`/sorteo/${r.id}`} className="text-muted">Ver</Link>}
                  <button onClick={() => setEditing(r.id)} className="text-brand-600">Editar</button>
                  {r.status === 'draft' && <button onClick={() => void setStatus(r, 'active')} className="text-free">Publicar</button>}
                  {(r.status === 'active' || r.status === 'closed') && <button onClick={() => void setStatus(r, 'cancelled')} className="text-sold">Cancelar sorteo</button>}
                </div>
              </div>
              </div>
              <RaffleStats id={r.id} />
              {['draft', 'active', 'closed'].includes(r.status) && (
                <Link to={`/admin?tab=dia&sorteo=${r.id}`} className={`${r.official_draw_date ? ghostCls : primaryCls} mt-3 block text-center`}>
                  📅 {r.official_draw_date ? 'Cambiar día del sorteo' : 'Cargar día y Quiniela'}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
