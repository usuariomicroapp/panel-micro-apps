import { useEffect, useState } from 'react'
import { enablePush, pushState, useInstall, type PushState } from '../lib/pwa'
import { useAuth } from '../lib/auth'

const btn = 'rounded-2xl btn-gold px-5 py-3 text-lg font-bold'

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Compartir">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Instalar la app en el celular. En iPhone se explica a mano porque Safari no tiene botón.
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const { installed, canPrompt, ios, prompt } = useInstall()
  if (installed || (!canPrompt && !ios)) return null
  return (
    <section className="rounded-3xl border-2 border-brand-200 bg-brand-50 p-5">
      <div className="flex items-center gap-4">
        <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
        <div>
          <h2 className="text-lg font-bold">Instalá la app en tu celular</h2>
          {!compact && <p className="text-base text-muted">Queda como un ícono en la pantalla y te avisa si ganás.</p>}
        </div>
      </div>
      {canPrompt ? (
        <button onClick={prompt} className={`${btn} mt-4 w-full`}>Instalar app</button>
      ) : (
        <ol className="mt-4 list-decimal space-y-2 pl-6 text-base">
          <li>Abrí esta página con <b>Safari</b>.</li>
          <li>Tocá el botón <b>Compartir</b> <ShareIcon /> (abajo en el medio).</li>
          <li>Elegí <b>“Agregar a inicio”</b> y después <b>“Agregar”</b>.</li>
        </ol>
      )}
    </section>
  )
}

// Activar los avisos en este celular.
export function PushCard() {
  const { session } = useAuth()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')) }, [])
  if (!session || !state || state === 'unsupported') return null

  const turnOn = async () => {
    setBusy(true); setError('')
    try { setState(await enablePush()) } catch { setError('No se pudieron activar los avisos. Probá de nuevo en un rato.') }
    setBusy(false)
  }
  return (
    <section className="card rounded-3xl p-5">
      <h2 className="text-lg font-bold">🔔 Avisos en este celular</h2>
      {state === 'on' && <p className="mt-2 text-base text-free">Activados. Te vamos a avisar si ganás o si cambia el día de un sorteo.</p>}
      {state === 'off' && (
        <>
          <p className="mt-2 text-base">Activalos para enterarte al instante si ganás, aunque tengas la app cerrada.</p>
          <button onClick={turnOn} disabled={busy} className={`${btn} mt-4 w-full`}>{busy ? 'Activando…' : 'Activar avisos'}</button>
        </>
      )}
      {state === 'needs-install' && <p className="mt-2 text-base">En iPhone, los avisos funcionan cuando la app está instalada. Instalala con los pasos de arriba y abrila desde el ícono.</p>}
      {state === 'denied' && <p className="mt-2 text-base">Los avisos están bloqueados. Para activarlos: Ajustes del celular → Notificaciones → buscá esta app (o el navegador) → Permitir.</p>}
      {error && <p className="mt-2 text-base text-sold">{error}</p>}
    </section>
  )
}
