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

const baseTabs = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'sorteos', label: 'Sorteos' },
  { id: 'productos', label: 'Productos de tienda' },
  { id: 'dia', label: 'Día del sorteo' },
  { id: 'participantes', label: 'Participantes' },
  { id: 'configuracion', label: 'Configuración' },
  { id: 'historial', label: 'Historial' },
] as const


export default function Admin() {
  const { ready, canManage, isOwner, viewAsBuyer, setViewAsBuyer, profile } = useAuth()
  const left = daysLeft(profile?.organizer_until)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'resumen'

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
      <nav className="flex flex-wrap gap-2">
        {baseTabs.map((t) => (
          <button key={t.id} onClick={() => setParams({ tab: t.id })}
            className={`rounded-full px-3.5 py-2 text-sm font-extrabold ${tab === t.id ? 'btn-gold' : 'card text-ink'}`}>
            {t.label}
          </button>
        ))}
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
