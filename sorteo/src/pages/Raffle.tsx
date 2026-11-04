import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import NumberGrid, { GridLegend } from '../components/NumberGrid'
import RaffleImage from '../components/RaffleImage'
import { fecha, pad } from '../lib/format'
import { countView, usePublicRaffle } from '../lib/publicRaffles'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'

const bigInput = 'mt-1 w-full rounded-xl border-2 border-line bg-surface px-4 py-3 text-lg outline-none focus:border-brand-500'

// Pide nombre y teléfono una sola vez: quedan guardados en el perfil y con cada número elegido.
function ContactForm({ onSaved }: { onSaved: () => void }) {
  const { profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const first = String(f.get('first_name')).trim()
    const phone = String(f.get('phone')).trim()
    if (!first || !phone) return setErr('Completá tu nombre y tu teléfono.')
    setBusy(true); setErr('')
    const { error } = await supabase!.from('profiles').update({ first_name: first, last_name: String(f.get('last_name')).trim(), phone }).eq('id', profile!.id)
    setBusy(false)
    if (error) return setErr(/phone/.test(error.message) ? 'El teléfono solo puede tener números, espacios, + y guiones.' : error.message)
    await refreshProfile()
    onSaved()
  }
  return (
    <form onSubmit={save} className="mt-4 space-y-3 rounded-2xl bg-brand-50 p-4">
      <p className="text-base font-semibold">Antes de confirmar, dejanos tus datos para avisarte si ganás:</p>
      <label className="block text-base">Nombre<input name="first_name" required maxLength={80} defaultValue={profile?.first_name} className={bigInput} /></label>
      <label className="block text-base">Apellido<input name="last_name" maxLength={80} defaultValue={profile?.last_name} className={bigInput} /></label>
      <label className="block text-base">Teléfono<input name="phone" type="tel" required inputMode="tel" defaultValue={profile?.phone} placeholder="Ej.: 11 4444-5555" className={bigInput} /></label>
      {err && <p role="alert" className="text-base text-sold">{err}</p>}
      <button disabled={busy} className="w-full rounded-2xl bg-ink py-3.5 text-lg font-bold text-white">{busy ? 'Guardando…' : 'Guardar y seguir'}</button>
    </form>
  )
}

