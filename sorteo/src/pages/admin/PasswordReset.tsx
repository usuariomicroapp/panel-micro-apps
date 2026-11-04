import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Notice, inputCls, primaryCls } from '../../components/ui'

// Contraseña olvidada: el cliente avisa por WhatsApp y el organizador le pone una nueva.
export default function PasswordReset() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [done, setDone] = useState<{ email: string; password: string } | null>(null)

  const suggest = () => {
    const words = ['sol', 'mar', 'luna', 'rio', 'flor', 'pan', 'luz', 'pez']
    const w = words[Math.floor(Math.random() * words.length)]
    return `${w}${Math.floor(1000 + Math.random() * 9000)}${words[Math.floor(Math.random() * words.length)]}`
  }
  const [password, setPassword] = useState(suggest)

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email')).trim()
    if (password.length < 8) return setMsg({ kind: 'error', text: 'La contraseña tiene que tener al menos 8 caracteres.' })
    setBusy(true); setMsg(null); setDone(null)
    const { data, error } = await supabase!.rpc('admin_set_password', { p_email: email, p_password: password })
    setBusy(false)
    if (error) {
      const m = /admin_set_password/.test(error.message) && /does not exist|schema cache|function/i.test(error.message)
        ? 'Falta actualizar la base: pegá el archivo de actualización en Supabase (SQL Editor).'
        : error.message
      return setMsg({ kind: 'error', text: m })
    }
    setMsg({ kind: 'ok', text: `Listo, ${data || email} ya puede entrar con la contraseña nueva.` })
    setDone({ email, password })
  }

  const text = done ? `Hola! Ya podés entrar a la app con tu correo ${done.email} y esta contraseña: ${done.password}` : ''
  return (
    <Card title="Contraseña olvidada">
      <p className="mb-4 text-base text-muted">Si un cliente no puede entrar, escribí su correo y una contraseña nueva. Después se la mandás por WhatsApp.</p>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-base font-semibold">Correo del cliente
          <input name="email" type="email" required autoComplete="off" placeholder="cliente@correo.com" className={inputCls} />
        </label>
        <label className="block text-base font-semibold">Contraseña nueva
          <div className="mt-1 flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" className={`${inputCls} mt-0 font-mono text-lg`} />
            <button type="button" onClick={() => setPassword(suggest())} className="card shrink-0 rounded-xl px-4 font-bold">Otra</button>
          </div>
        </label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button disabled={busy} className={`${primaryCls} w-full`}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </form>
      {done && (
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn-green rounded-2xl px-5 py-3 font-bold">Mandar por WhatsApp</a>
          <button onClick={() => { void navigator.clipboard?.writeText(text) }} className="card rounded-2xl px-5 py-3 font-bold">Copiar mensaje</button>
        </div>
      )}
    </Card>
  )
}
