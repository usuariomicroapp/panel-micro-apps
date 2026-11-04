import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui'

interface Log { id: number; actor: string | null; action: string; table_name: string | null; record_id: string | null; at: string }

const tables: Record<string, string> = {
  products: 'Producto', raffles: 'Sorteo', settings: 'Configuración',
  reservations: 'Números elegidos', lottery_draws: 'Resultado oficial', winners: 'Ganador',
  expenses: 'Gasto', profiles: 'Perfil',
}
const actions: Record<string, string> = { insert: 'creó', update: 'modificó', delete: 'eliminó' }

export default function History() {
  const [logs, setLogs] = useState<Log[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [page, setPage] = useState(0)
  const size = 30

  useEffect(() => {
    supabase!.from('audit_logs').select('id, actor, action, table_name, record_id, at').order('at', { ascending: false })
      .range(page * size, page * size + size - 1).then(async ({ data }) => {
        const rows = (data ?? []) as Log[]
        const ids = [...new Set(rows.map((r) => r.actor).filter(Boolean))] as string[]
        if (ids.length) {
          const { data: ps } = await supabase!.from('profiles').select('id, first_name, last_name, email').in('id', ids)
          setNames(Object.fromEntries((ps ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`.trim() || p.email])))
        }
        setLogs(rows)
      })
  }, [page])

  return (
    <Card title="Historial de operaciones">
      <p className="mb-4 text-sm text-muted">Registro automático e inalterable: nadie puede editarlo ni borrarlo.</p>
      {!logs ? <p className="text-muted">Cargando…</p> : logs.length === 0 ? <p className="text-sm text-muted">Sin operaciones todavía.</p> : (
        <ul className="divide-y divide-line text-sm">
          {logs.map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2.5">
              <span>
                <b>{l.actor ? names[l.actor] ?? 'Usuario ' + l.actor.slice(0, 8) : 'Sistema'}</b> {actions[l.action] ?? l.action} {tables[l.table_name ?? ''] ?? l.table_name}
                {l.record_id && <span className="text-muted"> · {l.record_id.slice(0, 8)}</span>}
              </span>
              <span className="tabular-nums text-muted">{new Date(l.at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex gap-3 text-sm font-semibold">
        {page > 0 && <button onClick={() => setPage(page - 1)} className="text-brand-600">← Más nuevos</button>}
        {logs && logs.length === size && <button onClick={() => setPage(page + 1)} className="text-brand-600">Más viejos →</button>}
      </div>
    </Card>
  )
}
