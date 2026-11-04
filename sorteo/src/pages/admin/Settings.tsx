import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls, ghostCls } from '../../components/ui'
import { BrandMark } from '../../components/Logo'
import { useBrand } from '../../lib/brand'
import { compressImage } from '../../lib/data'

// Nombre del emprendimiento y logo que ven los participantes.
function BrandSettings() {
  const brand = useBrand()
  const [name, setName] = useState(brand.name)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setName(brand.name), [brand.name])

  const missingColumns = (m: string) => /brand_/.test(m) ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).' : m

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase!.from('settings').update({ brand_name: name.trim() || 'SORTEO', updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: missingColumns(error.message) })
    else { brand.refresh(); setMsg({ kind: 'ok', text: 'Nombre guardado.' }) }
  }

  const uploadLogo = async (file?: File) => {
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const blob = await compressImage(file, 512, 0.9)
      const path = `marca/logo-${crypto.randomUUID()}.jpg`
      const up = await supabase!.storage.from('product-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw new Error(up.error.message)
      const { data: old } = await supabase!.from('settings').select('*').eq('id', 1).single()
      const { error } = await supabase!.from('settings').update({ brand_logo_path: path, updated_at: new Date().toISOString() }).eq('id', 1)
      if (error) throw new Error(missingColumns(error.message))
      const prev = (old as { brand_logo_path?: string | null } | null)?.brand_logo_path
      if (prev) await supabase!.storage.from('product-photos').remove([prev])
      brand.refresh(); setMsg({ kind: 'ok', text: 'Logo actualizado.' })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo subir el logo.' })
    }
    setBusy(false)
  }

  const removeLogo = async () => {
    setBusy(true); setMsg(null)
    const { data: old } = await supabase!.from('settings').select('*').eq('id', 1).single()
    const { error } = await supabase!.from('settings').update({ brand_logo_path: null }).eq('id', 1)
    const prev = (old as { brand_logo_path?: string | null } | null)?.brand_logo_path
    if (!error && prev) await supabase!.storage.from('product-photos').remove([prev])
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: missingColumns(error.message) })
    else brand.refresh()
  }

  return (
    <Card title="Tu emprendimiento">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <BrandMark size={72} />
          <div className="flex flex-wrap gap-2">
            <label className={`${primaryCls} cursor-pointer`}>
              {brand.logoUrl ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
            {brand.logoUrl && <button type="button" onClick={removeLogo} disabled={busy} className={ghostCls}>Quitar</button>}
          </div>
        </div>
        <form onSubmit={saveName} className="space-y-3">
          <label className="block text-sm font-medium">Nombre de la app
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="Ej.: Rifas de Rosa" className={inputCls} />
            <span className="mt-1 block text-xs text-muted">Es el nombre que ven los participantes arriba de todo y en la pantalla de bienvenida.</span>
          </label>
          <button disabled={busy} className={primaryCls}>Guardar nombre</button>
        </form>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </div>
    </Card>
  )
}

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
  return (
    <div className="space-y-6">
      <BrandSettings />
      <GeneralSettings row={row} setRow={setRow} msg={msg} setMsg={setMsg} busy={busy} setBusy={setBusy} />
    </div>
  )
}

function GeneralSettings({ row, setRow, msg, setMsg, busy, setBusy }: {
  row: SettingsRow
  setRow: (r: SettingsRow) => void
  msg: { kind: 'ok' | 'error'; text: string } | null
  setMsg: (m: { kind: 'ok' | 'error'; text: string } | null) => void
  busy: boolean
  setBusy: (b: boolean) => void
}) {

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
        <label className="block text-sm font-medium">Enlace de instalación de la app
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
