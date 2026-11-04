import { useEffect, useState, type FormEvent } from 'react'
import { myId } from '../../lib/mine'
import { supabase } from '../../lib/supabase'
import { compressImage, photoUrl, type Product, type ProductPhoto } from '../../lib/data'
import { pesos } from '../../lib/format'
import { Card, Notice, ghostCls, inputCls, primaryCls } from '../../components/ui'

// Cuadro editable debajo de cada foto: se guarda solo al salir del cuadro.
function Caption({ photo }: { photo: ProductPhoto }) {
  const [text, setText] = useState(photo.caption ?? '')
  const [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>('')
  const save = async () => {
    if (text === (photo.caption ?? '')) return
    setState('saving')
    const { error } = await supabase!.from('product_photos').update({ caption: text.trim() }).eq('id', photo.id)
    setState(error ? 'error' : 'saved')
    if (!error) photo.caption = text.trim()
  }
  return (
    <div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setState('') }} onBlur={save} rows={3} maxLength={1000}
        placeholder="Detalle de esta foto (ej.: cuadro de aluminio, rodado 29, incluye casco)"
        className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand-500" />
      <p className="h-4 text-xs text-muted">{state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado' : state === 'error' ? 'No se pudo guardar. Falta actualizar la base o no hay conexión.' : ''}</p>
    </div>
  )
}

function Photos({ productId }: { productId: string }) {
  const [photos, setPhotos] = useState<ProductPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => supabase!.from('product_photos').select('*').eq('product_id', productId).order('position').then(({ data }) => setPhotos((data ?? []) as ProductPhoto[]))
  useEffect(() => { void load() }, [productId])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setErr('')
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) throw new Error('Solo se aceptan imágenes')
        const blob = await compressImage(file)
        const path = `${productId}/${crypto.randomUUID()}.jpg`
        const up = await supabase!.storage.from('product-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        const ins = await supabase!.from('product_photos').insert({ product_id: productId, path, position: photos.length })
        if (ins.error) throw ins.error
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo subir la foto')
    }
    setBusy(false)
    void load()
  }

  const remove = async (p: ProductPhoto) => {
    await supabase!.storage.from('product-photos').remove([p.path])
    await supabase!.from('product_photos').delete().eq('id', p.id)
    void load()
  }

  return (
    <div className="mt-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((p) => (
          <div key={p.id} className="rounded-2xl border border-line p-2">
            <div className="relative">
              <img src={photoUrl(p.path)} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
              <button type="button" onClick={() => remove(p)} aria-label="Quitar foto" className="absolute right-1.5 top-1.5 h-8 w-8 rounded-full bg-night text-sm text-white">×</button>
            </div>
            <Caption photo={p} />
          </div>
        ))}
        <label className={`flex min-h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-line text-sm text-muted ${busy ? 'opacity-50' : ''}`}>
          {busy ? 'Subiendo…' : '+ Agregar foto'}
          <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      {err && <div className="mt-2"><Notice kind="error">{err}</Notice></div>}
    </div>
  )
}

