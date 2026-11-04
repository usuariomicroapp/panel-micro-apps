import { useEffect, useMemo, useState, type FormEvent } from 'react'
import qrcode from 'qrcode-generator'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useBrand } from '../lib/brand'
import { Card, Notice, ghostCls, inputCls, primaryCls } from '../components/ui'

interface Links { group_link: string; install_link: string; share_message: string }

const DEFAULT_MESSAGE = '¡Te invito a SORTEO!\n\nIngresá a nuestro grupo para conocer los próximos premios y novedades.\n\nGrupo:\n[ENLACE DEL GRUPO]\n\nInstalá la aplicación:\n[ENLACE DE SORTEO]'

// Arma el mensaje con los enlaces y el nombre del emprendimiento. Sin grupo cargado, saca esa parte.
export function buildMessage(template: string, brand: string, group: string, app: string) {
  let t = template || DEFAULT_MESSAGE
  if (!group) t = t.replace(/\n*[^\n]*\n?\[ENLACE DEL GRUPO\]/, '')
  return t.replaceAll('[ENLACE DEL GRUPO]', group).replaceAll('[ENLACE DE SORTEO]', app).replace(/\bSORTEO\b/g, brand).trim()
}

function qrDataUrl(text: string, cell = 8) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return q.createDataURL(cell, 4)
}

export default function Invite() {
  const { isAdmin } = useAuth()
  const { name: brand } = useBrand()
  const [row, setRow] = useState<Links | null>(null)
  const [copied, setCopied] = useState('')
  const [qrOf, setQrOf] = useState<'app' | 'group'>('app')

  useEffect(() => {
    if (!supabase) return setRow({ group_link: '', install_link: '', share_message: DEFAULT_MESSAGE })
    supabase.from('settings').select('group_link, install_link, share_message').eq('id', 1).maybeSingle()
      .then(({ data }) => setRow((data as Links) ?? { group_link: '', install_link: '', share_message: DEFAULT_MESSAGE }))
  }, [])

  const app = row?.install_link || `${window.location.origin}/`
  const group = row?.group_link ?? ''
  const message = useMemo(() => (row ? buildMessage(row.share_message, brand, group, app) : ''), [row, brand, group, app])
  const qrText = qrOf === 'group' && group ? group : app
  const qr = useMemo(() => qrDataUrl(qrText), [qrText])

  if (!row) return <p className="py-20 text-center text-muted">Cargando…</p>

  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what) } catch { setCopied('') }
    setTimeout(() => setCopied(''), 2500)
  }
  const shareNative = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: brand, text: message }) } catch { /* la persona cerró el menú */ }
    } else copy('mensaje', message)
  }
  const enc = encodeURIComponent
  const channels = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${enc(message)}`, cls: 'bg-free text-white' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${enc(app)}&text=${enc(message.replace(app, '').trim())}`, cls: 'bg-[#229ED9] text-white' },
    { label: 'SMS', href: `sms:?&body=${enc(message)}`, cls: 'bg-night text-white' },
    { label: 'Correo', href: `mailto:?subject=${enc(`Te invito a ${brand}`)}&body=${enc(message)}`, cls: 'bg-surface text-ink border border-line' },
  ]

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-extrabold">{isAdmin ? 'Invitar participantes' : 'Invitar a otras personas'}</h1>

      <Card title="Mensaje que se comparte">
        <pre className="whitespace-pre-wrap rounded-2xl bg-canvas p-4 font-sans text-base">{message}</pre>
        <button onClick={shareNative} className={`${primaryCls} mt-4 w-full py-4 text-lg`}>COMPARTIR SORTEO</button>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {channels.map((c) => (
            <a key={c.label} href={c.href} target="_blank" rel="noreferrer" className={`rounded-2xl px-4 py-3 text-center font-bold ${c.cls}`}>{c.label}</a>
          ))}
        </div>
        <button onClick={() => copy('mensaje', message)} className={`${ghostCls} mt-3 w-full`}>{copied === 'mensaje' ? '¡Mensaje copiado!' : 'Copiar mensaje'}</button>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <LinkBox letter="A" title="Enlace del grupo" value={group} empty="Todavía no cargaste el enlace del grupo de WhatsApp." copied={copied === 'grupo'} onCopy={() => copy('grupo', group)} />
        <LinkBox letter="B" title="Enlace de la app" value={app} copied={copied === 'app'} onCopy={() => copy('app', app)} />
      </div>

      <Card title="Código QR">
        {group && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-1">
            {(['app', 'group'] as const).map((k) => (
              <button key={k} onClick={() => setQrOf(k)} className={`rounded-xl py-2 font-semibold ${qrOf === k ? 'bg-surface shadow' : 'text-muted'}`}>{k === 'app' ? 'De la app' : 'Del grupo'}</button>
            ))}
          </div>
        )}
        <div className="flex flex-col items-center gap-3">
          <img src={qr} alt={`Código QR: ${qrText}`} className="h-64 w-64 rounded-2xl border border-line bg-white p-2 [image-rendering:pixelated]" />
          <p className="break-all text-center text-sm text-muted">{qrText}</p>
          <p className="text-center text-base">Imprimilo o mostralo en el celular: al escanearlo con la cámara se abre {qrOf === 'group' && group ? 'el grupo' : 'la app'}.</p>
          <a href={qrDataUrl(qrText, 16)} download={`qr-${qrOf === 'group' && group ? 'grupo' : 'app'}.gif`} className={ghostCls}>Descargar QR para imprimir</a>
        </div>
      </Card>

      {isAdmin && <EditLinks row={row} onSaved={setRow} />}
    </div>
  )
}

