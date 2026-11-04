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

import Icon, { type IconName } from '../components/Icon'

// Botones grandes del panel. Resumen, Configuración e Historial van dentro de "Mi perfil".
const mainTabs: { id: string; label: string; icon: IconName }[] = [
  { id: 'sorteos', label: 'Sorteos', icon: 'ticket' },
  { id: 'dia', label: 'Día del sorteo', icon: 'calendar' },
  { id: 'participantes', label: 'Participantes', icon: 'users' },
  { id: 'productos', label: 'Productos de tienda', icon: 'gift' },
]
const profileTabs = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'configuracion', label: 'Configuración' },
  { id: 'historial', label: 'Historial' },
]


export default function Admin() {
  const { ready, canManage, isOwner, viewAsBuyer, setViewAsBuyer, profile } = useAuth()
  const left = daysLeft(profile?.organizer_until)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'sorteos'
  const inProfile = profileTabs.some((t) => t.id === tab)

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

  // El dueño ve solo su panel. Para ver los otros paneles usa cuentas aparte.
  if (isOwner) {
    return (
      <div className="space-y-5">
        <div>
          <p className="label text-gold-dark">Panel del dueño</p>
          <h1 className="font-display text-3xl font-bold">Mi panel</h1>
        </div>
        <Owner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="label text-gold-dark">Panel del organizador</p>
        <h1 className="font-display text-3xl font-bold">Administración</h1>
        {left !== null && <p className="mt-2 rounded-xl bg-gold/15 px-3 py-2 text-sm font-semibold text-gold-dark">Período de prueba: {left === 0 ? 'hoy es el último día' : left === 1 ? 'te queda 1 día' : `te quedan ${left} días`}.</p>}
      </div>
      <nav className="space-y-3">
        <button onClick={() => setParams({ tab: 'resumen' })}
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-lg font-extrabold ${inProfile ? 'btn-gold' : 'card text-ink'}`}>
          <span className={`grid h-10 w-10 place-items-center rounded-full ${inProfile ? 'bg-night/15' : 'bg-gold/15 text-gold-dark'}`}><Icon name="user" /></span>
          <span className="flex-1">Perfil<span className="block text-xs font-semibold opacity-75">Resumen · Configuración · Historial</span></span>
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
        {inProfile && (
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-night/40 p-1">
            {profileTabs.map((t) => (
              <button key={t.id} onClick={() => setParams({ tab: t.id })}
                className={`rounded-xl py-2.5 text-sm font-extrabold ${tab === t.id ? 'bg-surface text-ink shadow' : 'text-muted'}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </nav>
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
