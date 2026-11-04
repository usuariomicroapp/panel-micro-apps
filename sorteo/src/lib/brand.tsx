import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

// Marca que se ve: la del organizador del link (?o=código) o la del organizador conectado.
// Sin organizador elegido se ve la marca general de la app y todos los sorteos.
interface Brand {
  name: string; logoUrl: string | null; paused: boolean; pausedMessage: string
  org: string | null; code: string; groupLink: string; installLink: string; shareMessage: string
  setOrg: (id: string | null) => void; refresh: () => void
}

const DEFAULT_NAME = 'SORTEO'
const ORG_KEY = 'sorteo-organizador'
const BrandContext = createContext<Brand>({
  name: DEFAULT_NAME, logoUrl: null, paused: false, pausedMessage: '', org: null, code: '', groupLink: '', installLink: '', shareMessage: '',
  setOrg: () => {}, refresh: () => {},
})

const readStored = () => { try { return localStorage.getItem(ORG_KEY) } catch { return null } }
const store = (id: string | null) => { try { if (id) localStorage.setItem(ORG_KEY, id); else localStorage.removeItem(ORG_KEY) } catch { /* sin almacenamiento */ } }
// El código puede venir antes del # (https://app/?o=abc123) o dentro (https://app/#/?o=abc123).
const codeInUrl = () => {
  const q = new URLSearchParams(window.location.search).get('o') || new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('o')
  return q && /^[a-z0-9]{4,20}$/i.test(q) ? q.toLowerCase() : null
}
const publicUrl = (path?: string | null) => (path ? supabase!.storage.from('product-photos').getPublicUrl(path).data.publicUrl : null)

interface OrgRow { organizer_id: string; code: string; brand_name: string; brand_logo_path: string | null; group_link: string; install_link: string; share_message: string }

export function BrandProvider({ children }: { children: ReactNode }) {
  const { profile, isOwner } = useAuth()
  const [visited, setVisited] = useState<string | null>(readStored)
  const [general, setGeneral] = useState({ name: DEFAULT_NAME, logoUrl: null as string | null, paused: false, pausedMessage: '', groupLink: '', installLink: '', shareMessage: '' })
  const [orgRow, setOrgRow] = useState<OrgRow | null>(null)
  const [tick, setTick] = useState(0)

  // El organizador conectado siempre ve su propia marca.
  // El organizador (y el dueño, que también hace sus sorteos) usa su propia marca.
  const own = profile && (profile.role === 'admin' || isOwner) ? profile.id : null
  const org = own ?? visited

  const setOrg = useCallback((id: string | null) => { store(id); setVisited(id) }, [])

  // Quien entra con el link de un organizador lo sigue: así le llegan los avisos de sorteos nuevos.
  useEffect(() => {
    if (!supabase || !profile || !visited || own) return
    const key = `sorteo-sigo-${profile.id}-${visited}`
    try { if (localStorage.getItem(key)) return } catch { /* sin almacenamiento */ }
    supabase.rpc('follow_organizer', { p_org: visited }).then(({ error }) => {
      if (!error) { try { localStorage.setItem(key, '1') } catch { /* sin almacenamiento */ } }
    })
  }, [profile, visited, own])

  // Link con código: se busca de qué organizador es y se recuerda.
  useEffect(() => {
    const code = codeInUrl()
    if (!supabase || !code) return
    supabase.from('organizer_settings').select('organizer_id').eq('code', code).maybeSingle()
      .then(({ data }) => { if (data) setOrg((data as { organizer_id: string }).organizer_id) })
  }, [setOrg])

  useEffect(() => {
    if (!supabase) return
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      const row = data as { brand_name?: string; brand_logo_path?: string | null; app_paused?: boolean; paused_message?: string; group_link?: string; install_link?: string; share_message?: string } | null
      setGeneral({
        name: row?.brand_name?.trim() || DEFAULT_NAME, logoUrl: publicUrl(row?.brand_logo_path), paused: !!row?.app_paused, pausedMessage: row?.paused_message ?? '',
        groupLink: row?.group_link ?? '', installLink: row?.install_link ?? '', shareMessage: row?.share_message ?? '',
      })
    })
  }, [tick])

  useEffect(() => {
    if (!supabase || !org) return setOrgRow(null)
    supabase.from('organizer_settings').select('*').eq('organizer_id', org).maybeSingle().then(({ data, error }) => {
      // Si la base todavía no tiene marcas por organizador, se usa la general.
      if (error || !data) { setOrgRow(null); if (!error && org === visited) setOrg(null); return }
      setOrgRow(data as OrgRow)
    })
  }, [org, tick, visited, setOrg])

  const value: Brand = orgRow
    ? {
        ...general, name: orgRow.brand_name?.trim() || general.name, logoUrl: publicUrl(orgRow.brand_logo_path),
        org: orgRow.organizer_id, code: orgRow.code, groupLink: orgRow.group_link, installLink: orgRow.install_link,
        shareMessage: orgRow.share_message || general.shareMessage, setOrg, refresh: () => setTick((t) => t + 1),
      }
    : { ...general, org: null, code: '', setOrg, refresh: () => setTick((t) => t + 1) }

  useEffect(() => { document.title = value.name }, [value.name])

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export const useBrand = () => useContext(BrandContext)

// Link para que los participantes entren directo a los sorteos de este organizador.
export const orgLink = (b: Pick<Brand, 'code' | 'installLink'>) => {
  const base = b.installLink || `${window.location.origin}/`
  if (!b.code) return base
  try { const u = new URL(base); u.searchParams.set('o', b.code); return u.toString() } catch { return `${window.location.origin}/?o=${b.code}` }
}

// Link directo a un sorteo (pasa por el registro si hace falta y vuelve a ese sorteo).
export const raffleLink = (b: Pick<Brand, 'code' | 'installLink'>, id: string) => {
  try { const u = new URL(orgLink(b)); u.hash = `#/sorteo/${id}`; return u.toString() } catch { return `${orgLink(b)}#/sorteo/${id}` }
}
