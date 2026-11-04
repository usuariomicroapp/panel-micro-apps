import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { pesos } from '../../lib/format'
import { Card } from '../../components/ui'

interface Stats {
  raffles: number
  participants: number
  sold: number
  reserved: number
  collected: number
  pending: number
  expenses: number
  costs: number
}

async function count(table: string, filter?: (q: any) => any) {
  let q: any = supabase!.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count: c } = await q
  return c ?? 0
}

async function sum(table: string, column: string, filter?: (q: any) => any) {
  let q: any = supabase!.from(table).select(column)
  if (filter) q = filter(q)
  const { data } = await q
  return ((data ?? []) as Record<string, number | string | null>[]).reduce((acc, r) => acc + Number(r[column] ?? 0), 0)
}

export default function Overview() {
  const [s, setS] = useState<Stats | null>(null)

  useEffect(() => {
    void (async () => {
      const [raffles, participants, sold, reserved, collected, pending, expenses, costs] = await Promise.all([
        count('raffles'),
        count('profiles', (q) => q.eq('role', 'participant')),
        count('raffle_numbers', (q) => q.eq('state', 'paid')),
        count('raffle_numbers', (q) => q.eq('state', 'reserved')),
        sum('payments', 'amount', (q) => q.eq('status', 'approved')),
        sum('payments', 'amount', (q) => q.eq('status', 'pending')),
        sum('expenses', 'amount'),
        supabase!.rpc('admin_products').then(({ data }) => ((data ?? []) as { acquisition_cost: number | null }[]).reduce((a, p) => a + Number(p.acquisition_cost ?? 0), 0)),
      ])
      setS({ raffles, participants, sold, reserved, collected, pending, expenses, costs })
    })()
  }, [])

  const tiles: [string, string, string?][] = s
    ? [
        ['Sorteos', String(s.raffles)],
        ['Participantes', String(s.participants)],
        ['Números vendidos', String(s.sold), 'Pagados y aprobados'],
        ['Números reservados', String(s.reserved), 'No son ventas todavía'],
        ['Cobrado y verificado', pesos(s.collected), 'Solo pagos aprobados'],
        ['Pagos pendientes', pesos(s.pending), 'Aún no es dinero recibido'],
        ['Gastos registrados', pesos(s.expenses)],
        ['Resultado', pesos(s.collected - s.expenses - s.costs), 'Cobrado − gastos − costo de premios'],
      ]
    : []

  return (
    <Card title="Resumen">
      {!s ? (
        <p className="text-muted">Cargando estadísticas…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map(([k, v, hint]) => (
            <div key={k} className="rounded-2xl border border-line p-4">
              <p className="text-xs text-muted">{k}</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums md:text-2xl">{v}</p>
              {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
