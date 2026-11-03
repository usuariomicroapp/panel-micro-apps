import ComingSoon from '../components/ComingSoon'

const cards = [
  { title: 'Productos', desc: 'Crear, editar, fotos, costo y precio de referencia', stage: 5 },
  { title: 'Sorteos', desc: 'Fechas, lotería, cantidad de números, precio, activar', stage: 5 },
  { title: 'Pagos pendientes', desc: 'Comprobantes, aprobar o rechazar', stage: 7 },
  { title: 'Resultados', desc: 'Confirmar resultado oficial y publicar ganador', stage: 8 },
  { title: 'Invitaciones', desc: 'Enlace del grupo, enlace de instalación, QR', stage: 9 },
  { title: 'Configuración', desc: 'Alias, CBU, titular, medios de pago', stage: 4 },
  { title: 'Historial', desc: 'Registro de todas las operaciones', stage: 4 },
  { title: 'Estadísticas', desc: 'Vendido, cobrado verificado, gastos, resultado', stage: 4 },
]

const stats = [
  ['Sorteos', '—'],
  ['Participantes', '—'],
  ['Números vendidos', '—'],
  ['Cobrado y verificado', '—'],
]

export default function Admin() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-600">Panel privado</p>
          <h1 className="text-2xl font-extrabold">Administración</h1>
        </div>
        <span className="rounded-full bg-sold/10 px-3 py-1 text-xs font-bold text-sold">Cobros deshabilitados</span>
      </div>
      <ComingSoon stage={4}>Este panel solo será accesible con la cuenta de Sebastián. Hoy es la maqueta de navegación; las cifras aparecen al conectar la base de datos.</ComingSoon>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-1 text-2xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title} className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5">
            <div>
              <h2 className="font-bold">{c.title}</h2>
              <p className="mt-1 text-sm text-muted">{c.desc}</p>
            </div>
            <span className="mt-4 self-start rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">Etapa {c.stage}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
