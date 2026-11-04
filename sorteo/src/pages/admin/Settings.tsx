import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls, ghostCls } from '../../components/ui'
import { BrandMark } from '../../components/Logo'
import { useBrand } from '../../lib/brand'
import { compressImage } from '../../lib/data'

type Brand = ReturnType<typeof useBrand>
// Cada organizador guarda en su propia marca. Sin marca propia (base vieja), en la general.
const saveBrand = (brand: Brand, update: Record<string, unknown>) => brand.org
  ? supabase!.from('organizer_settings').update(update).eq('organizer_id', brand.org)
  : supabase!.from('settings').update(update).eq('id', 1)
const currentLogo = async (brand: Brand) => {
  const { data } = brand.org
    ? await supabase!.from('organizer_settings').select('brand_logo_path').eq('organizer_id', brand.org).maybeSingle()
    : await supabase!.from('settings').select('brand_logo_path').eq('id', 1).maybeSingle()
  return (data as { brand_logo_path?: string | null } | null)?.brand_logo_path ?? null
}

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
    const { error } = await saveBrand(brand, { brand_name: name.trim() || 'SORTEO', updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: missingColumns(error.message) })
    else { brand.refresh(); setMsg({ kind: 'ok', text: 'Nombre guardado.' }) }
  }

  const uploadLogo = async (file?: File) => {
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const blob = await compressImage(file, 512, 0.9)
      const path = brand.org ? `marca/${brand.org}/logo-${crypto.randomUUID()}.jpg` : `marca/logo-${crypto.randomUUID()}.jpg`
      const up = await supabase!.storage.from('product-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw new Error(up.error.message)
      const prev = await currentLogo(brand)
      const { error } = await saveBrand(brand, { brand_logo_path: path, updated_at: new Date().toISOString() })
      if (error) throw new Error(missingColumns(error.message))
      if (prev) await supabase!.storage.from('product-photos').remove([prev])
      brand.refresh(); setMsg({ kind: 'ok', text: 'Logo actualizado.' })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo subir el logo.' })
    }
    setBusy(false)
  }

  const removeLogo = async () => {
    setBusy(true); setMsg(null)
    const prev = await currentLogo(brand)
    const { error } = await saveBrand(brand, { brand_logo_path: null })
    if (!error && prev) await supabase!.storage.from('product-photos').remove([prev])
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: missingColumns(error.message) })
    else brand.refresh()
  }

  return (
    <Card title="Tu emprendimiento" collapsible hint="Nombre, logo y colores">
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
}

export default function Settings() {
  const brand = useBrand()
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const row: SettingsRow = { group_link: brand.groupLink, install_link: brand.installLink, share_message: brand.shareMessage }
  const setRow = () => brand.refresh()

  return (
    <div className="space-y-6">
      <BrandSettings />
      <GeneralSettings row={row} setRow={setRow} msg={msg} setMsg={setMsg} busy={busy} setBusy={setBusy} />
    </div>
  )
}

function GeneralSettings({ row, setRow, msg, setMsg, busy, setBusy }: {
  row: SettingsRow
  setRow: () => void
  msg: { kind: 'ok' | 'error'; text: string } | null
  setMsg: (m: { kind: 'ok' | 'error'; text: string } | null) => void
  busy: boolean
  setBusy: (b: boolean) => void
}) {
  const brand = useBrand()

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const update = {
      group_link: String(f.get('group_link')).trim(),
      install_link: String(f.get('install_link')).trim(),
      share_message: String(f.get('share_message')),
      updated_at: new Date().toISOString(),
    }
    setBusy(true); setMsg(null)
    const { error } = await saveBrand(brand, update)
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: /check/i.test(error.message) ? 'Revisá los datos: los enlaces deben empezar con https://.' : error.message })
    else { setRow(); setMsg({ kind: 'ok', text: 'Configuración guardada.' }) }
  }

  return (
    <Card title="Configuración" collapsible hint="Mensajes y opciones de la app">
      <form key={`${row.group_link}|${row.install_link}|${row.share_message.length}`} onSubmit={save} className="space-y-4">
        <label className="block text-sm font-medium">Enlace del grupo de WhatsApp
          <input name="group_link" type="url" defaultValue={row.group_link} placeholder="https://chat.whatsapp.com/..." className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Enlace de instalación de la app
          <input name="install_link" type="url" defaultValue={row.install_link} placeholder="Vacío = el link de tus sorteos" className={inputCls} />
        </label>
        <label className="block text-sm font-medium">Mensaje para compartir
          <textarea name="share_message" rows={8} defaultValue={row.share_message} className={inputCls} />
          <span className="mt-1 block text-xs text-muted">[ENLACE DEL GRUPO] y [ENLACE DE SORTEO] se reemplazan automáticamente.</span>
        </label>

        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button disabled={busy} className={primaryCls}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
      </form>
    </Card>
  )
}
