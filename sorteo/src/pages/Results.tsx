import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePublicRaffles, type RaffleView } from '../lib/publicRaffles'
import { useQuiniela } from '../lib/quiniela'
import QuinielaBoard from '../components/QuinielaBoard'
import { dateAR, dmy, raffleLabel, slotLabels, slotTimes, type DrawSlot } from '../lib/data'
import { pad } from '../lib/format'

interface Result {
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
  const [results, setResults] = useState<Result[] | null>(null)
  useEffect(() => {
    if (!supabase) return setResults([])
    supabase.rpc('public_results').then(({ data }) => setResults((data ?? []) as Result[]))
  }, [])

  const today = dateAR()
  const todays = raffles.filter((r) => !r.isDemo && r.status === 'active' && r.drawDate === today && r.drawSlot)
  // Un tablero por turno (si dos sorteos usan la misma Quiniela, se ve una sola vez).
  const slots = [...new Set(todays.map((r) => r.drawSlot as DrawSlot))]
  const mine = results?.filter((r) => r.is_mine) ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold">Resultados</h1>

      {mine.map((r) => (
        <div key={r.raffle_id} className="rounded-3xl border-2 border-free bg-free/10 p-5 text-center">
          <p className="text-4xl" aria-hidden="true">🎉</p>
          <h2 className="mt-2 text-2xl font-extrabold">¡Ganaste {r.prize || r.raffle_name}!</h2>
          <p className="mt-1 text-lg">Salió tu número <b>{pad(r.winning_number, r.digits)}</b>. El organizador se va a comunicar con vos.</p>
        </div>
      ))}

      {slots.map((slot) => <LiveToday key={slot} slot={slot} raffles={todays.filter((r) => r.drawSlot === slot)} />)}

      {results && results.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Últimos resultados</h2>
          {results.map((r) => (
            <article key={r.raffle_id} className="rounded-3xl border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-brand-600">{raffleLabel({ name: r.raffle_name, raffle_no: r.raffle_no })}</p>
              <p className="text-sm text-muted">Quiniela de la Ciudad · {slotLabels[r.draw_slot]} del {dmy(r.draw_date)}</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">1.er premio</p>
                  <p className="text-2xl font-bold tabular-nums">{r.first_prize}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted">Número ganador</p>
                  <p className="text-4xl font-extrabold tabular-nums text-brand-700">{pad(r.winning_number, r.digits)}</p>
                </div>
              </div>
              <p className="mt-3 text-lg">{r.outcome === 'publicado' ? <>Ganó: <b>{r.is_mine ? 'vos' : r.winner_label}</b></> : 'Nadie tenía ese número: quedó desierto.'}</p>
            </article>
          ))}
        </section>
      ) : results && !slots.length ? (
        <div className="rounded-3xl border border-line bg-surface p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl">🎯</div>
          <h2 className="mt-4 text-lg font-bold">Todavía no hay resultados</h2>
          <p className="mt-1 text-base text-muted">El día del sorteo, acá vas a ver la Quiniela en vivo y el número ganador.</p>
        </div>
      ) : null}

      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-bold">Horarios de la Quiniela de la Ciudad</h2>
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
      <div className="rounded-2xl bg-brand-50 p-4">
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
