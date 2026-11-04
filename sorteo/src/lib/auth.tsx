import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface Profile {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string
  role: 'admin' | 'participant'
  is_owner?: boolean
  organizer_until?: string | null
  created_at: string
}

// Fecha de hoy en Argentina (AAAA-MM-DD).
const todayAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
// Días que le quedan de permiso a un organizador (null = sin vencimiento; negativo = vencido).
export const daysLeft = (until?: string | null) => (until ? Math.round((Date.parse(until) - Date.parse(todayAR())) / 86400_000) : null)

interface AuthState {
  ready: boolean
  session: Session | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  /** Puede administrar (organizador o dueño), aunque esté mirando como participante. */
  canManage: boolean
  /** Administra y no está en modo "ver como participante". */
  isAdmin: boolean
  isOwner: boolean
  viewAsBuyer: boolean
  setViewAsBuyer: (v: boolean) => void
}

const AuthContext = createContext<AuthState>({
  ready: false, session: null, profile: null, refreshProfile: async () => {},
  canManage: false, isAdmin: false, isOwner: false, viewAsBuyer: false, setViewAsBuyer: () => {},
})

const VIEW_KEY = 'sorteo-ver-como-comprador'
/** Marca que la persona llegó desde el correo de "Olvidé mi contraseña". */
export const RECOVERY_KEY = 'sorteo-recuperar-clave'
const readView = () => {
  try { return localStorage.getItem(VIEW_KEY) === '1' } catch { return false }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [viewAsBuyer, setView] = useState(readView)
  const setViewAsBuyer = (v: boolean) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v ? '1' : '0') } catch { /* sin almacenamiento */ }
  }

  const loadProfile = async (s: Session | null) => {
    if (!supabase || !s) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') {
        try { sessionStorage.setItem(RECOVERY_KEY, '1') } catch { /* sin almacenamiento */ }
      }
      setSession(s)
      void loadProfile(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const isOwner = !!profile?.is_owner
  const left = daysLeft(profile?.organizer_until)
  const canManage = isOwner || (profile?.role === 'admin' && (left === null || left >= 0))

  return (
    <AuthContext.Provider value={{
      ready, session, profile, refreshProfile: () => loadProfile(session),
      canManage, isAdmin: canManage && !viewAsBuyer, isOwner, viewAsBuyer: canManage && viewAsBuyer, setViewAsBuyer,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
