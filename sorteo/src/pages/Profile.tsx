import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ComingSoon from '../components/ComingSoon'
import { InstallCard, PushCard } from '../components/AppSetup'
import { RECOVERY_KEY, useAuth } from '../lib/auth'
import { isConfigured, supabase } from '../lib/supabase'

const input = 'mt-1 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-brand-500 disabled:bg-canvas'
const primary = 'w-full rounded-2xl btn-gold py-3.5 font-bold disabled:cursor-not-allowed'

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

  // Sin correo: el organizador le pone una contraseña nueva desde su panel.
  const forgot = () => {
    setError('')
    setInfo('Escribile al organizador del sorteo por WhatsApp y pedile una contraseña nueva. Te la cambia en el momento.')
  }


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
      // Si el correo ya tiene cuenta, Supabase no avisa con un error: devuelve un usuario sin identidades.
      else if (data.user && data.user.identities?.length === 0) { setMode('login'); setError('Ese correo ya tiene una cuenta. Ingresá con tu contraseña.') }
      else if (!data.session) setInfo('Te enviamos un correo para confirmar tu cuenta. Abrí el enlace y después ingresá.')
    }
    setBusy(false)
  }

  return (
    <form className="space-y-3 card rounded-3xl p-6" onSubmit={submit}>
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
      {mode === 'login' && <button type="button" onClick={forgot} disabled={busy} className="w-full py-2 text-base font-bold text-brand-700 underline underline-offset-4">¿Olvidaste tu contraseña?</button>}
      {mode === 'signup' && <p className="text-xs text-muted">Usamos tus datos solo para gestionar tus participaciones (Ley 25.326). Podés pedir que los borremos.</p>}
    </form>
  )
}

// Después de tocar el enlace del correo: elegir la contraseña nueva.
function NewPasswordCard({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase) return
    const f = new FormData(e.currentTarget)
    const a = String(f.get('password')), b = String(f.get('password2'))
    if (a.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (a !== b) return setError('Las dos contraseñas no son iguales.')
    setBusy(true); setError('')
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(false)
    if (error) return setError(translate(error.message))
    try { sessionStorage.removeItem(RECOVERY_KEY) } catch { /* sin almacenamiento */ }
    onDone()
  }
  return (
    <form onSubmit={save} className="navycard space-y-3 rounded-3xl p-6">
      <h2 className="font-display text-2xl font-bold">Elegí tu contraseña nueva</h2>
      <label className="block text-sm text-white/80">Contraseña nueva<input name="password" type="password" required minLength={8} autoComplete="new-password" className={`${input} text-ink`} /></label>
      <label className="block text-sm text-white/80">Repetila<input name="password2" type="password" required minLength={8} autoComplete="new-password" className={`${input} text-ink`} /></label>
      {error && <p role="alert" className="rounded-xl bg-sold/25 p-3 text-sm text-white">{error}</p>}
      <button disabled={busy} className={primary}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
    </form>
  )
}

function ProfileCard() {
  const { profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  // Abierta solo si faltan datos para poder elegir números.
  const [open, setOpen] = useState(() => !!profile && (!profile.first_name?.trim() || !profile.phone?.trim()))
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
    setBusy(false); setSaved(true); setOpen(false)
    setTimeout(() => setSaved(false), 4000)
  }

  const initial = (profile.first_name || profile.email || '?').trim().charAt(0).toUpperCase()
  return (
    <section className="card rounded-3xl">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-night font-display text-xl font-bold text-[#f6e0a4]">{initial}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{`${profile.first_name} ${profile.last_name}`.trim() || 'Tu cuenta'}</span>
          <span className={`block truncate text-sm ${saved ? 'font-semibold text-free' : 'text-muted'}`}>{saved ? '✓ Datos guardados' : open ? profile.email : 'Mis datos · tocá para cambiarlos'}</span>
        </span>
        {profile.is_owner ? <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-night">Dueño</span>
          : profile.role === 'admin' && <span className="rounded-full bg-night px-2.5 py-0.5 text-xs font-bold text-white">Organizador</span>}
        <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-6 w-6 shrink-0 text-gold-dark transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <form onSubmit={save} className="space-y-3 px-5 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Nombre<input name="first_name" defaultValue={profile.first_name} maxLength={80} className={input} /></label>
            <label className="block text-sm">Apellido<input name="last_name" defaultValue={profile.last_name} maxLength={80} className={input} /></label>
            <label className="col-span-2 block text-sm">Teléfono<input name="phone" type="tel" defaultValue={profile.phone} inputMode="tel" className={input} /></label>
          </div>
          <p className="text-xs text-muted">Registrado el {new Date(profile.created_at).toLocaleDateString('es-AR')}</p>
          <div className="flex gap-3">
            <button disabled={busy} className={primary}>{busy ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={() => supabase?.auth.signOut()} className="w-full rounded-2xl border border-line py-3.5 font-semibold text-muted">Cerrar sesión</button>
          </div>
        </form>
      )}
    </section>
  )
}

// Para el organizador: acceso al panel y ver como participante.
function ManagerTools() {
  return (
    <div className="space-y-4">
      <Link to="/admin" className="block rounded-2xl bg-night py-3.5 text-center font-bold text-white">Ir a mi panel</Link>
    </div>
  )
}

export default function Profile() {
  const { ready, session, isAdmin } = useAuth()
  const [recovering, setRecovering] = useState(() => {
    try { return sessionStorage.getItem(RECOVERY_KEY) === '1' } catch { return false }
  })
  const [changed, setChanged] = useState(false)
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-extrabold">Mi perfil</h1>
      {!isConfigured ? (
        <ComingSoon stage={3}>El registro e ingreso se activan cuando se conecte la base de datos.</ComingSoon>
      ) : !ready ? (
        <p className="text-muted">Cargando…</p>
      ) : session && recovering ? (
        <NewPasswordCard onDone={() => { setRecovering(false); setChanged(true) }} />
      ) : session ? (
        <>
          {changed && <p role="status" className="rounded-xl bg-free/10 p-3 text-base font-semibold text-free">Listo, guardamos tu contraseña nueva.</p>}
          <ProfileCard />
          {isAdmin && <ManagerTools />}
        </>
      ) : (
        <AuthForm />
      )}
      {session && <Link to="/mis-numeros" className="block rounded-2xl btn-gold py-4 text-center text-lg font-bold">Ver mis números</Link>}
      {session && !isAdmin && <Link to="/resultados" className="block card rounded-2xl py-4 text-center text-lg font-bold">Resultados y premios ganados</Link>}
      {session && <><InstallCard /><PushCard /></>}
    </div>
  )
}