export default function Raffle() {
  const { id } = useParams()
  const { loading, error, data: raffle, reload } = usePublicRaffle(id)
  const { session, profile } = useAuth()
  const { paused } = useBrand()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [claimErr, setClaimErr] = useState('')
  const [askContact, setAskContact] = useState(false)
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
  const isExample = raffle.id.startsWith('ejemplo-')
  const max = raffle.maxPerPerson
  const chosen = [...selected].sort((a, b) => a - b)

  const toggle = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else if (next.size >= max) {
        if (max === 1) return new Set([n])
        setSearchMsg(`En este sorteo podés elegir hasta ${max} números.`)
        return prev
      } else next.add(n)
      return next
    })

  const findNumber = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(search)
    if (search.trim() === '' || !Number.isInteger(n) || n < 0 || n >= raffle.totalNumbers) {
      return setSearchMsg(`Escribí un número del ${pad(0, raffle.digits)} al ${pad(raffle.totalNumbers - 1, raffle.digits)}.`)
    }
    if ((raffle.states[n] ?? 'available') !== 'available') return setSearchMsg(`El ${pad(n, raffle.digits)} ya lo eligió otra persona. Probá con otro.`)
    if (!selected.has(n)) toggle(n)
    setSearchMsg(`Elegiste el ${pad(n, raffle.digits)}.`)
    setSearch('')
  }

  const claim = async (contactSaved = false) => {
    if (!supabase || !chosen.length) return
    if (!contactSaved && (!profile?.first_name?.trim() || !profile?.phone?.trim())) return setAskContact(true)
    setBusy(true); setClaimErr('')
    const { data, error: err } = await supabase.rpc('claim_numbers', { p_raffle: raffle.id, p_numbers: chosen })
    setBusy(false)
    if (err) {
      if (/nombre y teléfono/.test(err.message)) return setAskContact(true)
      setClaimErr(/Failed to fetch|NetworkError/i.test(err.message) ? 'No hay conexión. Probá de nuevo.' : err.message)
      if (/disponible/.test(err.message)) { setSelected(new Set()); reload() }
      return
    }
    navigate(`/mis-numeros?nueva=${(data as { id: string }).id}`)
  }

  const canClaim = open && !isExample && !paused && !!session
  const label = chosen.length > 1 ? `Confirmar mis ${chosen.length} números` : 'Confirmar mi número'

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Link to="/" className="text-base font-medium text-muted">← Sorteos</Link>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          <RaffleImage raffle={raffle} gallery className="aspect-[16/9] w-full" />
          <div className="p-5 md:p-6">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-free/15 px-2.5 py-0.5 text-xs font-bold text-free">Gratis</span>
              {raffle.isDemo && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">Prueba</span>}
              {!open && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{raffle.statusLabel}</span>}
            </div>
            <h1 className="text-2xl font-extrabold md:text-3xl">{raffle.name}</h1>
            {raffle.description && <p className="mt-1 whitespace-pre-line text-muted">{raffle.description}</p>}
            <dl className="mt-5 grid grid-cols-2 gap-4 text-base md:grid-cols-4">
              <div><dt className="text-sm text-muted">Premio</dt><dd className="font-semibold">{raffle.prize}</dd></div>
              <div><dt className="text-sm text-muted">Participar</dt><dd className="font-semibold">Gratis · hasta {max} {max === 1 ? 'número' : 'números'}</dd></div>
              <div><dt className="text-sm text-muted">Sorteo oficial</dt><dd className="font-semibold">{raffle.officialDraw}</dd></div>
              <div><dt className="text-sm text-muted">Se puede elegir hasta</dt><dd className="font-semibold">{fecha(raffle.closesAt)}</dd></div>
            </dl>
            <p className="mt-4 rounded-xl bg-canvas p-3 text-base"><span className="font-semibold">Cómo se gana: </span>{raffle.rule}. Ejemplo: si sale 8537, gana el {raffle.digits === 2 ? '37' : '8537'.slice(-raffle.digits)}.{raffle.unsold && <> Si nadie tiene ese número: {raffle.unsold.toLowerCase()}.</>}</p>
          </div>
        </div>

        <section className="rounded-3xl border border-line bg-surface p-5 md:p-6">
          <h2 className="mb-4 text-xl font-bold">Elegí tu número</h2>
          {open && (
            <ol className="mb-4 space-y-1.5 rounded-2xl bg-brand-50 p-4 text-base">
              <li><b>1.</b> Tocá un número <b className="text-free">verde</b> (o escribilo abajo).</li>
              <li><b>2.</b> Tocá <b>{max === 1 ? 'Confirmar mi número' : 'Confirmar mis números'}</b>.</li>
              <li><b>3.</b> ¡Listo! Ya participás. Es gratis.</li>
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
            </form>
          )}
          {searchMsg && <p className="mb-3 text-base font-medium" role="status">{searchMsg}</p>}
          <div className="mb-3"><GridLegend /></div>
          <NumberGrid total={raffle.totalNumbers} digits={raffle.digits} states={raffle.states} selected={selected} onToggle={open ? toggle : () => {}} />
          <p className="mt-3 text-sm text-muted">{c.available} libres · {c.paid + c.reserved} elegidos</p>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div id="tu-seleccion" className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-bold">Tu elección</h2>
          {chosen.length === 0 ? (
            <p className="mt-2 text-base text-muted">Tocá un número verde de la grilla.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {chosen.map((n) => (
                <button key={n} onClick={() => toggle(n)} className="rounded-xl bg-brand-600 px-3 py-1.5 text-xl font-bold text-white" aria-label={`Quitar ${pad(n, raffle.digits)}`}>
                  {pad(n, raffle.digits)} ×
                </button>
              ))}
            </div>
          )}
          {claimErr && <p role="alert" className="mt-4 rounded-xl bg-sold/10 p-3 text-base text-sold">{claimErr}</p>}
          {!open ? (
            <p className="mt-4 rounded-xl bg-canvas p-3 text-base">Este sorteo ya no recibe participantes.</p>
          ) : isExample ? (
            <p className="mt-4 rounded-xl bg-canvas p-3 text-base">Este es un sorteo de ejemplo.</p>
          ) : paused ? (
            <p className="mt-4 rounded-xl bg-sold/10 p-3 text-base text-sold">La app está pausada: por ahora no se pueden elegir números.</p>
          ) : !session ? (
            <Link to="/perfil" className="mt-4 block w-full rounded-2xl bg-brand-600 py-4 text-center text-lg font-bold text-white">Ingresá para participar</Link>
          ) : askContact ? (
            <ContactForm onSaved={() => { setAskContact(false); void claim(true) }} />
          ) : (
            <button onClick={() => claim()} disabled={busy || chosen.length === 0} className="mt-4 w-full rounded-2xl bg-brand-600 py-4 text-lg font-bold text-white disabled:cursor-not-allowed disabled:bg-brand-600/40">
              {busy ? 'Guardando…' : label}
            </button>
          )}
        </div>
      </aside>

      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-[68px] z-10 border-t border-line bg-surface px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,.06)] lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-base">Elegiste <b>{chosen.map((n) => pad(n, raffle.digits)).join(', ')}</b></span>
            {canClaim && !askContact
              ? <button onClick={() => claim()} disabled={busy} className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-base font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Confirmar'}</button>
              : <a href="#tu-seleccion" className="shrink-0 rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">Seguir</a>}
          </div>
        </div>
      )}
    </div>
  )
}
