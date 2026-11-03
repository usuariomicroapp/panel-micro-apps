import ComingSoon from '../components/ComingSoon'

const message = `¡Te invito a SORTEO!

Ingresá a nuestro grupo para conocer los próximos premios y novedades.

Grupo:
[ENLACE DEL GRUPO]

Instalá la aplicación:
[ENLACE DE SORTEO]`

export default function Invite() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-extrabold">Invitar participantes</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold text-muted">A · ENLACE DEL GRUPO</p>
          <p className="mt-2 font-semibold">Grupo de WhatsApp</p>
          <p className="mt-1 text-sm text-muted">Lo cargás desde el panel.</p>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold text-muted">B · ENLACE DE INSTALACIÓN</p>
          <p className="mt-2 font-semibold">App SORTEO</p>
          <p className="mt-1 text-sm text-muted">Se genera al publicar la app.</p>
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold">Mensaje que se comparte</p>
        <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-canvas p-4 font-sans text-sm">{message}</pre>
        <button disabled className="mt-4 w-full cursor-not-allowed rounded-2xl bg-brand-600/40 py-3.5 font-bold text-white">COMPARTIR SORTEO</button>
      </div>
      <ComingSoon stage={9}>Compartir por WhatsApp, Telegram, SMS o correo y el código QR se activan cuando los enlaces estén cargados.</ComingSoon>
    </div>
  )
}
