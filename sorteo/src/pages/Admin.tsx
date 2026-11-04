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

const baseTabs = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'sorteos', label: 'Sorteos' },
  { id: 'participantes', label: 'Participantes' },
  { id: 'productos', label: 'Productos' },
  { id: 'configuracion', label: 'Configuración' },
  { id: 'historial', label: 'Historial' },
] as const

const upcoming = [
  { title: 'Resultados', desc: 'Confirmar resultado oficial y publicar ganador', stage: 8 },
]

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
      {tab === 'resumen' && (
        <>
          <Overview />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.map((c) => (
              <div key={c.title} className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5">
                <div>
                  <h2 className="font-bold">{c.title}</h2>
                  <p className="mt-1 text-sm text-muted">{c.desc}</p>
                </div>
                <span className="mt-4 self-start rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">Etapa {c.stage}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'dueno' && isOwner && <Owner />}
      {tab === 'sorteos' && <Raffles />}
      {tab === 'participantes' && <Participants />}
      {tab === 'productos' && <Products />}
      {tab === 'configuracion' && <Settings />}
      {tab === 'historial' && <History />}
    </div>
  )
}
