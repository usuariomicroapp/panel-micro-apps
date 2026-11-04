import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ComingSoon from '../components/ComingSoon'
import { useAuth, daysLeft } from '../lib/auth'
import { isConfigured } from '../lib/supabase'
import Overview from './admin/Overview'
import Settings from './admin/Settings'
import History from './admin/History'
import Products from './admin/Products'
import Raffles from './admin/Raffles'
import Participants from './admin/Participants'
import Owner from './admin/Owner'
import DrawDay from './admin/DrawDay'
import PasswordReset from './admin/PasswordReset'
import ShareBox, { useInviteMessage } from '../components/ShareBox'
import { ProfileCard } from './Profile'
import { InstallCard, PushCard } from '../components/AppSetup'

import Icon, { type IconName } from '../components/Icon'

// Botones grandes del panel. Resumen, Configuración e Historial van dentro de "Mi perfil".
const mainTabs: { id: string; label: string; icon: IconName }[] = [
  { id: 'sorteos', label: 'Sorteos', icon: 'ticket' },
  { id: 'dia', label: 'Día del sorteo', icon: 'calendar' },
  { id: 'participantes', label: 'Participantes', icon: 'users' },
  { id: 'productos', label: 'Productos de tienda', icon: 'gift' },
]
// Dentro de Perfil: mis datos, el negocio (nombre y foto), resumen e historial.
const profileTabs: { id: string; label: string; hint: string; icon: IconName }[] = [
  { id: 'configuracion', label: 'Mi negocio', hint: 'Nombre, foto o logo y mensajes', icon: 'shield' },
  { id: 'resumen', label: 'Resumen', hint: 'Cómo van tus sorteos e invitar gente', icon: 'chart' },
  { id: 'historial', label: 'Historial', hint: 'Todo lo que se hizo en tu panel', icon: 'bell' },
]


