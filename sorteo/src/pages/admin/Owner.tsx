import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls } from '../../components/ui'
import { useAuth, type Profile } from '../../lib/auth'
import { useBrand } from '../../lib/brand'
import { fecha } from '../../lib/format'

const missing = (m: string) => (/app_paused|paused_message|is_owner/.test(m) ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).' : m)

// Panel del dueño de la plataforma: pausa la app y elige quién organiza.
function Pause() {
  const brand = useBrand()
  const [message, setMessage] = useState(brand.pausedMessage)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setMessage(brand.pausedMessage), [brand.pausedMessage])

  const set = async (paused: boolean) => {
    if (paused && !window.confirm('¿Pausar la app? Nadie va a poder reservar ni cargar ventas hasta que la reanudes.')) return
    setBusy(true); setMsg(null)
    const { error } = await supabase!.from('settings').update({ app_paused: paused, paused_message: message.trim() || 'La app está pausada momentáneamente.' }).eq('id', 1)
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: missing(error.message) })
    else { brand.refresh(); setMsg({ kind: 'ok', text: paused ? 'App pausada.' : 'App funcionando.' }) }
  }

  return (
    <Card title="Estado de la app">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Si pausás la app, todos la siguen viendo pero nadie puede reservar ni cargar ventas. Tu cliente no puede reanudarla.</p>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${brand.paused ? 'bg-sold/10 text-sold' : 'bg-free/15 text-free'}`}>{brand.paused ? 'Pausada' : 'Funcionando'}</span>
        </div>
        <label className="block text-sm">Mensaje que se muestra al pausar
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} className={inputCls} />
        </label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {brand.paused
          ? <button disabled={busy} onClick={() => set(false)} className={primaryCls}>Reanudar la app</button>
          : <button disabled={busy} onClick={() => set(true)} className="rounded-2xl bg-sold px-5 py-3 font-bold text-white disabled:opacity-50">Pausar la app</button>}
      </div>
    </Card>
  )
}

function Accounts() {
  const { profile: me } = useAuth()
  const [people, setPeople] = useState<Profile[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  const load = () => supabase!.from('profiles').select('*').order('created_at', { ascending: false }).then(({ data }) => setPeople((data ?? []) as Profile[]))
  useEffect(() => { void load() }, [])

  const setRole = async (p: Profile, role: Profile['role']) => {
    const who = `${p.first_name} ${p.last_name}`.trim() || p.email
    const text = role === 'admin' ? `¿Hacer organizador a ${who}? Va a poder crear sorteos, cargar ventas y ver los datos de los compradores.` : `¿Quitarle a ${who} el rol de organizador?`
    if (!window.confirm(text)) return
    setErr('')
    const { error } = await supabase!.from('profiles').update({ role }).eq('id', p.id)
    if (error) setErr(missing(error.message))
    void load()
  }

  const shown = (people ?? []).filter((p) => !q || `${p.first_name} ${p.last_name} ${p.email} ${p.phone}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <Card title="Cuentas">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo o teléfono" className={inputCls} />
      {err && <div className="mt-3"><Notice kind="error">{err}</Notice></div>}
      {!people ? <p className="mt-3 text-muted">Cargando…</p> : (
        <ul className="mt-3 divide-y divide-line">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold">{`${p.first_name} ${p.last_name}`.trim() || 'Sin nombre'}</p>
                <p className="text-muted">{p.email}{p.phone && <> · {p.phone}</>}</p>
                <p className="text-xs text-muted">Desde {fecha(p.created_at)}</p>
              </div>
              {p.is_owner ? (
                <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">Dueño{p.id === me?.id && ' (vos)'}</span>
              ) : p.role === 'admin' ? (
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">Organizador</span>
                  <button onClick={() => setRole(p, 'participant')} className="font-semibold text-sold">Quitar</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold text-muted">Comprador</span>
                  <button onClick={() => setRole(p, 'admin')} className="font-semibold text-brand-600">Hacer organizador</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function Owner() {
  return (
    <div className="space-y-6">
      <Notice kind="ok">Este es tu panel de dueño. Tu cliente (el organizador) no lo ve y no puede quitarte el control.</Notice>
      <Pause />
      <Accounts />
    </div>
  )
}
