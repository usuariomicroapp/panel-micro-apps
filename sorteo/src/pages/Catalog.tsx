import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RaffleImage from '../components/RaffleImage'
import { supabase, isConfigured } from '../lib/supabase'
import { loadPhotos, type PhotoView, type Product } from '../lib/data'
import { pesos } from '../lib/format'

interface Item extends Product { photos: PhotoView[]; raffles: { id: string; name: string }[] }

const cols = 'id, name, description, reference_price, prize_info, created_at'

// Catálogo de premios tipo tienda: fotos, detalles y precio de cada producto.
export default function Catalog() {
  const [items, setItems] = useState<Item[] | null>(isConfigured ? null : [])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    let alive = true
    ;(async () => {
      const query = (c: string) => supabase!.from('products').select(c).order('created_at', { ascending: false })
      // Si la base todavía no tiene la columna show_in_store, se muestran todos.
      let res = await query(cols + ', show_in_store')
      if (res.error) res = await query(cols)
      if (res.error) {
        if (alive) setError('No se pudo cargar el catálogo. Probá de nuevo en un rato.')
        return
      }
      const products = ((res.data ?? []) as unknown as Product[]).filter((p) => p.show_in_store !== false)
      const ids = products.map((p) => p.id)
      const [photos, raffles] = await Promise.all([
        loadPhotos(ids),
        ids.length ? supabase.from('raffles').select('id, name, product_id').eq('status', 'active').in('product_id', ids) : Promise.resolve({ data: [] }),
      ])
      const byProduct: Record<string, { id: string; name: string }[]> = {}
      for (const r of (raffles.data ?? []) as { id: string; name: string; product_id: string }[]) (byProduct[r.product_id] ??= []).push(r)
      if (alive) setItems(products.map((p) => ({ ...p, photos: photos[p.id] ?? [], raffles: byProduct[p.id] ?? [] })))
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold md:text-3xl">Premios</h1>
        <p className="mt-1 text-muted">Mirá los productos con sus fotos, detalles y precio.</p>
      </div>
      {!isConfigured && <p className="rounded-2xl bg-canvas p-4 text-sm text-muted">El catálogo se muestra cuando la app está conectada a la base de datos.</p>}
      {error && <p className="rounded-2xl bg-red-50 p-4 text-center text-sm text-red-700">{error}</p>}
      {items === null && !error && <p className="py-16 text-center text-muted">Cargando premios…</p>}
      {items?.length === 0 && isConfigured && (
        <div className="rounded-3xl border border-dashed border-line bg-surface p-10 text-center">
          <h2 className="text-lg font-bold">Todavía no hay premios cargados</h2>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items?.map((p) => {
          const view = { name: p.name, prize: p.name, photos: p.photos }
          return (
            <article key={p.id} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
              <RaffleImage raffle={view} gallery className="aspect-square w-full" />
              <div className="space-y-3 p-5">
                <h2 className="text-xl font-bold">{p.name}</h2>
                {p.reference_price != null && <p className="text-2xl font-extrabold text-brand-700">{pesos(Number(p.reference_price))}</p>}
                {p.description && <p className="whitespace-pre-line text-base text-ink/80">{p.description}</p>}
                {p.prize_info && <p className="whitespace-pre-line rounded-xl bg-canvas p-3 text-sm">{p.prize_info}</p>}
                {p.raffles.map((r) => (
                  <Link key={r.id} to={`/sorteo/${r.id}`} className="block rounded-2xl bg-brand-600 py-3.5 text-center text-lg font-bold text-white">
                    Participar por este premio
                  </Link>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
