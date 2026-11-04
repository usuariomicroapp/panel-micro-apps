import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

// Nombre del emprendimiento y logo, editables desde Panel → Configuración.
interface Brand { name: string; logoUrl: string | null; paused: boolean; pausedMessage: string; refresh: () => void }

const DEFAULT_NAME = 'SORTEO'
const BrandContext = createContext<Brand>({ name: DEFAULT_NAME, logoUrl: null, paused: false, pausedMessage: '', refresh: () => {} })

export function BrandProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState(DEFAULT_NAME)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [pausedMessage, setPausedMessage] = useState('')

  const refresh = useCallback(() => {
    if (!supabase) return
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      const row = data as { brand_name?: string; brand_logo_path?: string | null; app_paused?: boolean; paused_message?: string } | null
      setName(row?.brand_name?.trim() || DEFAULT_NAME)
      setPaused(!!row?.app_paused)
      setPausedMessage(row?.paused_message ?? '')
      setLogoUrl(row?.brand_logo_path ? supabase!.storage.from('product-photos').getPublicUrl(row.brand_logo_path).data.publicUrl : null)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    document.title = name
  }, [name])

  return <BrandContext.Provider value={{ name, logoUrl, paused, pausedMessage, refresh }}>{children}</BrandContext.Provider>
}

export const useBrand = () => useContext(BrandContext)