export default function Admin() {
  const { ready, canManage, isOwner, viewAsBuyer, setViewAsBuyer, profile } = useAuth()
  const left = daysLeft(profile?.organizer_until)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'sorteos'
  // El dueño tiene dos paneles: el de administrador (clientes y ventas) y el de usuario (sus propios sorteos).
  const mode = usePanelMode(params.get('modo'))
  const inProfile = tab === 'perfil' || profileTabs.some((t) => t.id === tab)
  const section = profileTabs.find((t) => t.id === tab)

  if (!isConfigured) {
    return <ComingSoon stage={3}>El panel se activa cuando la app está conectada a la base de datos.</ComingSoon>
  }
  if (!ready) return <p className="py-20 text-center text-muted">Cargando…</p>
  if (canManage && viewAsBuyer) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-muted">Estás viendo la app como participante.</p>
        <button onClick={() => setViewAsBuyer(false)} className="mt-6 rounded-2xl btn-gold px-6 py-3 font-bold">Volver a mi panel</button>
      </div>
    )
  }
  if (!canManage && profile?.role === 'admin') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Tu período de prueba terminó</h1>
        <p className="mt-2 text-muted">Tus sorteos y productos siguen guardados. Escribile al dueño de la app para seguir usando tu panel.</p>
      </div>
    )
  }
  if (!canManage) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-extrabold">Panel privado</h1>
        <p className="mt-2 text-muted">Solo el administrador puede entrar acá.</p>
        <Link to="/perfil" className="mt-6 inline-block rounded-2xl btn-gold px-6 py-3 font-bold">Ingresar</Link>
      </div>
    )
  }

  if (isOwner && mode !== 'usuario') {
    return (
      <div className="space-y-5">
        <PanelSwitch mode="admin" />
        <div>
          <p className="label text-gold-dark">Panel administrador</p>
          <h1 className="font-display text-3xl font-bold">Mi negocio</h1>
        </div>
        <Owner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {isOwner && <PanelSwitch mode="usuario" />}
      <div>
        <p className="label text-gold-dark">{isOwner ? 'Panel usuario' : 'Panel del organizador'}</p>
        <h1 className="font-display text-3xl font-bold">Administración</h1>
        {left !== null && <p className="mt-2 rounded-xl bg-gold/15 px-3 py-2 text-sm font-semibold text-gold-dark">Período de prueba: {left === 0 ? 'hoy es el último día' : left === 1 ? 'te queda 1 día' : `te quedan ${left} días`}.</p>}
      </div>
      {inProfile ? (
        <div className="space-y-4">
          <button onClick={() => setParams({ tab: section ? 'perfil' : 'sorteos' })}
            className="card flex items-center gap-2 rounded-full px-4 py-2.5 text-base font-extrabold text-ink">
            <Icon name="back" className="h-5 w-5" />{section ? 'Volver a Perfil' : 'Volver al panel'}
          </button>
          <h2 className="font-display text-2xl font-bold">{section ? section.label : 'Perfil'}</h2>
          {!section && (
            <>
              <ProfileCard />
              <div className="space-y-3">
                {profileTabs.map((t) => (
                  <button key={t.id} onClick={() => setParams({ tab: t.id })}
                    className="card flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold/15 text-gold-dark"><Icon name={t.icon} /></span>
                    <span className="flex-1"><span className="block text-lg font-extrabold">{t.label}</span><span className="block text-sm text-muted">{t.hint}</span></span>
                    <span aria-hidden className="text-2xl text-muted">›</span>
                  </button>
                ))}
              </div>
              <InstallCard />
              <PushCard />
            </>
          )}
        </div>
      ) : (
        <nav className="space-y-3">
          <button onClick={() => setParams({ tab: 'perfil' })}
            className="card flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-lg font-extrabold text-ink">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/15 text-gold-dark"><Icon name="user" /></span>
            <span className="flex-1">Perfil<span className="block text-xs font-semibold opacity-75">Mis datos · Mi negocio · Resumen · Historial</span></span>
            <span aria-hidden className="text-2xl">›</span>
          </button>
          <div className="grid grid-cols-2 gap-3">
            {mainTabs.map((t) => (
              <button key={t.id} onClick={() => setParams({ tab: t.id })}
                className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl px-2 py-4 text-center text-base font-extrabold leading-tight ${tab === t.id ? 'btn-gold' : 'card text-ink'}`}>
                <span className={`grid h-11 w-11 place-items-center rounded-full ${tab === t.id ? 'bg-night/15' : 'bg-gold/15 text-gold-dark'}`}><Icon name={t.icon} /></span>
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
      {tab === 'resumen' && <><InviteParticipants /><Overview /></>}
      {tab === 'dia' && <DrawDay />}
      {tab === 'sorteos' && <Raffles />}
      {tab === 'participantes' && <><Participants /><PasswordReset /></>}
      {tab === 'productos' && <Products />}
      {tab === 'configuracion' && <Settings />}
      {tab === 'historial' && <History />}
    </div>
  )
}

// Link para que los participantes instalen la app y elijan su número.
function InviteParticipants() {
  const { link, message } = useInviteMessage()
  return <ShareBox title="Invitar participantes" text="Mandá este link para que instalen la app y elijan su número." message={message} link={link} />
}

const MODE_KEY = 'sorteo-panel-modo'
type Mode = 'admin' | 'usuario'
// Recuerda qué panel eligió el dueño, así los botones internos (?tab=...) no lo sacan de ahí.
function usePanelMode(fromUrl: string | null): Mode {
  const [mode, setMode] = useState<Mode>(() => {
    if (fromUrl === 'admin' || fromUrl === 'usuario') return fromUrl
    try { return localStorage.getItem(MODE_KEY) === 'usuario' ? 'usuario' : 'admin' } catch { return 'admin' }
  })
  useEffect(() => {
    if (fromUrl !== 'admin' && fromUrl !== 'usuario') return
    setMode(fromUrl)
    try { localStorage.setItem(MODE_KEY, fromUrl) } catch { /* sin almacenamiento */ }
  }, [fromUrl])
  return mode
}

// Selector de panel, solo para el dueño.
function PanelSwitch({ mode }: { mode: Mode }) {
  const opts: { id: Mode; label: string; hint: string }[] = [
    { id: 'admin', label: 'Panel administrador', hint: 'Clientes y ventas' },
    { id: 'usuario', label: 'Panel usuario', hint: 'Mis sorteos y productos' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-night/40 p-1.5">
      {opts.map((o) => (
        <Link key={o.id} to={o.id === 'usuario' ? '/admin?modo=usuario&tab=sorteos' : '/admin?modo=admin'}
          className={`rounded-xl px-2 py-3 text-center ${mode === o.id ? 'btn-gold' : 'text-ink'}`}>
          <span className="block text-base font-extrabold leading-tight">{o.label}</span>
          <span className="block text-xs font-semibold opacity-75">{o.hint}</span>
        </Link>
      ))}
    </div>
  )
}
