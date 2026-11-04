import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import NumberGrid, { GridLegend } from '../components/NumberGrid'
import RaffleImage from '../components/RaffleImage'
import ComingSoon from '../components/ComingSoon'
import { fecha, pad, pesos } from '../lib/format'
import { countView, usePublicRaffle } from '../lib/publicRaffles'

export default function Raffle() {
  const { id } = useParams()
  const { loading, error, data: raffle } = usePublicRaffle(id)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [searchMsg, setSearchMsg] = useState('')

  if (loading) return <p className="py-20 text-center text-muted">Cargando sorteo…</p>
  if (error) return <p className="py-20 text-center text-red-700">{error} <Link to="/" className="font-semibold text-brand-600">Volver</Link></p>
  if (!raffle) {
    return <p className="py-20 text-center text-muted">No encontramos ese sorteo. <Link to="/" className="font-semibold text-brand-600">Volver</Link></p>
  }

  const c = countView(raffle)
  const open = raffle.status === 'active'
  const toggle = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  const findNumber = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(search)
    if (search.trim() === '' || !Number.isInteger(n) || n < 0 || n >= raffle.totalNumbers) {
      return setSearchMsg(`Escribí un número del ${pad(0, raffle.digits)} al ${pad(raffle.totalNumbers - 1, raffle.digits)}.`)
    }
    const st = raffle.states[n] ?? 'available'
    if (st !== 'available') return setSearchMsg(`El ${pad(n, raffle.digits)} ya está ${st === 'paid' ? 'vendido' : 'reservado'}. Probá con otro.`)
    if (!selected.has(n)) toggle(n)
    setSearchMsg(`¡Listo! Elegiste el ${pad(n, raffle.digits)}.`)
    setSearch('')
  }
  const chosen = [...selected].sort((a, b) => a - b)
  const total = chosen.length * raffle.pricePerNumber

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Link to="/" className="text-sm font-medium text-muted">← Sorteos</Link>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          <RaffleImage raffle={raffle} gallery className="aspect-[16/9] w-full" />
          <div className="p-5 md:p-6">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {raffle.isDemo && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">Sorteo de demostración</span>}
              {!open && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{raffle.statusLabel}</span>}
            </div>
            <h1 className="text-2xl font-extrabold md:text-3xl">{raffle.name}</h1>
            {raffle.description && <p className="mt-1 whitespace-pre-line text-muted">{raffle.description}</p>}
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div><dt className="text-muted">Premio</dt><dd className="font-semibold">{raffle.prize}</dd></div>
              <div><dt className="text-muted">Por número</dt><dd className="font-semibold">{pesos(raffle.pricePerNumber)}</dd></div>
              <div><dt className="text-muted">Sorteo oficial</dt><dd className="font-semibold">{raffle.officialDraw}</dd></div>
              <div><dt className="text-muted">Cierre</dt><dd className="font-semibold">{fecha(raffle.closesAt)}</dd></div>
            </dl>
            <p className="mt-4 rounded-xl bg-canvas p-3 text-sm"><span className="font-semibold">Regla: </span>{raffle.rule}. Ejemplo: si sale 8537, gana el {raffle.digits === 2 ? '37' : '8537'.slice(-raffle.digits)}.{raffle.unsold && <> Si el número ganador no se vendió: {raffle.unsold.toLowerCase()}.</>}</p>
          </div>
        </div>

        <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Elegí tus números</h2>
          </div>
          {open && (
            <ol className="mb-4 space-y-1.5 rounded-2xl bg-brand-50 p-4 text-base">
              <li><b>1.</b> Tocá un número <b className="text-free">verde</b> (o escribilo abajo).</li>
              <li><b>2.</b> Tocá <b>Reservar números</b>.</li>
              <li><b>3.</b> Pagá por transferencia y mandá el comprobante.</li>
            </ol>
          )}
          {open && (
            <form onSubmit={findNumber} className="mb-4">
              <label className="block text-base font-medium">¿Tenés un número favorito?
                <div className="mt-1 flex gap-2">
                  <input value={search} onChange={(e) => { setSearch(e.target.value.replace(/\D/g, '')); setSearchMsg('') }} inputMode="numeric" maxLength={raffle.digits}
                    placeholder={`Ej.: ${pad(37, raffle.digits)}`} className="w-full rounded-xl border-2 border-line bg-surface px-4 py-3 text-xl font-bold tabular-nums outline-none focus:border-brand-500" />
                  <button className="shrink-0 rounded-xl bg-ink px-5 text-lg font-bold text-white">Elegir</button>
                </div>
              </label>
              {searchMsg && <p className="mt-2 text-base font-medium" role="status">{searchMsg}</p>}
            </form>
          )}
          <div className="mb-3"><GridLegend /></div>
          <NumberGrid total={raffle.totalNumbers} digits={raffle.digits} states={raffle.states} selected={selected} onToggle={open ? toggle : () => {}} />
          <p className="mt-3 text-sm text-muted">{c.available} libres · {c.reserved} reservados · {c.paid} pagados</p>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="font-bold">Tu selección</h2>
          {chosen.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Tocá uno o más números verdes de la grilla.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chosen.map((n) => (
                <button key={n} onClick={() => toggle(n)} className="rounded-lg bg-brand-600 px-2.5 py-1 text-sm font-bold text-white" aria-label={`Quitar ${pad(n, raffle.digits)}`}>
                  {pad(n, raffle.digits)} ×
                </button>
              ))}
            </div>
          )}
          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sm text-muted">{chosen.length} × {pesos(raffle.pricePerNumber)}</span>
            <span className="text-2xl font-extrabold">{pesos(total)}</span>
          </div>
          <button disabled className="mt-4 w-full cursor-not-allowed rounded-2xl bg-brand-600/40 py-3.5 font-bold text-white">Reservar números</button>
          <div className="mt-3">
            <ComingSoon stage={6}>{open ? "Las reservas se activan en la próxima etapa. Hoy solo se calcula el total." : "Este sorteo ya no recibe reservas."}</ComingSoon>
          </div>
        </div>
      </aside>

      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-[68px] z-10 border-t border-line bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,.06)] lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <span className="text-sm"><b>{chosen.length}</b> números · <b>{pesos(total)}</b></span>
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">Reservas en Etapa 6</span>
          </div>
        </div>
      )}
    </div>
  )
}
