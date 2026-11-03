import ComingSoon from '../components/ComingSoon'

const sections = ['Mis números', 'Mis sorteos', 'Mis pagos y comprobantes', 'Premios ganados']

export default function Profile() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-extrabold">Mi perfil</h1>
      <form className="space-y-3 rounded-3xl border border-line bg-surface p-6" onSubmit={(e) => e.preventDefault()}>
        <h2 className="font-bold">Ingresar</h2>
        <label className="block text-sm">Correo electrónico
          <input type="email" disabled className="mt-1 w-full rounded-xl border border-line bg-canvas px-4 py-3" placeholder="tu@correo.com" />
        </label>
        <label className="block text-sm">Contraseña
          <input type="password" disabled className="mt-1 w-full rounded-xl border border-line bg-canvas px-4 py-3" placeholder="••••••••" />
        </label>
        <button disabled className="w-full cursor-not-allowed rounded-2xl bg-brand-600/40 py-3.5 font-bold text-white">Ingresar</button>
        <p className="text-center text-sm text-muted">¿No tenés cuenta? <span className="font-semibold text-brand-600">Crear cuenta</span></p>
        <ComingSoon stage={3}>El registro e ingreso se activan cuando se conecte Supabase.</ComingSoon>
      </form>
      <div className="grid grid-cols-2 gap-3">
        {sections.map((s) => (
          <div key={s} className="rounded-2xl border border-line bg-surface p-4 text-sm font-semibold text-muted">{s}</div>
        ))}
      </div>
    </div>
  )
}
