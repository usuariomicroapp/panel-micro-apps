import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls } from '../../components/ui'

interface SettingsRow {
  group_link: string
  install_link: string
  share_message: string
  payments_enabled: boolean
  authorization_number: string | null
  authorization_entity: string | null
}

export default function Settings() {
  const [row, setRow] = useState<SettingsRow | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase!.from('settings').select('*').eq('id', 1).single().then(({ data }) => setRow(data as SettingsRow))
  }, [])

  if (!row) return <Card title="Configuración"><p className="text-muted">Cargando…</p></Card>

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const auth = String(f.get('authorization_number') ?? '').trim()
    const update = {
      group_link: String(f.get('group_link')).trim(),
      install_link: String(f.get('install_link')).trim(),
      share_message: String(f.get('share_message')),
      authorization_number: auth || null,
      authorization_entity: String(f.get('authorization_entity') ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    }
    setBusy(true); setMsg(null)
    const { error } = await supabase!.from('settings').update(update).eq('id', 1)
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: /check/i.test(error.message) ? 'Revisá los datos: los enlaces deben empezar con https:// y, si los cobros están activos, la autorización no puede quedar vacía.' : error.message })
    else { setRow({ ...row, ...update }); setMsg({ kind: 'ok', text: 'Configuración guardada.' }) }
  }

  return (
    <Card title="Configuración">
      <form onSubmit={save} className="space-y-4">
        <label className="block text-sm font-medium">Enlace del grupo de WhatsApp
          <input name="group_link" type="url" defaultValue={row.group_link} placeholder="https://chat.whatsapp.com/..." className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Enlace de instalación de SORTEO
          <input name="install_link" type="url" defaultValue={row.install_link || window.location.origin} placeholder="https://sorteo-5yd.pages.dev" className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Mensaje para compartir
          <textarea name="share_message" rows={8} defaultValue={row.share_message} className={inputCls} />
          <span className="mt-1 block text-xs text-muted">[ENLACE DEL GRUPO] y [ENLACE DE SORTEO] se reemplazan automáticamente.</span>
        </label>

        <div className="rounded-2xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Cobros y venta de números</p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.payments_enabled ? 'bg-free/15 text-free' : 'bg-sold/10 text-sold'}`}>
              {row.payments_enabled ? 'Habilitados' : 'Deshabilitados'}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Por seguridad legal, los cobros solo se pueden encender con un número de autorización cargado, y se encienden desde la base de datos, no desde acá. Cargá la autorización cuando la tengas.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">N.º de autorización
              <input name="authorization_number" defaultValue={row.authorization_number ?? ''} className={inputCls} />
            </label>
            <label className="block text-sm">Organismo que autorizó
              <input name="authorization_entity" defaultValue={row.authorization_entity ?? ''} placeholder="Ej.: Lotería de la Ciudad" className={inputCls} />
            </label>
          </div>
        </div>

        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button disabled={busy} className={primaryCls}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
      </form>
    </Card>
  )
}
