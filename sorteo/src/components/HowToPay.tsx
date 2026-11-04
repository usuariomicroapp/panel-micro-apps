import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { pesos } from '../lib/format'

interface Method { id: string; label: string; alias: string; cbu: string; holder: string; instructions: string }

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* el navegador no deja copiar: se puede seleccionar a mano */ }
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="select-all break-all text-base font-bold">{value}</p>
      </div>
      <button type="button" onClick={copy} className="shrink-0 rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm">{copied ? 'Copiado' : 'Copiar'}</button>
    </div>
  )
}

// Muestra a dónde y cuánto transferir por los números elegidos.
// Los datos los carga el organizador en su perfil; la base solo los entrega con las ventas habilitadas.
export default function HowToPay({ total, isDemo }: { total: number; isDemo: boolean }) {
  const { session, canManage } = useAuth()
  const [methods, setMethods] = useState<Method[] | null>(null)

  useEffect(() => {
    if (!supabase || !session) return
    supabase.from('payment_methods').select('id, label, alias, cbu, holder, instructions').eq('active', true).order('position')
      .then(({ data }) => setMethods((data ?? []) as Method[]))
  }, [session])

  return (
    <div className="mt-5 rounded-2xl border border-line p-4">
      <h3 className="text-lg font-bold">Cómo pagar</h3>
      <p className="mt-1 text-base">Total a transferir: <b>{pesos(total)}</b></p>
      {!session ? (
        <p className="mt-2 text-sm text-muted"><Link to="/perfil" className="font-semibold text-brand-600">Ingresá</Link> para ver los datos de la cuenta.</p>
      ) : methods === null ? (
        <p className="mt-2 text-sm text-muted">Cargando…</p>
      ) : methods.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {isDemo ? 'Este es un sorteo de prueba: no se muestran datos para transferir.' : 'Los datos de pago aparecen cuando las ventas estén habilitadas.'}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {isDemo && <p className="rounded-xl bg-gold/30 p-3 text-sm font-semibold">Sorteo de prueba: no transfieras dinero real.</p>}
          {canManage && <p className="text-xs text-muted">Así lo ve el comprador.</p>}
          {methods.map((m) => (
            <div key={m.id} className="space-y-2">
              <p className="font-semibold">{m.label}</p>
              {m.alias && <CopyRow label="Alias" value={m.alias} />}
              {m.cbu && <CopyRow label="CBU / CVU" value={m.cbu} />}
              {m.holder && <p className="text-sm">Titular: <b>{m.holder}</b></p>}
              {m.instructions && <p className="whitespace-pre-line text-sm text-muted">{m.instructions}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
