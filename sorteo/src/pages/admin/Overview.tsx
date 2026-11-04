import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon, { type IconName } from '../../components/Icon'

interface Stats { raffles: number; active: number; participants: number; taken: number; accounts: number; pushes: number; // sorteos realizados
  main: { name: string; raffle_no: number | null; total_numbers: number; taken: number } | null }

async function count(table: string, filter?: (q: any) => any) {
  let q: any = supabase!.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count: c } = await q
  return c ?? 0
}

export default function Overview() {
  const [s, setS] = useState<Stats | null>(null)

  useEffect(() => {
    void (async () => {
      const [raffles, active, taken, accounts, entries, drawn, mainRes] = await Promise.all([
        count('raffles'),
        count('raffles', (q) => q.eq('status', 'active')),
        count('raffle_numbers', (q) => q.neq('state', 'available')),
        count('profiles', (q) => q.eq('role', 'participant')),
        supabase!.from('reservations').select('user_id, buyer_name, buyer_phone').eq('status', 'approved'),
        count('raffles', (q) => q.eq('status', 'drawn')),
        supabase!.from('raffles').select('id, name, raffle_no, total_numbers').eq('status', 'active').order('closes_at').limit(1),
      ])
      const m = ((mainRes.data ?? []) as { id: string; name: string; raffle_no: number | null; total_numbers: number }[])[0]
      const mainTaken = m ? await count('raffle_numbers', (q) => q.eq('raffle_id', m.id).neq('state', 'available')) : 0
      const people = new Set(((entries.data ?? []) as { user_id: string | null; buyer_name: string | null; buyer_phone: string | null }[])
        .map((r) => r.user_id ?? `p:${(r.buyer_name ?? '').toLowerCase()}${r.buyer_phone ?? ''}`))
      setS({ raffles, active, participants: people.size, taken, accounts, pushes: drawn, main: m ? { ...m, taken: mainTaken } : null })
    })()
  }, [])

  if (!s) return <section className="card rounded-3xl p-6"><p className="text-muted">Cargando estadísticas…</p></section>

  const tiles: [IconName, string, number][] = [
    ['users', 'Participantes', s.participants],
    ['ticket', 'Sorteos activos', s.active],
    ['trophy', 'Sorteos realizados', s.pushes],
    ['chart', 'Números elegidos', s.taken],
    ['calendar', 'Sorteos en total', s.raffles],
    ['user', 'Cuentas registradas', s.accounts],
  ]
  const m = s.main
  const pct = m ? Math.round((m.taken / m.total_numbers) * 100) : 0

  return (
    <div className="space-y-4">
      {m && (
        <section className="card flex items-center gap-5 rounded-3xl p-5 md:p-6">
          <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full shadow-[0_0_24px_#d4ac5633]"
            style={{ background: `conic-gradient(#9c7529, #f6e0a4 ${pct}%, #ffffff14 ${pct}% 100%)` }}>
            <div className="grid h-[5.6rem] w-[5.6rem] place-items-center rounded-full bg-[radial-gradient(circle_at_50%_30%,#1b2550,#0c1226)] text-center text-white shadow-[inset_0_2px_6px_#0008]">
              <div><div className="font-display text-3xl font-bold">{pct}%</div><div className="text-[10px] font-bold uppercase tracking-widest text-[#8f98bf]">elegidos</div></div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted">{m.raffle_no ? `Sorteo N° ${m.raffle_no} · ` : ''}{m.name}</p>
            <p className="font-display text-3xl font-bold">{m.taken} <span className="text-lg text-muted">de {m.total_numbers}</span></p>
            <p className="mt-1 text-sm font-bold text-free">{m.total_numbers - m.taken} números libres</p>
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map(([icon, k, v]) => (
          <div key={k} className="card rounded-2xl p-4">
            <Icon name={icon} className="h-5 w-5 text-gold-dark" />
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">{v}</p>
            <p className="text-sm text-muted">{k}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
