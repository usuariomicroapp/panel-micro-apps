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
  created_at: string
}

interface AuthState {
  ready: boolean
  session: Session | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ ready: false, session: null, profile: null, refreshProfile: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      void loadProfile(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ ready, session, profile, refreshProfile: () => loadProfile(session) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