function ProductForm({ initial, onDone }: { initial?: Product; onDone: () => void }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const num = (v: FormDataEntryValue | null) => (String(v ?? '').trim() === '' ? null : Number(v))

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const row = {
      name: String(f.get('name')).trim(),
      description: String(f.get('description')).trim(),
      reference_price: num(f.get('reference_price')),
      acquisition_cost: num(f.get('acquisition_cost')),
      prize_info: String(f.get('prize_info')).trim(),
      show_in_store: f.get('show_in_store') === 'on',
      updated_at: new Date().toISOString(),
    }
    setBusy(true); setErr('')
    const { error } = initial
      ? await supabase!.from('products').update(row).eq('id', initial.id)
      : await supabase!.from('products').insert(row)
    setBusy(false)
    if (error) setErr(/show_in_store/.test(error.message) ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).' : error.message)
    else onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">Nombre
          <input name="name" required maxLength={120} defaultValue={initial?.name} placeholder="Ej.: Smartphone 128 GB" className={inputCls} />
        </label>
        <label className="block text-sm sm:col-span-2">Descripción
          <textarea name="description" rows={3} maxLength={4000} defaultValue={initial?.description} className={inputCls} />
        </label>
        <label className="block text-sm">Precio o valor del producto ($)
          <input name="reference_price" type="number" min="0" step="0.01" defaultValue={initial?.reference_price ?? ''} className={inputCls} />
        </label>
        <label className="block text-sm">Costo de adquisición ($) <span className="text-muted">· privado</span>
          <input name="acquisition_cost" type="number" min="0" step="0.01" defaultValue={initial?.acquisition_cost ?? ''} className={inputCls} />
        </label>
        <label className="block text-sm sm:col-span-2">Información del premio
          <textarea name="prize_info" rows={2} maxLength={4000} defaultValue={initial?.prize_info} placeholder="Garantía, entrega, retiro…" className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input name="show_in_store" type="checkbox" defaultChecked={initial?.show_in_store ?? true} className="h-5 w-5" />
          Mostrar en el catálogo de premios que ven los participantes
        </label>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex gap-2">
        <button disabled={busy} className={primaryCls}>{initial ? 'Guardar' : 'Crear producto'}</button>
        <button type="button" onClick={onDone} className={ghostCls}>Cancelar</button>
      </div>
    </form>
  )
}

export default function Products() {
  const [items, setItems] = useState<Product[] | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [err, setErr] = useState('')

  // Los premios de los sorteos se cargan desde Sorteos: acá van solo los productos de la tienda.
  const load = async () => {
    const [{ data }, { data: rs }] = await Promise.all([supabase!.rpc('admin_products'), supabase!.from('raffles').select('product_id').eq('organizer_id', await myId())])
    const used = new Set(((rs ?? []) as { product_id: string }[]).map((r) => r.product_id))
    setItems(((data ?? []) as Product[]).filter((p) => !used.has(p.id)))
  }
  useEffect(() => { void load() }, [])

  const remove = async (p: Product) => {
    if (!window.confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return
    setErr('')
    const { data: photos } = await supabase!.from('product_photos').select('path').eq('product_id', p.id)
    const { error } = await supabase!.from('products').delete().eq('id', p.id)
    if (error) return setErr(/foreign key|violates/i.test(error.message) ? 'No se puede eliminar: el producto está usado en un sorteo.' : error.message)
    if (photos?.length) await supabase!.storage.from('product-photos').remove(photos.map((x) => x.path))
    void load()
  }

  return (
    <Card title="Productos de tienda" action={editing === null && <button onClick={() => setEditing('new')} className="text-sm font-semibold text-brand-600">+ Nuevo producto</button>}>
      {err && <div className="mb-3"><Notice kind="error">{err}</Notice></div>}
      {editing === 'new' && <div className="mb-4"><ProductForm onDone={() => { setEditing(null); void load() }} /></div>}
      {!items ? <p className="text-muted">Cargando…</p> : items.length === 0 && editing !== 'new' ? (
        <p className="text-sm text-muted">Todavía no hay productos. Creá el primero para poder armar un sorteo.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => editing === p.id ? (
            <li key={p.id}><ProductForm initial={p} onDone={() => { setEditing(null); void load() }} /><Photos productId={p.id} /></li>
          ) : (
            <li key={p.id} className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold">{p.name}{p.show_in_store === false && <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">Oculto en el catálogo</span>}</p>
                  <p className="text-muted">
                    {p.reference_price != null && <>Precio {pesos(p.reference_price)} · </>}
                    {p.acquisition_cost != null && <>Costo {pesos(p.acquisition_cost)}</>}
                  </p>
                </div>
                <div className="flex gap-3 text-sm font-semibold">
                  <button onClick={() => setEditing(p.id)} className="text-brand-600">Editar</button>
                  <button onClick={() => remove(p)} className="text-sold">Eliminar</button>
                </div>
              </div>
              <Photos productId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
