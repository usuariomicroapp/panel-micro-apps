import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ComingSoon from '../components/ComingSoon'
import { useAuth } from '../lib/auth'
import { isConfigured } from '../lib/supabase'
import Overview from './admin/Overview'
import Settings from './admin/Settings'
import History from './admin/History'
import Products from './admin/Products'
import Raffles from './admin/Raffles'
import Participants from './admin/Participants'
import Owner from './admin/Owner'
import DrawDay from './admin/DrawDay'

const baseTabs = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'sorteos', label: 'Sorteos' },
  { id: 'dia', label: 'Día del sorteo' },
  { id: 'participantes', label: 'Participantes' },
  { id: 'productos', label: 'Productos' },
  { id: 'configuracion', label: 'Configuración' },
  { id: 'historial', label: 'Historial' },
] as const


export default function Admin() {
  const { ready, canManage, isOwner, viewAsBuyer, setViewAsBuyer } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tabs = isOwner ? [{ id: 'dueno', label: 'Mi panel de dueño' }, ...baseTabs] : baseTabs
  const tab = params.get('tab') ?? (isOwner ? 'dueno' : 'resumen')

  if (!isConfigured) {
    return <ComingSoon stage={3}>El panel se activa cuando la app está conectada a la base de datos.</ComingSoon>
  }
  if (!ready) return <p className="py-20 text-center text-muted">Cargando…</p>
  if (canManage && viewAsBuyer) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-muted">Estás viendo la app como participante.</p>
        <button onClick={() => setViewAsBuyer(false)} className="mt-6 rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white">Volver a mi panel</button>
      </div>
    )
  }
  if (!canManage) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-extrabold">Panel privado</h1>
        <p className="mt-2 text-muted">Solo el administrador puede entrar acá.</p>
        <Link to="/perfil" className="mt-6 inline-block rounded-2xl bg-brand-600 px-6 py-3 font-bold text-white">Ingresar</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand-600">Panel privado</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">{isOwner ? 'Administración (dueño)' : 'Administración'}</h1>
          <button onClick={() => { setViewAsBuyer(true); navigate('/') }} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-brand-700">
            Ver como participante
          </button>
        </div>
      </div>
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setParams({ tab: t.id })}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-ink text-white' : 'bg-surface text-muted border border-line'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'resumen' && <Overview />}
      {tab === 'dia' && <DrawDay />}
      {tab === 'dueno' && isOwner && <Owner />}
      {tab === 'sorteos' && <Raffles />}
      {tab === 'participantes' && <Participants />}
      {tab === 'productos' && <Products />}
      {tab === 'configuracion' && <Settings />}
      {tab === 'historial' && <History />}
    </div>
  )
}
