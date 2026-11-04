import { useEffect, useState } from 'react'
import { enablePush, hideInstall, pushState, useInstall, type PushState } from '../lib/pwa'
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
export function InstallCard(_: { compact?: boolean }) {
  const { installed, canPrompt, ios, prompt } = useInstall()
  const [steps, setSteps] = useState(false)
  if (installed || (!canPrompt && !ios)) return null
  return (
    <section className="card rounded-2xl px-3 py-2.5">
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
        <p className="min-w-0 flex-1 text-sm font-bold leading-tight">Instalá la app<span className="block font-normal text-muted">Te avisa si ganás</span></p>
        {canPrompt
          ? <button onClick={prompt} className="btn-gold shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold">Instalar</button>
          : <button onClick={() => setSteps(!steps)} className="btn-gold shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold">{steps ? 'Cerrar' : 'Cómo'}</button>}
        <button onClick={hideInstall} aria-label="Ya la tengo instalada, no mostrar más" title="Ya la tengo" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg text-muted">×</button>
      </div>
      {steps && (
        <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-sm">
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
      {state === 'on' && <p className="mt-2 text-base text-free">Activados. Te avisamos cuando haya un sorteo nuevo, si cambia el día y si ganás.</p>}
      {state === 'off' && (
        <>
          <p className="mt-2 text-base">Activalos para enterarte al instante cuando hay un sorteo nuevo y si ganás, aunque tengas la app cerrada.</p>
          <button onClick={turnOn} disabled={busy} className={`${btn} mt-4 w-full`}>{busy ? 'Activando…' : 'Activar avisos'}</button>
        </>
      )}
      {state === 'needs-install' && <p className="mt-2 text-base">En iPhone, los avisos funcionan cuando la app está instalada. Instalala (tocá «Cómo» arriba) y abrila desde el ícono.</p>}
      {state === 'denied' && <p className="mt-2 text-base">Los avisos están bloqueados. Para activarlos: Ajustes del celular → Notificaciones → buscá esta app (o el navegador) → Permitir.</p>}
      {error && <p className="mt-2 text-base text-sold">{error}</p>}
    </section>
  )
}

// Cartel grande para que el participante active los avisos (sorteos nuevos y si gana).
export function PushBanner() {
  const { session } = useAuth()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem('sorteo-avisos-luego') === '1' } catch { return false } })
  useEffect(() => { if (session) pushState().then(setState).catch(() => setState('unsupported')) }, [session])
  if (!session || later || !state || (state !== 'off' && state !== 'needs-install')) return null
  const turnOn = async () => {
    setBusy(true)
    try { setState(await enablePush()) } catch { /* se puede reintentar */ }
    setBusy(false)
  }
  const close = () => { setLater(true); try { sessionStorage.setItem('sorteo-avisos-luego', '1') } catch { /* sin almacenamiento */ } }
  return (
    <section className="mx-auto mt-4 w-full max-w-6xl px-4">
      <div className="relative rounded-3xl border-2 border-gold bg-gold/15 p-5">
        <button onClick={close} aria-label="Más tarde" className="absolute right-3 top-3 h-9 w-9 rounded-full text-xl text-muted">×</button>
        <p className="pr-8 text-xl font-extrabold">🔔 Activá los avisos</p>
        <p className="mt-1 text-base">Te avisamos al instante cuando hay un <b>sorteo nuevo</b> y si <b>ganaste</b>. Sin avisos te lo podés perder.</p>
        {state === 'off'
          ? <button onClick={turnOn} disabled={busy} className={`${btn} mt-4 w-full`}>{busy ? 'Activando…' : 'Sí, activar avisos'}</button>
          : <p className="mt-3 text-base font-semibold">En iPhone: primero instalá la app (Compartir → «Agregar a inicio») y abrila desde el ícono.</p>}
      </div>
    </section>
  )
}
