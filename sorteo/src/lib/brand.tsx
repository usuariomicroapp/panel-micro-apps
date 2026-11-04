import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

// Nombre del emprendimiento y logo, editables desde Panel → Configuración.
interface Brand { name: string; logoUrl: string | null; refresh: () => void }

const DEFAULT_NAME = 'SORTEO'
const BrandContext = createContext<Brand>({ name: DEFAULT_NAME, logoUrl: null, refresh: () => {} })

export function BrandProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState(DEFAULT_NAME)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!supabase) return
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      const row = data as { brand_name?: string; brand_logo_path?: string | null } | null
      setName(row?.brand_name?.trim() || DEFAULT_NAME)
      setLogoUrl(row?.brand_logo_path ? supabase!.storage.from('product-photos').getPublicUrl(row.brand_logo_path).data.publicUrl : null)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    document.title = name
  }, [name])

  return <BrandContext.Provider value={{ name, logoUrl, refresh }}>{children}</BrandContext.Provider>
}

export const useBrand = () => useContext(BrandContext)
