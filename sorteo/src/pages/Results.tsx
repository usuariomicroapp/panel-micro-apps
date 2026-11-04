import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'
import { usePublicRaffles, type RaffleView } from '../lib/publicRaffles'
import { useQuiniela } from '../lib/quiniela'
import QuinielaBoard from '../components/QuinielaBoard'
import { dateAR, dmy, raffleLabel, slotLabels, slotTimes, type DrawSlot } from '../lib/data'
import { pad } from '../lib/format'
import Balls from '../components/Balls'
import Icon from '../components/Icon'

interface Result {
  organizer_id?: string | null
  raffle_id: string
  raffle_no: number | null
  raffle_name: string
  prize: string
  digits: number
  draw_date: string
  draw_slot: DrawSlot
  first_prize: string
  winning_number: number
  outcome: 'publicado' | 'desierto'
  winner_label: string
  is_mine: boolean
}

// Quiniela en vivo para los sorteos de hoy, y los resultados ya publicados.
export default function Results() {
  const { data: raffles } = usePublicRaffles()
  const { org } = useBrand()
  const [results, setResults] = useState<Result[] | null>(null)
  useEffect(() => {
    if (!supabase) return setResults([])
    supabase.rpc('public_results').then(({ data }) => setResults(((data ?? []) as Result[]).filter((r) => !org || !r.organizer_id || r.organizer_id === org)))
  }, [org])

  const today = dateAR()
  const todays = raffles.filter((r) => !r.isDemo && r.status === 'active' && r.drawDate === today && r.drawSlot)
  // Un tablero por turno (si dos sorteos usan la misma Quiniela, se ve una sola vez).
  const slots = [...new Set(todays.map((r) => r.drawSlot as DrawSlot))]
  const mine = results?.filter((r) => r.is_mine) ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="label text-gold-dark">Quiniela de la Ciudad</p>
        <h1 className="font-display text-3xl font-bold">Resultados</h1>
      </div>

      {mine.map((r) => (
        <div key={r.raffle_id} className="pop-in rounded-3xl bg-gradient-to-br from-[#f7e3aa] via-[#d4ac56] to-[#b38a3a] p-5 text-[#2a1d05] shadow-[0_24px_34px_-18px_#d4ac5699,inset_0_1px_0_#fff9]">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#2a1d0514]"><Icon name="trophy" className="h-8 w-8" /></span>
            <div>
              <p className="label">¡Ganaste!</p>
              <h2 className="font-display text-2xl font-bold leading-tight">{r.prize || r.raffle_name}</h2>
            </div>
          </div>
          <p className="mt-3 text-lg">Salió tu número <b>{pad(r.winning_number, r.digits)}</b>. El organizador se va a comunicar con vos para la entrega.</p>
        </div>
      ))}

      {slots.map((slot) => <LiveToday key={slot} slot={slot} raffles={todays.filter((r) => r.drawSlot === slot)} />)}

      {results && results.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">Últimos resultados</h2>
          {results.map((r) => (
            <article key={r.raffle_id} className="card rounded-3xl p-5">
              <p className="label text-gold-dark">{raffleLabel({ name: r.raffle_name, raffle_no: r.raffle_no })}</p>
              <p className="text-sm text-muted">Quiniela de la Ciudad · {slotLabels[r.draw_slot]} del {dmy(r.draw_date)}</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">1.er premio</p>
                  <p className="text-2xl font-bold tabular-nums">{r.first_prize}</p>
                </div>
                <div className="text-right">
                  <p className="mb-1.5 text-sm text-muted">Número ganador</p>
                  <Balls value={pad(r.winning_number, r.digits)} gold={r.digits} size="sm" />
                </div>
              </div>
              <p className="mt-3 text-lg">{r.outcome === 'publicado' ? <>Ganó: <b>{r.is_mine ? 'vos' : r.winner_label}</b></> : 'Nadie tenía ese número: quedó desierto.'}</p>
            </article>
          ))}
        </section>
      ) : results && !slots.length ? (
        <div className="card rounded-3xl p-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gold/15 text-gold-dark"><Icon name="trophy" className="h-8 w-8" /></div>
          <h2 className="mt-4 text-lg font-bold">Todavía no hay resultados</h2>
          <p className="mt-1 text-base text-muted">El día del sorteo, acá vas a ver la Quiniela en vivo y el número ganador.</p>
        </div>
      ) : null}

      <section className="card rounded-3xl p-5">
        <h2 className="text-lg font-extrabold">Horarios de la Quiniela de la Ciudad</h2>
        <p className="text-sm text-muted">De lunes a sábado.</p>
        <ul className="mt-3 divide-y divide-line text-base">
          {(Object.keys(slotTimes) as DrawSlot[]).map((s) => (
            <li key={s} className="flex justify-between py-2"><span>{slotLabels[s].split(' ·')[0]}</span><span className="font-semibold tabular-nums">{slotTimes[s]}</span></li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function LiveToday({ slot, raffles }: { slot: DrawSlot; raffles: RaffleView[] }) {
  const live = useQuiniela(dateAR(), slot)
  return (
    <section className="space-y-3">
      <div className="card rounded-2xl p-4">
        <p className="text-base font-bold">Hoy a las {slotTimes[slot]} se sortea:</p>
        <ul className="mt-1 text-base">
          {raffles.map((r) => <li key={r.id}><Link to={`/sorteo/${r.id}`} className="font-semibold text-brand-700 underline">{raffleLabel({ name: r.name, raffle_no: r.raffleNo })}</Link></li>)}
        </ul>
      </div>
      <QuinielaBoard live={live} digits={raffles[0].digits} />
      <p className="text-sm text-muted">El ganador se confirma cuando el organizador lo publica.</p>
    </section>
  )
}