function LinkBox({ letter, title, value, empty, copied, onCopy }: { letter: string; title: string; value: string; empty?: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="card rounded-3xl p-5">
      <p className="text-xs font-semibold text-muted">{letter} · {title.toUpperCase()}</p>
      {value ? (
        <>
          <a href={value} target="_blank" rel="noreferrer" className="mt-2 block break-all font-semibold text-brand-700 underline">{value}</a>
          <button onClick={onCopy} className="mt-3 rounded-xl border border-line px-4 py-2 text-sm font-semibold">{copied ? '¡Copiado!' : 'Copiar enlace'}</button>
        </>
      ) : <p className="mt-2 text-sm text-muted">{empty}</p>}
    </div>
  )
}

function EditLinks({ row, onSaved }: { row: Links; onSaved: (r: Links) => void }) {
  const [group, setGroup] = useState(row.group_link)
  const [app, setApp] = useState(row.install_link)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    // Si pegan el enlace sin https://, se lo agregamos.
    const fix = (v: string) => (v && !/^[a-z]+:\/\//i.test(v) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v) ? `https://${v}` : v)
    const g = fix(group.trim()), a = fix(app.trim())
    setGroup(g); setApp(a)
    if (g && !/^https:\/\/\S+$/.test(g)) return setMsg({ kind: 'error', text: 'El enlace del grupo tiene que empezar con https:// (copialo desde WhatsApp: Info del grupo → Invitar mediante enlace).' })
    if (a && !/^https:\/\/\S+$/.test(a)) return setMsg({ kind: 'error', text: 'El enlace de la app tiene que empezar con https://' })
    setBusy(true)
    const { error } = await supabase!.from('settings').update({ group_link: g, install_link: a, updated_at: new Date().toISOString() }).eq('id', 1)
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    onSaved({ ...row, group_link: g, install_link: a })
    setMsg({ kind: 'ok', text: 'Enlaces guardados.' })
  }

  return (
    <Card title="Cambiar enlaces">
      <form onSubmit={save} className="space-y-4">
        <label className="block text-base font-semibold">A · Enlace del grupo de WhatsApp
          <input value={group} onChange={(e) => setGroup(e.target.value)} type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://chat.whatsapp.com/..." className={inputCls} />
          <span className="mt-1 block text-sm font-normal text-muted">En WhatsApp: entrá al grupo → tocá el nombre → Invitar mediante enlace → Copiar enlace.</span>
        </label>
        <label className="block text-base font-semibold">B · Enlace de la app
          <input value={app} onChange={(e) => setApp(e.target.value)} type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder={`${window.location.origin}/`} className={inputCls} />
          <span className="mt-1 block text-sm font-normal text-muted">Si lo dejás vacío se usa la dirección de esta app.</span>
        </label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button disabled={busy} className={`${primaryCls} w-full`}>{busy ? 'Guardando…' : 'Guardar enlaces'}</button>
        <p className="text-sm text-muted">El texto del mensaje se cambia en Panel → Configuración.</p>
      </form>
    </Card>
  )
}
