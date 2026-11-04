import { Link, useSearchParams } from 'react-router-dom'
import ComingSoon from '../components/ComingSoon'
import { useAuth } from '../lib/auth'
import { isConfigured } from '../lib/supabase'
import Overview from './admin/Overview'
import Settings from './admin/Settings'
import PaymentMethods from './admin/PaymentMethods'
import History from './admin/History'
import Products from './admin/Products'
import Raffles from './admin/Raffles'
import ManualSales from './admin/ManualSales'

const tabs = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'sorteos', label: 'Sorteos' },
  { id: 'ventas', label: 'Ventas en persona' },
  { id: 'productos', label: 'Productos' },
  { id: 'configuracion', label: 'Configuración' },
  { id: 'pagos', label: 'Medios de pago' },
  { id: 'historial', label: 'Historial' },
] as const

const upcoming = [
  { title: 'Pagos pendientes', desc: 'Comprobantes, aprobar o rechazar', stage: 7 },
  { title: 'Resultados', desc: 'Confirmar resultado oficial y publicar ganador', stage: 8 },
]

export default function Admin() {
  const { ready, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'resumen'

  if (!isConfigured) {
    return <ComingSoon stage={3}>El panel se activa cuando la app está conectada a la base de datos.</ComingSoon>
  }
  if (!ready) return <p className="py-20 text-center text-muted">Cargando…</p>
  if (profile?.role !== 'admin') {
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
        <h1 className="text-2xl font-extrabold">Administración</h1>
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
      {tab === 'sorteos' && <Raffles />}
      {tab === 'ventas' && <ManualSales />}
      {tab === 'productos' && <Products />}
      {tab === 'configuracion' && <Settings />}
      {tab === 'pagos' && <PaymentMethods />}
      {tab === 'historial' && <History />}
    </div>
  )
}
