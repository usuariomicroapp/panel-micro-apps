import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RaffleImage from '../components/RaffleImage'
import { InstallCard } from '../components/AppSetup'
import { useAuth } from '../lib/auth'
import { fecha } from '../lib/format'
import { drawMoment, hasDeadline, slotLabels, slotTimes, dmy } from '../lib/data'
import { countView, usePublicRaffles, type RaffleView } from '../lib/publicRaffles'
import ShareBox, { useInviteMessage } from '../components/ShareBox'

const two = (n: number) => String(Math.max(0, n)).padStart(2, '0')

// Cuenta regresiva hasta el cierre del sorteo.
function useCountdown(iso: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = Math.max(0, new Date(iso).getTime() - now)
  const s = Math.floor(ms / 1000)
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, done: ms === 0 }
}

const drawText = (r: RaffleView) => {
  if (!r.drawDate || !r.drawSlot) return 'Quiniela de la Ciudad · día a definir'
  return `Quiniela de la Ciudad · ${slotLabels[r.drawSlot].split(' ·')[0]} · ${dmy(r.drawDate)} ${slotTimes[r.drawSlot]}`
}

function Featured({ r }: { r: RaffleView }) {
  const c = countView(r)
  const taken = c.paid + c.reserved
  const pct = Math.round((taken / r.totalNumbers) * 100)
  const target = r.drawDate && r.drawSlot ? drawMoment(r.drawDate, r.drawSlot).toISOString() : r.closesAt
  const t = useCountdown(target)
  const cells: [number, string][] = t.days > 0 ? [[t.days, t.days === 1 ? 'Día' : 'Días'], [t.hours, 'Horas'], [t.minutes, 'Minutos']] : [[t.hours, 'Horas'], [t.minutes, 'Minutos'], [t.seconds, 'Segundos']]
  return (
    <Link to={`/sorteo/${r.id}`} className="navycard block overflow-hidden rounded-[28px] p-5 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="label inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[#f6e0a4]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f6e0a4]" />{r.raffleNo ? `Sorteo N° ${r.raffleNo}` : 'Sorteo destacado'}
        </span>
        {r.isDemo && <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-night">Prueba</span>}
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-2 md:items-center">
        <div className="overflow-hidden rounded-2xl shadow-[0_20px_30px_-20px_#000]">
          <RaffleImage raffle={r} className="aspect-[16/10] w-full" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl">{r.prize || r.name}</h1>
          <p className="mt-1.5 text-sm text-[#aab3d6]">{drawText(r)}</p>
          {!t.done && hasDeadline(target) && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {cells.map(([v, l]) => (
                <div key={l} className="rounded-2xl border border-white/10 bg-white/5 py-2.5 text-center">
                  <div className="gold-text font-display text-3xl font-bold tabular-nums">{two(v)}</div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[#8f98bf]">{l}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-between text-sm font-bold">
            <span className="text-[#c9d0ee]">{taken} de {r.totalNumbers} números elegidos</span>
            <span className="text-[#5fe0ad]">{c.available} libres</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#9c7529] to-[#f6e0a4] shadow-[0_0_10px_#d4ac5688]" style={{ width: `${pct}%` }} />
          </div>
          <span className="btn-gold mt-5 block rounded-2xl py-4 text-center text-lg font-extrabold">{r.status === 'active' ? 'Elegir mi número' : 'Ver sorteo'}</span>
        </div>
      </div>
    </Link>
  )
}

function RaffleRow({ r }: { r: RaffleView }) {
  const c = countView(r)
  return (
    <Link to={`/sorteo/${r.id}`} className="card flex items-center gap-4 rounded-2xl p-3 transition hover:-translate-y-0.5">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
        <RaffleImage raffle={r} className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        {r.raffleNo && <p className="label text-gold-dark">Sorteo N° {r.raffleNo}</p>}
        <h2 className="truncate text-lg font-extrabold">{r.prize || r.name}</h2>
        <p className="text-sm text-muted">{r.status !== 'active' ? r.statusLabel : hasDeadline(r.closesAt) ? `Hasta ${fecha(r.closesAt)}` : 'Día del sorteo a definir'}</p>
      </div>
      <div className="pr-2 text-right">
        <p className="font-display text-2xl font-bold text-free">{c.available}</p>
        <p className="text-xs font-semibold text-muted">libres</p>
      </div>
    </Link>
  )
}

export default function Home() {
  const { loading, error, data } = usePublicRaffles()
  const { isAdmin } = useAuth()
  const [first, ...rest] = data
  return (
    <div className="space-y-6">
      {loading && <p className="py-16 text-center text-muted">Cargando sorteos…</p>}
      {error && <p className="rounded-2xl bg-sold/10 p-4 text-center text-sm text-sold">{error}</p>}
      {!loading && !error && data.length === 0 && (
        <div className="navycard rounded-[28px] p-8 text-center">
          <h1 className="font-display text-3xl font-bold">Elegí tu número de la suerte</h1>
          <p className="mx-auto mt-2 max-w-md text-[#aab3d6]">Todavía no hay sorteos publicados. Cuando se publique uno, lo vas a ver acá.</p>
          {isAdmin && <Link to="/admin?tab=sorteos" className="btn-gold mt-6 inline-block rounded-2xl px-6 py-3.5 font-extrabold">Crear un sorteo</Link>}
        </div>
      )}

      {first && <Featured r={first} />}
      <InstallCard compact />

      {rest.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-extrabold">Más sorteos</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {rest.map((r) => <RaffleRow key={r.id} r={r} />)}
          </div>
        </section>
      )}
      {!isAdmin && <InviteOthers />}
      <p className="text-center text-sm text-muted">Cada sorteo usa las últimas cifras del 1.er premio de la Quiniela de la Ciudad.</p>
    </div>
  )
}

// Para que el participante invite a otras personas a los sorteos.
function InviteOthers() {
  const { link, message } = useInviteMessage()
  return <ShareBox title="Invitá a otras personas" text="¿Conocés a alguien que quiera participar? Mandale este link para que instale la app y elija su número." message={message} link={link} button="Invitar" />
}
