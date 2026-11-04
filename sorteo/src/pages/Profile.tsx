import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ComingSoon from '../components/ComingSoon'
import { useAuth } from '../lib/auth'
import { isConfigured, supabase } from '../lib/supabase'

const sections = ['Premios ganados']

const input = 'mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-brand-500 disabled:bg-canvas'
const primary = 'w-full rounded-2xl bg-brand-600 py-3.5 font-bold text-white active:scale-[.99] disabled:cursor-not-allowed disabled:bg-brand-600/40'

const translate = (msg: string) => {
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/Email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.'
  if (/already registered/i.test(msg)) return 'Ese correo ya tiene una cuenta. Probá ingresar.'
  if (/Password should be/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
  return msg
}

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase) return
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email')).trim()
    const password = String(f.get('password'))
    setBusy(true); setError(''); setInfo('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(translate(error.message))
    } else {
      if (password.length < 8) { setBusy(false); return setError('La contraseña debe tener al menos 8 caracteres.') }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: {
            first_name: String(f.get('first_name')).trim(),
            last_name: String(f.get('last_name')).trim(),
            phone: String(f.get('phone')).trim(),
          },
        },
      })
      if (error) setError(translate(error.message))
      else if (!data.session) setInfo('Te enviamos un correo para confirmar tu cuenta. Abrí el enlace y después ingresá.')
    }
    setBusy(false)
  }

  return (
    <form className="space-y-3 rounded-3xl border border-line bg-surface p-6" onSubmit={submit}>
      <div className="grid grid-cols-2 rounded-2xl bg-canvas p-1 text-sm font-semibold">
        {(['login', 'signup'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(''); setInfo('') }}
            className={`rounded-xl py-2 ${mode === m ? 'bg-surface text-brand-700 shadow-sm' : 'text-muted'}`}>
            {m === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        ))}
      </div>
      {mode === 'signup' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Nombre<input name="first_name" required maxLength={80} autoComplete="given-name" className={input} /></label>
          <label className="block text-sm">Apellido<input name="last_name" required maxLength={80} autoComplete="family-name" className={input} /></label>
          <label className="col-span-2 block text-sm">Teléfono<input name="phone" required type="tel" minLength={6} autoComplete="tel" placeholder="11 5555-5555" className={input} /></label>
        </div>
      )}
      <label className="block text-sm">Correo electrónico<input name="email" type="email" required autoComplete="email" placeholder="tu@correo.com" className={input} /></label>
      <label className="block text-sm">Contraseña<input name="password" type="password" required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={input} /></label>
      {error && <p role="alert" className="rounded-xl bg-sold/10 p-3 text-sm text-sold">{error}</p>}
      {info && <p role="status" className="rounded-xl bg-free/10 p-3 text-sm text-free">{info}</p>}
      <button disabled={busy} className={primary}>{busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</button>
      {mode === 'signup' && <p className="text-xs text-muted">Usamos tus datos solo para gestionar tus participaciones (Ley 25.326). Podés pedir que los borremos.</p>}
    </form>
  )
}

function ProfileCard() {
  const { profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  if (!profile) return <p className="text-muted">Cargando tu perfil…</p>

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase) return
    const f = new FormData(e.currentTarget)
    setBusy(true)
    await supabase.from('profiles').update({
      first_name: String(f.get('first_name')).trim(),
      last_name: String(f.get('last_name')).trim(),
      phone: String(f.get('phone')).trim(),
    }).eq('id', profile.id)
    await refreshProfile()
    setBusy(false); setSaved(true)
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-3xl border border-line bg-surface p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">{profile.first_name || 'Tu cuenta'} {profile.last_name}</h2>
          <p className="text-sm text-muted">{profile.email}</p>
        </div>
        {profile.is_owner ? <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">Dueño</span>
          : profile.role === 'admin' && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">Organizador</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Nombre<input name="first_name" defaultValue={profile.first_name} maxLength={80} className={input} /></label>
        <label className="block text-sm">Apellido<input name="last_name" defaultValue={profile.last_name} maxLength={80} className={input} /></label>
        <label className="col-span-2 block text-sm">Teléfono<input name="phone" type="tel" defaultValue={profile.phone} inputMode="tel" className={input} /></label>
      </div>
      <p className="text-xs text-muted">Registrado el {new Date(profile.created_at).toLocaleDateString('es-AR')}</p>
      {saved && <p role="status" className="text-sm text-free">Datos guardados.</p>}
      <div className="flex gap-3">
        <button disabled={busy} className={primary}>Guardar</button>
        <button type="button" onClick={() => supabase?.auth.signOut()} className="w-full rounded-2xl border border-line py-3.5 font-semibold text-muted">Cerrar sesión</button>
      </div>
    </form>
  )
}

// Para el organizador: acceso al panel y ver como participante.
function ManagerTools() {
  const { setViewAsBuyer } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Link to="/admin" className="rounded-2xl bg-ink py-3.5 text-center font-bold text-white">Ir a mi panel</Link>
        <button onClick={() => { setViewAsBuyer(true); navigate('/') }} className="rounded-2xl border border-line py-3.5 font-semibold text-brand-700">Ver como participante</button>
      </div>
    </div>
  )
}

export default function Profile() {
  const { ready, session, isAdmin } = useAuth()
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-extrabold">Mi perfil</h1>
      {!isConfigured ? (
        <ComingSoon stage={3}>El registro e ingreso se activan cuando se conecte la base de datos.</ComingSoon>
      ) : !ready ? (
        <p className="text-muted">Cargando…</p>
      ) : session ? (
        <>
          <ProfileCard />
          {isAdmin && <ManagerTools />}
        </>
      ) : (
        <AuthForm />
      )}
      {session && <Link to="/mis-numeros" className="block rounded-2xl bg-brand-600 py-4 text-center text-lg font-bold text-white">Ver mis números</Link>}
      {!isAdmin && <div className="grid grid-cols-2 gap-3">
        {sections.map((s) => (
          <div key={s} className="rounded-2xl border border-line bg-surface p-4 text-sm font-semibold text-muted">{s}<span className="mt-1 block text-xs font-normal">Disponible en la Etapa 8</span></div>
        ))}
      </div>}
    </div>
  )
}
