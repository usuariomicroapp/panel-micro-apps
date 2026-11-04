import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui'

interface Stats { raffles: number; active: number; participants: number; taken: number; accounts: number }

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
      const [raffles, active, taken, accounts, entries] = await Promise.all([
        count('raffles'),
        count('raffles', (q) => q.eq('status', 'active')),
        count('raffle_numbers', (q) => q.neq('state', 'available')),
        count('profiles', (q) => q.eq('role', 'participant')),
        supabase!.from('reservations').select('user_id, buyer_name, buyer_phone').eq('status', 'approved'),
      ])
      const people = new Set(((entries.data ?? []) as { user_id: string | null; buyer_name: string | null; buyer_phone: string | null }[])
        .map((r) => r.user_id ?? `p:${(r.buyer_name ?? '').toLowerCase()}${r.buyer_phone ?? ''}`))
      setS({ raffles, active, participants: people.size, taken, accounts })
    })()
  }, [])

  const tiles: [string, number, string?][] = s
    ? [
        ['Sorteos', s.raffles],
        ['Sorteos activos', s.active],
        ['Participantes', s.participants, 'Con al menos un número elegido'],
        ['Números elegidos', s.taken],
        ['Cuentas registradas', s.accounts],
      ]
    : []

  return (
    <Card title="Resumen">
      {!s ? (
        <p className="text-muted">Cargando estadísticas…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {tiles.map(([k, v, hint]) => (
            <div key={k} className="rounded-2xl border border-line p-4">
              <p className="text-xs text-muted">{k}</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{v}</p>
              {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
